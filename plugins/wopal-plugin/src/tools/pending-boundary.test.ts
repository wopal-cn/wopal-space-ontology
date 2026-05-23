import { describe, expect, it, vi } from "vitest"
import { createWopalTaskAbortTool } from "./wopal-task-abort.js"
import { createWopalReplyTool } from "./wopal-task-reply.js"
import { createWopalTaskFinishTool } from "./wopal-task-finish.js"
import { canDeleteTask, isResumableTask, isTaskActive } from "../tasks/task-phase.js"
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
    reacquireSlotOnWakeUp: vi.fn(() => true),
    finishTask: vi.fn(async (taskId: string, parentSessionID: string) => {
      const t = task && task.id === taskId && task.parentSessionID === parentSessionID ? task : undefined
      if (!t) {
        return { ok: false, message: "Task not found or not owned by this session" }
      }
      
      // running cannot be finished (active state)
      if (t.status === "running") {
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

describe("task status boundary tests", () => {
  const parentSessionID = "parent-session-123"

  // Helper to create tasks with specific status
  function createTaskWithStatus(status: WopalTask["status"], overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: `wopal-task-${status}`,
      sessionID: `session-${status}`,
      status,
      description: `${status} task`,
      agent: "fae",
      prompt: "Test task",
      parentSessionID,
      createdAt: new Date(),
      concurrencyKey: undefined,
      ...overrides,
    }
  }

  describe("wopal_task_abort", () => {
    it("succeeds on running task (abort stops active execution)", async () => {
      const runningTask = createTaskWithStatus("running")
      const mockManager = createMockTaskManager(runningTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id },
        { sessionID: parentSessionID },
      )

      // abort should succeed on running task
      expect(result).toContain("aborted")
      expect(result).not.toContain("Failed to abort")
    })

    it("rejects idle task (abort only works on running)", async () => {
      const idleTask = createTaskWithStatus("idle")
      const mockManager = createMockTaskManager(idleTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: idleTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Failed to abort task")
      expect(result).toContain("abort only works on running tasks")
    })

    it("rejects waiting task (abort only works on running)", async () => {
      const waitingTask = createTaskWithStatus("waiting")
      const mockManager = createMockTaskManager(waitingTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: waitingTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Failed to abort task")
      expect(result).toContain("abort only works on running tasks")
    })

    it("rejects stuck task (abort only works on running)", async () => {
      const stuckTask = createTaskWithStatus("stuck")
      const mockManager = createMockTaskManager(stuckTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: stuckTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Failed to abort task")
      expect(result).toContain("abort only works on running tasks")
    })

    it("rejects error task (abort only works on running)", async () => {
      const errorTask = createTaskWithStatus("error")
      const mockManager = createMockTaskManager(errorTask)
      const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

      const result = await execute(
        { task_id: errorTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Failed to abort task")
      expect(result).toContain("abort only works on running tasks")
    })
  })

  describe("wopal_task_reply", () => {
    it("rejects running task for normal reply (running is not resumable)", async () => {
      const runningTask = createTaskWithStatus("running")
      const mockManager = createMockTaskManager(runningTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      // reply without interrupt rejects running task because running is active (not resumable)
      expect(result).toContain("Error")
      expect(result).toContain("Task is actively running")
    })

    it("succeeds on idle task (idle is resumable)", async () => {
      const idleTask = createTaskWithStatus("idle")
      const mockManager = createMockTaskManager(idleTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: idleTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      // reply should succeed on idle task
      expect(result).toContain("Reply sent to task")
    })

    it("succeeds on waiting task (waiting is resumable)", async () => {
      const waitingTask = createTaskWithStatus("waiting")
      const mockManager = createMockTaskManager(waitingTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: waitingTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      // reply should succeed on waiting task
      expect(result).toContain("Reply sent to task")
    })

    it("succeeds on stuck task (stuck is resumable)", async () => {
      const stuckTask = createTaskWithStatus("stuck")
      const mockManager = createMockTaskManager(stuckTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: stuckTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      // reply should succeed on stuck task
      expect(result).toContain("Reply sent to task")
    })

    it("rejects error task (error is not resumable)", async () => {
      const errorTask = createTaskWithStatus("error")
      const mockManager = createMockTaskManager(errorTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: errorTask.id, message: "continue" },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("error state")
      expect(result).toContain("cannot be resumed")
    })

    it("succeeds on running task with interrupt flag", async () => {
      const runningTask = createTaskWithStatus("running")
      const mockManager = createMockTaskManager(runningTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, message: "change direction", interrupt: true },
        { sessionID: parentSessionID },
      )

      // interrupt reply should succeed on running task
      expect(result).toContain("Interrupt sent")
      expect(result).not.toContain("Error")
    })

    it("rejects idle task with interrupt (interrupt requires running)", async () => {
      const idleTask = createTaskWithStatus("idle")
      const mockManager = createMockTaskManager(idleTask)
      const execute = getExecute(createWopalReplyTool(mockManager as never))

      const result = await execute(
        { task_id: idleTask.id, message: "change direction", interrupt: true },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Error")
      expect(result).toContain("interrupt only works on running tasks")
    })
  })

  describe("wopal_task_finish", () => {
    it("rejects running task (running is active, cannot finish)", async () => {
      const runningTask = createTaskWithStatus("running")
      const mockManager = createMockTaskManager(runningTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("Task is actively running")
      expect(result).toContain("Use wopal_task_abort")
    })

    it("succeeds on idle task (idle is deletable)", async () => {
      const idleTask = createTaskWithStatus("idle")
      const mockManager = createMockTaskManager(idleTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: idleTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    })

    it("succeeds on waiting task (waiting is deletable)", async () => {
      const waitingTask = createTaskWithStatus("waiting")
      const mockManager = createMockTaskManager(waitingTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: waitingTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    })

    it("succeeds on stuck task (stuck is deletable)", async () => {
      const stuckTask = createTaskWithStatus("stuck")
      const mockManager = createMockTaskManager(stuckTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: stuckTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    })

    it("succeeds on error task (error is deletable)", async () => {
      const errorTask = createTaskWithStatus("error")
      const mockManager = createMockTaskManager(errorTask)
      const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

      const result = await execute(
        { task_id: errorTask.id },
        { sessionID: parentSessionID },
      )

      expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    })
  })

  describe("isTaskActive function (running is the only active state)", () => {
    it("returns true for running", () => {
      const task = createTaskWithStatus("running")
      expect(isTaskActive(task)).toBe(true)
    })

    it("returns false for idle", () => {
      const task = createTaskWithStatus("idle")
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for waiting", () => {
      const task = createTaskWithStatus("waiting")
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for stuck", () => {
      const task = createTaskWithStatus("stuck")
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for error", () => {
      const task = createTaskWithStatus("error")
      expect(isTaskActive(task)).toBe(false)
    })
  })

  describe("isResumableTask function (idle/waiting/stuck are resumable)", () => {
    it("returns false for running (active, not resumable)", () => {
      const task = createTaskWithStatus("running")
      expect(isResumableTask(task)).toBe(false)
    })

    it("returns true for idle", () => {
      const task = createTaskWithStatus("idle")
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for waiting", () => {
      const task = createTaskWithStatus("waiting")
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for stuck", () => {
      const task = createTaskWithStatus("stuck")
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns false for error", () => {
      const task = createTaskWithStatus("error")
      expect(isResumableTask(task)).toBe(false)
    })
  })

  describe("canDeleteTask function (idle/waiting/stuck/error are deletable)", () => {
    it("returns false for running (active, cannot delete)", () => {
      const task = createTaskWithStatus("running")
      expect(canDeleteTask(task)).toBe(false)
    })

    it("returns true for idle", () => {
      const task = createTaskWithStatus("idle")
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for waiting", () => {
      const task = createTaskWithStatus("waiting")
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for stuck", () => {
      const task = createTaskWithStatus("stuck")
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for error", () => {
      const task = createTaskWithStatus("error")
      expect(canDeleteTask(task)).toBe(true)
    })
  })

  describe("state transition matrix", () => {
    // Verify that all non-active states behave consistently
    const nonActiveStates: WopalTask["status"][] = ["idle", "waiting", "stuck"]

    for (const status of nonActiveStates) {
      it(`${status}: isTaskActive returns false`, () => {
        const task = createTaskWithStatus(status)
        expect(isTaskActive(task)).toBe(false)
      })

      it(`${status}: isResumableTask returns true`, () => {
        const task = createTaskWithStatus(status)
        expect(isResumableTask(task)).toBe(true)
      })

      it(`${status}: canDeleteTask returns true`, () => {
        const task = createTaskWithStatus(status)
        expect(canDeleteTask(task)).toBe(true)
      })
    }

    it("running: isTaskActive returns true (the only active state)", () => {
      const task = createTaskWithStatus("running")
      expect(isTaskActive(task)).toBe(true)
    })

    it("running: isResumableTask returns false (active states are not resumable)", () => {
      const task = createTaskWithStatus("running")
      expect(isResumableTask(task)).toBe(false)
    })

    it("running: canDeleteTask returns false (active states cannot be deleted)", () => {
      const task = createTaskWithStatus("running")
      expect(canDeleteTask(task)).toBe(false)
    })

    it("error: isTaskActive false, isResumableTask false, canDeleteTask true", () => {
      const task = createTaskWithStatus("error")
      expect(isTaskActive(task)).toBe(false)
      expect(isResumableTask(task)).toBe(false)
      expect(canDeleteTask(task)).toBe(true)
    })
  })
})
