import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { LoggerInstance } from "../logger.js";
import type { OpenCodeClient } from "../types.js";

export interface MemoryInjectorContext {
  client: OpenCodeClient;
  sessionStore: SessionStore;
  memoryLogger: LoggerInstance;
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
