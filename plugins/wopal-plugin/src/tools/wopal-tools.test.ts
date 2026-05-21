import { describe, expect, it, vi } from "vitest"
import { createWopalOutputTool } from "./wopal-task-output.js"
import { createWopalTaskTool } from "./wopal-task.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute
}

describe("wopal tools", () => {
  describe("wopal_task", () => {
    it("fails when context session id is missing", async () => {
      const manager = {
        launch: vi.fn(),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      await expect(
        execute(
          { description: "Test task", prompt: "Do something", agent: "general" },
          {},
        ),
      ).resolves.toBe("Failed to launch task: current session ID is unavailable.")
      expect(manager.launch).not.toHaveBeenCalled()
    })

    it("surfaces launch failures", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: false,
          taskId: "task-1",
          status: "error",
          error: "Background task launch failed: session.create is unavailable",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      await expect(
        execute(
          { description: "Test task", prompt: "Do something", agent: "general" },
          { sessionID: "parent-1" },
        ),
      ).resolves.toContain("Reason: Background task launch failed: session.create is unavailable")
    })

    it("returns task id on success", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: true,
          taskId: "task-123",
          status: "running",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      const result = await execute(
        { description: "Test task", prompt: "Do something" },
        { sessionID: "parent-1" },
      )

      expect(result).toContain("task-123")
      expect(result).toContain("running")
      expect(manager.launch).toHaveBeenCalledWith({
        description: "Test task",
        prompt: expect.stringContaining("Do something"),
        agent: "general",
        parentSessionID: "parent-1",
      })
    })

    it("uses default agent when not specified", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: true,
          taskId: "task-1",
          status: "running",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      await execute(
        { description: "Test task", prompt: "Do something" },
        { sessionID: "parent-1" },
      )

      expect(manager.launch).toHaveBeenCalledWith(
        expect.objectContaining({ agent: "general" }),
      )
    })
  })

  describe("wopal_task_output", () => {
    it("enforces ownership via current session", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue(undefined),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, { sessionID: "parent-2" }),
      ).resolves.toBe("Task not found for current session: task-1")
      expect(manager.getTaskForParent).toHaveBeenCalledWith("task-1", "parent-2")
    })

    it("describes running tasks", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "running",
          description: "Test task",
          agent: "general",
        }),
        getConcurrencyStatus: vi.fn().mockReturnValue({ used: 2, limit: 5, available: 3 }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** running")
      expect(output).toContain("still running")
    })

    it("describes error tasks with error message", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "error",
          description: "Test task",
          agent: "general",
          error: "Something went wrong",
        }),
        getConcurrencyStatus: vi.fn().mockReturnValue({ used: 2, limit: 5, available: 3 }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** error")
      expect(output).toContain("Error: Something went wrong")
    })

    it("describes waiting tasks", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "waiting",
          description: "Test task",
          agent: "general",
          waitingReason: "question_detected",
        }),
        getConcurrencyStatus: vi.fn().mockReturnValue({ used: 2, limit: 5, available: 3 }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** waiting")
      expect(output).toContain("**Waiting reason:** question_detected")
    })

    it("fails when context session id is missing", async () => {
      const manager = {
        getTaskForParent: vi.fn(),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, {}),
      ).resolves.toBe("Current session ID is unavailable; cannot read task status.")
      expect(manager.getTaskForParent).not.toHaveBeenCalled()
    })
  })
})