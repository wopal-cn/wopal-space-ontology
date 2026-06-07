import { describe, it, expect } from "vitest"
import { getErrorMessage, extractMessages, extractAssistantContent, extractBySection } from "./session-messages.js"
import type { SessionMessage, MessagesResult } from "../types.js"

describe("getErrorMessage", () => {
  it("returns null for array input", () => {
    expect(getErrorMessage([] as unknown as MessagesResult)).toBeNull()
  })

  it("returns null for undefined error", () => {
    expect(getErrorMessage({ error: undefined })).toBeNull()
  })

  it("returns null for null error", () => {
    expect(getErrorMessage({ error: null })).toBeNull()
  })

  it("returns string error as-is", () => {
    expect(getErrorMessage({ error: "Something went wrong" })).toBe("Something went wrong")
  })

  it("returns empty string error as string", () => {
    expect(getErrorMessage({ error: "" })).toBe("")
  })

  it("converts non-string error to string", () => {
    expect(getErrorMessage({ error: { code: 500 } })).toBe("[object Object]")
  })
})

describe("extractMessages", () => {
  it("returns empty array for empty input", () => {
    expect(extractMessages({})).toEqual([])
  })

  it("extracts from data array", () => {
    const messages: SessionMessage[] = [
      { id: "1", info: { role: "user" } },
      { id: "2", info: { role: "assistant" } },
    ]
    expect(extractMessages({ data: messages })).toEqual(messages)
  })

  it("extracts from direct array", () => {
    const messages: SessionMessage[] = [
      { id: "1", info: { role: "user" } },
    ]
    expect(extractMessages(messages as unknown as MessagesResult)).toEqual(messages)
  })

  it("filters non-message items", () => {
    const input = [null, { id: "1" }, undefined, "string"] as unknown as MessagesResult
    expect(extractMessages(input)).toEqual([{ id: "1" }])
  })
})

describe("extractAssistantContent", () => {
  it("returns empty string for empty input", () => {
    expect(extractAssistantContent([])).toBe("")
  })

  it("extracts text from assistant messages", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "Hello, world!" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Hello, world!")
  })

  it("extracts reasoning content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "reasoning", text: "Thinking..." }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Thinking...")
  })

  it("extracts tool_result with string content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "tool" },
        parts: [{ type: "tool_result", content: "Tool output" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Tool output")
  })

  it("extracts tool_result with array content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "tool" },
        parts: [
          {
            type: "tool_result",
            content: [
              { type: "text", text: "Line 1" },
              { type: "text", text: "Line 2" },
            ],
          },
        ],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Line 1\n\nLine 2")
  })

  it("ignores user messages", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "User input" }],
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "Assistant response" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Assistant response")
  })

  it("joins multiple messages with double newline", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "First message" }],
      },
      {
        info: { role: "tool" },
        parts: [{ type: "tool_result", content: "Tool result" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("First message\n\nTool result")
  })

  it("filters empty text parts", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [
          { type: "text", text: "" },
          { type: "text", text: "Non-empty" },
        ],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Non-empty")
  })
})

describe("extractBySection", () => {
  describe("text section", () => {
    it("returns last assistant message content by default (no truncation)", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "First message" }],
        },
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Last message with long content that should not be truncated" }],
        },
      ]
      expect(extractBySection(messages, "text")).toBe("Last message with long content that should not be truncated")
    })

    it("aggregates multiple messages and truncates to 4000 chars", () => {
      const longContent = "A".repeat(5000)
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Message 1" }],
        },
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: longContent }],
        },
      ]
      const result = extractBySection(messages, "text", { lastN: 2 })
      expect(result.length).toBeLessThanOrEqual(4000 + "\n[...earlier content truncated]".length)
      expect(result.endsWith("\n[...earlier content truncated]")).toBe(true)
      expect(result).toContain("A")
    })

    it("returns empty string when no assistant text content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "User input" }],
        },
      ]
      expect(extractBySection(messages, "text")).toBe("")
    })

    it("filters empty text parts in single message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "text", text: "" },
            { type: "text", text: "Valid content" },
          ],
        },
      ]
      expect(extractBySection(messages, "text")).toBe("Valid content")
    })
  })

  describe("reasoning section", () => {
    it("returns last assistant reasoning content by default", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: "First reasoning" }],
        },
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: "Last reasoning" }],
        },
      ]
      expect(extractBySection(messages, "reasoning")).toBe("Last reasoning")
    })

    it("aggregates multiple reasoning messages and truncates", () => {
      const longReasoning = "B".repeat(4500)
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: "Reasoning 1" }],
        },
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: longReasoning }],
        },
      ]
      const result = extractBySection(messages, "reasoning", { lastN: 2 })
      expect(result.length).toBeLessThanOrEqual(4000 + "\n[...earlier content truncated]".length)
      expect(result.endsWith("\n[...earlier content truncated]")).toBe(true)
    })

    it("returns empty string when no reasoning content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Only text content" }],
        },
      ]
      expect(extractBySection(messages, "reasoning")).toBe("")
    })
  })

  describe("tools section", () => {
    it("outputs tool name with completed status", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "read",
              state: { status: "completed" },
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[tool: read] (completed)")
    })

    it("outputs tool name with error status and exit code", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "bash",
              state: { status: "error", metadata: { exit: 1 } },
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[tool: bash] (error, exit:1)")
    })

    it("outputs tool_result status without content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "tool" },
          parts: [
            {
              type: "tool_result",
              state: { status: "completed" },
              content: "Long output content that should not appear in tools section",
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[result]: (completed)")
      expect(extractBySection(messages, "tools")).not.toContain("Long output")
    })

    it("handles missing state gracefully", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "tool",
              tool: "read",
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[tool: read] (error, detected-from-content)")
    })

    it("MCP fallback: detects error from content when status is completed", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "tool" },
          parts: [
            {
              type: "tool_result",
              state: { status: "completed" }, // MCP incorrectly reports completed
              content: "Error: validation failed for input parameter",
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[result]: (error, detected-from-content)")
    })

    it("MCP fallback: detects error from array content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "tool" },
          parts: [
            {
              type: "tool_result",
              state: { status: "completed" },
              content: [
                { type: "text", text: "isError: true" },
                { type: "text", text: "failed to execute command" },
              ],
            },
          ],
        },
      ]
      expect(extractBySection(messages, "tools")).toBe("[result]: (error, detected-from-content)")
    })

    it("outputs multiple tools with their statuses", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "read", state: { status: "completed" } },
            { type: "tool", tool: "bash", state: { status: "error", metadata: { exit: 127 } } },
          ],
        },
        {
          info: { role: "tool" },
          parts: [
            { type: "tool_result", state: { status: "completed" } },
            { type: "tool_result", state: { status: "error" } },
          ],
        },
      ]
      const result = extractBySection(messages, "tools")
      expect(result).toContain("[tool: read] (completed)")
      expect(result).toContain("[tool: bash] (error, exit:127)")
      expect(result).toContain("[result]: (completed)")
      expect(result).toContain("[result]: (error)")
    })
  })
})
