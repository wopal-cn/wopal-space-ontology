import { describe, it, expect } from "vitest"
import {
  extractErrorMessage,
  isAbortedSessionError,
  classifyError,
  isRecord,
} from "./error-classifier.js"

describe("error-classifier", () => {
  describe("isRecord", () => {
    it("should return true for objects", () => {
      expect(isRecord({})).toBe(true)
      expect(isRecord({ a: 1 })).toBe(true)
    })

    it("should return false for non-objects", () => {
      expect(isRecord(null)).toBe(false)
      expect(isRecord(undefined)).toBe(false)
      expect(isRecord("string")).toBe(false)
      expect(isRecord(123)).toBe(false)
    })
  })

  describe("extractErrorMessage", () => {
    it("should extract from string", () => {
      expect(extractErrorMessage("error message")).toBe("error message")
    })

    it("should extract from Error instance", () => {
      expect(extractErrorMessage(new Error("test error"))).toBe("test error")
    })

    it("should return undefined for null/undefined", () => {
      expect(extractErrorMessage(null)).toBeUndefined()
      expect(extractErrorMessage(undefined)).toBeUndefined()
    })

    it("should extract from nested error.data.error", () => {
      const error = { data: { error: "nested error" } }
      expect(extractErrorMessage(error)).toBe("nested error")
    })

    it("should extract from error.data.message", () => {
      const error = { data: { message: "data message" } }
      expect(extractErrorMessage(error)).toBe("data message")
    })

    it("should extract from error.cause", () => {
      const error = { cause: "cause message" }
      expect(extractErrorMessage(error)).toBe("cause message")
    })

    it("should extract from error.message", () => {
      const error = { message: "direct message" }
      expect(extractErrorMessage(error)).toBe("direct message")
    })

    it("should stringify other values", () => {
      expect(extractErrorMessage({ code: 500 })).toBe('{"code":500}')
    })
  })

  describe("isAbortedSessionError", () => {
    it("should detect aborted error", () => {
      expect(isAbortedSessionError("Session aborted")).toBe(true)
      expect(isAbortedSessionError("ABORTED by user")).toBe(true)
      expect(isAbortedSessionError("The session was aborted")).toBe(true)
    })

    it("should not detect non-aborted error", () => {
      expect(isAbortedSessionError("Network error")).toBe(false)
      expect(isAbortedSessionError("Timeout")).toBe(false)
    })
  })

  describe("classifyError", () => {
    it("should classify timeout error", () => {
      const result = classifyError({ message: "Connection timeout" })
      expect(result.category).toBe("timeout")
      expect(result.message).toBe("Connection timeout")
    })

    it("should classify ETIMEDOUT error", () => {
      const result = classifyError({ message: "ETIMEDOUT" })
      expect(result.category).toBe("timeout")
    })

    it("should classify network error", () => {
      const result = classifyError({ message: "ECONNREFUSED" })
      expect(result.category).toBe("network")
    })

    it("should classify network error with 'network' keyword", () => {
      const result = classifyError({ message: "Network failure" })
      expect(result.category).toBe("network")
    })

    it("should classify crash error", () => {
      const result = classifyError({ message: "Process crash" })
      expect(result.category).toBe("crash")
    })

    it("should classify killed error", () => {
      const result = classifyError({ message: "Process killed" })
      expect(result.category).toBe("crash")
    })

    it("should classify cancelled error (aborted)", () => {
      const result = classifyError({ message: "Session aborted" })
      expect(result.category).toBe("cancelled")
    })

    it("should classify unknown error", () => {
      const result = classifyError({ message: "Something went wrong" })
      expect(result.category).toBe("unknown")
    })

    it("should include raw error in result", () => {
      const error = { message: "test", code: 500 }
      const result = classifyError(error)
      expect(result.raw).toBe(error)
    })

    it("should handle Error instances", () => {
      const error = new Error("timeout error")
      const result = classifyError(error)
      expect(result.category).toBe("timeout")
      expect(result.message).toBe("timeout error")
      expect(result.raw).toBe(error)
    })

    it("should handle string errors", () => {
      const result = classifyError("aborted by user")
      expect(result.category).toBe("cancelled")
      expect(result.message).toBe("aborted by user")
    })
  })
})