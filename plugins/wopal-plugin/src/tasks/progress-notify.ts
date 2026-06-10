/**
 * Progress Notify Handler
 *
 * Handles progress notification logic for running tasks.
 * Extracted from task-monitor.ts for better modularity.
 */

import type { WopalTask } from "../types.js"
import type { OpenCodeClient } from "../types.js"
import type { SessionStore } from "../session-store.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import { toErrorMessage } from "./utils.js"
import { fetchContextPercent, type TaskSessionInspector } from "../session-runtime-info.js"

// Progress notification thresholds
export const PROGRESS_NOTIFY_TIME_THRESHOLD_MS = 180_000 // 3 minutes
export const CONTEXT_WARN_THRESHOLD = 45

export type ProgressNotifyTrigger =
  | 'time_quota'
  | 'context_milestone'

export interface ProgressTaskInfo {
  taskId: string
  messageCount: number
  wasNotified: boolean
  contextUsage: number | null
  triggerReason?: ProgressNotifyTrigger
}

export interface ProgressNotifyDeps {
  tasks: Map<string, WopalTask>
  sessionStore: SessionStore
  client: OpenCodeClient
  debugLog: LoggerInstance
  directory: string
  taskManager?: TaskSessionInspector
  sendProgressNotificationFn: (task: WopalTask, messageCount: number, contextUsage: number | null, triggerReason?: ProgressNotifyTrigger) => Promise<void>
}

/**
 * Calculate the context milestone for a given percentage.
 *
 * Milestones:
 * - 40%: first milestone (reached when pct >= 40)
 * - 50%, 55%, 60%, ...: every 5% from 50% onward
 *
 * Returns null if below 40% (no milestone yet).
 */
export function getContextMilestone(pct: number): number | null {
  if (pct >= 50) {
    return Math.floor(pct / 5) * 5
  }
  if (pct >= 40) {
    return 40
  }
  return null
}

/**
 * Check progress notifications for running tasks.
 * Returns task info with notification status.
 */
export async function checkProgressNotifications(
  deps: ProgressNotifyDeps,
): Promise<ProgressTaskInfo[]> {
  const { tasks, sessionStore, client, debugLog, directory, taskManager, sendProgressNotificationFn } = deps
  const taskInfos: ProgressTaskInfo[] = []
  const runningTasks = Array.from(tasks.values()).filter(t => t.status === 'running')

  for (const task of runningTasks) {
    if (!task.sessionID) continue

    try {
      const messagesResult = await client.session?.messages?.({
        path: { id: task.sessionID },
      })

      if (!messagesResult || typeof messagesResult !== 'object') continue

      const data = (messagesResult as { data?: unknown[] }).data
      if (!data) continue

      const messageCount = data.length

      let shouldNotify = false
      let triggerReason: ProgressNotifyTrigger | undefined = undefined

      // Time-based fallback: notify once per time quota slot (3 min each).
      // Uses progressNotifyTimeBaseline (reset on reactivation) instead of startedAt (total runtime).
      const now = new Date()
      const timeBaseline = task.progressNotifyTimeBaseline ?? task.startedAt ?? now
      const elapsedMs = now.getTime() - timeBaseline.getTime()
      const timeQuota = Math.floor(elapsedMs / PROGRESS_NOTIFY_TIME_THRESHOLD_MS)
      const lastQuota = task.lastNotifyTimeQuota ?? 0
      if (timeQuota > lastQuota) {
        task.lastNotifyTimeQuota = timeQuota
        shouldNotify = true
        triggerReason = 'time_quota'
      }

      // Cache-first: prefer sessionStore.lastTokens to avoid streaming window returning null
      const ctxInfo = await fetchContextPercent(client, sessionStore, directory, task.sessionID, debugLog, taskManager)
      const contextUsage = ctxInfo?.pct ?? null

      // Context milestone: notify when crossing a milestone threshold.
      // Milestones: 40% first, then 50/55/60/65/... every 5%.
      // Dedup by lastNotifyContextPct — only notify if current milestone > last notified milestone.
      if (contextUsage !== null) {
        const currentMilestone = getContextMilestone(contextUsage)
        const lastMilestone = task.lastNotifyContextPct ?? 0
        if (currentMilestone !== null && currentMilestone > lastMilestone) {
          shouldNotify = true
          triggerReason = 'context_milestone'
        }
      }

      if (shouldNotify) {
        // Update dedup fields before sending
        if (contextUsage !== null) {
          task.lastNotifyContextPct = getContextMilestone(contextUsage) ?? contextUsage
        }
        await sendProgressNotificationFn(task, messageCount, contextUsage, triggerReason)
      }

      taskInfos.push({
        taskId: task.id,
        messageCount,
        wasNotified: shouldNotify,
        contextUsage,
        ...(triggerReason ? { triggerReason } : {}),
      })
    } catch (err) {
      debugLog.debug({ err: toErrorMessage(err) }, `[progressNotify] error for ${formatSessionID(task.sessionID, true)}`)
    }
  }

  return taskInfos
}
