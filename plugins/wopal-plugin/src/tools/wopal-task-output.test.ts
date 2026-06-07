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

function createMockClientWithTodos() {
  return {
    session: {
      messages: vi.fn().mockResolvedValue({
        data: [
          {
            info: { role: "assistant" },
            parts: [
              { type: "tool", tool: "todowrite", state: { input: { todos: [
                { content: "Implement feature X", status: "completed", priority: "high" },
                { content: "Write tests", status: "in_progress", priority: "high" },
                { content: "Update docs", status: "pending", priority: "medium" },
                { content: "Refactor code", status: "cancelled" },
              ] } } },
              { type: "text", text: "Working on todos" },
            ],
          },
        ],
      }),
      status: vi.fn().mockResolvedValue({ childSession: { type: "idle" } }),
    },
  }
}

function createMockClientNoTodos() {
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

  it("shows idle status when task.status is idle", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask({ status: "idle" })
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

  it("does not show idle status for running tasks", async () => {
    const mockClient = createMockClient()
    const runningTask = createRunningTask()
    const mockManager = createMockTaskManager(runningTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).not.toContain("**Idle:**")
    expect(result).not.toContain("This task is idle")
  })

  it("shows idle status for idle task (status=idle)", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask({ status: "idle" })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("**Idle:**")
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

  it("shows 'idle' status text when task.status is idle", async () => {
    const mockClient = createMockClient()
    const idleTask = createRunningTask({ status: "idle" })
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalOutputTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("**Status:** idle")
    expect(result).not.toContain("**Status:** running")
  })

  describe("todos section", () => {
    it("returns todo summary when section=todos without detail", async () => {
      const mockClient = createMockClientWithTodos()
      const runningTask = createRunningTask()
      const mockManager = createMockTaskManager(runningTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, section: "todos" },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("✓1")
      expect(result).toContain("⏳1")
      expect(result).toContain("⏸1")
      expect(result).toContain("✗1")
      expect(result).toContain("1/4")
      expect(result).not.toContain("Implement feature X")
    })

    it("returns full todo list when section=todos with detail=true", async () => {
      const mockClient = createMockClientWithTodos()
      const runningTask = createRunningTask()
      const mockManager = createMockTaskManager(runningTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, section: "todos", detail: true },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("✓1")
      expect(result).toContain("⏳1")
      expect(result).toContain("Implement feature X")
      expect(result).toContain("Write tests")
      expect(result).toContain("Update docs")
      expect(result).toContain("Refactor code")
    })

    it("returns 'No todos found' when no todowrite calls", async () => {
      const mockClient = createMockClientNoTodos()
      const runningTask = createRunningTask()
      const mockManager = createMockTaskManager(runningTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, section: "todos" },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("(No todos found)")
    })

    it("returns 'Failed to fetch' on message fetch error", async () => {
      const mockClient = {
        session: {
          messages: vi.fn().mockRejectedValue(new Error("Connection refused")),
          status: vi.fn().mockResolvedValue({ childSession: { type: "idle" } }),
        },
      }
      const runningTask = createRunningTask()
      const mockManager = createMockTaskManager(runningTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: runningTask.id, section: "todos" },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("(Failed to fetch:")
      expect(result).toContain("Connection refused")
    })

    it("returns todo summary for waiting tasks", async () => {
      const mockClient = createMockClientWithTodos()
      const waitingTask = createRunningTask({ status: "waiting" })
      const mockManager = createMockTaskManager(waitingTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: waitingTask.id, section: "todos" },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("✓1")
      expect(result).toContain("⏳1")
      expect(result).toContain("1/4")
      expect(result).not.toContain("Implement feature X")
    })

    it("returns todo detail for waiting tasks with detail=true", async () => {
      const mockClient = createMockClientWithTodos()
      const waitingTask = createRunningTask({ status: "waiting" })
      const mockManager = createMockTaskManager(waitingTask, mockClient)
      const execute = getExecute(createWopalOutputTool(mockManager as never))

      const result = await execute(
        { task_id: waitingTask.id, section: "todos", detail: true },
        { sessionID: parentSessionID },
      )

      expect(result).toContain("**Todos:**")
      expect(result).toContain("Implement feature X")
      expect(result).toContain("Write tests")
    })
  })
})