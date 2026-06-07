/**
 * Task Monitor - Assembly Layer
 *
 * Monitors task health and progress.
 * Delegates to specialized handler modules for progress notification.
 */

import type { WopalTask } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import type { SessionStore } from "../session-store.js"
import { formatSessionID } from "../logger.js"
import { extractContextFromStore } from "../session-runtime-info.js"
import { getDisplayStatus } from "./task-phase.js"

// Re-export from specialized modules for backward compatibility
export {
  checkProgressNotifications,
  PROGRESS_NOTIFY_TIME_THRESHOLD_MS,
  CONTEXT_WARN_THRESHOLD,
  getContextMilestone,
  type ProgressNotifyTrigger,
  type ProgressTaskInfo,
} from "./progress-notify.js"

import type { ProgressTaskInfo } from "./progress-notify.js"
import { CONTEXT_WARN_THRESHOLD } from "./progress-notify.js"

// Re-export ContextUsageInfo from session-runtime-info
export type { ContextUsageInfo } from "../session-runtime-info.js"

export function formatTaskTickLines(
  tasks: Map<string, WopalTask>,
  progressInfos: ProgressTaskInfo[],
  sessionStore?: SessionStore,
): string[] {
  const allTasks = Array.from(tasks.values())

  if (allTasks.length === 0) return []

  const now = Date.now()
  return allTasks.map((task) => {
    const sessionId = formatSessionID(task.sessionID, true)
    const statusText = getDisplayStatus(task)
    const wasChecked = progressInfos.find(p => p.taskId === task.id)

    const msgsText = wasChecked ? `${wasChecked.messageCount} msgs` : '—'

    const elapsedMs = now - (task.startedAt?.getTime() ?? task.createdAt.getTime())
    const totalSec = Math.floor(elapsedMs / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const timeText = `${min}m${sec.toString().padStart(2, '0')}s`

    const ctxPct = wasChecked?.contextUsage ?? (sessionStore && task.sessionID
      ? extractContextFromStore(sessionStore, task.sessionID)?.pct
      : null)
    const ctxText = ctxPct != null
      ? (ctxPct >= CONTEXT_WARN_THRESHOLD ? `, ctx:${ctxPct}% ⚠️` : `, ctx:${ctxPct}%`)
      : ', ctx:—'

    const notifiedMark = wasChecked?.wasNotified ? ' ✓notified' : ''

    return `${sessionId} ${task.agent} [${statusText}] "${task.description}" ${msgsText}, ${timeText}${ctxText}${notifiedMark}`
  })
}

export function logTickStatus(
  tasks: Map<string, WopalTask>,
  progressInfos: ProgressTaskInfo[],
  debugLog: LoggerInstance,
  sessionStore?: SessionStore,
): void {
  const lines = formatTaskTickLines(tasks, progressInfos, sessionStore)
  if (lines.length > 0) {
    const numberedLines = lines.map((line, i) => `  [${i}] ${line}`)
    debugLog.debug(`[tick] ${lines.length} tasks:\n${numberedLines.join('\n')}`)
  }
}
