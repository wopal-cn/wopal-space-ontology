import { describe, expect, it, vi } from "vitest"
import { createWopalTaskFinishTool } from "./wopal-task-finish.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockClient() {
  return {
    session: {
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
    finishTask: vi.fn(async (taskId: string, parentSessionID: string) => {
      const t = task && task.id === taskId && task.parentSessionID === parentSessionID ? task : undefined
      if (!t) {
        return { ok: false, message: "Task not found or not owned by this session" }
      }
      
      // Check if task can be deleted
      if (t.status === "running" && !t.idleNotified) {
        return { ok: false, message: "Task is actively running. Use wopal_task_abort or wopal_task_reply(interrupt=true) to stop first, then finish." }
      }
      
      // Delete session if present
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

describe("wopal_task_finish", () => {
  const parentSessionID = "parent-session-123"

  function createTask(overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: "wopal-task-456",
      sessionID: "child-session-789",
      status: "idle",
      description: "Test task",
      agent: "fae",
      prompt: "Do something",
      parentSessionID,
      createdAt: new Date(),
      concurrencyKey: "default",
      idleNotified: true,
      ...overrides,
    }
  }

  it("fails when context session id is missing", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute({ task_id: "wopal-task-456" }, {})

    expect(result).toBe("Failed to finish task: current session ID is unavailable.")
  })

  it("task not found or not owned: returns error", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent" },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to finish task: Task not found")
  })

  it("rejects actively running task (without idleNotified)", async () => {
    const runningTask = createTask({ status: "running", idleNotified: undefined })
    const mockManager = createMockTaskManager(runningTask)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to finish task")
    expect(result).toContain("actively running")
    expect(result).toContain("wopal_task_abort")
  })

  it("succeeds on pending task", async () => {
    const pendingTask = createTask({ status: "pending", sessionID: undefined, concurrencyKey: undefined })
    const mockManager = createMockTaskManager(pendingTask)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: pendingTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
  })

  it("succeeds on idle task (running + idleNotified)", async () => {
    const idleTask = createTask({ status: "running", idleNotified: true })
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    expect(mockClient.session.delete).toHaveBeenCalledWith({
      path: { id: idleTask.sessionID },
    })
  })

  it("succeeds on error task", async () => {
    const errorTask = createTask({ status: "error", error: "Something went wrong" })
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(errorTask, mockClient)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: errorTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    expect(mockClient.session.delete).toHaveBeenCalled()
  })

  it("succeeds on waiting task", async () => {
    const waitingTask = createTask({ status: "waiting", waitingReason: "question_detected" })
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(waitingTask, mockClient)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Task finished successfully. Session deleted from OpenCode.")
    expect(mockClient.session.delete).toHaveBeenCalled()
  })

  it("handles session.delete returning error", async () => {
    const mockClient = createMockClient()
    mockClient.session.delete.mockResolvedValueOnce({ error: "Session not found" })
    const idleTask = createTask({ status: "running", idleNotified: true })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to finish task")
    expect(result).toContain("Failed to delete session")
    expect(result).toContain("Session not found")
  })

  it("handles session.delete throwing exception", async () => {
    const mockClient = createMockClient()
    mockClient.session.delete.mockRejectedValueOnce(new Error("Network error"))
    const idleTask = createTask({ status: "running", idleNotified: true })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalTaskFinishTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to finish task")
    expect(result).toContain("Failed to delete session")
    expect(result).toContain("Network error")
  })
})