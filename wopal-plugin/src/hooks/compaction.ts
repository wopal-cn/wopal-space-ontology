import type { SessionStore } from "../session-store.js";
import { sanitizePathForContext } from "./message-context.js";
import type { DebugLog } from "../debug.js";

export interface CompactionHookContext {
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  now: () => number;
}

export function createCompactionHooks(ctx: CompactionHookContext) {
  async function onSessionCompacting(
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      ctx.contextDebugLog("No sessionID in compacting hook input");
      return;
    }

    const sessionState = ctx.sessionStore.get(sessionID);
    if (!sessionState || sessionState.contextPaths.size === 0) {
      ctx.contextDebugLog(
        `No context paths for session ${sessionID} during compaction`,
      );
      return;
    }

    ctx.sessionStore.markCompacting(sessionID, ctx.now());

    const sortedPaths = Array.from(sessionState.contextPaths).sort();
    const maxPaths = 20;
    const pathsToInclude = sortedPaths.slice(0, maxPaths);

    const contextString = [
      "OpenCode Rules: Working context",
      "Current file paths in context:",
      ...pathsToInclude.map((p) => `  - ${sanitizePathForContext(p)}`),
      ...(sortedPaths.length > maxPaths
        ? [`  ... and ${sortedPaths.length - maxPaths} more paths`]
        : []),
    ].join("\n");

    output.context.push(contextString);

    ctx.contextDebugLog(
      `Added ${pathsToInclude.length} context path(s) to compaction for session ${sessionID}`,
    );
  }

  return {
    "experimental.session.compacting": onSessionCompacting,
  };
}
