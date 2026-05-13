import { createDebugLog } from "../debug.js"
import type { ProgressInfo } from "../tasks/progress.js"
import type { LoopWarning } from "../tasks/loop-detector.js"
import { fetchContextPercent } from "../tasks/task-monitor.js"

const debugLog = createDebugLog("[wopal-task]", "task")
export const MAX_RECENT_OUTPUT = 800

/**
 * Truncate text to max length, adding truncation indicator if needed.
 */
export function truncateOutput(text: string): string {
  if (text.length <= MAX_RECENT_OUTPUT) return text
  return text.slice(-MAX_RECENT_OUTPUT) + "\n[...earlier content truncated]"
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export interface TaskModelInfo {
  providerID: string
  modelID: string
}

export async function getTaskModelInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sessionID: string,
): Promise<TaskModelInfo | null> {
  try {
    if (typeof client.session?.messages !== "function") return null
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 1 }
    })
    const messages = messagesResult?.data ?? []

    // 找最后一条 assistant 消息获取模型信息
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAssistant = [...messages].reverse().find((m: any) =>
      m?.info?.role === "assistant"
    )
    if (!lastAssistant?.info) return null

    const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
    const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
    if (!providerID || !modelID) return null

    return { providerID, modelID }
  } catch (err) {
    debugLog(`[modelInfo] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export async function getContextUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sessionID: string,
  directory: string,
): Promise<string | null> {
  const info = await fetchContextPercent(client, directory, sessionID, debugLog)
  if (!info) return null

  const warn = info.pct > 45 ? " ⚠️" : ""
  return `Context: ${info.pct}% used (${formatTokenCount(info.used)}/${formatTokenCount(info.contextLimit)})${warn}`
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