/**
 * Session Runtime Info - Unified session model/context/session role query
 *
 * Consolidates provider/model/context usage queries from task-monitor and output-helpers.
 * Eliminates `any` type escapes and provides cache-first strategy for context usage.
 */

import type { OpenCodeClient, OpenCodeConfig, SessionMessage } from "./types.js"
import type { SessionStore } from "./session-store.js"
import type { DebugLog } from "./debug.js"
import { formatSessionID } from "./debug.js"

export interface SessionModelInfo {
  providerID: string
  modelID: string
}

export interface ContextUsageInfo {
  pct: number
  used: number
  contextLimit: number
}

export interface ProviderModelConfig {
  providers: Array<{
    id: string
    models?: Record<string, { limit?: { context?: number } }>
  }>
}

/**
 * Fetch providers config from OpenCode client.
 * Returns null if config API unavailable or fails.
 */
export async function fetchProvidersConfig(
  config: OpenCodeConfig | undefined,
  directory: string,
  debugLog?: DebugLog,
): Promise<ProviderModelConfig | null> {
  if (typeof config?.providers !== "function") {
    debugLog?.(`[providersConfig] no config.providers API`)
    return null
  }

  try {
    const result = await config.providers({ query: { directory } })
    const providers = result?.data?.providers ?? []
    debugLog?.(`[providersConfig] fetched ${providers.length} providers`)
    return { providers }
  } catch (err) {
    debugLog?.(`[providersConfig] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Extract model info from last assistant message.
 * Returns null if no assistant message or missing model info.
 */
export function extractModelFromMessages(
  messages: SessionMessage[],
  debugLog?: DebugLog,
): SessionModelInfo | null {
  const lastAssistant = [...messages].reverse().find((m) =>
    m?.info?.role === "assistant"
  )

  if (!lastAssistant?.info) {
    debugLog?.(`[modelFromMsgs] no assistant message found`)
    return null
  }

  const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
  const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID

  if (!providerID || !modelID) {
    debugLog?.(`[modelFromMsgs] missing provider/model IDs`)
    return null
  }

  return { providerID, modelID }
}

/**
 * Fetch session model info via messages API.
 * Uses last assistant message to extract provider/model IDs.
 */
export async function fetchSessionModelInfo(
  client: OpenCodeClient,
  sessionID: string,
  debugLog?: DebugLog,
): Promise<SessionModelInfo | null> {
  if (typeof client.session?.messages !== "function") {
    debugLog?.(`[modelInfo] no session.messages API`)
    return null
  }

  try {
    const result = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 5 }
    })
    const messages = (result as { data?: SessionMessage[] } | undefined)?.data ?? []

    return extractModelFromMessages(messages, debugLog)
  } catch (err) {
    debugLog?.(`[modelInfo] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Extract context usage from already-fetched messages.
 * Computes usage percentage against model's context limit.
 */
export function extractContextUsage(
  messages: SessionMessage[],
  providers: ProviderModelConfig["providers"],
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
    debugLog?.(`[extractCtx] used=0 (step still streaming)`)
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
 * Extract context usage from sessionStore cached tokens.
 * Preferred path since messages API returns tokens=0 during streaming.
 */
export function extractContextFromStore(
  sessionStore: SessionStore,
  sessionID: string,
  providers: ProviderModelConfig["providers"],
  debugLog?: DebugLog,
): ContextUsageInfo | null {
  const state = sessionStore.get(sessionID)
  const tokens = state?.lastTokens
  const isTask = state?.isTask ?? false

  if (!tokens) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} no lastTokens in store`)
    return null
  }

  // Stale check: tokens older than 60s may be outdated
  const ageMs = Date.now() - tokens.updatedAt
  if (ageMs > 60_000) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} tokens stale (${Math.floor(ageMs / 1000)}s ago)`)
    return null
  }

  const providerID = state.providerID
  const modelID = state.modelID

  if (!providerID || !modelID) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} missing provider/model info`)
    return null
  }

  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)

  if (used === 0) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} used=0`)
    return null
  }

  const provider = providers.find((p) => p.id === providerID)
  const contextLimit = provider?.models?.[modelID]?.limit?.context

  if (!contextLimit) {
    debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} no contextLimit for ${providerID}/${modelID}`)
    return null
  }

  const pct = Math.round((used / contextLimit) * 100)
  debugLog?.(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} ${used}/${contextLimit} = ${pct}%`)
  return { pct, used, contextLimit }
}

/**
 * Fetch context usage percentage with cache-first strategy.
 * 1. Try sessionStore.lastTokens (captured from step-finish event)
 * 2. Fallback to messages API (may return 0 during streaming)
 */
export async function fetchContextPercent(
  client: OpenCodeClient,
  sessionStore: SessionStore,
  directory: string,
  sessionID: string,
  debugLog?: DebugLog,
): Promise<ContextUsageInfo | null> {
  const state = sessionStore.get(sessionID)
  const isTask = state?.isTask ?? false
  const ctxLog = (msg: string) => debugLog?.(`[ctxUsage] ${formatSessionID(sessionID, isTask)} ${msg}`)

  try {
    // Get providers config (needed for contextLimit lookup)
    const configResult = await fetchProvidersConfig(client.config, directory, debugLog)
    if (!configResult) {
      ctxLog("no providers config")
      return null
    }

    // Cache-first: try sessionStore.lastTokens
    const fromStore = extractContextFromStore(sessionStore, sessionID, configResult.providers, debugLog)
    if (fromStore) {
      ctxLog(`from store: ${fromStore.pct}%`)
      return fromStore
    }

    // Fallback: messages API (may return tokens=0 during streaming)
    if (typeof client.session?.messages !== "function") {
      ctxLog(`no session.messages API`)
      return null
    }

    const messagesResult = await client.session.messages({
      path: { id: sessionID },
    })
    const messages = (messagesResult as { data?: SessionMessage[] } | undefined)?.data ?? []
    ctxLog(`fetched ${messages.length} messages (fallback)`)

    const result = extractContextUsage(messages, configResult.providers, debugLog)
    if (result) {
      ctxLog(`${result.used}/${result.contextLimit} = ${result.pct}%`)
    }
    return result
  } catch (err) {
    ctxLog(`error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Format token count for human-readable display.
 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/**
 * Format context usage for display with warning indicator.
 */
export function formatContextUsage(info: ContextUsageInfo | null): string | null {
  if (!info) return null

  const warn = info.pct > 45 ? " ⚠️" : ""
  return `Context: ${info.pct}% used (${formatTokenCount(info.used)}/${formatTokenCount(info.contextLimit)})${warn}`
}