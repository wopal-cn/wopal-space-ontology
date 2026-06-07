import { describe, it, expect, beforeEach } from "vitest"
import { consumeNewMessages, clearCursor, getCursorCount } from "./session-cursor.js"
import type { SessionMessage } from "../types.js"

describe("session-cursor", () => {
  beforeEach(() => {
    // Clear all cursors before each test
    const count = getCursorCount()
    for (let i = 0; i < count; i++) {
      clearCursor(`test-session-${i}`)
    }
  })

  describe("consumeNewMessages", () => {
    it("returns all messages when no sessionID", () => {
      const messages: SessionMessage[] = [
        { id: "1" },
        { id: "2" },
      ]
      expect(consumeNewMessages(undefined, messages)).toEqual(messages)
    })

    it("returns all messages on first call", () => {
      const sessionID = "test-session-1"
      const messages: SessionMessage[] = [
        { id: "1" },
        { id: "2" },
      ]
      expect(consumeNewMessages(sessionID, messages)).toEqual(messages)
    })

    it("returns only new messages on second call", () => {
      const sessionID = "test-session-2"
      const messages1: SessionMessage[] = [
        { id: "1" },
        { id: "2" },
      ]
      const messages2: SessionMessage[] = [
        { id: "1" },
        { id: "2" },
        { id: "3" },
        { id: "4" },
      ]

      consumeNewMessages(sessionID, messages1)
      const newMessages = consumeNewMessages(sessionID, messages2)

      expect(newMessages).toEqual([
        { id: "3" },
        { id: "4" },
      ])
    })

    it("returns empty array when no new messages", () => {
      const sessionID = "test-session-3"
      const messages: SessionMessage[] = [
        { id: "1" },
        { id: "2" },
      ]

      consumeNewMessages(sessionID, messages)
      const newMessages = consumeNewMessages(sessionID, messages)

      expect(newMessages).toEqual([])
    })

    it("handles messages with time-based key", () => {
      const sessionID = "test-session-4"
      const messages: SessionMessage[] = [
        { info: { time: "2024-01-01" } },
        { info: { time: { created: 1234567890 } } },
      ]

      expect(consumeNewMessages(sessionID, messages)).toEqual(messages)
    })

    it("handles messages with index-based key when no id or time", () => {
      const sessionID = "test-session-5"
      const messages: SessionMessage[] = [
        { info: { role: "user" } },
        { info: { role: "assistant" } },
      ]

      expect(consumeNewMessages(sessionID, messages)).toEqual(messages)
    })
  })

  describe("clearCursor", () => {
    it("clears cursor for session", () => {
      const sessionID = "test-session-clear"
      consumeNewMessages(sessionID, [{ id: "1" }])

      clearCursor(sessionID)

      // After clear, should return all messages again
      const messages = consumeNewMessages(sessionID, [{ id: "1" }])
      expect(messages).toEqual([{ id: "1" }])
    })
  })

  describe("getCursorCount", () => {
    it("returns number of active cursors", () => {
      const initialCount = getCursorCount()

      consumeNewMessages("count-test-1", [{ id: "1" }])
      consumeNewMessages("count-test-2", [{ id: "2" }])

      expect(getCursorCount()).toBe(initialCount + 2)
    })
  })
})
