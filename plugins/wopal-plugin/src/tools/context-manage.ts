/**
 * context_manage Tool - Session Context Management (Orchestration Layer)
 *
 * Thin entry point for session context management actions.
 * Action handlers extracted to context-manage-actions.ts.
 * Target resolver extracted to context-target.ts.
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { SystemPromptMetadata } from "../types.js";
import type { MessageWithInfo } from "../hooks/message-context.js";
import type { SessionStore } from "../session-store.js";
import { SessionStore as SessionStoreClass } from "../session-store.js";
import { contextLogger, formatSessionID } from "../logger.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { OpenCodeClient } from "../types.js";
import { resolveSessionTarget } from "./context-target.js";
import {
  handleStatus,
  handleDump,
  handleCompact,
} from "./context-manage-actions.js";

/**
 * Create context_manage tool
 *
 * @param client - OpenCode client for session.messages() and session.update()
 * @param systemSnapshots - Plugin injections (rules + memories)
 * @param transformedMessagesMap - Messages with synthetic parts from hooks
 */
export function createContextManageTool(
  client: OpenCodeClient,
  systemSnapshots?: Map<string, string[]>,
  systemMetadataMap?: Map<string, SystemPromptMetadata>,
  systemInjectionsMap?: Map<string, string[]>,
  transformedMessagesMap?: Map<string, MessageWithInfo[]>,
  workspaceDir?: string,
  sessionStore?: SessionStore,
  taskManager?: SimpleTaskManager,
): ToolDefinition {
  const snapshotMap = systemSnapshots ?? new Map<string, string[]>();
  const metadataMap = systemMetadataMap ?? new Map<string, SystemPromptMetadata>();
  const injectionsMap = systemInjectionsMap ?? new Map<string, string[]>();
  const messagesMap = transformedMessagesMap ?? new Map<string, MessageWithInfo[]>();
  const baseDir = workspaceDir ?? ".";
  const store = sessionStore ?? new SessionStoreClass();

  return tool({
    description: `Cross-session context manager. Operates on main or child sessions via optional session_id (accepts 'ses_xxx' or 'wopal-task-xxx', defaults to current).

Actions:
- 'status': Session stats (context %, model, tokens) + active tasks list (main sessions only). Use before compact decisions or when context usage is uncertain.
- 'dump': Export context to file. Default: compact mode (detail=false). Use detail=true only when user explicitly requests full content. Low-frequency diagnostic tool.
- 'compact': Trigger context compaction.

⚠️ compact is ASYNC — it schedules compaction but does NOT start immediately. Actual compaction begins only after YOUR turn finishes. After calling compact, finish your turn as soon as possible. Every message you generate delays compaction and degrades quality under high context. You will receive a notification when compaction completes — resume work only after that.`,
    args: {
      action: tool.schema
        .enum(["status", "dump", "compact"] as const)
        .describe("'status' to inspect session context usage, 'dump' to export session context, 'compact' to compact session"),
      session_id: tool.schema
        .string()
        .optional()
        .describe("Optional session ID for cross-session operations. Accepts ses_xxx or wopal-task-xxx format."),
      detail: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Use full content mode for dump (default false = compact mode)"),
    },
    execute: async (args, context: ToolContext): Promise<string> => {
      const sessionID = context.sessionID;

      // Log caller session for status/dump; compact has dedicated target session log
      if (args.action !== "compact") {
        if (args.session_id && args.session_id !== sessionID) {
          const callerLabel = formatSessionID(sessionID ?? "?", false);
          const target = await resolveSessionTarget(args.session_id, client as OpenCodeClient, taskManager);
          const targetLabel = formatSessionID(target.sessionID, target.isTask);
          contextLogger.debug(`[context_manage] action=${args.action} caller=${callerLabel} target=${targetLabel}`);
        } else {
          contextLogger.debug(`[context_manage] action=${args.action} ${formatSessionID(sessionID ?? "?", false)}`);
        }
      }

      // Get sessionStore from context (tests inject it directly)
      const ctxStore = (context as { sessionStore?: SessionStore }).sessionStore
      const activeStore = ctxStore ?? store;

      // === STATUS action ===
      if (args.action === "status") {
        const rawSessionID = args.session_id || sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for status.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        return handleStatus(target.sessionID, activeStore, target.isTask, taskManager);
      }

      // === DUMP action ===
      if (args.action === "dump") {
        const rawSessionID = args.session_id || sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for dump.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        return await handleDump(
          target.sessionID,
          target.isTask,
          client,
          baseDir,
          snapshotMap,
          metadataMap,
          injectionsMap,
          messagesMap,
          args.detail ?? false,
        );
      }

      // === COMPACT action ===
      if (args.action === "compact") {
        const rawSessionID = args.session_id || sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for compact.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        contextLogger.trace(`[context_manage] compact ${formatSessionID(target.sessionID, target.isTask)}`);
        return await handleCompact(target.sessionID, target.isTask, client, activeStore, baseDir, taskManager);
      }

      return "Unknown action.";
    },
  });
}
