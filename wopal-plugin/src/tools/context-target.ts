/**
 * Context Target Resolver
 *
 * Resolves raw session/task IDs to normalized sessionID and isTask flag.
 * Reused by all context-manage action handlers.
 */

import type { OpenCodeClient } from "../types.js"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { isChildSession } from "../hooks/session-utils.js"
import { normalizeSessionReference } from "../session-ref.js"

export interface SessionTarget {
  sessionID: string
  isTask: boolean
}

/**
 * Resolve raw session ID to normalized target.
 *
 * Supports:
 * - Raw session IDs: `ses_xxx`
 * - Task references: `wopal-task-xxx` → extracts `ses_xxx`
 * - Child session detection via `isChildSession()` helper
 *
 * @param rawID - Raw input ID (ses_xxx or wopal-task-xxx)
 * @param client - OpenCode client for session.get API
 * @param taskManager - Optional task manager for task lookup
 * @returns Normalized target with sessionID and isTask flag
 */
export async function resolveSessionTarget(
  rawID: string,
  client: OpenCodeClient,
  taskManager?: SimpleTaskManager,
): Promise<SessionTarget> {
  const normalized = normalizeSessionReference(rawID)

  if (normalized.isTaskReference) {
    return { sessionID: normalized.sessionID, isTask: true }
  }

  const isTask = await isChildSession(normalized.sessionID, {
    client,
    taskManager,
    cache: new Map<string, boolean>(),
  })

  return { sessionID: normalized.sessionID, isTask }
}