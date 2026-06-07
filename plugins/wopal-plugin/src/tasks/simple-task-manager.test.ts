import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SimpleTaskManager } from "./simple-task-manager.js"
import { sessionIDToTaskID } from "./task-launcher.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import type { LoggerInstance } from "../logger.js"

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
      delete: vi.fn().mockResolvedValue({ data: true }),
      children: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
}

function createMockLogger(): LoggerInstance {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}

describe("SimpleTaskManager", () => {
  let manager: SimpleTaskManager
  let mockClient: ReturnType<typeof createMockClient>
  const mockDebugLog = createMockLogger()

  beforeEach(() => {
    mockClient = createMockClient()
    manager = new SimpleTaskManager(mockClient, mockClient, "/test/dir", undefined, undefined, mockDebugLog)
    mockDebugLog.debug.mockClear()
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
        body: {
          parentID: "parent-1",
          title: "Test task",
          agent: "general",
        },
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
        status: "failed",
        error: "Background task launch failed: parent session ID is required",
      })
    })

    it("fails when session.create is unavailable", async () => {
      const client = { session: { promptAsync: vi.fn(), abort: vi.fn() } }
      const failingManager = new SimpleTaskManager(client, client, "/test/dir", undefined, undefined, mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toEqual({
        ok: false,
        status: "failed",
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
        status: "failed",
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
        status: "failed",
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
      const failingManager = new SimpleTaskManager(client, client, "/test/dir", undefined, undefined, mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "failed",
        error: "Background task launch failed: session.promptAsync is unavailable",
      })
      expect(client.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
      // launch 失败时 task 不保留
      expect(manager.getTask("wopal-task-child-session-1")).toBeUndefined()
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
        status: "failed",
        error:
          "Background task launch failed: session.promptAsync did not return a promise",
      })
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "ses_child-session-1" },
      })
      // launch 失败时 task 不保留
      expect(manager.getTask("wopal-task-child-session-1")).toBeUndefined()
    })

    it("releases concurrency when promptAsync later rejects", async () => {
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

      // Concurrency should be held before rejection
      expect(manager.getConcurrencyStatus().used).toBe(1)

      deferred.reject(new Error("Prompt failed"))
      await flushAsyncWork()

      // Task is classified as error by stop classifier (no assistant activity), concurrency is released
      const task = manager.getTask(result.taskId)
      expect(task?.status).toBe("error")
      expect(task?.error).toBe("Prompt failed")
      expect(manager.getConcurrencyStatus().used).toBe(0)

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

  describe("recovery", () => {
    it("restores child sessions as idle tasks", async () => {
      mockClient.session.children.mockResolvedValueOnce({
        data: [{
          id: "ses_recovered-old",
          title: "Recovered task",
          agent: "fae",
          time: { created: Date.now() - 4_000_000 },
        }],
      })

      await manager.recoverFromSession("parent-1")

      const taskId = sessionIDToTaskID("ses_recovered-old")
      const task = manager.getTaskForParent(taskId, "parent-1")

      // recovered tasks default to idle (not current active run)
      expect(task?.status).toBe("idle")
      expect(task?.startedAt?.getTime()).toBeGreaterThan(Date.now() - 5_000)
      expect(task?.progress).toMatchObject({ toolCalls: 0 })
    })

    it("allows parent to delete recovered idle task", async () => {
      mockClient.session.children.mockResolvedValueOnce({
        data: [{
          id: "ses_recovered-delete",
          title: "Recovered task",
          agent: "fae",
          time: { created: Date.now() - 4_000_000 },
        }],
      })

      await manager.recoverFromSession("parent-1")

      const taskId = sessionIDToTaskID("ses_recovered-delete")
      const task = manager.getTask(taskId)
      // recovered task is idle, can be deleted
      expect(task?.status).toBe("idle")

      const result = await manager.finishTask(taskId, "parent-1")

      expect(result).toEqual({
        ok: true,
        message: "Task finished successfully. Session deleted from OpenCode.",
      })
      expect(mockClient.session.delete).toHaveBeenCalledWith({
        path: { id: "ses_recovered-delete" },
      })
      expect(manager.getTask(taskId)).toBeUndefined()
    })

    it("retries recovery after a temporary children API failure", async () => {
      mockClient.session.children
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockResolvedValueOnce({
          data: [{
            id: "ses_recovered-retry",
            title: "Recovered after retry",
            agent: "fae",
            time: { created: Date.now() - 4_000_000 },
          }],
        })

      await manager.recoverFromSession("parent-1")
      expect(manager.getTask(sessionIDToTaskID("ses_recovered-retry"))).toBeUndefined()

      await manager.recoverFromSession("parent-1")
      const recoveredTask = manager.getTask(sessionIDToTaskID("ses_recovered-retry"))
      expect(recoveredTask?.status).toBe("idle")
    })
  })

  describe("interrupt", () => {
    it("aborts session and sets task to idle", async () => {
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
      // interrupt sets status to idle
      expect(manager.getTask(result.taskId)?.status).toBe("idle")
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
      // status becomes idle even if abort fails
      expect(manager.getTask(result.taskId)?.status).toBe("idle")
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

    it("interrupt aborts session, task becomes idle", async () => {
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
      // interrupt sets status to idle
      expect(manager.getTask(result.taskId)?.status).toBe("idle")
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
      // interrupt sets status to idle
      expect(manager.getTask(result.taskId)?.status).toBe("idle")
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

  describe("dispose", () => {
    it("is idempotent (tick loop is now managed by MonitorEngine)", async () => {
      // Create a manager and dispose — no longer manages ticker internally
      const newManager = new SimpleTaskManager(mockClient, mockClient, "/test/dir", undefined, undefined, mockDebugLog)
      newManager.dispose()
      // Second call should not throw
      newManager.dispose()
    })
  })

  describe("createMonitorStrategy", () => {
    it("returns a strategy with name 'task-monitor'", () => {
      const strategy = manager.createMonitorStrategy()
      expect(strategy.name).toBe("task-monitor")
      expect(typeof strategy.tick).toBe("function")
    })

    it("strategy tick calls runTaskMonitorTick with manager deps", async () => {
      const task = {
        id: "wopal-task-strategy-test",
        status: "running",
        description: "Strategy test",
        agent: "fae",
        prompt: "test",
        parentSessionID: "parent-1",
        createdAt: new Date(),
        startedAt: new Date(),
        sessionID: "ses_strategy-test",
        progress: { toolCalls: 0, lastUpdate: new Date(), lastMeaningfulActivity: new Date() },
      } as const

      // Access internal tasks map to add a task
      const internalTasks = (manager as unknown as { tasks: Map<string, unknown> }).tasks
      internalTasks.set(task.id, task)

      const strategy = manager.createMonitorStrategy()
      // tick should not throw even with a running task
      await strategy.tick()
    })
  })

  describe("finishTask (real implementation)", () => {
    it("rejects actively running task", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      // Task is actively running
      const finishResult = await manager.finishTask(result.taskId, "parent-1")

      expect(finishResult.ok).toBe(false)
      expect(finishResult.message).toContain("actively running")
      expect(finishResult.message).toContain("wopal_task_abort")
    })

    it("accepts idle task", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Mark as idle (simulating abort or interrupt)
      task.status = "idle"

      const finishResult = await manager.finishTask(result.taskId, "parent-1")

      expect(finishResult.ok).toBe(true)
      expect(finishResult.message).toContain("finished successfully")
      expect(mockClient.session.delete).toHaveBeenCalled()
      expect(manager.getTask(result.taskId)).toBeUndefined()
    })

    it("accepts waiting task", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Mark as waiting
      task.status = "waiting"

      const finishResult = await manager.finishTask(result.taskId, "parent-1")

      expect(finishResult.ok).toBe(true)
      expect(mockClient.session.delete).toHaveBeenCalled()
    })

    it("accepts stuck task", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Mark as stuck
      task.status = "stuck"

      const finishResult = await manager.finishTask(result.taskId, "parent-1")

      expect(finishResult.ok).toBe(true)
      expect(mockClient.session.delete).toHaveBeenCalled()
    })

    it("rejects wrong parent session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const finishResult = await manager.finishTask(result.taskId, "parent-2")

      expect(finishResult.ok).toBe(false)
      expect(finishResult.message).toContain("not found or not owned")
    })
  })

  describe("session registration", () => {
    it("registerTaskSession adds session to taskSessions", () => {
      const sessionID = "ses_test-session-1"
      manager.registerTaskSession(sessionID)
      expect(manager.isTaskSession(sessionID)).toBe(true)
    })

    it("isTaskSession returns false for unregistered session", () => {
      expect(manager.isTaskSession("ses_unknown-session")).toBe(false)
    })

    it("isTaskSession returns false after manager creation (no sessions)", () => {
      expect(manager.isTaskSession("ses_nonexistent")).toBe(false)
    })

    it("registerTaskSession allows registering multiple sessions", () => {
      manager.registerTaskSession("ses_session-a")
      manager.registerTaskSession("ses_session-b")
      manager.registerTaskSession("ses_session-c")
      expect(manager.isTaskSession("ses_session-a")).toBe(true)
      expect(manager.isTaskSession("ses_session-b")).toBe(true)
      expect(manager.isTaskSession("ses_session-c")).toBe(true)
    })

    it("registerTaskSession is idempotent", () => {
      const sessionID = "ses_idempotent"
      manager.registerTaskSession(sessionID)
      manager.registerTaskSession(sessionID)
      manager.registerTaskSession(sessionID)
      expect(manager.isTaskSession(sessionID)).toBe(true)
    })

    it("launched task sessions are automatically registered", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      expect(manager.isTaskSession("ses_child-session-1")).toBe(true)
    })

    it("recovered task sessions are automatically registered", async () => {
      const mockClient = createMockClient()
      mockClient.session.children.mockResolvedValueOnce({
        data: [{
          id: "ses_recovered-reg",
          title: "Recovered session",
          agent: "fae",
          time: { created: Date.now() - 4_000_000 },
        }],
      })
      const recoveryManager = new SimpleTaskManager(mockClient, mockClient, "/test/dir", undefined, undefined, mockDebugLog)

      await recoveryManager.recoverFromSession("parent-1")
      expect(recoveryManager.isTaskSession("ses_recovered-reg")).toBe(true)

      recoveryManager.dispose()
    })
  })

  describe("reacquireSlotOnWakeUp (real concurrency behavior)", () => {
    it("success: acquires slot and clears waitingConcurrencyKey", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Simulate idle state: task was aborted/interrupted
      task.status = "idle"
      task.waitingConcurrencyKey = task.concurrencyKey
      task.concurrencyKey = undefined

      // Call reacquireSlotOnWakeUp with available slots
      const acquired = manager.reacquireSlotOnWakeUp(task)

      // Verify: concurrencyKey restored, waitingConcurrencyKey cleared
      expect(acquired).toBe(true)
      expect(task.concurrencyKey).toBe("default")
      expect(task.waitingConcurrencyKey).toBeUndefined()
      
      // Verify concurrency status reflects the acquisition
      const status = manager.getConcurrencyStatus()
      expect(status.used).toBeGreaterThan(0)
    })

    it("concurrency limit reached: preserves waitingConcurrencyKey for retry", async () => {
      // First launch a task (succeeds because slots available)
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Task has concurrencyKey from launch
      expect(task.concurrencyKey).toBe("default")
      expect(manager.getConcurrencyStatus().used).toBe(1)

      // Access internal concurrency manager to fill remaining slots
      const internalConcurrency = (manager as unknown as { concurrency: ConcurrencyManager }).concurrency
      
      // Fill remaining 4 slots (limit is 5)
      for (let i = 0; i < 4; i++) {
        internalConcurrency.tryAcquire("default", 5)
      }

      // Verify limit reached
      expect(manager.getConcurrencyStatus().used).toBe(5)
      expect(manager.getConcurrencyStatus().available).toBe(0)

      // Set idle state
      task.status = "idle"
      task.waitingConcurrencyKey = task.concurrencyKey
      task.concurrencyKey = undefined

      // Call reacquireSlotOnWakeUp when limit is reached
      const acquired = manager.reacquireSlotOnWakeUp(task)

      // Verify: concurrencyKey NOT set (acquisition failed)
      // waitingConcurrencyKey preserved for retry
      expect(acquired).toBe(false)
      expect(task.concurrencyKey).toBeUndefined()
      expect(task.waitingConcurrencyKey).toBe("default")
    })

    it("non-resumable task: reacquireSlotOnWakeUp does nothing", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) throw new Error("expected successful launch")

      const task = manager.getTask(result.taskId)
      if (!task) throw new Error("expected task")

      // Task is actively running (not idle)
      expect(task.status).toBe("running")

      // Call reacquireSlotOnWakeUp - should do nothing
      const acquired = manager.reacquireSlotOnWakeUp(task)

      // Verify: no state change
      expect(acquired).toBe(false)
      expect(task.concurrencyKey).toBe("default") // Still has the original slot
      expect(task.waitingConcurrencyKey).toBeUndefined()
    })
  })
})
