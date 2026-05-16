import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import { formatSessionID } from "../debug.js";

export interface CompactionHookContext {
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  now: () => number;
}

export function createCompactionHooks(ctx: CompactionHookContext) {
  async function onSessionCompacting(
    input: { sessionID: string },
    _output: { context: string[]; prompt?: string },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      ctx.contextDebugLog("No sessionID in compacting hook input");
      return;
    }

    ctx.sessionStore.markCompacting(sessionID, ctx.now());
    ctx.contextDebugLog(`${formatSessionID(sessionID, false)} marked as compacting`);
  }

  return {
    "experimental.session.compacting": onSessionCompacting,
  };
}