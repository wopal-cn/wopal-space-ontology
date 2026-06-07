/**
 * Session Runtime Info - Unified session model/context/session role query
 *
 * Consolidates provider/model/context usage queries from task-monitor and output-helpers.
 * Eliminates `any` type escapes and provides cache-first strategy for context usage.
 */

import type { OpenCodeClient, OpenCodeConfig, SessionMessage } from "./types.js"
import type { SessionStore } from "./session-store.js"
import type { LoggerInstance } from "./logger.js"
import { formatSessionID, taskLogger } from "./logger.js"

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

export interface TaskSessionInspector {
  isTaskSession: (sessionID: string) => boolean
}

/**
 * Fetch providers config from OpenCode client.
 * Returns null if config API unavailable or fails.
 */
export async function fetchProvidersConfig(
  config: OpenCodeConfig | undefined,
  directory: string,
  _debugLog?: LoggerInstance,
): Promise<ProviderModelConfig | null> {
  void _debugLog // retained for callers, unused after taskLogger migration
  if (typeof config?.providers !== "function") {
    taskLogger.trace("[providersConfig] no config.providers API")
    return null
  }

  try {
    const result = await config.providers({ query: { directory } })
    const providers = result?.data?.providers ?? []
    taskLogger.trace({ provider_count: providers.length }, "[providersConfig] fetched providers")
    return { providers }
  } catch (err) {
    taskLogger.trace({ err }, "[providersConfig] error")
    return null
  }
}

/**
 * Extract model info from last assistant message.
 * Returns null if no assistant message or missing model info.
 */
export function extractModelFromMessages(
  messages: SessionMessage[],
  debugLog?: LoggerInstance,
): SessionModelInfo | null {
  const lastAssistant = [...messages].reverse().find((m) =>
    m?.info?.role === "assistant"
  )

  if (!lastAssistant?.info) {
    debugLog?.debug(`[modelFromMsgs] no assistant message found`)
    return null
  }

  const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
  const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID

  if (!providerID || !modelID) {
    debugLog?.debug(`[modelFromMsgs] missing provider/model IDs`)
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
  debugLog?: LoggerInstance,
): Promise<SessionModelInfo | null> {
  if (typeof client.session?.messages !== "function") {
    debugLog?.debug("[modelInfo] no session.messages API")
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
    debugLog?.debug(`[modelInfo] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Extract context usage from already-fetched messages.
 * Computes usage percentage against model's context limit.
 */
export function extractContextUsage(
  messages: SessionMessage[],
  providers: ProviderModelConfig["providers"] = [],
  debugLog?: LoggerInstance,
): ContextUsageInfo | null {
  const lastAssistant = [...messages].reverse().find((m) =>
    m?.info?.role === "assistant" && m?.info?.tokens
  )

  if (!lastAssistant?.info?.tokens) {
    debugLog?.trace("[extractCtx] no assistant with tokens found")
    return null
  }

  const tokens = lastAssistant.info.tokens
  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)

  if (used === 0) {
    debugLog?.trace(`[extractCtx] used=0 (step still streaming)`)
    return null
  }

  const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
  const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID

  if (!providerID || !modelID) {
    debugLog?.trace(`[extractCtx] missing IDs: providerID=${providerID ?? 'undefined'} modelID=${modelID ?? 'undefined'}`)
    return null
  }

  const provider = providers.find((p) => p.id === providerID)
  const contextLimit = provider?.models?.[modelID]?.limit?.context

  if (!contextLimit) {
    debugLog?.trace(`[extractCtx] no context limit for ${providerID}/${modelID}`)
    return null
  }

  const pct = Math.round((used / contextLimit) * 100)
  debugLog?.trace(`[extractCtx] ${used}/${contextLimit} = ${pct}%`)
  return { pct, used, contextLimit }
}

/**
 * Extract context usage from sessionStore cached tokens.
 * Preferred path since messages API returns tokens=0 during streaming.
 */
export function extractContextFromStore(
  sessionStore: SessionStore,
  sessionID: string,
  providers: ProviderModelConfig["providers"] = [],
  debugLog?: LoggerInstance,
  taskManager?: TaskSessionInspector,
): ContextUsageInfo | null {
  const state = sessionStore.get(sessionID)
  const tokens = state?.lastTokens
  const isTask = taskManager?.isTaskSession(sessionID) ?? false

  if (!tokens) {
    debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} no lastTokens in store`)
    return null
  }

  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)

  if (used === 0) {
    debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} used=0`)
    return null
  }

  if (state.contextLimit && state.contextLimit > 0) {
    const pct = Math.round((used / state.contextLimit) * 100)
    debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} ${used}/${state.contextLimit} = ${pct}%`)
    return { pct, used, contextLimit: state.contextLimit }
  }

  const providerID = state.providerID
  const modelID = state.modelID

  if (!providerID || !modelID) {
    debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} missing provider/model info`)
    return null
  }

  const provider = providers.find((p) => p.id === providerID)
  const contextLimit = provider?.models?.[modelID]?.limit?.context

  if (!contextLimit) {
    debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} no contextLimit for ${providerID}/${modelID}`)
    return null
  }

  const pct = Math.round((used / contextLimit) * 100)
  debugLog?.trace(`[ctxFromStore] ${formatSessionID(sessionID, isTask)} ${used}/${contextLimit} = ${pct}%`)
  return { pct, used, contextLimit }
}

/**
 * Fetch context usage percentage with cache-first strategy.
 * 1. Try sessionStore.lastTokens + contextLimit (captured from step-finish event)
 * 2. Try sessionStore.lastTokens + provider config lookup
 * 3. Fallback to messages API (may return 0 during streaming)
 */
export async function fetchContextPercent(
  client: OpenCodeClient,
  sessionStore: SessionStore,
  directory: string,
  sessionID: string,
  debugLog?: LoggerInstance,
  taskManager?: TaskSessionInspector,
): Promise<ContextUsageInfo | null> {
  const isTask = taskManager?.isTaskSession(sessionID) ?? false
  const ctxLog = (msg: string) => debugLog?.trace(`[ctxUsage] ${formatSessionID(sessionID, isTask)} ${msg}`)

  try {
    // Fast path: complete cached state needs no provider/messages API.
    const cached = extractContextFromStore(sessionStore, sessionID, [], debugLog, taskManager)
    if (cached) {
      ctxLog(`from store: ${cached.pct}%`)
      return cached
    }

    // Get providers config only when cached contextLimit is unavailable.
    const configResult = await fetchProvidersConfig(client.config, directory, debugLog)
    if (!configResult) {
      ctxLog("no providers config")
      return null
    }

    // Cache-first: try sessionStore.lastTokens
    const fromStore = extractContextFromStore(sessionStore, sessionID, configResult.providers, debugLog, taskManager)
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
    taskLogger.trace(`[ctxUsage] ${formatSessionID(sessionID, isTask)} fetched ${messages.length} messages (fallback)`)

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
