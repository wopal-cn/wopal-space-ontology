import { createDebugLog } from "../debug.js"
import type { SessionStore } from "../session-store.js"
import type { ProgressInfo } from "../tasks/progress.js"
import type { LoopWarning } from "../tasks/loop-detector.js"
import { fetchContextPercent, fetchSessionModelInfo, formatContextUsage } from "../session-runtime-info.js"
import type { OpenCodeClient } from "../types.js"

const debugLog = createDebugLog("[task]", "task")
export const MAX_RECENT_OUTPUT = 800

/**
 * Truncate text to max length, adding truncation indicator if needed.
 */
export function truncateOutput(text: string): string {
  if (text.length <= MAX_RECENT_OUTPUT) return text
  return text.slice(-MAX_RECENT_OUTPUT) + "\n[...earlier content truncated]"
}

export async function getSessionModelInfo(
  client: OpenCodeClient,
  sessionID: string,
): Promise<{ providerID: string; modelID: string } | null> {
  return fetchSessionModelInfo(client, sessionID, debugLog)
}

export async function getContextUsage(
  client: OpenCodeClient,
  sessionID: string,
  directory: string,
  sessionStore: SessionStore,
): Promise<string | null> {
  const info = await fetchContextPercent(client, sessionStore, directory, sessionID, debugLog)
  return formatContextUsage(info)
}

/**
 * Format progress information for display.
 */
export function formatProgressOutput(
  progress: ProgressInfo,
  loopWarning: LoopWarning | null,
  sessionStatus: string,
  recentOutput: string | null
): string {
  let result = `\n\n**Progress:**`
  result += `\n- Session: ${sessionStatus}`
  result += `\n- Messages: ${progress.totalMessages} total, ${progress.newMessages} new since last check`

  if (progress.toolCalls.length > 0) {
    const toolSummary = progress.toolCalls
      .slice(0, 5)
      .map((t: { tool: string; count: number }) => `${t.tool}: ${t.count}`)
      .join(", ")
    result += `\n- Tool calls: ${toolSummary}`
  }

  if (progress.lastActivityMs > 0) {
    const seconds = Math.floor(progress.lastActivityMs / 1000)
    if (seconds < 60) {
      result += `\n- Last activity: ${seconds} second${seconds !== 1 ? "s" : ""} ago`
    } else {
      const minutes = Math.floor(seconds / 60)
      result += `\n- Last activity: ${minutes} minute${minutes !== 1 ? "s" : ""} ago`
    }
  }

  if (loopWarning) {
    const severityIcon = loopWarning.severity === "critical" ? "!!" : "!"
    result += `\n\n${severityIcon} **Warning**: ${loopWarning.message}`
  }

  if (recentOutput) {
    result += `\n\n---\n**Recent output:**\n${truncateOutput(recentOutput)}`
  }

  return result
}