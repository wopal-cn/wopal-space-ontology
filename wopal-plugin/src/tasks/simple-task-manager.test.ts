import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SimpleTaskManager } from "./simple-task-manager.js"
import { sessionIDToTaskID } from "./task-launcher.js"

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function flushAsyncWork(iterations = 5) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function createMockClient() {
  return {
    session: {
      create: vi.fn().mockResolvedValue({ id: "ses_child-session-1" }),
      promptAsync: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe("SimpleTaskManager", () => {
  let manager: SimpleTaskManager
  let mockClient: ReturnType<typeof createMockClient>
  const mockDebugLog = vi.fn()

  beforeEach(() => {
    mockClient = createMockClient()
    manager = new SimpleTaskManager(mockClient, "/test/dir", mockDebugLog)
    mockDebugLog.mockClear()
  })

  afterEach(() => {
    manager.dispose()
  })

  describe("launch", () => {
    it("creates a running task and child session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true, status: "running" })
      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      expect(result.taskId).toBe("wopal-task-child-session-1")

      expect(mockClient.session.create).toHaveBeenCalledWith({
        parentID: "parent-1",
        title: "Test task",
      })
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
        body: {
          agent: "general",
          parts: [{ type: "text", text: "Do something" }],
          tools: {
            "wopal_task": false,
          },
        },
      })

      const task = manager.getTask(result.taskId)
      expect(task?.status).toBe("running")
      expect(manager.findBySession("ses_child-session-1")?.id).toBe(result.taskId)
    })

    it("extracts session id from session.data.id (OpenCode API structure)", async () => {
      mockClient.session.create.mockResolvedValueOnce({ data: { id: "ses_session-from-data-id" } })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true })
      if (!result.ok) throw new Error("expected success")

      expect(result.taskId).toBe("wopal-task-session-from-data-id")
      expect(manager.findBySession("ses_session-from-data-id")?.id).toBe(result.taskId)
    })

    it("extracts session id from session.id as fallback", async () => {
      mockClient.session.create.mockResolvedValueOnce({ id: "ses_session-from-id" })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true })
      if (!result.ok) throw new Error("expected success")

      expect(result.taskId).toBe("wopal-task-session-from-id")
      expect(manager.findBySession("ses_session-from-id")?.id).toBe(result.taskId)
    })

    it("fails when parent session id is missing", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "",
      })

      expect(result).toEqual({
        ok: false,
        status: "error",
        error: "Background task launch failed: parent session ID is required",
      })
    })

    it("fails when session.create is unavailable", async () => {
      const client = { session: { promptAsync: vi.fn(), abort: vi.fn() } }
      const failingManager = new SimpleTaskManager(client, "/test/dir", mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toEqual({
        ok: false,
        status: "error",
        error: "Background task launch failed: session.create is unavailable",
      })
    })

    it("fails when session.create rejects", async () => {
      mockClient.session.create.mockRejectedValueOnce(new Error("Create failed"))

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: Create failed",
      })
      // No taskId when session.create fails
      expect(result.taskId).toBeUndefined()
    })

    it("fails when child session id is missing", async () => {
      mockClient.session.create.mockResolvedValueOnce({ info: {} })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: child session did not provide an ID",
      })
    })

    it("fails when session.promptAsync is unavailable", async () => {
      const client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "ses_child-session-1" }),
          abort: vi.fn().mockResolvedValue(undefined),
        },
      }
      const failingManager = new SimpleTaskManager(client, "/test/dir", mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: session.promptAsync is unavailable",
      })
      expect(client.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
    })

    it("fails when session.promptAsync does not return a promise", async () => {
      mockClient.session.promptAsync.mockReturnValueOnce(undefined)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error:
          "Background task launch failed: session.promptAsync did not return a promise",
      })
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
    })

    it("marks task as error when promptAsync later rejects", async () => {
      const deferred = createDeferred<void>()
      mockClient.session.promptAsync.mockReturnValueOnce(deferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      deferred.reject(new Error("Prompt failed"))
      await flushAsyncWork()

      const task = manager.getTask(result.taskId)
      expect(task?.status).toBe("error")
      expect(task?.error).toBe("Background task execution failed: Prompt failed")

      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
    })
  })

  describe("ownership", () => {
    it("returns task only to owning parent session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      expect(manager.getTaskForParent(result.taskId, "parent-1")?.id).toBe(result.taskId)
      expect(manager.getTaskForParent(result.taskId, "parent-2")).toBeUndefined()
    })
  })

  describe("interrupt", () => {
    it("aborts session but keeps status as running", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const interrupted = await manager.interrupt(result.taskId, "parent-1")

      expect(interrupted).toBe("interrupted")
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
      // interrupt only aborts, status remains running
      expect(manager.getTask(result.taskId)?.status).toBe("running")
    })

    it("still returns interrupted even when session.abort rejects", async () => {
      mockClient.session.abort.mockRejectedValueOnce(new Error("Abort failed"))

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const interrupted = await manager.interrupt(result.taskId, "parent-1")

      expect(interrupted).toBe("interrupted")
      // status still running after interrupt
      expect(manager.getTask(result.taskId)?.status).toBe("running")
    })

    it("rejects interruption from a different parent session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      await expect(manager.interrupt(result.taskId, "parent-2")).resolves.toBe("not_found")
      expect(mockClient.session.abort).not.toHaveBeenCalled()
    })

    it("interrupt aborts session, task remains running", async () => {
      const abortDeferred = createDeferred<void>()
      mockClient.session.abort.mockReturnValueOnce(abortDeferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const interruptPromise = manager.interrupt(result.taskId, "parent-1")
      abortDeferred.resolve(undefined)

      await expect(interruptPromise).resolves.toBe("interrupted")
      // interrupt keeps status as running
      expect(manager.getTask(result.taskId)?.status).toBe("running")
    })

    it("interrupt does not block idle notification", async () => {
      const abortDeferred = createDeferred<void>()
      mockClient.session.abort.mockReturnValueOnce(abortDeferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const interruptPromise = manager.interrupt(result.taskId, "parent-1")
      abortDeferred.resolve(undefined)

      await expect(interruptPromise).resolves.toBe("interrupted")
      // interrupt keeps status as running
      expect(manager.getTask(result.taskId)?.status).toBe("running")
    })
  })

  describe("notifyParent", () => {
    it("sends notification with task status", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      await manager.notifyParent(result.taskId)

      // Find the call that was made to the parent session (not the child)
      const call = mockClient.session.promptAsync.mock.calls.find(
        (entry) => entry[0]?.path?.id === "parent-1",
      )
      expect(call).toBeDefined()
      const notification = call?.[0]?.body?.parts?.[0]?.text as string

      expect(notification).toContain(result.taskId)
      expect(notification).toContain("[WOPAL TASK")
    })
  })

  describe("cleanup", () => {
    it("removes old error tasks", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const task = manager.getTask(result.taskId)
      if (!task) {
        throw new Error("expected task")
      }

      task.status = "error"
      task.completedAt = new Date(Date.now() - 4_000_000)

      manager.cleanup(3_600_000)

      expect(manager.getTask(result.taskId)).toBeUndefined()
    })

    it("keeps recent error tasks", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const task = manager.getTask(result.taskId)
      if (!task) {
        throw new Error("expected task")
      }

      task.status = "error"
      task.completedAt = new Date(Date.now() - 1_000)

      manager.cleanup(3_600_000)

      expect(manager.getTask(result.taskId)).toBeDefined()
    })
  })

  describe("dispose", () => {
    it("stops automatic cleanup interval", async () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval")

      // Create a manager and immediately dispose
      const newManager = new SimpleTaskManager(mockClient, "/test/dir", mockDebugLog)
      newManager.dispose()

      expect(clearIntervalSpy).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })
  })
})
