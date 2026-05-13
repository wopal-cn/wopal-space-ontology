import type { SessionMessage, WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"

// --- merged from stuck-detector.ts ---

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

// --- original task-monitor.ts ---

// Progress notification thresholds
export const PROGRESS_NOTIFY_MESSAGE_THRESHOLD = 20
export const PROGRESS_NOTIFY_TIME_THRESHOLD_MS = 180_000 // 3 minutes
export const CONTEXT_WARN_THRESHOLD = 45
export const CONTEXT_NOTIFY_INCREMENT = 5

export interface ProgressTaskInfo {
  taskId: string
  messageCount: number
  wasNotified: boolean
  contextUsage: number | null
}

export interface TaskMonitorDeps {
  tasks: Map<string, WopalTask>
  client: {
    session?: {
      messages?: (args: { path: { id: string } }) => Promise<{
        data?: SessionMessage[]
      }>
      promptAsync?: (args: unknown) => Promise<void>
    }
    config?: {
      providers?: (args: { query: { directory: string } }) => Promise<{
        data?: {
          providers?: Array<{
            id: string
            models?: Record<string, { limit?: { context?: number } }>
          }>
        }
      }>
    }
  }
  debugLog: DebugLog
  directory: string
  notifyParentStuckFn: (task: WopalTask, durationText: string) => Promise<void>
  sendProgressNotificationFn: (task: WopalTask, messageCount: number, contextUsage: number | null) => Promise<void>
}

/**
 * Core context usage calculation — single source of truth for fetching
 * messages, extracting token counts, and computing the usage percentage.
 * Returns rich info (percentage + raw values) or null if unavailable.
 */
export interface ContextUsageInfo {
  pct: number
  used: number
  contextLimit: number
}

export async function fetchContextPercent(
  client: TaskMonitorDeps["client"],
  directory: string,
  sessionID: string,
  debugLog: DebugLog,
): Promise<ContextUsageInfo | null> {
  const ctxLog = (msg: string) => debugLog(`[ctxUsage:${sessionID.slice(0, 8)}] ${msg}`)
  try {
    if (typeof client.session?.messages !== "function") {
      ctxLog("no session.messages API")
      return null
    }
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
    })
    const messages = messagesResult?.data ?? []
    ctxLog(`fetched ${messages.length} messages`)
    const lastAssistant = [...messages].reverse().find((m) =>
      m?.info?.role === "assistant" && m?.info?.tokens
    )
    if (!lastAssistant?.info?.tokens) {
      const assistantCount = messages.filter((m: SessionMessage) => m?.info?.role === "assistant").length
      ctxLog(`no assistant with tokens (total assistants: ${assistantCount})`)
      return null
    }

    const tokens = lastAssistant.info.tokens
    const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)
    if (used === 0) {
      ctxLog("tokens.input=0 (step still streaming)")
      return null
    }

    if (typeof client.config?.providers !== "function") {
      ctxLog("no config.providers API")
      return null
    }
    const providersResult = await client.config.providers({
      query: { directory },
    })
    const providers = providersResult?.data?.providers ?? []
    const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
    const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
    if (!providerID || !modelID) {
      ctxLog(`missing IDs: providerID=${providerID ?? 'undefined'} modelID=${modelID ?? 'undefined'}`)
      return null
    }

    const provider = providers.find((p: { id: string }) => p.id === providerID)
    const contextLimit = provider?.models?.[modelID]?.limit?.context
    if (!contextLimit) {
      ctxLog(`no context limit for ${providerID}/${modelID}`)
      return null
    }

    const pct = Math.round((used / contextLimit) * 100)
    ctxLog(`${used}/${contextLimit} = ${pct}%`)
    return { pct, used, contextLimit }
  } catch (err) {
    ctxLog(`error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export async function getContextUsagePercent(
  client: TaskMonitorDeps["client"],
  directory: string,
  sessionID: string,
  debugLog: DebugLog,
): Promise<number | null> {
  const info = await fetchContextPercent(client, directory, sessionID, debugLog)
  return info?.pct ?? null
}

export async function checkProgressNotifications(
  deps: TaskMonitorDeps,
): Promise<ProgressTaskInfo[]> {
  const { tasks, client, debugLog, directory, sendProgressNotificationFn } = deps
  const taskInfos: ProgressTaskInfo[] = []
  const runningTasks = Array.from(tasks.values()).filter(t => t.status === 'running' && !t.idleNotified)

  for (const task of runningTasks) {
    if (!task.sessionID) continue

    try {
      const messagesResult = await client.session?.messages?.({
        path: { id: task.sessionID },
      })

      if (!messagesResult?.data) continue

      const messageCount = messagesResult.data.length
      const now = new Date()
      const lastNotifyCount = task.lastNotifyMessageCount ?? 0

      const referenceTime = lastNotifyCount > 0
        ? (task.lastNotifyTime?.getTime() ?? 0)
        : (task.startedAt?.getTime() ?? 0)
      const messageDelta = messageCount - lastNotifyCount
      const timeDelta = now.getTime() - referenceTime

      let shouldNotify = messageDelta >= PROGRESS_NOTIFY_MESSAGE_THRESHOLD ||
        (referenceTime > 0 && timeDelta >= PROGRESS_NOTIFY_TIME_THRESHOLD_MS)

      // Bug 1 fix: prefer cached value to avoid streaming window returning null
      let contextUsage: number | null = task.lastContextUsage ?? null
      if (contextUsage === null) {
        try {
          contextUsage = await getContextUsagePercent(client, directory, task.sessionID, debugLog)
          if (contextUsage !== null) {
            task.lastContextUsage = contextUsage
          }
        } catch {
          // Graceful degradation
        }
      }

      if (contextUsage !== null && contextUsage >= CONTEXT_WARN_THRESHOLD) {
        const lastNotifiedUsage = task.lastNotifyContextUsage ?? 0
        const usageGrowth = contextUsage - lastNotifiedUsage
        if (usageGrowth >= CONTEXT_NOTIFY_INCREMENT) {
          shouldNotify = true
        }
      }

      if (shouldNotify) {
        await sendProgressNotificationFn(task, messageCount, contextUsage)
        task.lastNotifyMessageCount = messageCount
        task.lastNotifyTime = now
        if (contextUsage !== null && contextUsage >= CONTEXT_WARN_THRESHOLD) {
          task.lastNotifyContextUsage = contextUsage
        }
      }

      taskInfos.push({
        taskId: task.id,
        messageCount,
        wasNotified: shouldNotify,
        contextUsage,
      })
    } catch (err) {
      debugLog(`[progressNotify] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return taskInfos
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
    const lastNotifyCount = task.lastNotifyMessageCount ?? 0
    const wasChecked = progressInfos.find(p => p.taskId === task.id)

    let msgsText: string
    if (wasChecked) {
      msgsText = lastNotifyCount > 0
        ? `+${wasChecked.messageCount - lastNotifyCount} msgs`
        : `${wasChecked.messageCount} msgs`
    } else {
      msgsText = '—'
    }

    const refTime = lastNotifyCount > 0 && task.lastNotifyTime
      ? task.lastNotifyTime.getTime()
      : (task.startedAt?.getTime() ?? 0)
    const elapsedMs = refTime > 0 ? now - refTime : 0
    const totalSec = Math.floor(elapsedMs / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const timeText = `${min}m${sec.toString().padStart(2, '0')}s`

    const ctxPct = wasChecked?.contextUsage ?? task.lastContextUsage
    const ctxText = ctxPct != null
      ? (ctxPct >= CONTEXT_WARN_THRESHOLD ? `, ctx:${ctxPct}% ⚠️` : `, ctx:${ctxPct}%`)
      : ''

    const notifiedMark = wasChecked?.wasNotified ? ' ✓notified' : ''

    return `  [${i + 1}] wopal-task-${shortId} "${task.description}": ${msgsText}, ${timeText}${ctxText}${notifiedMark}`
  })

  debugLog(`[tick] ${runningTasks.length} tasks:\n${lines.join('\n')}`)
}