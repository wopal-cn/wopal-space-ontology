/**
 * Notification Summary Extraction
 *
 * Helper functions to extract concise summaries from session messages
 * for enriching task notifications.
 */

import type { SessionMessage } from "../types.js"
import { getLastAssistantMessage, extractAssistantText, extractToolCallSequence } from "./session-messages.js"

/**
 * Todo summary with status counts.
 */
export interface TodoSummary {
  completed: number
  in_progress: number
  pending: number
  cancelled: number
}

/**
 * Extract todo summary from session messages.
 * Searches for todowrite tool calls and reads state.input for todo states.
 * Only uses the LAST todowrite call (todowrite submits full list each time).
 */
export function extractTodoSummary(messages: SessionMessage[]): TodoSummary | null {
  // Iterate backwards to find the LAST todowrite snapshot
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info?.role !== "assistant") continue
    if (!message.parts) continue

    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j]
      if (part.type === "tool" && part.tool === "todowrite") {
        if (part.state?.input && typeof part.state.input === "object") {
          const input = part.state.input as { todos?: Array<{ status?: string }> }
          if (Array.isArray(input.todos) && input.todos.length > 0) {
            // Found the last todowrite snapshot - count its todos and return immediately
            const summary: TodoSummary = {
              completed: 0,
              in_progress: 0,
              pending: 0,
              cancelled: 0,
            }

            for (const todo of input.todos) {
              if (todo.status === "completed") summary.completed++
              else if (todo.status === "in_progress") summary.in_progress++
              else if (todo.status === "pending") summary.pending++
              else if (todo.status === "cancelled") summary.cancelled++
            }

            return summary
          }
        }
      }
    }
  }

  return null
}

/**
 * Format todo summary for display.
 * Returns compact format like "✓2 ⏳1 ⏸3 ✗0" or null if no todos.
 */
export function formatTodoSummary(summary: TodoSummary | null): string | null {
  if (!summary) return null
  if (summary.completed + summary.in_progress + summary.pending + summary.cancelled === 0) return null

  const parts: string[] = []
  if (summary.completed > 0) parts.push(`✓${summary.completed}`)
  if (summary.in_progress > 0) parts.push(`⏳${summary.in_progress}`)
  if (summary.pending > 0) parts.push(`⏸${summary.pending}`)
  if (summary.cancelled > 0) parts.push(`✗${summary.cancelled}`)

  return parts.length > 0 ? parts.join(" ") : null
}

/**
 * Tool-call summary with counts.
 */
export interface ToolCallSummary {
  total: number
  topTools: Array<{ tool: string; count: number }>
}

/**
 * Extract tool-call summary from session messages.
 */
export function extractToolCallSummary(messages: SessionMessage[]): ToolCallSummary {
  const sequence = extractToolCallSequence(messages)
  const counts = new Map<string, number>()

  for (const tool of sequence) {
    counts.set(tool, (counts.get(tool) ?? 0) + 1)
  }

  const topTools = Array.from(counts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    total: sequence.length,
    topTools,
  }
}

/**
 * Format tool-call summary for display.
 * Returns compact format like "12 calls (bash:5, read:3, edit:2)".
 */
export function formatToolCallSummary(summary: ToolCallSummary): string {
  if (summary.total === 0) return "0 calls"

  const topToolsStr = summary.topTools
    .map(t => `${t.tool}:${t.count}`)
    .join(", ")

  return `${summary.total} calls (${topToolsStr})`
}

/**
 * Extract last assistant text output (excluding synthetic text).
 * Truncates to sensible length for notifications.
 */
export function extractLastOutput(messages: SessionMessage[], maxLength: number = 200): string | null {
  const lastMsg = getLastAssistantMessage(messages)
  if (!lastMsg) return null

  const text = extractAssistantText(lastMsg)
  if (!text || text.trim().length === 0) return null

  // Truncate sensibly
  if (text.length <= maxLength) return text

  // Try to truncate at a sentence boundary
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf(".")
  const lastNewline = truncated.lastIndexOf("\n")

  const cutoff = Math.max(lastPeriod, lastNewline)
  if (cutoff > maxLength * 0.7) {
    return truncated.slice(0, cutoff + 1) + " [...]"
  }

  return truncated + " [...]"
}

/**
 * Format todo completion percentage for display.
 * Returns format like "3/5, 60%" or null if no todos.
 */
export function formatTodoPercentage(summary: TodoSummary | null): string | null {
  if (!summary) return null
  const total = summary.completed + summary.in_progress + summary.pending + summary.cancelled
  if (total === 0) return null
  const pct = Math.round((summary.completed / total) * 100)
  return `${summary.completed}/${total}, ${pct}%`
}

/**
 * Calculate elapsed runtime from task startedAt.
 */
export function formatElapsedRuntime(startedAt: Date | undefined): string | null {
  if (!startedAt) return null

  const elapsedMs = Date.now() - startedAt.getTime()
  const seconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}