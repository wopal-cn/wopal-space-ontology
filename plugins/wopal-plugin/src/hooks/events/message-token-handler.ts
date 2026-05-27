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

interface EventPart {
  type?: string
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
  }
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
  info: { agent?: string } | undefined,
): void {
  if (!sessionID) return

  if (info?.agent) {
    ctx.sessionStore.upsert(sessionID, (s) => {
      s.agent = info.agent
    })
  }
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

    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
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

    // Get model info and context limit for percentage calculation
    let model = "?"
    let pctText = ""
    let modelInfo: { providerID: string; modelID: string } | null = null
    let contextLimit: number | undefined = undefined

    try {
      modelInfo = await getSessionModelInfo(ctx.client, sessionID)
      if (modelInfo) {
        const info = modelInfo
        model = `${info.providerID}/${info.modelID}`
        const configClient = ctx.client
        if (typeof configClient.config?.providers === "function") {
          const providersResult = await configClient.config.providers({ query: { directory: "" } })
          const providers = providersResult?.data?.providers ?? []
          const provider = providers.find((p) => p.id === info.providerID)
          contextLimit = provider?.models?.[info.modelID]?.limit?.context
          if (contextLimit && contextLimit > 0) {
            pctText = ` pct=${Math.round((used / contextLimit) * 100)}%`
          }
        }
      }
    } catch {
      // ignore — percentage is informational only
    }

    ctx.contextLog.info(
      { session_id: formatSessionID(sessionID, isTask), agent, model, input: t.input ?? 0, output: t.output ?? 0, cache_read: cache.read ?? 0, cache_write: cache.write ?? 0, ...(pctText ? { pct: pctText.trim() } : {}) },
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
        if (modelInfo) {
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
