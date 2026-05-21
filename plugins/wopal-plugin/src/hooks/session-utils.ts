/**
 * Session Utilities - Shared session detection functions
 *
 * Public utilities for session type detection, used by multiple modules
 * (memory injection, rules injection, message hooks).
 */

import type { OpenCodeClient } from "../types.js";

/**
 * Dependencies for child session detection.
 * Minimal interface to avoid coupling to specific module contexts.
 */
export interface ChildSessionCheckDeps {
  client: OpenCodeClient;
  taskManager?: { findBySession: (sessionID: string) => unknown } | undefined;
  cache?: Map<string, boolean> | undefined;
}

/**
 * Check if a session is a child session (has parentID).
 *
 * Two detection methods (checked in order):
 * 1. taskManager.findBySession() - wopal_task tracked sessions (fast, in-memory)
 * 2. OpenCode session API - session.get() parentID check (reliable, async)
 *
 * @param sessionID - Session ID to check
 * @param deps - Detection dependencies
 * @returns true if child session (has parent), false otherwise
 */
export async function isChildSession(
  sessionID: string,
  deps: ChildSessionCheckDeps,
): Promise<boolean> {
  const cached = deps.cache?.get(sessionID);
  if (cached !== undefined) return cached;

  // Check 1: wopal_task tracked sessions (fast in-memory check)
  if (deps.taskManager?.findBySession(sessionID)) {
    deps.cache?.set(sessionID, true);
    return true;
  }

  // Check 2: OpenCode session API — parentID means child session
  try {
    const sessionApi = deps.client?.session;
    if (sessionApi?.get && typeof sessionApi.get === "function") {
      const result = await sessionApi.get({ path: { id: sessionID } });
      const data = (result as { data?: { parentID?: string } } | undefined)?.data;
      const hasParent = !!data?.parentID;
      deps.cache?.set(sessionID, hasParent);
      return hasParent;
    }
  } catch {
    // API not available or failed — fall through to not-a-child
  }

  deps.cache?.set(sessionID, false);
  return false;
}