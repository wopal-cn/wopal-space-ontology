import type { ErrorCategory } from "../types.js"
import { toErrorMessage } from "./utils.js"

export type { ErrorCategory }
export { toErrorMessage }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Extract error message from various error formats.
 * Tries multiple extraction paths in order of priority.
 */
export function extractErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message

  if (isRecord(error)) {
    const dataRaw = error["data"]
    const candidates: unknown[] = [
      error,
      dataRaw,
      error["error"],
      isRecord(dataRaw)
        ? (dataRaw as Record<string, unknown>)["error"]
        : undefined,
      error["cause"],
    ]

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate
      }
      if (
        isRecord(candidate) &&
        typeof candidate["message"] === "string" &&
        candidate["message"].length > 0
      ) {
        return candidate["message"]
      }
    }
  }

  return toErrorMessage(error)
}

/**
 * Check if error indicates an aborted session.
 */
export function isAbortedSessionError(error: unknown): boolean {
  const message = extractErrorMessage(error) ?? ""
  return message.toLowerCase().includes("aborted")
}

/**
 * Classify error into a category for better error handling and reporting.
 */
export function classifyError(error: unknown): {
  category: ErrorCategory
  message: string
  raw: unknown
} {
  const message = extractErrorMessage(error) ?? "Unknown error"
  const lowerMsg = message.toLowerCase()

  if (isAbortedSessionError(error)) {
    return { category: "cancelled", message, raw: error }
  }
  if (lowerMsg.includes("timeout") || lowerMsg.includes("etimedout")) {
    return { category: "timeout", message, raw: error }
  }
  if (lowerMsg.includes("econnrefused") || lowerMsg.includes("network")) {
    return { category: "network", message, raw: error }
  }
  if (lowerMsg.includes("crash") || lowerMsg.includes("killed")) {
    return { category: "crash", message, raw: error }
  }

  return { category: "unknown", message, raw: error }
}