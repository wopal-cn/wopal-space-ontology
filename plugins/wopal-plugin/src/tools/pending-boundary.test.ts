import { describe, expect, it, vi } from "vitest"
import { createWopalTaskAbortTool } from "./wopal-task-abort.js"
import { createWopalReplyTool } from "./wopal-task-reply.js"
import { createWopalTaskFinishTool } from "./wopal-task-finish.js"
import { canDeleteTask, isResumableTask } from "../tasks/task-phase.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockClient() {
  return {
    session: {
      abort: vi.fn().mockResolvedValue(undefined),
      promptAsync: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue({ data: true }),
    },
  }
}

function createMockTaskManager(
  task?: WopalTask,
  client?: ReturnType<typeof createMockClient>,
) {
  const mockClient = client ?? createMockClient()
  return {
    getTaskForParent: vi.fn((id: string, parentID: string) =>
      task && task.id === id && task.parentSessionID === parentID ? task : undefined,
    ),
    getClient: vi.fn(() => mockClient),
    releaseConcurrencySlot: vi.fn(),
    reacquireSlotOnWakeUp: vi.fn(),
    finishTask: vi.fn(async (taskId: string, parentSessionID: string) => {
      const t = task && task.id === taskId && task.parentSessionID === parentSessionID ? task : undefined
      if (!t) {
        return { ok: false, message: "Task not found or not owned by this session" }
      }
      
      // pending can be finished
      if (t.status === "running" && !t.idleNotified) {
        return { ok: false, message: "Task is actively running. Use wopal_task_abort or wopal_task_reply(interrupt=true) to stop first, then finish." }
      }
      
      if (t.sessionID && mockClient.session.delete) {
        try {
          const result = await mockClient.session.delete({ path: { id: t.sessionID } })
          if (result.error) {
            return { ok: false, message: `Failed to delete session: ${String(result.error)}` }
          }
        } catch (err) {
          return { ok: false, message: `Failed to delete session: ${String(err)}` }
        }
      }
      
      return { ok: true, message: "Task finished successfully. Session deleted from OpenCode." }
    }),
  }
}

