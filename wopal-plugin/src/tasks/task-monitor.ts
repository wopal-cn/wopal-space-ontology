import type { SessionMessage, WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"
import type { SessionStore } from "../session-store.js"
import { formatSessionID } from "../debug.js"

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

export interface TaskMonitorDeps {
  tasks: Map<string, WopalTask>
  sessionStore: SessionStore
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
  sendProgressNotificationFn: (task: WopalTask, messageCount: number, contextUsage: number | null, triggerReason?: ProgressNotifyTrigger) => Promise<void>
}

/**
 * Core context usage calculation from already-fetched messages.
 * Extracts token counts from the last assistant message and computes
 * the usage percentage against the model's context limit.
 * Returns rich info (percentage + raw values) or null if unavailable.
 */
export interface ContextUsageInfo {
  pct: number
  used: number
  contextLimit: number
}

export function extractContextUsage(
  messages: SessionMessage[],
  providers: Array<{ id: string; models?: Record<string, { limit?: { context?: number } }> }>,
  debugLog?: DebugLog,
): ContextUsageInfo | null {
  const lastAssistant = [...messages].reverse().find((m) =>
    m?.info?.role === "assistant" && m?.info?.tokens
  )
  if (!lastAssistant?.info?.tokens) {
    debugLog?.(`[extractCtx] no assistant with tokens found`)
    return null
  }

  const tokens = lastAssistant.info.tokens
  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)
  if (used === 0) {
    debugLog?.(`[extractCtx] tokens.input=0 (step still streaming)`)
    return null
  }

  const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
  const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
  if (!providerID || !modelID) {
    debugLog?.(`[extractCtx] missing IDs: providerID=${providerID ?? 'undefined'} modelID=${modelID ?? 'undefined'}`)
    return null
  }

  const provider = providers.find((p) => p.id === providerID)
  const contextLimit = provider?.models?.[modelID]?.limit?.context
  if (!contextLimit) {
    debugLog?.(`[extractCtx] no context limit for ${providerID}/${modelID}`)
    return null
  }

  const pct = Math.round((used / contextLimit) * 100)
  debugLog?.(`[extractCtx] ${used}/${contextLimit} = ${pct}%`)
  return { pct, used, contextLimit }
}

/**
 * Calculate context usage from sessionStore cached tokens (captured from step-finish).
 * This is the preferred path since messages API returns tokens=0 during streaming.
 */
export function extractContextFromStore(
  sessionStore: SessionStore,
  sessionID: string,
  providers: Array<{ id: string; models?: Record<string, { limit?: { context?: number } }> }>,
  debugLog?: DebugLog,
): ContextUsageInfo | null {
  const state = sessionStore.get(sessionID)
  const tokens = state?.lastTokens
  if (!tokens) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} no lastTokens in store`)
    return null
  }

  // Stale check: tokens older than 60s may be outdated
  const ageMs = Date.now() - tokens.updatedAt
  if (ageMs > 60_000) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} tokens stale (${Math.floor(ageMs / 1000)}s ago)`)
    return null
  }

  const providerID = state.providerID
  const modelID = state.modelID
  if (!providerID || !modelID) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} missing provider/model info`)
    return null
  }

  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)
  if (used === 0) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} used=0`)
    return null
  }

  const provider = providers.find((p) => p.id === providerID)
  const contextLimit = provider?.models?.[modelID]?.limit?.context
  if (!contextLimit) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} no contextLimit for ${providerID}/${modelID}`)
    return null
  }

  const pct = Math.round((used / contextLimit) * 100)
  debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, true)} ${used}/${contextLimit} = ${pct}%`)
  return { pct, used, contextLimit }
}

/**
 * Fetch context usage percentage with cache-first strategy.
 * 1. Try sessionStore.lastTokens (captured from step-finish event)
 * 2. Fallback to messages API (may return 0 during streaming)
 */
export async function fetchContextPercent(
  client: TaskMonitorDeps["client"],
  sessionStore: SessionStore,
  directory: string,
  sessionID: string,
  debugLog: DebugLog,
): Promise<ContextUsageInfo | null> {
  const ctxLog = (msg: string) => debugLog(`[ctxUsage] ${formatSessionID(sessionID, true)} ${msg}`)

  try {
    // Get providers config (needed for contextLimit lookup)
    if (typeof client.config?.providers !== "function") {
      ctxLog("no config.providers API")
      return null
    }
    const providersResult = await client.config.providers({
      query: { directory },
    })
    const providers = providersResult?.data?.providers ?? []

    // Cache-first: try sessionStore.lastTokens
    const fromStore = extractContextFromStore(sessionStore, sessionID, providers, debugLog)
    if (fromStore) {
      ctxLog(`from store: ${fromStore.pct}%`)
      return fromStore
    }

    // Fallback: messages API (may return tokens=0 during streaming)
    if (typeof client.session?.messages !== "function") {
      ctxLog("no session.messages API")
      return null
    }
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
    })
    const messages = messagesResult?.data ?? []
    ctxLog(`fetched ${messages.length} messages (fallback)`)

    const result = extractContextUsage(messages, providers, debugLog)
    if (result) {
      ctxLog(`${result.used}/${result.contextLimit} = ${result.pct}%`)
    }
    return result
  } catch (err) {
    ctxLog(`error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export async function getContextUsagePercent(
  client: TaskMonitorDeps["client"],
  sessionStore: SessionStore,
  directory: string,
  sessionID: string,
  debugLog: DebugLog,
): Promise<number | null> {
  const info = await fetchContextPercent(client, sessionStore, directory, sessionID, debugLog)
  return info?.pct ?? null
}

export async function checkProgressNotifications(
  deps: TaskMonitorDeps,
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

      if (!messagesResult?.data) continue

      const messageCount = messagesResult.data.length

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
        triggerReason,
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
