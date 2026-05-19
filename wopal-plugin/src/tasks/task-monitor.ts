/**
 * Task Monitor - Assembly Layer
 *
 * Monitors task health and progress.
 * Delegates to specialized handler modules for stuck detection and progress notification.
 */

import type { WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"

// Re-export from specialized modules for backward compatibility
export {
  checkProgressNotifications,
  PROGRESS_NOTIFY_MESSAGE_MODULO,
  PROGRESS_NOTIFY_TIME_THRESHOLD_MS,
  CONTEXT_WARN_THRESHOLD,
  CONTEXT_NOTIFY_MODULO,
  CONTEXT_WARN_NOTIFY_MODULO,
  type ProgressNotifyTrigger,
  type ProgressTaskInfo,
} from "./progress-notify.js"

import type { ProgressTaskInfo } from "./progress-notify.js"
import { CONTEXT_WARN_THRESHOLD } from "./progress-notify.js"

// Re-export ContextUsageInfo from session-runtime-info
export type { ContextUsageInfo } from "../session-runtime-info.js"

// --- stuck detection (inline for now, could be extracted later) ---

export const DEFAULT_STUCK_TIMEOUT_MS = 120_000 // 2 minutes

export interface StuckCheckConfig {
  stuckTimeoutMs: number
}

export interface StuckResult {
  task: WopalTask
  durationMs: number
}

export function checkStuckTasks(args: {
  tasks: Iterable<WopalTask>
  config: StuckCheckConfig
}): StuckResult[] {
  const { tasks, config } = args
  const now = Date.now()
  const results: StuckResult[] = []

  for (const task of tasks) {
    if (task.status !== "running" && task.status !== "waiting") continue
    if (!task.startedAt || !task.sessionID) continue
    if (task.stuckNotified) continue
    if (task.idleNotified) continue

    const meaningfulActivity = task.progress?.lastMeaningfulActivity ?? task.startedAt
    const elapsed = now - meaningfulActivity.getTime()

    if (elapsed > config.stuckTimeoutMs) {
      results.push({ task, durationMs: elapsed })
    }
  }

  return results
}

export function clearStuckState(tasks: Iterable<WopalTask>): void {
  for (const task of tasks) {
    if (task.status !== "running") continue
    if (!task.stuckNotified || !task.stuckNotifiedAt) continue

    const meaningfulActivity = task.progress?.lastMeaningfulActivity
    if (meaningfulActivity && meaningfulActivity > task.stuckNotifiedAt) {
      task.stuckNotified = false
      delete task.stuckNotifiedAt
    }
  }
}

// --- monitor dependencies interface ---

// --- monitor dependencies interface (used by simple-task-manager) ---

export interface TaskMonitorDeps {
  tasks: Map<string, WopalTask>
  debugLog: DebugLog
  notifyParentStuckFn: (task: WopalTask, durationText: string) => Promise<void>
}

export async function checkStuckTasksAndNotify(
  deps: Pick<TaskMonitorDeps, "tasks" | "debugLog" | "notifyParentStuckFn">,
): Promise<void> {
  const { tasks, debugLog, notifyParentStuckFn } = deps

  const results = checkStuckTasks({
    tasks: tasks.values(),
    config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS },
  })

  for (const { task, durationMs } of results) {
    const durationSeconds = Math.floor(durationMs / 1000)
    const durationMinutes = Math.floor(durationSeconds / 60)
    const durationText = durationMinutes >= 1
      ? `${durationMinutes}min ${durationSeconds % 60}s`
      : `${durationSeconds}s`

    task.stuckNotified = true
    task.stuckNotifiedAt = new Date()

    debugLog(`[stuck] detected: taskId=${task.id} duration=${durationText}`)
    await notifyParentStuckFn(task, durationText)
  }
}

export function logTickStatus(
  tasks: Map<string, WopalTask>,
  progressInfos: ProgressTaskInfo[],
  debugLog: DebugLog,
): void {
  const runningTasks = Array.from(tasks.values())
    .filter(t => t.status === 'running' && !t.idleNotified)

  if (runningTasks.length === 0) return

  const now = Date.now()
  const lines = runningTasks.map((task, i) => {
    const shortId = task.id.replace('wopal-task-', '').slice(0, 8)
    const wasChecked = progressInfos.find(p => p.taskId === task.id)

    const msgsText = wasChecked ? `${wasChecked.messageCount} msgs` : '—'

    const elapsedMs = now - (task.startedAt?.getTime() ?? 0)
    const totalSec = Math.floor(elapsedMs / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const timeText = `${min}m${sec.toString().padStart(2, '0')}s`

    const ctxPct = wasChecked?.contextUsage
    const ctxText = ctxPct != null
      ? (ctxPct >= CONTEXT_WARN_THRESHOLD ? `, ctx:${ctxPct}% ⚠️` : `, ctx:${ctxPct}%`)
      : ''

    const notifiedMark = wasChecked?.wasNotified ? ' ✓notified' : ''

    return `  [${i + 1}] wopal-task-${shortId} "${task.description}": ${msgsText}, ${timeText}${ctxText}${notifiedMark}`
  })

  debugLog(`[tick] ${runningTasks.length} tasks:\n${lines.join('\n')}`)
}