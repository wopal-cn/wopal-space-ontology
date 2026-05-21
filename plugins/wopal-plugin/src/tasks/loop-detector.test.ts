import { describe, it, expect } from "vitest"
import { detectLoop } from "./loop-detector.js"
import type { SessionMessage } from "../types.js"

describe("detectLoop", () => {
  describe("#given empty messages", () => {
    it("returns null", () => {
      expect(detectLoop([])).toBeNull()
    })
  })

  describe("#given tool loop detection", () => {
    it("detects 3 consecutive same tool calls", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Read" },
          ],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("tool_loop")
      expect(result?.message).toContain("Read")
      expect(result?.message).toContain("3 times")
      expect(result?.severity).toBe("warning")
    })

    it("detects 5+ consecutive same tool calls as critical", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Edit" },
          ],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("tool_loop")
      expect(result?.severity).toBe("critical")
    })

    it("does not detect loop with 2 consecutive calls", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool", tool: "Read" }, { type: "tool", tool: "Read" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).toBeNull()
    })

    it("does not detect loop with mixed tool calls", () => {
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
      const result = detectLoop(messages)
      expect(result).toBeNull()
    })

    it("handles tool_call type", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Bash" },
            { type: "tool", tool: "Bash" },
            { type: "tool", tool: "Bash" },
          ],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("tool_loop")
      expect(result?.message).toContain("Bash")
    })

    it("detects consecutive calls across multiple assistant messages", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool", tool: "Read" }],
        },
        {
          info: { role: "tool" },
          parts: [{ type: "tool_result", content: "result" }],
        },
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Read" },
          ],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("tool_loop")
    })
  })

  describe("#given rapid cycle detection", () => {
    it("detects rapid message generation (<1s intervals)", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 2000 } },
          parts: [{ type: "text", text: "First" }],
        },
        {
          info: { role: "assistant", time: { created: now - 1500 } },
          parts: [{ type: "text", text: "Second" }],
        },
        {
          info: { role: "assistant", time: { created: now - 1000 } },
          parts: [{ type: "text", text: "Third" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("rapid_cycle")
      expect(result?.severity).toBe("warning")
    })

    it("does not detect rapid cycle with slow messages", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 5000 } },
          parts: [{ type: "text", text: "First" }],
        },
        {
          info: { role: "assistant", time: { created: now - 3000 } },
          parts: [{ type: "text", text: "Second" }],
        },
        {
          info: { role: "assistant", time: { created: now - 1000 } },
          parts: [{ type: "text", text: "Third" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).toBeNull()
    })

    it("does not detect rapid cycle with fewer than 3 messages", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 500 } },
          parts: [{ type: "text", text: "First" }],
        },
        {
          info: { role: "assistant", time: { created: now } },
          parts: [{ type: "text", text: "Second" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).toBeNull()
    })

    it("ignores non-assistant messages", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "user", time: { created: now - 100 } },
          parts: [{ type: "text", text: "User" }],
        },
        {
          info: { role: "assistant", time: { created: now - 2000 } },
          parts: [{ type: "text", text: "First" }],
        },
        {
          info: { role: "assistant", time: { created: now - 1500 } },
          parts: [{ type: "text", text: "Second" }],
        },
        {
          info: { role: "assistant", time: { created: now - 1000 } },
          parts: [{ type: "text", text: "Third" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("rapid_cycle")
    })
  })

  describe("#given prioritization", () => {
    it("returns tool_loop over rapid_cycle when both detected", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 500 } },
          parts: [
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Read" },
          ],
        },
        {
          info: { role: "assistant", time: { created: now - 300 } },
          parts: [{ type: "text", text: "Done" }],
        },
        {
          info: { role: "assistant", time: { created: now - 100 } },
          parts: [{ type: "text", text: "Final" }],
        },
      ]
      const result = detectLoop(messages)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("tool_loop")
    })
  })
})
