import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WopalTask, OpenCodeClient, SessionMessage } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import {
  sendProgressNotification,
  notifyParent,
  notifyParentStuck,
  sendNotification,
} from "./task-notifier.js"

const mockLogger: LoggerInstance = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
};

describe("task-notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("sendProgressNotification", () => {
    it("contains all required fields in notification text", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockResolvedValue({
        data: [
          {
            info: { role: "assistant" },
            parts: [
              { type: "text", text: "Task output text" },
              { type: "tool", tool: "bash" },
              { type: "tool", tool: "bash" },
              { type: "tool", tool: "read" },
              { type: "tool", tool: "todowrite", state: { input: { todos: [{ status: "completed" }] } } },
            ],
          },
        ],
      })

      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task description",
        status: "running",
        startedAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
        createdAt: new Date(),
        agent: "test-agent",
        prompt: "test prompt",
      }

      await sendProgressNotification(
        { client, debugLog: mockLogger },
        task,
        42,
        65,
        "time_quota",
      )

      expect(mockPromptAsync).toHaveBeenCalledOnce()
      const callArg = mockPromptAsync.mock.calls[0][0]
      const notificationText = callArg.body.parts[0].text

      // Verify required fields
      expect(notificationText).toContain("wopal-task-123")
      expect(notificationText).toContain("**Agent:** test-agent")
      expect(notificationText).toContain("Test task description")
      expect(notificationText).toContain("42 messages")
      expect(notificationText).toContain("65% used ⚠️") // Context warning
      expect(notificationText).toContain("3m") // Runtime
      expect(notificationText).toContain("time quota elapsed") // Trigger
      expect(notificationText).toContain("4 calls") // Tool count (bash:2, read:1, todowrite:1)
      expect(notificationText).toContain("bash:2") // Top tool
      expect(notificationText).toContain("✓1 (1/1, 100%)") // Todo summary with percentage
      expect(notificationText).toContain("Task output text") // Last output
    })

    it("logs debug summary on success", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        startedAt: new Date(),
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await sendProgressNotification(
        { client, debugLog: mockLogger },
        task,
        42,
        50,
        "context_milestone",
      )

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[progressNotify] sent:")
      )
      expect(mockLogger.debug.mock.calls[0][0]).toContain("taskId=wopal-task-123")
      expect(mockLogger.debug.mock.calls[0][0]).toContain("msgs=42")
    })

    it("logs debug summary on failure", async () => {
      const mockPromptAsync = vi.fn().mockRejectedValue(new Error("Network error"))
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        startedAt: new Date(),
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await sendProgressNotification(
        { client, debugLog: mockLogger },
        task,
        42,
        null,
        "time_quota",
      )

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[progressNotify] failed:")
      )
    })

    it("does not crash when messages API fails", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockRejectedValue(new Error("API failure"))
      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        startedAt: new Date(),
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      // Should not throw
      await sendProgressNotification(
        { client, debugLog: mockLogger },
        task,
        42,
        null,
      )

      expect(mockPromptAsync).toHaveBeenCalledOnce()
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[progressNotify] failed to fetch messages")
      )
    })
  })

  describe("notifyParent", () => {
    it("IDLE notification contains tools/todos/last output", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockResolvedValue({
        data: [
          {
            info: { role: "assistant" },
            parts: [
              { type: "text", text: "Task completed successfully" },
              { type: "tool", tool: "bash" },
              { type: "tool", tool: "todowrite", state: { input: { todos: [{ status: "completed" }, { status: "completed" }] } } },
            ],
          },
        ],
      })

      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        idleNotified: true,
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockPromptAsync).toHaveBeenCalledOnce()
      const notificationText = mockPromptAsync.mock.calls[0][0].body.parts[0].text

      expect(notificationText).toContain("[WOPAL TASK IDLE]")
      expect(notificationText).toContain("**Agent:** test")
      expect(notificationText).toContain("2 calls") // Tool count (bash:1, todowrite:1)
      expect(notificationText).toContain("✓2 (2/2, 100%)") // Todo summary with percentage
      expect(notificationText).toContain("Task completed successfully") // Last output
    })

    it("ERROR notification stays concise (no enrichment)", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockResolvedValue({
        data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "Output" }] }],
      })

      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "error",
        error: "Task crashed with timeout",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockPromptAsync).toHaveBeenCalledOnce()
      expect(mockMessages).not.toHaveBeenCalled() // No message fetch for error
      const notificationText = mockPromptAsync.mock.calls[0][0].body.parts[0].text

      expect(notificationText).toContain("[WOPAL TASK ERROR]")
      expect(notificationText).toContain("**Agent:** test")
      expect(notificationText).toContain("Task crashed with timeout")
      expect(notificationText).not.toContain("Tools:")
      expect(notificationText).not.toContain("Todos:")
      expect(notificationText).not.toContain("Last output:")
    })

    it("logs debug summary on success", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        idleNotified: true,
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[notifyParent] sent:")
      )
      expect(mockLogger.debug.mock.calls[0][0]).toContain("taskId=wopal-task-123")
      expect(mockLogger.debug.mock.calls[0][0]).toContain("status=IDLE")
    })

    it("logs debug summary on failure", async () => {
      const mockPromptAsync = vi.fn().mockRejectedValue(new Error("Network error"))
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "error",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[notifyParent] failed:")
      )
    })

    it("does not fetch messages when task.error is set", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockResolvedValue({ data: [] })
      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "error",
        error: "Error occurred",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockMessages).not.toHaveBeenCalled()
    })

    it("fetches messages only for idle non-error", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const mockMessages = vi.fn().mockResolvedValue({ data: [] })
      const client: OpenCodeClient = {
        session: {
          promptAsync: mockPromptAsync,
          messages: mockMessages,
        },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        idleNotified: true, // Idle but no error
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParent({ client, debugLog: mockLogger }, task)

      expect(mockMessages).toHaveBeenCalledOnce()
    })
  })

  describe("notifyParentStuck", () => {
    it("contains ID, description, and duration in notification", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test stuck task",
        status: "running",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParentStuck({ client, debugLog: mockLogger }, task, "2m 30s")

      expect(mockPromptAsync).toHaveBeenCalledOnce()
      const notificationText = mockPromptAsync.mock.calls[0][0].body.parts[0].text

      expect(notificationText).toContain("[WOPAL TASK STUCK]")
      expect(notificationText).toContain("wopal-task-123")
      expect(notificationText).toContain("**Agent:** test")
      expect(notificationText).toContain("Test stuck task")
      expect(notificationText).toContain("No meaningful output for 2m 30s")
    })

    it("logs debug summary on success", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParentStuck({ client, debugLog: mockLogger }, task, "1m 45s")

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[notifyParentStuck] sent:")
      )
      expect(mockLogger.debug.mock.calls[0][0]).toContain("taskId=wopal-task-123")
      expect(mockLogger.debug.mock.calls[0][0]).toContain("duration=1m 45s")
    })

    it("logs debug summary on failure", async () => {
      const mockPromptAsync = vi.fn().mockRejectedValue(new Error("Network error"))
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const task: WopalTask = {
        id: "wopal-task-123",
        sessionID: "session-123",
        parentSessionID: "parent-456",
        description: "Test task",
        status: "running",
        createdAt: new Date(),
        agent: "test",
        prompt: "test",
      }

      await notifyParentStuck({ client, debugLog: mockLogger }, task, "2m")

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[notifyParentStuck] failed:")
      )
    })
  })

  describe("sendNotification", () => {
    it("returns true on success", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const result = await sendNotification(
        { client, debugLog: mockLogger },
        "parent-123",
        "Test notification",
      )

      expect(result).toBe(true)
      expect(mockPromptAsync).toHaveBeenCalledWith({
        path: { id: "parent-123" },
        body: {
          noReply: false,
          parts: [{ type: "text", text: "Test notification" }],
        },
      })
    })

    it("returns false on failure", async () => {
      const mockPromptAsync = vi.fn().mockRejectedValue(new Error("Network error"))
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      const result = await sendNotification(
        { client, debugLog: mockLogger },
        "parent-123",
        "Test notification",
      )

      expect(result).toBe(false)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[sendNotification] error:")
      )
    })

    it("returns false when promptAsync unavailable", async () => {
      const client: OpenCodeClient = {
        session: {},
      } as OpenCodeClient

      const result = await sendNotification(
        { client, debugLog: mockLogger },
        "parent-123",
        "Test notification",
      )

      expect(result).toBe(false)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "[sendNotification] skipped: session.promptAsync unavailable"
      )
    })

    it("noReply defaults to false for task notifications", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      await sendNotification(
        { client, debugLog: mockLogger },
        "parent-123",
        "Task notification",
      )

      expect(mockPromptAsync.mock.calls[0][0].body.noReply).toBe(false)
    })

    it("noReply is true for permission notifications", async () => {
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      const client: OpenCodeClient = {
        session: { promptAsync: mockPromptAsync },
      } as OpenCodeClient

      await sendNotification(
        { client, debugLog: mockLogger },
        "parent-123",
        "Permission notification",
        true,
      )

      expect(mockPromptAsync.mock.calls[0][0].body.noReply).toBe(true)
    })
  })
})