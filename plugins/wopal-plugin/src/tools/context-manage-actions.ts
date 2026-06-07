/**
 * Context Manage Actions - Handlers for status/dump/compact
 *
 * Extracted from context-manage.ts to reduce orchestration layer size.
 * Each handler is pure or has minimal side effects.
 */

import type { OpenCodeClient } from "../types.js"
import type { SessionState, SessionStore } from "../session-store.js"
import type { SystemPromptMetadata } from "../types.js"
import type { MessageWithInfo } from "../hooks/message-context.js"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { TaskSessionInspector } from "../session-runtime-info.js"
import { contextLogger, formatSessionID } from "../logger.js"
import { writeContextDump, findActualKey } from "./dump-formatter.js"
import { fetchContextPercent } from "../session-runtime-info.js"

export interface StatusPayload {
  sessionID: string
  agent: string | null
  isCompacting: boolean
  lastTokens: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
  }
  model: {
    provider: string | null
    id: string | null
  }
  loadedSkills: number
  pct: number | null
}

interface StatsFromState {
  agent: string | null
  isCompacting: boolean
  lastTokens: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
  }
  model: {
    provider: string | null
    id: string | null
  }
  loadedSkills: number
  pct: number | null
}

/**
 * Build stats payload from session state (without sessionID).
 */
function buildStatsPayload(state?: SessionState): StatsFromState {
  const used = (state?.lastTokens?.input ?? 0) + (state?.lastTokens?.cache?.read ?? 0)
  const ctxLimit = state?.contextLimit
  const pct = ctxLimit && ctxLimit > 0 ? Math.round((used / ctxLimit) * 100) : null

  return {
    agent: state?.agent ?? null,
    isCompacting: state?.isCompacting ?? false,
    lastTokens: {
      input: state?.lastTokens?.input ?? 0,
      output: state?.lastTokens?.output ?? 0,
      cache: {
        read: state?.lastTokens?.cache?.read ?? 0,
        write: state?.lastTokens?.cache?.write ?? 0,
      },
    },
    model: {
      provider: state?.providerID ?? null,
      id: state?.modelID ?? null,
    },
    loadedSkills: state?.loadedSkills.size ?? 0,
    pct,
  }
}

/**
 * Handle status action - return session context usage stats.
 */
export function handleStatus(
  sessionID: string,
  sessionStore: SessionStore,
  isChildSession: boolean,
  taskManager?: SimpleTaskManager,
): string {
  const state = sessionStore.get(sessionID)
  const stats = buildStatsPayload(state)
  const payload: StatusPayload = {
    sessionID,
    ...stats,
  }

  // Add tasks array only for main sessions (not child sessions)
  if (!isChildSession && taskManager) {
    const tasks = taskManager.listTasksForParent(sessionID)
    return JSON.stringify(
      {
        ...payload,
        tasks,
      },
      null,
      2,
    )
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Handle dump action - export session context to file.
 */
export async function handleDump(
  sessionID: string,
  isTask: boolean,
  client: OpenCodeClient,
  baseDir: string,
  systemSnapshots: Map<string, string[]>,
  systemMetadataMap: Map<string, SystemPromptMetadata>,
  systemInjectionsMap: Map<string, string[]>,
  transformedMessagesMap: Map<string, MessageWithInfo[]>,
  detail: boolean,
): Promise<string> {
  const prefix = isTask ? "CTXDUMP-TASK" : "CTXDUMP"

  let title: string | null = null
  try {
    if (typeof client?.session?.get === "function") {
      const result = await client.session.get({ path: { id: sessionID } }) as { data?: { title?: string } } | undefined
      title = result?.data?.title ?? null
    }
  } catch {
    // Graceful degradation
  }

  const result = await writeContextDump({
    sessionID,
    baseDir,
    filenamePrefix: prefix,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    transformedMessagesMap,
    client,
    detail,
    title,
  })

  const actualKey = findActualKey(systemMetadataMap, sessionID)
  const metaLabel = actualKey
    ? (actualKey === sessionID ? "hit" : `prefix-matched → ${actualKey}`)
    : `miss (map keys: ${systemMetadataMap.size > 0 ? Array.from(systemMetadataMap.keys()).join(", ") : "empty"})`
  const sysPromptLabel = result.hasMetadata
    ? result.parsedFromRaw
      ? `parsed from ${result.blockCount} raw blocks`
      : "structured metadata"
    : `${result.blockCount} raw blocks`
  return `Context dumped to ${result.filepath}\n\n- **Session:** ${sessionID}\n- **System prompt:** ${sysPromptLabel} (${metaLabel})\n- **Messages:** ${result.messageCount}`
}

/**
 * Handle compact action - trigger session compaction.
 */
export async function handleCompact(
  sessionID: string,
  isTask: boolean,
  client: OpenCodeClient,
  sessionStore: SessionStore,
  directory: string,
  taskManager?: TaskSessionInspector,
): Promise<string> {
  const state = sessionStore.get(sessionID)
  if (state?.isCompacting) {
    const since = state.compactingSince
    const elapsedSec = since ? Math.floor((Date.now() - since) / 1000) : "?"
    return `Already compacting ${formatSessionID(sessionID, isTask)} (started ${elapsedSec}s ago). Wait for compaction to complete.`
  }

  if (!state) {
    return `Failed: session not found in store. Ensure the session ${formatSessionID(sessionID, isTask)} has been active (received at least one step-finish event).`
  }

  if (typeof client?.session?.summarize !== "function") {
    return `Failed: session.summarize API unavailable.`
  }

  let contextInfo = "Context: unknown"
  try {
    const ctxInfo = await fetchContextPercent(client, sessionStore, directory, sessionID, contextLogger, taskManager)
    if (ctxInfo) {
      const warning = ctxInfo.pct >= 75 ? " ⚠️" : ctxInfo.pct >= 55 ? " ⚡" : ""
      contextInfo = `Context: ${ctxInfo.pct}% used${warning} (${ctxInfo.used}/${ctxInfo.contextLimit} tokens)`
    }
  } catch {
    // ignore - context info is informational only
  }

  const providerID = state.providerID ?? ""
  const modelID = state.modelID ?? ""

  if (!isTask) {
    sessionStore.upsert(sessionID, (next) => {
      next.pendingCompactTrigger = "plugin"
    })
    contextLogger.info(`${formatSessionID(sessionID, false)} compact scheduled, will start on next idle`)
    return [
      `Compacting session ${formatSessionID(sessionID, false)}...`,
      contextInfo,
      `Model: ${providerID || "?"}/${modelID || "?"}`,
      "Main-session compaction scheduled. It will start automatically when the current turn becomes idle.",
      "Main session will receive auto-recovery message when compaction completes.",
    ].join("\n")
  }

  sessionStore.markCompacting(sessionID, Date.now(), "plugin")
  try {
    await client.session.summarize({
      path: { id: sessionID },
      body: { providerID, modelID },
    })
  } catch (error) {
    sessionStore.upsert(sessionID, (next) => {
      next.isCompacting = false
      delete next.compactingSince
      delete next.compactingTrigger
    })
    const message = error instanceof Error ? error.message : String(error)
    return `Failed to compact: ${message}\n${contextInfo}`
  }

  return [
    `Compacting session ${formatSessionID(sessionID, isTask)}...`,
    contextInfo,
    `Model: ${providerID || "?"}/${modelID || "?"}`,
    "Compaction triggered. The session will be summarized and become IDLE.",
    "Parent agent will receive [WOPAL TASK COMPACTED] notification when done.",
  ].join("\n")
}
