import { describe, it, expect, vi, beforeEach } from "vitest"
import { classifyTaskStop } from "./task-stop-classifier.js"
import type { WopalTask, OpenCodeClient, SessionMessage } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { extractMessages } from "./session-messages.js"

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

function createTask(overrides: Partial<WopalTask> = {}): WopalTask {
  return {
    id: "wopal-task-123",
    sessionID: "session-123",
    parentSessionID: "parent-456",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "test prompt",
    createdAt: new Date(),
    startedAt: new Date(),
    progress: { toolCalls: 0, lastUpdate: new Date() },
    ...overrides,
  } as WopalTask
}

function createAssistantMessage(text: string, synthetic: boolean = false): SessionMessage {
  return {
    id: "msg-1",
    info: { role: "assistant" },
    parts: [{ type: "text", text, synthetic }],
  }
}

function createAssistantToolMessage(tool: string): SessionMessage {
  return {
    id: "msg-tool-1",
    info: { role: "assistant" },
    parts: [{ type: "tool", tool }],
  }
}

function createClientWithMessages(messages: SessionMessage[]): OpenCodeClient {
  return {
    session: {
      messages: vi.fn().mockResolvedValue({ data: messages }),
    },
  } as OpenCodeClient
}

describe("task-stop-classifier", () => {
  let mockLogger: LoggerInstance

  beforeEach(() => {
    mockLogger = createMockLogger()
    vi.clearAllMocks()
  })

  describe("classifyTaskStop", () => {
    it("sets idle when new assistant text exists and differs from lastAssistantMessage", async () => {
      const task = createTask({
        lastAssistantMessage: "Previous output",
      })
      const client = createClientWithMessages([
        createAssistantMessage("New output from fae"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("idle")
      expect(task.status).toBe("idle")
      expect(task.lastAssistantMessage).toBe("New output from fae")
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] idle"),
      )
    })

    it("sets error when no assistant activity evidence exists", async () => {
      const task = createTask()
      const client = createClientWithMessages([])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("error")
      expect(task.status).toBe("error")
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] error"),
      )
    })

    it("sets stuck when assistant tool activity exists without assistant text", async () => {
      const task = createTask()
      const client = createClientWithMessages([
        createAssistantToolMessage("bash"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("stuck")
      expect(task.status).toBe("stuck")
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] stuck"),
      )
    })

    it("sets stuck when assistant text is same as lastAssistantMessage", async () => {
      const task = createTask({
        lastAssistantMessage: "Same output",
      })
      const client = createClientWithMessages([
        createAssistantMessage("Same output"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("stuck")
      expect(task.status).toBe("stuck")
      expect(task.lastAssistantMessage).toBe("Same output")
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] stuck"),
      )
    })

    it("sets error when messages API fails and no activity evidence exists", async () => {
      const task = createTask()
      const client = {
        session: {
          messages: vi.fn().mockRejectedValue(new Error("API failure")),
        },
      } as OpenCodeClient

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("error")
      expect(task.status).toBe("error")
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] error"),
      )
    })

    it("sets stuck when messages API fails but progress evidence exists", async () => {
      const task = createTask({
        progress: { toolCalls: 1, lastUpdate: new Date(), lastMeaningfulActivity: new Date() },
      })
      const client = {
        session: {
          messages: vi.fn().mockRejectedValue(new Error("API failure")),
        },
      } as OpenCodeClient

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("stuck")
      expect(task.status).toBe("stuck")
    })

    it("sets idle when waiting task has new assistant text", async () => {
      const task = createTask({
        status: "waiting",
        pendingQuestionID: "q-123",
        lastAssistantMessage: "Previous response",
      })
      const client = createClientWithMessages([
        createAssistantMessage("New response after question"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("idle")
      expect(task.status).toBe("idle")
      expect(task.pendingQuestionID).toBeUndefined()
      expect(task.lastAssistantMessage).toBe("New response after question")
    })

    it("ignores synthetic assistant text", async () => {
      const task = createTask({
        lastAssistantMessage: "Real output",
      })
      const client = createClientWithMessages([
        createAssistantMessage("Synthetic notification", true),
        createAssistantMessage("Real output"), // same as lastAssistantMessage
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("stuck")
      expect(task.status).toBe("stuck")
    })

    it("sets idle when lastAssistantMessage is undefined and new text exists", async () => {
      const task = createTask() // no lastAssistantMessage
      const client = createClientWithMessages([
        createAssistantMessage("First output"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("idle")
      expect(task.status).toBe("idle")
      expect(task.lastAssistantMessage).toBe("First output")
    })

    it("skips classification for non-running/waiting tasks", async () => {
      const task = createTask({ status: "idle" })
      const client = createClientWithMessages([])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("idle") // unchanged
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("[classifyTaskStop] skipped"),
      )
    })

    it("sets error when only synthetic text exists (no assistant activity evidence)", async () => {
      const task = createTask()
      const client = createClientWithMessages([
        createAssistantMessage("Synthetic only", true),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("error")
      expect(task.status).toBe("error")
    })

    it("handles multiple assistant messages and uses latest non-synthetic", async () => {
      const task = createTask({
        lastAssistantMessage: "Old output",
      })
      const client = createClientWithMessages([
        createAssistantMessage("Old output"),
        createAssistantMessage("Synthetic message", true),
        createAssistantMessage("Latest real output"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe("idle")
      expect(task.status).toBe("idle")
      expect(task.lastAssistantMessage).toBe("Latest real output")
    })

    it("returns result with status field matching task.status", async () => {
      const task = createTask()
      const client = createClientWithMessages([
        createAssistantMessage("Output"),
      ])

      const result = await classifyTaskStop({
        task,
        client,
        debugLog: mockLogger,
      })

      expect(result.status).toBe(task.status)
      expect(result.lastAssistantMessage).toBe(task.lastAssistantMessage)
    })
  })
})
