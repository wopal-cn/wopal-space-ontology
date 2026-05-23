import { describe, it, expect, vi, beforeEach } from "vitest"
import { launchTask, sessionIDToTaskID } from "./task-launcher.js"
import type { TaskLauncherDeps, LaunchInput } from "./task-launcher.js"
import { toErrorMessage, isPromiseLike } from "./utils.js"
import type { WopalTask } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { ConcurrencyManager } from "./concurrency-manager.js"

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

describe("task-launcher", () => {
  describe("sessionIDToTaskID", () => {
    it("should strip ses_ prefix from sessionID", () => {
      expect(sessionIDToTaskID("ses_abc123")).toBe("wopal-task-abc123")
    })

    it("should work with sessionID without ses_ prefix", () => {
      expect(sessionIDToTaskID("child-123")).toBe("wopal-task-child-123")
    })
  })
  describe("toErrorMessage", () => {
    it("should extract message from Error objects", () => {
      const error = new Error("test error message")
      expect(toErrorMessage(error)).toBe("test error message")
    })

    it("should return string directly", () => {
      expect(toErrorMessage("direct string")).toBe("direct string")
    })

    it("should stringify object errors", () => {
      const error = { code: "ERR123", detail: "something failed" }
      expect(toErrorMessage(error)).toBe("{\"code\":\"ERR123\",\"detail\":\"something failed\"}")
    })

    it("should fallback to String() for null", () => {
      expect(toErrorMessage(null)).toBe("null")
    })

    it("should handle empty error message by falling back to String()", () => {
      const error = new Error("")
      // Empty message is falsy, falls through to String(error) = "Error"
      expect(toErrorMessage(error)).toBe("Error")
    })
  })

  describe("isPromiseLike", () => {
    it("should return true for Promise", () => {
      expect(isPromiseLike(Promise.resolve())).toBe(true)
    })

    it("should return true for promise-like object", () => {
      const promiseLike = { then: () => {} }
      expect(isPromiseLike(promiseLike)).toBe(true)
    })

    it("should return false for non-promise", () => {
      expect(isPromiseLike({})).toBe(false)
      expect(isPromiseLike(null)).toBe(false)
      expect(isPromiseLike("string")).toBe(false)
    })
  })

  describe("launchTask", () => {
    let tasks: Map<string, WopalTask>
    let abortSessionSpy: ReturnType<typeof vi.fn>
    let debugLogSpy: LoggerInstance
    let concurrency: ConcurrencyManager
    let deps: TaskLauncherDeps

    beforeEach(() => {
      tasks = new Map()
      abortSessionSpy = vi.fn().mockResolvedValue(undefined)
      debugLogSpy = createMockLogger()
      concurrency = new ConcurrencyManager()

      deps = {
        tasks,
        client: {},
        debugLog: debugLogSpy,
        concurrency,
        concurrencyKey: "test",
        taskManager: { registerTaskSession: vi.fn() },
        abortSession: abortSessionSpy,
      }
    })

    it("should fail without parentSessionID", async () => {
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: undefined,
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.status).toBe("failed")
      expect(result.error).toContain("parent session ID is required")
      expect(concurrency.getCount("test")).toBe(0)
    })

    it("should fail when session.create is unavailable", async () => {
      deps.client = { session: {} }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.error).toContain("session.create is unavailable")
      expect(concurrency.getCount("test")).toBe(0)
    })

    it("should fail when session.create throws", async () => {
      deps.client = {
        session: {
          create: vi.fn().mockRejectedValue(new Error("create failed")),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.error).toContain("create failed")
      // No taskId when session.create fails (task not created yet)
      expect(result.taskId).toBeUndefined()
      expect(concurrency.getCount("test")).toBe(0)
    })

    it("should fail when session does not provide ID", async () => {
      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({}),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.error).toContain("did not provide an ID")
      expect(concurrency.getCount("test")).toBe(0)
    })

    it("should fail when promptAsync is unavailable", async () => {
      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.status).toBe("failed")
      expect(result.error).toContain("promptAsync is unavailable")
      // launch 失败时 session 已被 abort，但 task 不保留（已从 tasks map 删除）
      expect(abortSessionSpy).toHaveBeenCalledWith("child-123")
      expect(tasks.has("wopal-task-child-123")).toBe(false)
    })

    it("should fail when promptAsync does not return promise, abort session and not retain task", async () => {
      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
          promptAsync: vi.fn().mockReturnValue("not a promise"),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.status).toBe("failed")
      expect(result.error).toContain("did not return a promise")
      expect(abortSessionSpy).toHaveBeenCalledWith("child-123")
      // launch 失败时 task 不保留
      expect(tasks.has("wopal-task-child-123")).toBe(false)
    })

    it("should launch successfully and set task to running", async () => {
      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
          promptAsync: vi.fn().mockResolvedValue({}),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(true)
      expect(result.status).toBe("running")
      expect(result.taskId).toBe("wopal-task-child-123")

      const task = tasks.get(result.taskId!)
      expect(task?.status).toBe("running")
      expect(task?.sessionID).toBe("child-123")
    })

    it("should release concurrency when promptAsync rejects and task is still running", async () => {
      let rejectPrompt: (err: Error) => void
      const promptPromise = new Promise((_, reject) => {
        rejectPrompt = reject
      })

      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
          promptAsync: vi.fn().mockReturnValue(promptPromise),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)
      expect(result.ok).toBe(true)

      // Reject promptAsync while task is still running
      rejectPrompt!(new Error("prompt rejected"))
      await new Promise((r) => setTimeout(r, 10)) // flush microtask

      // concurrency should be released
      expect(concurrency.getCount("test")).toBe(0)
      expect(abortSessionSpy).toHaveBeenCalledWith("child-123")
    })

    it("should skip cleanup when promptAsync rejects after task status changed from running", async () => {
      // This is the WR-01 test case: idle → abort → rejection race condition
      let rejectPrompt: (err: Error) => void
      const promptPromise = new Promise((_, reject) => {
        rejectPrompt = reject
      })

      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
          promptAsync: vi.fn().mockReturnValue(promptPromise),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)
      expect(result.ok).toBe(true)

      const task = tasks.get(result.taskId!)
      expect(task?.status).toBe("running")

      // Simulate task status changed to idle (e.g., by abort)
      task!.status = 'idle'

      // Now reject promptAsync (e.g., from abort triggered by idle)
      rejectPrompt!(new Error("aborted after idle"))
      await new Promise((r) => setTimeout(r, 10)) // flush microtask

      // Should not release concurrency again or abort session (already handled by abort)
      expect(abortSessionSpy).not.toHaveBeenCalled()
    })

    it("should fail when concurrency limit reached", async () => {
      // Acquire all slots first
      concurrency.tryAcquire("test", 5)
      concurrency.tryAcquire("test", 5)
      concurrency.tryAcquire("test", 5)
      concurrency.tryAcquire("test", 5)
      concurrency.tryAcquire("test", 5)

      deps.client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-123" }),
          promptAsync: vi.fn().mockResolvedValue({}),
        },
      }
      const input: LaunchInput = {
        description: "test task",
        agent: "general",
        prompt: "do something",
        parentSessionID: "parent-123",
      }

      const result = await launchTask(deps, input)

      expect(result.ok).toBe(false)
      expect(result.error).toContain("Concurrency limit reached")
    })
  })
})
