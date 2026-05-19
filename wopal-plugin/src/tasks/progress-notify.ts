/**
 * Progress Notify Handler
 *
 * Handles progress notification logic for running tasks.
 * Extracted from task-monitor.ts for better modularity.
 */

import type { WopalTask } from "../types.js"
import type { OpenCodeClient } from "../types.js"
import type { SessionStore } from "../session-store.js"
import type { DebugLog } from "../debug.js"
import { fetchContextPercent } from "../session-runtime-info.js"

// Progress notification thresholds
export const PROGRESS_NOTIFY_MESSAGE_MODULO = 20
export const PROGRESS_NOTIFY_TIME_THRESHOLD_MS = 180_000 // 3 minutes
export const CONTEXT_WARN_THRESHOLD = 45
export const CONTEXT_NOTIFY_MODULO = 10
export const CONTEXT_WARN_NOTIFY_MODULO = 5

export type ProgressNotifyTrigger =
  | 'time_quota'
  | 'message_count'
  | 'context_threshold'
  | 'context_normal'

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
  debugLog: DebugLog
  directory: string
  sendProgressNotificationFn: (task: WopalTask, messageCount: number, contextUsage: number | null, triggerReason?: ProgressNotifyTrigger) => Promise<void>
}

/**
 * Check progress notifications for running tasks.
 * Returns task info with notification status.
 */
export async function checkProgressNotifications(
  deps: ProgressNotifyDeps,
): Promise<ProgressTaskInfo[]> {
  const { tasks, sessionStore, client, debugLog, directory, sendProgressNotificationFn } = deps
  const taskInfos: ProgressTaskInfo[] = []
  const runningTasks = Array.from(tasks.values()).filter(t => t.status === 'running' && !t.idleNotified)

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

      // Time-based fallback: notify once per time quota slot (3 min each)
      const now = new Date()
      const elapsedMs = now.getTime() - (task.startedAt?.getTime() ?? 0)
      const timeQuota = Math.floor(elapsedMs / PROGRESS_NOTIFY_TIME_THRESHOLD_MS)
      const lastQuota = task.lastNotifyTimeQuota ?? 0
      if (timeQuota > lastQuota) {
        task.lastNotifyTimeQuota = timeQuota
        shouldNotify = true
        triggerReason = 'time_quota'
      }

      // Message count threshold: notify once per modulo (dedup by lastNotifyMessageCount)
      if (messageCount > 0 && messageCount % PROGRESS_NOTIFY_MESSAGE_MODULO === 0) {
        const lastMsgCount = task.lastNotifyMessageCount ?? 0
        if (messageCount !== lastMsgCount) {
          shouldNotify = true
          triggerReason = 'message_count'
        }
      }

      // Cache-first: prefer sessionStore.lastTokens to avoid streaming window returning null
      const ctxInfo = await fetchContextPercent(client, sessionStore, directory, task.sessionID, debugLog)
      const contextUsage = ctxInfo?.pct ?? null

      // Context threshold: notify once per modulo value (dedup by lastNotifyContextPct)
      if (contextUsage !== null && contextUsage >= CONTEXT_WARN_THRESHOLD) {
        const modulo = CONTEXT_WARN_NOTIFY_MODULO
        if (contextUsage > 0 && contextUsage % modulo === 0) {
          const lastCtxPct = task.lastNotifyContextPct ?? 0
          if (contextUsage !== lastCtxPct) {
            shouldNotify = true
            triggerReason = 'context_threshold'
          }
        }
      } else if (contextUsage !== null) {
        const modulo = CONTEXT_NOTIFY_MODULO
        if (contextUsage > 0 && contextUsage % modulo === 0) {
          const lastCtxPct = task.lastNotifyContextPct ?? 0
          if (contextUsage !== lastCtxPct) {
            shouldNotify = true
            triggerReason = 'context_normal'
          }
        }
      }

      if (shouldNotify) {
        // Update dedup fields before sending
        task.lastNotifyMessageCount = messageCount
        if (contextUsage !== null) {
          task.lastNotifyContextPct = contextUsage
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
      debugLog(`[progressNotify] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return taskInfos
}