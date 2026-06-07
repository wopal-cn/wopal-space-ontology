import { describe, it, expect } from "vitest"
import { isMeaningfulActivity, trackActivity, analyzeProgress } from "./progress.js"
import type { WopalTask, SessionMessage } from "../types.js"

function createTask(overrides: Partial<WopalTask> = {}): WopalTask {
  return {
    id: "task-1",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "test",
    parentSessionID: "parent-1",
    createdAt: new Date(),
    startedAt: new Date(Date.now() - 60_000),
    sessionID: "session-1",
    progress: { toolCalls: 0, lastUpdate: new Date() },
    ...overrides,
  } as WopalTask
}

describe("isMeaningfulActivity", () => {
  it("should identify tool as meaningful", () => {
    expect(isMeaningfulActivity("tool")).toBe(true)
  })

  it("should identify text as meaningful", () => {
    expect(isMeaningfulActivity("text")).toBe(true)
  })

  it("should not identify reasoning as meaningful", () => {
    expect(isMeaningfulActivity("reasoning")).toBe(false)
  })

  it("should not identify tool_result as meaningful", () => {
    expect(isMeaningfulActivity("tool_result")).toBe(false)
  })

  it("should handle undefined as not meaningful", () => {
    expect(isMeaningfulActivity(undefined)).toBe(false)
  })

  it("should handle empty string as not meaningful", () => {
    expect(isMeaningfulActivity("")).toBe(false)
  })
})

describe("trackActivity", () => {
  it("should update lastMeaningfulActivity for tool_call", () => {
    const task = createTask()
    const before = new Date()
    const result = trackActivity(task, "tool")

    expect(result).toBe(true)
    expect(task.progress?.lastMeaningfulActivity).toBeDefined()
    expect(task.progress?.lastMeaningfulActivity!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(task.progress?.lastUpdate).toEqual(task.progress?.lastMeaningfulActivity)
    expect(task.progress?.toolCalls).toBe(1)
  })

  it("should update lastMeaningfulActivity for text", () => {
    const task = createTask()
    const result = trackActivity(task, "text")

    expect(result).toBe(true)
    expect(task.progress?.lastMeaningfulActivity).toBeDefined()
    expect(task.progress?.toolCalls).toBe(0)
  })

  it("should not update for reasoning", () => {
    const task = createTask()
    const originalUpdate = task.progress?.lastUpdate
    const result = trackActivity(task, "reasoning")

    expect(result).toBe(false)
    expect(task.progress?.lastMeaningfulActivity).toBeUndefined()
    expect(task.progress?.lastUpdate).toEqual(originalUpdate)
  })

  it("should not update for tool_result", () => {
    const task = createTask()
    const result = trackActivity(task, "tool_result")

    expect(result).toBe(false)
    expect(task.progress?.lastMeaningfulActivity).toBeUndefined()
  })

  it("should increment toolCalls for repeated tool_call", () => {
    const task = createTask()
    trackActivity(task, "tool")
    trackActivity(task, "tool")
    trackActivity(task, "tool")

    expect(task.progress?.toolCalls).toBe(3)
  })

  it("should not increment toolCalls for text", () => {
    const task = createTask()
    trackActivity(task, "text")
    trackActivity(task, "text")

    expect(task.progress?.toolCalls).toBe(0)
  })

  it("should handle task without progress gracefully", () => {
    const task: WopalTask = {
      id: "task-no-progress",
      status: "running",
      description: "Test task",
      agent: "fae",
      prompt: "test",
      parentSessionID: "parent-1",
      createdAt: new Date(),
      startedAt: new Date(Date.now() - 60_000),
      sessionID: "session-1",
    }
    const result = trackActivity(task, "tool")

    expect(result).toBe(false)
  })

  it("should also update lastUpdate when tracking meaningful activity", () => {
    const task = createTask()
    task.progress!.lastUpdate = new Date(Date.now() - 10_000)
    const oldUpdateTime = task.progress!.lastUpdate.getTime()

    trackActivity(task, "text")

    expect(task.progress?.lastUpdate.getTime()).toBeGreaterThan(oldUpdateTime)
    expect(task.progress?.lastUpdate).toEqual(task.progress?.lastMeaningfulActivity)
  })
})

describe("analyzeProgress", () => {
  describe("#given empty messages", () => {
    it("returns zero counts", () => {
      const result = analyzeProgress([], [])
      expect(result.totalMessages).toBe(0)
      expect(result.newMessages).toBe(0)
      expect(result.toolCalls).toEqual([])
      expect(result.hasAssistantText).toBe(false)
    })
  })

  describe("#given messages with assistant text", () => {
    it("detects assistant text content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Hello, world!" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(true)
    })

    it("detects reasoning content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: "Thinking..." }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(true)
    })

    it("ignores empty text", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "   " }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(false)
    })
  })

  describe("#given tool calls", () => {
    it("counts tool calls", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Read" },
          ],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([
        { tool: "Read", count: 2 },
        { tool: "Edit", count: 1 },
      ])
    })

    it("handles tool_call type", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool", tool: "Bash" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([{ tool: "Bash", count: 1 }])
    })

    it("uses unknown for missing tool name", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([{ tool: "unknown", count: 1 }])
    })
  })

  describe("#given finish reason", () => {
    it("extracts finish reason from last assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          info: { role: "assistant", finish: "stop" },
          parts: [{ type: "text", text: "Hi" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.finishReason).toBe("stop")
    })

    it("returns undefined when no assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.finishReason).toBeUndefined()
    })
  })

  describe("#given timestamps", () => {
    it("calculates last activity time from message time object", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 5000 } },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBeGreaterThanOrEqual(5000)
    })

    it("calculates last activity time from string time", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: new Date(Date.now() - 10000).toISOString() },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBeGreaterThanOrEqual(9000)
    })

    it("returns zero when no timestamps", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBe(0)
    })
  })

  describe("#given new messages", () => {
    it("counts new messages separately", () => {
      const allMessages: SessionMessage[] = [
        { info: { role: "user" } },
        { info: { role: "assistant" } },
        { info: { role: "assistant" } },
      ]
      const newMessages: SessionMessage[] = [
        { info: { role: "assistant" } },
      ]
      const result = analyzeProgress(allMessages, newMessages)
      expect(result.totalMessages).toBe(3)
      expect(result.newMessages).toBe(1)
    })
  })
})