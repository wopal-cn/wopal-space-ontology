// Merged from progress-tracker.ts + progress-analyzer.ts
import type { SessionMessage, WopalTask } from "../types.js"
import { createDebugLog } from "../debug.js"
import {
  getMessageTime,
  extractToolCallSequence,
  hasAssistantTextContent,
  getFinishReason,
} from "./session-messages.js"

const debugLog = createDebugLog("[wopal-task]", "task")

// --- progress-tracker ---

const MEANINGFUL_PART_TYPES = new Set(["tool", "text"])

export function isMeaningfulActivity(partType: string | undefined): boolean {
  return MEANINGFUL_PART_TYPES.has(partType ?? "")
}

export function trackActivity(task: WopalTask, partType: string | undefined): boolean {
  if (!isMeaningfulActivity(partType)) return false
  if (!task.progress) return false

  const now = new Date()
  task.progress.lastMeaningfulActivity = now
  task.progress.lastUpdate = now

  if (partType === "tool") {
    task.progress.toolCalls++
  }

  return true
}

// --- progress-analyzer ---

export interface ProgressInfo {
  totalMessages: number
  newMessages: number
  toolCalls: Array<{ tool: string; count: number }>
  lastActivityMs: number
  hasAssistantText: boolean
  finishReason?: string
}

/**
 * Analyze progress information from session messages.
 *
 * @param allMessages - All messages in the session
 * @param newMessages - Messages since last check
 * @returns Progress information including counts, tool calls, and activity
 */
export function analyzeProgress(
  allMessages: SessionMessage[],
  newMessages: SessionMessage[]
): ProgressInfo {
  const toolSequence = extractToolCallSequence(allMessages)
  const toolCounts = new Map<string, number>()
  for (const tool of toolSequence) {
    toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1)
  }
  const toolCalls = Array.from(toolCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)

  // Calculate last activity time
  let lastActivityTime = 0
  for (const message of allMessages) {
    const msgTime = getMessageTime(message)
    if (msgTime > lastActivityTime) {
      lastActivityTime = msgTime
    }
  }

  const now = Date.now()
  const lastActivityMs = lastActivityTime > 0 ? now - lastActivityTime : 0

  const hasAssistantText = hasAssistantTextContent(allMessages)
  const finishReason = getFinishReason(allMessages)

  const info: ProgressInfo = {
    totalMessages: allMessages.length,
    newMessages: newMessages.length,
    toolCalls,
    lastActivityMs,
    hasAssistantText,
    ...(finishReason !== undefined ? { finishReason } : {}),
  }

  const toolSummary = toolCalls.length > 0
    ? `, tools: ${toolCalls.map(t => `${t.tool}×${t.count}`).join(', ')}`
    : ''
  debugLog(`[progress] ${allMessages.length} msgs (+${newMessages.length})${toolSummary}`)

  return info
}
