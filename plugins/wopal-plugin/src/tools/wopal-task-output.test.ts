import { describe, expect, it, vi } from "vitest"
import { createWopalOutputTool } from "./wopal-task-output.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockClient() {
  return {
    session: {
      messages: vi.fn().mockResolvedValue({
        data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "test output" }] }],
      }),
      status: vi.fn().mockResolvedValue({ childSession: { type: "idle" } }),
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
    getDirectory: vi.fn(() => "/test/dir"),
    getConcurrencyStatus: vi.fn(() => ({ used: 2, limit: 5, available: 3 })),
  }
}

describe("wopal_task_output", () => {
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
      ...overrides,
    }
  }

  it("shows idle status when task.idleNotified is true", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask({ idleNotified: true })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("**Idle:** awaiting your judgment")
    expect(result).toContain("wopal_task_finish")
    expect(result).toContain("wopal_task_reply")
  })

  it("does not show idle status when idleNotified is false or undefined", async () => {
    const mockClient = createMockClient()
    const runningTask = createRunningTask({ idleNotified: false })
    const mockManager = createMockTaskManager(runningTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).not.toContain("**Idle:**")
    expect(result).not.toContain("This task is idle")
  })

  it("shows idle status for idle task without idleNotified undefined", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask() // idleNotified undefined
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).not.toContain("**Idle:**")
  })

  it("returns error when task not found", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent" },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Task not found")
  })

  it("returns error when sessionID missing", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute({ task_id: "task-1" }, {})

    expect(result).toBe("Current session ID is unavailable; cannot read task status.")
  })

  it("shows 'idle (awaiting judgment)' status text when task.idleNotified is true", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask({ idleNotified: true })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("**Status:** idle (awaiting judgment)")
    expect(result).not.toContain("**Status:** running")
  })
})