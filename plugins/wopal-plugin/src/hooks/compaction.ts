import type { SessionStore } from "../session-store.js";
import type { LoggerInstance } from "../logger.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import { formatSessionID } from "../logger.js";

export interface CompactionHookContext {
  sessionStore: SessionStore;
  contextLogger: LoggerInstance;
  now: () => number;
  taskManager?: SimpleTaskManager;
}

export function createCompactionHooks(ctx: CompactionHookContext) {
  async function onSessionCompacting(
    input: { sessionID: string },
    _output: { context: string[]; prompt?: string },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      ctx.contextLogger.debug("No sessionID in compacting hook input");
      return;
    }

    ctx.sessionStore.markCompacting(sessionID, ctx.now());
    const isTask = !!ctx.taskManager?.isTaskSession(sessionID);
    ctx.contextLogger.debug(`${formatSessionID(sessionID, isTask)} marked as compacting`);
  }

  return {
    "experimental.session.compacting": onSessionCompacting,
  };
}
