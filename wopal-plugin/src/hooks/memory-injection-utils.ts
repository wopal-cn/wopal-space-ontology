import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DebugLog } from "../debug.js";
import type { OpenCodeClient } from "../types.js";

export interface MemoryInjectorContext {
  client: OpenCodeClient;
  sessionStore: SessionStore;
  memoryDebugLog: DebugLog;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  taskManager: { findBySession: (sessionID: string) => unknown } | undefined;
}

export function clearInjectedMemory(
  sessionStore: SessionStore,
  sessionID: string,
): void {
  sessionStore.upsert(sessionID, (state) => {
    state.injectedRawText = undefined;
  });
}
