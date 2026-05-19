/**
 * Message/Token Event Handler
 *
 * Handles message.updated, message.part.delta, and message.part.updated events.
 * Captures agent info and token usage from step-finish events.
 */

import type { OpenCodeClient } from "../../types.js"
import type { SessionStore } from "../../session-store.js"
import type { DebugLog } from "../../debug.js"
import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import { createDebugLog, formatSessionID } from "../../debug.js"
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
  contextLog: DebugLog
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
 * Handle message.part.updated event - token tracking and activity
 */
export async function handleMessagePartUpdated(
  ctx: MessageTokenHandlerContext,
  sessionID: string | undefined,
  part: EventPart | undefined,
): Promise<void> {
  const contextLog = createDebugLog("[context] [tokens]", "context")

  // Token usage logging for step-finish events
  if (sessionID && part?.type === "step-finish" && part?.tokens) {
    const t = part.tokens
    const cache = t.cache ?? {}
    const isTask = !!ctx.taskManager?.findBySession(sessionID)
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

    contextLog(`${formatSessionID(sessionID, isTask)} agent=${agent} model=${model} tokens: input=${t.input ?? 0} output=${t.output ?? 0} cache_read=${cache.read ?? 0} cache_write=${cache.write ?? 0}${pctText}`)

    // Store token data + context limit in sessionStore
    if (t.input || cache.read) {
      ctx.sessionStore.upsert(sessionID, (state) => {
        if (modelInfo) {
          state.providerID = modelInfo.providerID
          state.modelID = modelInfo.modelID
        }
        if (contextLimit) {
          state.contextLimit = contextLimit
        }
        state.isTask = isTask
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