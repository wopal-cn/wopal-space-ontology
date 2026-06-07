/**
 * Message/Token Event Handler
 *
 * Handles message.updated, message.part.delta, and message.part.updated events.
 * Captures agent info and token usage from step-finish events.
 * Consumes pending context warnings on step-finish and injects [CONTEXT HEALTH] reminder.
 */

import type { OpenCodeClient } from "../../types.js"
import type { SessionStore } from "../../session-store.js"
import type { LoggerInstance } from "../../logger.js"
import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import { formatSessionID } from "../../logger.js"
import { trackActivity } from "../../tasks/progress.js"
import { getSessionModelInfo } from "../../tools/output-helpers.js"
import { getSessionModelOverride } from "../../session-model.js"

interface EventPart {
  type?: string
  snapshot?: unknown
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
  }
}

interface EventModelInfo {
  providerID?: string
  modelID?: string
  model?: { providerID?: string; modelID?: string }
}

interface MessageUpdateInfo extends EventModelInfo {
  agent?: string
}

function extractModelInfo(info: EventModelInfo | undefined): { providerID: string; modelID: string } | null {
  const providerID = info?.providerID ?? info?.model?.providerID
  const modelID = info?.modelID ?? info?.model?.modelID
  if (!providerID || !modelID) return null
  return { providerID, modelID }
}

function formatModel(info: { providerID: string; modelID: string } | null | undefined): string {
  return info ? `${info.providerID}/${info.modelID}` : "?"
}

async function resolveContextLimit(
  ctx: MessageTokenHandlerContext,
  modelInfo: { providerID: string; modelID: string } | null,
): Promise<number | undefined> {
  if (!modelInfo || typeof ctx.client.config?.providers !== "function") return undefined
  const providersResult = await ctx.client.config.providers({ query: { directory: "" } })
  const providers = providersResult?.data?.providers ?? []
  const provider = providers.find((p) => p.id === modelInfo.providerID)
  return provider?.models?.[modelInfo.modelID]?.limit?.context
}

function getTrustedStoredModel(state: { providerID?: string; modelID?: string } | undefined): { providerID: string; modelID: string } | null {
  if (!state?.providerID || !state?.modelID) return null
  return { providerID: state.providerID, modelID: state.modelID }
}

function isCompactionAgent(agent: string | undefined): boolean {
  return agent === "compaction"
}

export interface MessageTokenHandlerContext {
  client: OpenCodeClient
  sessionStore: SessionStore
  taskManager: SimpleTaskManager | undefined
  contextLog: LoggerInstance
}

/**
 * Handle message.updated event - capture agent info
 */
export function handleMessageUpdated(
  ctx: MessageTokenHandlerContext,
  sessionID: string | undefined,
  info: MessageUpdateInfo | undefined,
): void {
  if (!sessionID) return

  const modelInfo = extractModelInfo(info)
  if (!info?.agent && !modelInfo) return

  ctx.sessionStore.upsert(sessionID, (s) => {
    if (s.isCompacting && isCompactionAgent(info?.agent)) {
      ctx.contextLog.debug(
        { session_id: formatSessionID(sessionID, !!ctx.taskManager?.isTaskSession(sessionID)), agent: info?.agent, model: formatModel(modelInfo) },
        "Ignored compaction message model update",
      )
      return
    }

    if (info?.agent) s.agent = info.agent
    if (modelInfo) {
      const current = getTrustedStoredModel(s)
      const sid = formatSessionID(sessionID, !!ctx.taskManager?.isTaskSession(sessionID))
      if (!current || current.providerID !== modelInfo.providerID || current.modelID !== modelInfo.modelID) {
        s.providerID = modelInfo.providerID
        s.modelID = modelInfo.modelID
        delete s.contextLimit
        ctx.contextLog.debug({ session_id: sid, model: formatModel(modelInfo) }, current ? "Session model updated" : "Session model initialized")
      }
    }
  })
}

/**
 * Handle message.part.delta event - track activity for running tasks
 */
export function handleMessagePartDelta(
  ctx: MessageTokenHandlerContext,
  sessionID: string | undefined,
): void {
  if (!sessionID) return

  const task = ctx.taskManager?.findBySession(sessionID)
  if (task && task.status === "running") {
    trackActivity(task, "text")
  }
}

/**
 * Consume pending context warning on step-finish.
 * Sends [CONTEXT HEALTH] reminder if a pending warning exists.
 * Returns true if a warning was sent, false otherwise.
 */