describe("pending task boundary tests", () => {
  const parentSessionID = "parent-session-123"

  function createPendingTask(overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: "wopal-task-pending",
      sessionID: undefined,
      status: "pending",
      description: "Pending task",
      agent: "fae",
      prompt: "Queued task",
      parentSessionID,
      createdAt: new Date(),
      concurrencyKey: undefined,
      ...overrides,
    }
  }

  describe("wopal_task_abort", () => {
    it("rejects pending task (abort only works on running)", async () => {
      const pendingTask = createPendingTask()
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: pendingTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Failed to abort task: task is pending")
      expect(result).toContain("abort only works on running tasks")
      expect(result).toContain("wopal_task_finish")
    })
  })

  describe("wopal_task_reply", () => {
    it("rejects pending task for normal reply (pending is not resumable)", async () => {
      const pendingTask = createPendingTask()
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: pendingTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      // reply without interrupt rejects pending task because isResumableTask returns false
      // (pending is not waiting/error/idle)
      expect(result).toContain("Error")
      expect(result).toContain("Task is actively running")
    })

    it("rejects pending task for interrupt reply (pending is not running)", async () => {
      const pendingTask = createPendingTask()
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: pendingTask.id, message: "change direction", interrupt: true },
        { sessionID: parentSessionID },
      )

      // interrupt reply requires status === "running", pending is not running
      expect(result).toContain("Error")
      expect(result).toContain("interrupt only works on running tasks")
      expect(result).toContain("Task is pending")
    })
  })

  describe("wopal_task_finish", () => {
    it("succeeds on pending task", async () => {
      const pendingTask = createPendingTask()
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: pendingTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    })

    it("pending task without sessionID: finish succeeds without calling session.delete", async () => {
      const mockClient = createMockClient()
      const pendingTask = createPendingTask({ sessionID: undefined })
      const mockManager = createMockTaskManager(pendingTask, mockClient)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: pendingTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
      // session.delete should NOT be called because pending task has no sessionID
      expect(mockClient.session.delete).not.toHaveBeenCalled()
    })
  })

  describe("pending state semantics", () => {
    it("pending is deletable (canDeleteTask returns true)", async () => {
      const pendingTask = createPendingTask()
      // pending status is not "running" with idleNotified=false, so canDeleteTask returns true
      expect(pendingTask.status).toBe("pending")
      expect(pendingTask.idleNotified).toBeUndefined()
      
      // Verify canDeleteTask function directly
      expect(canDeleteTask(pendingTask)).toBe(true)
      
      // finish should succeed
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))
      const result = await execute(
        { task_id: pendingTask.id },
        { sessionID: parentSessionID },
      )
      expect(result).toContain("finished successfully")
    })

    it("pending is not abortable (abort requires running status)", async () => {
      const pendingTask = createPendingTask()
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))
      
      const result = await execute(
        { task_id: pendingTask.id },
        { sessionID: parentSessionID },
      )
      
      // abort should reject because status is not "running"
      expect(result).toContain("Failed to abort")
      expect(result).toContain("task is pending")
    })

    it("pending is not resumable (reply requires resumable state)", async () => {
      const pendingTask = createPendingTask()
      
      // Verify isResumableTask function directly
      expect(isResumableTask(pendingTask)).toBe(false)
      
      const mockManager = createMockTaskManager(pendingTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))
      
      const result = await execute(
        { task_id: pendingTask.id, message: "test" },
        { sessionID: parentSessionID },
      )
      
      // reply rejects pending task because pending is not a resumable state
      // resumable states: waiting, error, or idle phase (running + idleNotified)
      expect(result).toContain("Error")
      expect(result).toContain("actively running")
    })
  })

  describe("canDeleteTask function coverage", () => {
    it("rejects actively running (running without idleNotified)", () => {
      const activeTask: WopalTask = {
        id: "task-active",
        status: "running",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
        concurrencyKey: "default",
      }
      expect(canDeleteTask(activeTask)).toBe(false)
    })

    it("accepts idle phase (running + idleNotified)", () => {
      const idleTask: WopalTask = {
        id: "task-idle",
        status: "running",
        idleNotified: true,
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
        concurrencyKey: undefined,
        waitingConcurrencyKey: "default",
      }
      expect(canDeleteTask(idleTask)).toBe(true)
    })

    it("accepts waiting status", () => {
      const waitingTask: WopalTask = {
        id: "task-waiting",
        status: "waiting",
        waitingReason: "question_detected",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(canDeleteTask(waitingTask)).toBe(true)
    })

    it("accepts error status", () => {
      const errorTask: WopalTask = {
        id: "task-error",
        status: "error",
        error: "Something failed",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(canDeleteTask(errorTask)).toBe(true)
    })

    it("accepts pending status", () => {
      const pendingTask: WopalTask = {
        id: "task-pending",
        status: "pending",
        sessionID: undefined,
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(canDeleteTask(pendingTask)).toBe(true)
    })
  })

  describe("isResumableTask function coverage", () => {
    it("accepts waiting status", () => {
      const waitingTask: WopalTask = {
        id: "task-waiting",
        status: "waiting",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(isResumableTask(waitingTask)).toBe(true)
    })

    it("accepts error status", () => {
      const errorTask: WopalTask = {
        id: "task-error",
        status: "error",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(isResumableTask(errorTask)).toBe(true)
    })

    it("accepts idle phase (running + idleNotified)", () => {
      const idleTask: WopalTask = {
        id: "task-idle",
        status: "running",
        idleNotified: true,
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(isResumableTask(idleTask)).toBe(true)
    })

    it("rejects actively running (running without idleNotified)", () => {
      const activeTask: WopalTask = {
        id: "task-active",
        status: "running",
        sessionID: "ses-123",
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(isResumableTask(activeTask)).toBe(false)
    })

    it("rejects pending status", () => {
      const pendingTask: WopalTask = {
        id: "task-pending",
        status: "pending",
        sessionID: undefined,
        description: "",
        agent: "fae",
        prompt: "",
        parentSessionID: "parent-1",
        createdAt: new Date(),
      }
      expect(isResumableTask(pendingTask)).toBe(false)
    })
  })
})