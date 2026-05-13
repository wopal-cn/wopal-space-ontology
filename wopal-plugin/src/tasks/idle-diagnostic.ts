import type { SessionMessage } from "../types.js"
import { createDebugLog } from "../debug.js"
import {
  extractAssistantText,
  getLastAssistantMessage,
  getFinishReason,
} from "./session-messages.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export interface IdleDiagnostic {
  verdict: "completed" | "error"
  reason: string
  lastMessage?: string
}

/**
 * Diagnose the idle state based on session messages.
 *
 * After removing detectQuestionPattern, this function always returns "completed"
 * for finish=stop with text content. The parent AI is responsible for judging
 * whether the sub-agent's output contains a question and using wopal_reply if needed.
 * Real question detection is handled by question-relay.ts via the question.asked event.
 *
 * @param messages - Session messages to analyze
 * @returns Diagnostic result with verdict, reason, and optional last message
 */
export function diagnoseIdle(messages: SessionMessage[]): IdleDiagnostic {
  debugLog(`[diagnoseIdle] analyzing ${messages.length} messages`)

  // 1. Empty messages or no assistant message
  if (!messages || messages.length === 0) {
    return { verdict: "error", reason: "no_response" }
  }

  const lastAssistant = getLastAssistantMessage(messages)
  if (!lastAssistant) {
    return { verdict: "error", reason: "no_response" }
  }

  const finishReason = getFinishReason(lastAssistant)
  const text = extractAssistantText(lastAssistant)

  // 2. Analyze based on finish_reason
  if (finishReason === "stop") {
    debugLog(`[diagnoseIdle] verdict=completed finish=stop text_length=${text.length}`)
    return { verdict: "completed", reason: "normal_completion", lastMessage: text }
  }

  if (finishReason === "length") {
    debugLog(`[diagnoseIdle] verdict=error finish=length`)
    return { verdict: "error", reason: "finish_length" }
  }

  if (finishReason === "content_filter") {
    debugLog(`[diagnoseIdle] verdict=error finish=content_filter`)
    return { verdict: "error", reason: "finish_content_filter" }
  }

  // No finish_reason but has text → completed
  if (text.length > 0) {
    debugLog(`[diagnoseIdle] verdict=completed finish=undefined text_length=${text.length}`)
    return { verdict: "completed", reason: "normal_completion", lastMessage: text }
  }

  debugLog(`[diagnoseIdle] verdict=error finish=undefined text_length=0`)
  return { verdict: "error", reason: "no_response" }
}

/**
 * Build a summary of recent tool calls from messages.
 *
 * @param messages - Session messages to analyze
 * @param maxLength - Maximum length of the summary (default 800)
 * @returns Formatted tool call summary
 */
export function buildContextSummary(messages: SessionMessage[], maxLength = 800): string {
  const toolCalls: Array<{ tool: string; args?: string }> = []

  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if (part.type === "tool" && part.tool) {
        toolCalls.push({ tool: part.tool })
      }
    }
  }

  if (toolCalls.length === 0) {
    const lastAssistant = getLastAssistantMessage(messages)
    if (lastAssistant) {
      const text = extractAssistantText(lastAssistant)
      if (text.length > maxLength) {
        return text.slice(0, maxLength) + "..."
      }
      return text
    }
    return ""
  }

  const lines: string[] = []
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]
    if (tc.args) {
      lines.push(`${i + 1}. ${tc.tool}(${tc.args})`)
    } else {
      lines.push(`${i + 1}. ${tc.tool}()`)
    }
  }

  const summary = lines.join("\n")
  if (summary.length > maxLength) {
    return summary.slice(0, maxLength) + "..."
  }
  return summary
}