export async function consumeContextWarning(
  ctx: MessageTokenHandlerContext,
  sessionID: string,
): Promise<boolean> {
  // Skip task sessions
  if (ctx.taskManager?.isTaskSession(sessionID)) return false

  // Atomically enter sending state and get pct
  const pct = ctx.sessionStore.beginContextWarningSend(sessionID)
  if (pct === null) return false

  const warningText = `<system-reminder>
[CONTEXT HEALTH]
Context usage: ${pct}%. Consider compacting with context_manage(action="compact") to maintain session health.
</system-reminder>`

  try {
    if (typeof ctx.client.session?.promptAsync !== "function") {
      ctx.sessionStore.rollbackContextWarningSend(sessionID, pct)
      ctx.contextLog.debug(
        `[contextHealth] ${formatSessionID(sessionID, false)} promptAsync unavailable, rolling back warning`,
      )
      return false
    }

    const modelOverride = getSessionModelOverride(ctx.sessionStore.get(sessionID))

    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        ...(modelOverride ? { model: modelOverride } : {}),
        noReply: false,
        parts: [{ type: "text", text: warningText }],
      },
    })

    ctx.sessionStore.commitContextWarningSend(sessionID, Date.now())
    ctx.contextLog.debug(
      `[contextHealth] ${formatSessionID(sessionID, false)} context warning sent at ${pct}%`,
    )
    return true
  } catch (err) {
    ctx.sessionStore.rollbackContextWarningSend(sessionID, pct)
    ctx.contextLog.debug(
      `[contextHealth] ${formatSessionID(sessionID, false)} warning send failed, rolled back: ${err instanceof Error ? err.message : String(err)}`,
    )
    return false
  }
}

/**
 * Handle message.part.updated event - token tracking, context warning, and activity
 */
export async function handleMessagePartUpdated(
  ctx: MessageTokenHandlerContext,
  sessionID: string | undefined,
  part: EventPart | undefined,
): Promise<void> {
  // Outer layer: step-finish — consume context warning for main sessions
  if (sessionID && part?.type === "step-finish") {
    await consumeContextWarning(ctx, sessionID)
  }

  // Inner layer: token usage logging and storage (only when tokens present)
  if (sessionID && part?.type === "step-finish" && part?.tokens) {
    const t = part.tokens
    const cache = t.cache ?? {}
    const isTask = !!ctx.taskManager?.isTaskSession(sessionID)
    const state = ctx.sessionStore.get(sessionID)
    const agent = state?.agent ?? "?"
    const used = (t.input ?? 0) + (cache.read ?? 0)
    let modelInfo = getTrustedStoredModel(state)

    ctx.contextLog.trace(
      {
        session_id: formatSessionID(sessionID, isTask),
        part_keys: Object.keys(part),
        snapshot_keys: typeof part.snapshot === "object" && part.snapshot !== null ? Object.keys(part.snapshot) : [],
      },
      "Step finish payload",
    )

    if (state?.isCompacting) {
      let compactingContextLimit: number | undefined = state.contextLimit
      if (!compactingContextLimit) {
        try {
          compactingContextLimit = await resolveContextLimit(ctx, modelInfo)
        } catch {
          // ignore — percentage is informational only
        }
      }
      const compactingPct = compactingContextLimit && compactingContextLimit > 0 ? Math.round((used / compactingContextLimit) * 100) : undefined
      ctx.contextLog.info(
        { session_id: formatSessionID(sessionID, isTask), agent, model: formatModel(modelInfo), input: t.input ?? 0, output: t.output ?? 0, cache_read: cache.read ?? 0, cache_write: cache.write ?? 0, ...(compactingPct !== undefined ? { pct: compactingPct } : {}) },
        "Token usage",
      )
      return
    }

    let contextLimit: number | undefined = undefined

    try {
      if (!modelInfo) {
        modelInfo = await getSessionModelInfo(ctx.client, sessionID)
      }
      contextLimit = await resolveContextLimit(ctx, modelInfo)
    } catch {
      // ignore — percentage is informational only
    }

    const pct = contextLimit && contextLimit > 0 ? Math.round((used / contextLimit) * 100) : undefined

    ctx.contextLog.info(
      { session_id: formatSessionID(sessionID, isTask), agent, model: formatModel(modelInfo), input: t.input ?? 0, output: t.output ?? 0, cache_read: cache.read ?? 0, cache_write: cache.write ?? 0, ...(pct !== undefined ? { pct } : {}) },
      "Token usage",
    )

    // Store token data + context limit + title in sessionStore
    if (t.input || cache.read) {
      let sessionTitle: string | undefined
      try {
        if (typeof ctx.client?.session?.get === "function") {
          const result = await ctx.client.session.get({ path: { id: sessionID } }) as { data?: { title?: string } } | undefined
          sessionTitle = result?.data?.title
        }
      } catch {
        // graceful degradation
      }

      ctx.sessionStore.upsert(sessionID, (state) => {
        if (modelInfo && !getTrustedStoredModel(state)) {
          state.providerID = modelInfo.providerID
          state.modelID = modelInfo.modelID
        }
        if (contextLimit) {
          state.contextLimit = contextLimit
        }
        if (sessionTitle) {
          state.title = sessionTitle
        }
        const cacheData = t.cache ? { ...t.cache } : undefined
        state.lastTokens = {
          input: t.input ?? 0,
          output: t.output ?? 0,
          ...(cacheData ? { cache: cacheData } : {}),
          updatedAt: Date.now(),
        }
      })
    }
  }

  // Track activity for running tasks
  if (sessionID) {
    const task = ctx.taskManager?.findBySession(sessionID)
    if (task && task.status === "running") {
      trackActivity(task, part?.type)
    }
  }
}
