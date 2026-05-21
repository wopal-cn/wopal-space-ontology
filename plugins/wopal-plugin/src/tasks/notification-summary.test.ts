import { describe, it, expect } from "vitest"
import type { SessionMessage } from "../types.js"
import {
  extractTodoSummary,
  formatTodoSummary,
  formatTodoPercentage,
  extractToolCallSummary,
  formatToolCallSummary,
  extractLastOutput,
  formatElapsedRuntime,
  type TodoSummary,
  type ToolCallSummary,
} from "./notification-summary.js"

describe("notification-summary", () => {
  describe("extractTodoSummary", () => {
    it("parses todowrite tool calls with all 4 statuses", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              state: {
                input: {
                  todos: [
                    { status: "completed" },
                    { status: "completed" },
                    { status: "in_progress" },
                    { status: "pending" },
                    { status: "pending" },
                    { status: "pending" },
                    { status: "cancelled" },
                  ],
                },
              },
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      expect(summary).toEqual({
        completed: 2,
        in_progress: 1,
        pending: 3,
        cancelled: 1,
      })
    })

    it("uses only last todowrite call snapshot", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              state: {
                input: {
                  todos: [
                    { status: "completed" },
                    { status: "in_progress" },
                  ],
                },
              },
            },
          ],
        },
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              state: {
                input: {
                  todos: [
                    { status: "completed" },
                    { status: "pending" },
                  ],
                },
              },
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      // Should use ONLY the LAST todowrite snapshot: completed:1, pending:1
      // The earlier todowrite with completed:1, in_progress:1 is IGNORED
      expect(summary).toEqual({
        completed: 1,
        pending: 1,
        in_progress: 0,
        cancelled: 0,
      })
    })

    it("returns null when no todowrite calls found", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "bash",
              state: { status: "completed" },
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      expect(summary).toBeNull()
    })

    it("returns null when tool parts lack state.input", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              // No state field
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      expect(summary).toBeNull()
    })

    it("returns null when state.input has no todos array", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              state: {
                input: { }, // No todos field
              },
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      expect(summary).toBeNull()
    })

    it("skips messages without assistant role", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [
            {
              type: "tool",
              tool: "todowrite",
              state: {
                input: {
                  todos: [{ status: "completed" }],
                },
              },
            },
          ],
        },
      ]

      const summary = extractTodoSummary(messages)

      expect(summary).toBeNull()
    })
  })

  describe("formatTodoSummary", () => {
    it("formats compact summary with all non-zero counts", () => {
      const summary: TodoSummary = {
        completed: 2,
        in_progress: 1,
        pending: 3,
        cancelled: 0,
      }

      const formatted = formatTodoSummary(summary)

      expect(formatted).toBe("✓2 ⏳1 ⏸3")
    })

    it("formats summary with all counts", () => {
      const summary: TodoSummary = {
        completed: 2,
        in_progress: 1,
        pending: 3,
        cancelled: 1,
      }

      const formatted = formatTodoSummary(summary)

      expect(formatted).toBe("✓2 ⏳1 ⏸3 ✗1")
    })

    it("returns null for null input", () => {
      const formatted = formatTodoSummary(null)

      expect(formatted).toBeNull()
    })

    it("returns null for all zero counts", () => {
      const summary: TodoSummary = {
        completed: 0,
        in_progress: 0,
        pending: 0,
        cancelled: 0,
      }

      const formatted = formatTodoSummary(summary)

      expect(formatted).toBeNull()
    })

    it("formats summary with only completed todos", () => {
      const summary: TodoSummary = {
        completed: 5,
        in_progress: 0,
        pending: 0,
        cancelled: 0,
      }

      const formatted = formatTodoSummary(summary)

      expect(formatted).toBe("✓5")
    })
  })

  describe("formatTodoPercentage", () => {
    it("formats completion percentage with normal input", () => {
      const summary: TodoSummary = {
        completed: 3,
        in_progress: 1,
        pending: 1,
        cancelled: 0,
      }

      const formatted = formatTodoPercentage(summary)

      expect(formatted).toBe("3/5, 60%")
    })

    it("returns null for null input", () => {
      const formatted = formatTodoPercentage(null)

      expect(formatted).toBeNull()
    })

    it("returns null for zero total", () => {
      const summary: TodoSummary = {
        completed: 0,
        in_progress: 0,
        pending: 0,
        cancelled: 0,
      }

      const formatted = formatTodoPercentage(summary)

      expect(formatted).toBeNull()
    })

    it("formats 100% when all completed", () => {
      const summary: TodoSummary = {
        completed: 5,
        in_progress: 0,
        pending: 0,
        cancelled: 0,
      }

      const formatted = formatTodoPercentage(summary)

      expect(formatted).toBe("5/5, 100%")
    })

    it("formats 0% when none completed", () => {
      const summary: TodoSummary = {
        completed: 0,
        in_progress: 3,
        pending: 2,
        cancelled: 0,
      }

      const formatted = formatTodoPercentage(summary)

      expect(formatted).toBe("0/5, 0%")
    })

    it("rounds percentage correctly", () => {
      const summary: TodoSummary = {
        completed: 1,
        in_progress: 0,
        pending: 2,
        cancelled: 0,
      }

      const formatted = formatTodoPercentage(summary)

      // 1/3 = 33.33% → rounds to 33%
      expect(formatted).toBe("1/3, 33%")
    })
  })

  describe("extractToolCallSummary", () => {
    it("parses tool call sequences and sorts by count", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "bash" },
            { type: "tool", tool: "read" },
            { type: "tool", tool: "bash" },
          ],
        },
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "edit" },
            { type: "tool", tool: "bash" },
            { type: "tool", tool: "read" },
          ],
        },
      ]

      const summary = extractToolCallSummary(messages)

      expect(summary.total).toBe(6)
      expect(summary.topTools).toHaveLength(3)
      expect(summary.topTools[0]).toEqual({ tool: "bash", count: 3 })
      expect(summary.topTools[1]).toEqual({ tool: "read", count: 2 })
      expect(summary.topTools[2]).toEqual({ tool: "edit", count: 1 })
    })

    it("limits top tools to 5", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "bash" },
            { type: "tool", tool: "read" },
            { type: "tool", tool: "edit" },
            { type: "tool", tool: "glob" },
            { type: "tool", tool: "grep" },
            { type: "tool", tool: "write" },
            { type: "tool", tool: "bash" },
          ],
        },
      ]

      const summary = extractToolCallSummary(messages)

      expect(summary.topTools).toHaveLength(5)
    })

    it("returns zero calls for empty messages", () => {
      const messages: SessionMessage[] = []

      const summary = extractToolCallSummary(messages)

      expect(summary.total).toBe(0)
      expect(summary.topTools).toHaveLength(0)
    })

    it("skips messages without assistant role", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [
            { type: "tool", tool: "bash" },
          ],
        },
      ]

      const summary = extractToolCallSummary(messages)

      expect(summary.total).toBe(0)
    })

    it("handles tool parts without tool name", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool" }, // No tool field
          ],
        },
      ]

      const summary = extractToolCallSummary(messages)

      expect(summary.total).toBe(1)
      expect(summary.topTools[0]).toEqual({ tool: "unknown", count: 1 })
    })
  })

  describe("formatToolCallSummary", () => {
    it("formats summary with multiple tools", () => {
      const summary: ToolCallSummary = {
        total: 12,
        topTools: [
          { tool: "bash", count: 5 },
          { tool: "read", count: 3 },
          { tool: "edit", count: 2 },
        ],
      }

      const formatted = formatToolCallSummary(summary)

      expect(formatted).toBe("12 calls (bash:5, read:3, edit:2)")
    })

    it("formats zero calls", () => {
      const summary: ToolCallSummary = {
        total: 0,
        topTools: [],
      }

      const formatted = formatToolCallSummary(summary)

      expect(formatted).toBe("0 calls")
    })

    it("formats summary with single tool", () => {
      const summary: ToolCallSummary = {
        total: 3,
        topTools: [{ tool: "bash", count: 3 }],
      }

      const formatted = formatToolCallSummary(summary)

      expect(formatted).toBe("3 calls (bash:3)")
    })
  })

  describe("extractLastOutput", () => {
    it("extracts non-synthetic text from last assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "First message" },
          ],
        },
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "Second message", synthetic: false },
            { type: "reasoning", text: "Thinking..." },
          ],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBe("Second message")
    })

    it("excludes synthetic text", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "Real output", synthetic: false },
            { type: "text", text: "System notification", synthetic: true },
          ],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBe("Real output")
    })

    it("returns null when no assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "User input" }],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBeNull()
    })

    it("returns null for empty text", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "" },
            { type: "text", text: "   " },
          ],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBeNull()
    })

    it("truncates at sentence boundary", () => {
      const longText = "This is the first sentence. And this is the second sentence. This is the third sentence that will be truncated."
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: longText },
          ],
        },
      ]

      const output = extractLastOutput(messages, 80)

      expect(output).toBe("This is the first sentence. And this is the second sentence. [...]")
    })

    it("truncates at newline boundary", () => {
      const longText = "First paragraph\n\nSecond paragraph\n\nThird paragraph that exceeds limit"
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: longText },
          ],
        },
      ]

      const output = extractLastOutput(messages, 50)

      // Should truncate at newline since it's > 70% of maxLength
      expect(output).toContain("[...]")
      expect(output!.length).toBeLessThan(60)
    })

    it("hard truncates when no good boundary found", () => {
      const longText = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: longText },
          ],
        },
      ]

      const output = extractLastOutput(messages, 30)

      expect(output).toBe("abcdefghijklmnopqrstuvwxyzABCD [...]")
    })

    it("concatenates multiple text parts", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "Part one " },
            { type: "text", text: "part two" },
          ],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBe("Part one  part two")
    })

    it("excludes reasoning parts", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "reasoning", text: "Thinking..." },
            { type: "text", text: "Output text" },
          ],
        },
      ]

      const output = extractLastOutput(messages)

      expect(output).toBe("Output text")
    })
  })

  describe("formatElapsedRuntime", () => {
    it("formats hours and minutes", () => {
      const startedAt = new Date(Date.now() - (2 * 60 * 60 * 1000 + 15 * 60 * 1000))
      const formatted = formatElapsedRuntime(startedAt)

      expect(formatted).toBe("2h 15m")
    })

    it("formats minutes and seconds", () => {
      const startedAt = new Date(Date.now() - (5 * 60 * 1000 + 30 * 1000))
      const formatted = formatElapsedRuntime(startedAt)

      expect(formatted).toBe("5m 30s")
    })

    it("formats only seconds", () => {
      const startedAt = new Date(Date.now() - 45 * 1000)
      const formatted = formatElapsedRuntime(startedAt)

      expect(formatted).toBe("45s")
    })

    it("formats zero seconds", () => {
      const startedAt = new Date(Date.now())
      const formatted = formatElapsedRuntime(startedAt)

      expect(formatted).toBe("0s")
    })

    it("returns null for undefined startedAt", () => {
      const formatted = formatElapsedRuntime(undefined)

      expect(formatted).toBeNull()
    })

    it("handles large hour values", () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 60 * 1000)
      const formatted = formatElapsedRuntime(startedAt)

      expect(formatted).toBe("5h 0m")
    })
  })
})