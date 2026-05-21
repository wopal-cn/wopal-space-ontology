/**
 * Test-only helpers for accessing internal session store state.
 * @internal - Test utilities only. Not part of public API.
 */

import { sessionStore } from "./session-store-instance.js";
import type { SessionState } from "./session-store.js";

export function setSessionStateLimit(limit: number): void {
  sessionStore.setMax(limit);
}

export function getSessionStateIDs(): string[] {
  return sessionStore.ids();
}

export function getSessionStateSnapshot(sessionID: string): SessionState | undefined {
  return sessionStore.snapshot(sessionID);
}

export function upsertSessionState(
  sessionID: string,
  mutator: (state: SessionState) => void,
): void {
  sessionStore.upsert(sessionID, mutator);
}

export function resetSessionState(): void {
  sessionStore.reset();
}

export function getSeedCount(sessionID: string): number {
  return sessionStore.get(sessionID)?.seedCount ?? 0;
}
