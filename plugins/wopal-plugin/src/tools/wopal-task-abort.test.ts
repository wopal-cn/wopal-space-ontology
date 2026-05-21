import { describe, expect, it, vi } from "vitest"
import { createWopalTaskAbortTool } from "./wopal-task-abort.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockClient() {
  return {
    session: {
      abort: vi.fn().mockResolvedValue(undefined),
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
  }
}

describe("wopal_task_abort", () => {
  const parentSessionID = "parent-session-123"

  function createRunningTask(overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: "wopal-task-456",
      sessionID: "child-session-789",
      status: "running",
      description: "Test task",
      agent: "fae",
      prompt: "Do something",
      parentSessionID,
      createdAt: new Date(),
      concurrencyKey: "default",
      ...overrides,
    }
  }

  it("fails when context session id is missing", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute({ task_id: "wopal-task-456" }, {})

    expect(result).toBe("Failed to abort task: current session ID is unavailable.")
  })

  it("task not found or not owned: returns error", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Failed to abort task: task not found or not owned by this session.")
  })

  it("non-running task: returns error with guidance", async () => {
    const waitingTask = createRunningTask({ status: "waiting" })
    const mockManager = createMockTaskManager(waitingTask)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to abort task: task is waiting")
    expect(result).toContain("abort only works on running tasks")
    expect(result).toContain("Use wopal_task_finish")
  })

  it("task without sessionID: returns error", async () => {
    const taskWithoutSession = createRunningTask({ sessionID: undefined })
    const mockManager = createMockTaskManager(taskWithoutSession)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: taskWithoutSession.id },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Failed to abort task: task has no active session.")
  })

  it("successfully aborts running task, sets idle phase", async () => {
    const mockClient = createMockClient()
    const runningTask = createRunningTask()
    const mockManager = createMockTaskManager(runningTask, mockClient)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain(`Task ${runningTask.id} aborted`)
    expect(result).toContain("Execution stopped")
    expect(result).toContain("idle phase")
    expect(result).toContain("wopal_task_finish")
    expect(result).toContain("wopal_task_reply")
    
    // Verify session.abort was called
    expect(mockClient.session.abort).toHaveBeenCalledWith({
      path: { id: runningTask.sessionID },
    })

    // Verify task state changes
    expect(runningTask.idleNotified).toBe(true)
    expect(runningTask.waitingConcurrencyKey).toBe("default")
    expect(mockManager.releaseConcurrencySlot).toHaveBeenCalledWith(runningTask)
  })

  it("abort handles abort API failure gracefully", async () => {
    const mockClient = createMockClient()
    mockClient.session.abort.mockRejectedValueOnce(new Error("Session already idle"))
    const runningTask = createRunningTask()
    const mockManager = createMockTaskManager(runningTask, mockClient)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    // Should still succeed even if abort fails
    expect(result).toContain(`Task ${runningTask.id} aborted`)
    expect(runningTask.idleNotified).toBe(true)
  })

  it("abort without concurrencyKey does not set waitingConcurrencyKey", async () => {
    const mockClient = createMockClient()
    const runningTask = createRunningTask({ concurrencyKey: undefined })
    const mockManager = createMockTaskManager(runningTask, mockClient)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain(`Task ${runningTask.id} aborted`)
    expect(runningTask.idleNotified).toBe(true)
    expect(runningTask.waitingConcurrencyKey).toBeUndefined()
    // releaseConcurrencySlot is called even when concurrencyKey is undefined (no-op in implementation)
    expect(mockManager.releaseConcurrencySlot).toHaveBeenCalledWith(runningTask)
  })

  it("error task cannot be aborted", async () => {
    const errorTask = createRunningTask({ status: "error", error: "Previous error" })
    const mockManager = createMockTaskManager(errorTask)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: errorTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to abort task: task is error")
    expect(result).toContain("Use wopal_task_finish")
  })

  it("idle task (running + idleNotified) cannot be aborted again", async () => {
    const idleTask = createRunningTask({ idleNotified: true })
    const mockManager = createMockTaskManager(idleTask)
    const execute = getExecute(createWopalTaskAbortTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    // idle phase task should be rejected with guidance to use finish instead
    expect(result).toContain("Failed to abort task: task is already in idle phase")
    expect(result).toContain("wopal_task_finish")
    expect(result).toContain("wopal_task_reply")
  })
})