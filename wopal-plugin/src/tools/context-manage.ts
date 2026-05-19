/**
 * context_manage Tool - Session Context Management
 *
 * Manages session-level state including summaries and status.
 * - summary: Generate session summary via LLM and update session title
 * - status: View current session context usage statistics
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { DistillLLMClient } from "../memory/llm-client.js";
import {
  loadSessionContext,
  saveSessionContext,
  type SessionContext,
} from "../memory/session-context.js";
import type { SessionMessage, SystemPromptMetadata } from "../types.js";
import type { MessageWithInfo } from "../hooks/message-context.js";
import type { SessionState, SessionStore } from "../session-store.js";
import { SessionStore as SessionStoreClass } from "../session-store.js";
import { createDebugLog, formatSessionID } from "../debug.js";
import { writeContextDump, findActualKey } from "./dump-formatter.js";
import { fetchContextPercent } from "../tasks/task-monitor.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import { isChildSession } from "../hooks/session-utils.js";
import { normalizeSessionReference } from "../session-ref.js";
import type { OpenCodeClient } from "../types.js";

const debugLog = createDebugLog("[context]", "context");

async function resolveSessionTarget(
  rawID: string,
  client: OpenCodeClient,
  taskManager?: SimpleTaskManager,
): Promise<{ sessionID: string; isTask: boolean }> {
  const normalized = normalizeSessionReference(rawID);
  if (normalized.isTaskReference) {
    return { sessionID: normalized.sessionID, isTask: true };
  }

  const isTask = await isChildSession(normalized.sessionID, {
    client,
    taskManager,
    cache: new Map<string, boolean>(),
  });

  return { sessionID: normalized.sessionID, isTask };
}

/**
 * Create context_manage tool
 *
 * @param distillLLM - Distill LLM client for summary generation
 * @param client - OpenCode client for session.messages() and session.update()
 * @param systemInjectionsMap - Plugin injections (rules + memories)
 * @param transformedMessagesMap - Messages with synthetic parts from hooks
 */
export function createContextManageTool(
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
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
    description:
      "Session context tool. Actions:\n" +
      "- 'summary': Generate ≤50 char summary via LLM and update session title.\n" +
      "  MUST only call when user explicitly requests (e.g. \"摘要本次会话\"). Do not repeat after success.\n" +
      "- 'status': Return session context usage stats. For main sessions, also lists child tasks.\n" +
      "  Use to inspect session state before/after actions (e.g., before compact, after launch).\n" +
      "  Main sessions: include session payload + tasks array (child task summaries).\n" +
      "  Child sessions: include session payload only (no tasks array).\n" +
      "- 'dump': Export session context to file.\n" +
      "  Default: dump current session (no session_id needed).\n" +
      "  Optional session_id: dump specific session (accepts 'ses_xxx' or 'wopal-task-xxx').\n" +
      "  Default is compact mode (truncates long content, recommended). Use detail=true only when user requests full content.\n" +
      "- 'compact': Compact session context (manual compaction).\n" +
      "  Reports current context usage and triggers compaction. No threshold parameter—agent decides when to compact.\n" +
      "  Optional session_id: compact specific session (accepts 'ses_xxx' or 'wopal-task-xxx'). Default: current session.",
    args: {
      action: tool.schema
        .enum(["summary", "status", "dump", "compact"] as const)
        .describe("'summary' to generate summary and update title, 'status' to inspect session context usage, 'dump' to export session context, 'compact' to compact session"),
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

      // Log caller session for summary/status/dump; compact has dedicated target session log
      // When querying a different session (args.session_id != caller), show both to prevent misleading duplicates
      if (args.action !== "compact") {
        if (args.session_id && args.session_id !== sessionID) {
          const callerLabel = formatSessionID(sessionID ?? "?", false);
          const target = await resolveSessionTarget(args.session_id, client as OpenCodeClient, taskManager);
          const targetLabel = formatSessionID(target.sessionID, target.isTask);
          debugLog(`[context_manage] action=${args.action} caller=${callerLabel} target=${targetLabel}`);
        } else {
          debugLog(`[context_manage] action=${args.action} ${formatSessionID(sessionID ?? "?", false)}`);
        }
      }

      // Get sessionStore from context (tests inject it directly)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctxStore = (context as any).sessionStore as SessionStore | undefined;
      const activeStore = ctxStore ?? store;

      if (args.action === "status") {
        const rawSessionID = args.session_id ?? sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for status.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        return handleStatus(target.sessionID, activeStore, target.isTask, taskManager);
      }

      if (args.action === "dump") {
        const rawSessionID = args.session_id ?? sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for dump.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        const dumpSessionID = target.sessionID;
        const prefix = target.isTask ? "CTXDUMP-TASK" : "CTXDUMP";

        let title: string | null = null;
        try {
          if (typeof client?.session?.get === "function") {
            const result = await client.session.get({ path: { id: dumpSessionID } });
            title = result?.data?.title ?? null;
          }
        } catch {
          // Graceful degradation
        }

        const result = await writeContextDump({
          sessionID: dumpSessionID,
          baseDir,
          filenamePrefix: prefix,
          systemSnapshots: snapshotMap,
          systemMetadataMap: metadataMap,
          systemInjectionsMap: injectionsMap,
          transformedMessagesMap: messagesMap,
          client,
          detail: args.detail ?? false,
          title,
        });

        const actualKey = findActualKey(metadataMap, dumpSessionID);
        const metaLabel = actualKey
          ? (actualKey === dumpSessionID ? "hit" : `prefix-matched → ${actualKey}`)
          : `miss (map keys: ${metadataMap.size > 0 ? Array.from(metadataMap.keys()).join(", ") : "empty"})`;
        const sysPromptLabel = result.hasMetadata
          ? result.parsedFromRaw
            ? `parsed from ${result.blockCount} raw blocks`
            : "structured metadata"
          : `${result.blockCount} raw blocks`;
        return `Context dumped to ${result.filepath}\n\n- **Session:** ${dumpSessionID}\n- **System prompt:** ${sysPromptLabel} (${metaLabel})\n- **Plugin injections:** ${result.injectionCount}\n- **Messages:** ${result.messageCount}`;
      }

      if (args.action === "compact") {
        const rawSessionID = args.session_id ?? sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for compact.";
        }
        const target = await resolveSessionTarget(rawSessionID, client as OpenCodeClient, taskManager);
        const compactSessionID = target.sessionID;
        const isTask = target.isTask;

        debugLog(`[context_manage] compact ${formatSessionID(compactSessionID, isTask)}`);

        return await handleCompact(compactSessionID, client, activeStore, baseDir, isTask);
      }

      if (!sessionID) {
        return "Failed: current session ID is unavailable.";
      }

      if (args.action === "summary") {
        return await handleSummary(sessionID, distillLLM, client);
      }

      return "Unknown action.";
    },
  });
}

function handleStatus(
  sessionID: string,
  sessionStore: SessionStore,
  isChildSession: boolean,
  taskManager?: SimpleTaskManager,
): string {
  const state = sessionStore.get(sessionID);
  const payload = {
    sessionID,
    ...buildStatsPayload(state),
  };

  // Add tasks array only for main sessions (not child sessions)
  if (!isChildSession && taskManager) {
    const tasks = taskManager.listTasksForParent(sessionID);
    return JSON.stringify(
      {
        ...payload,
        tasks,
      },
      null,
      2,
    );
  }

  return JSON.stringify(payload, null, 2);
}

function buildStatsPayload(state?: SessionState): {
  agent: string | null;
  isCompacting: boolean;
  lastTokens: {
    input: number;
    output: number;
    cache: {
      read: number;
      write: number;
    };
  };
  model: {
    provider: string | null;
    id: string | null;
  };
  loadedSkills: number;
  pct: number | null;
} {
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
  };
}

async function handleSummary(
  sessionID: string,
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<string> {
  if (typeof client?.session?.messages !== "function") {
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages: SessionMessage[] = result?.data ?? [];

    if (messages.length === 0) {
      return "No messages in current session to summarize.";
    }

    const userTexts: string[] = [];
    for (const msg of messages) {
      if (msg.info?.role !== "user") continue;
      if (!msg.parts) continue;

      // Skip compaction messages
      if (msg.parts.some((p) => p.type === "compaction")) continue;

      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          // Skip synthetic parts (system notifications injected as user text)
          if (part.synthetic) continue;
          userTexts.push(part.text);
        }
      }
    }

    if (userTexts.length === 0) {
      return "No user messages found to summarize.";
    }

    const combinedText = userTexts.join("\n\n---\n\n");
    const truncatedText = combinedText.length > 3000
      ? combinedText.slice(-3000)
      : combinedText;
    const prompt = `根据以下用户消息，用一句话概括本次会话的核心意图，不超过 50 字。

用户消息：
${truncatedText}

要求：
- 用简洁的一句话描述用户想要做什么
- 不超过 50 个汉字
- 只输出摘要内容，不要其他解释`;

    const summaryText = await distillLLM.complete(prompt);
    const cleanedSummary = summaryText
      .trim()
      .replace(/^["「『]|["」』]$/g, "")
      .slice(0, 80);

    const existingCtx = loadSessionContext(sessionID);
    const newCtx: SessionContext = {
      sessionID,
      title: existingCtx?.title ?? null,
      ...existingCtx,
      summary: {
        text: cleanedSummary,
        messageCount: messages.length,
        generatedAt: new Date().toISOString(),
      },
    };

    if (typeof client?.session?.update === "function") {
      try {
        await client.session.update({
          path: { id: sessionID },
          body: { title: cleanedSummary },
        });
        newCtx.title = cleanedSummary;
      } catch (error) {
        debugLog(`[context_manage.summary] Failed to update session title: ${error}`);
      }
    }

    saveSessionContext(newCtx);

    return [
      "## ✅ Session Summary Generated",
      "",
      `**Summary:** ${cleanedSummary}`,
      `**Message Count:** ${messages.length}`,
      `**Generated At:** ${new Date().toISOString()}`,
      "",
      "> Important: This output is only visible to the calling agent. You must display the full content to the user.",
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to generate summary: ${message}`;
  }
}

async function handleCompact(
  sessionID: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sessionStore: SessionStore,
  directory: string,
  isTask: boolean,
): Promise<string> {
  const state = sessionStore.get(sessionID);
  if (state?.isCompacting) {
    const since = state.compactingSince;
    const elapsedSec = since ? Math.floor((Date.now() - since) / 1000) : "?";
    return `Already compacting ${formatSessionID(sessionID, isTask)} (started ${elapsedSec}s ago). Wait for compaction to complete.`;
  }

  if (!state) {
    return `Failed: session not found in store. Ensure the session ${formatSessionID(sessionID, isTask)} has been active (received at least one step-finish event).`;
  }

  if (typeof client?.session?.summarize !== "function") {
    return `Failed: session.summarize API unavailable.`;
  }

  let contextInfo = "Context: unknown";
  try {
    const ctxInfo = await fetchContextPercent(client, sessionStore, directory, sessionID, debugLog);
    if (ctxInfo) {
      const warning = ctxInfo.pct >= 75 ? " ⚠️" : ctxInfo.pct >= 55 ? " ⚡" : "";
      contextInfo = `Context: ${ctxInfo.pct}% used${warning} (${ctxInfo.used}/${ctxInfo.contextLimit} tokens)`;
    }
  } catch {
    // ignore - context info is informational only
  }

  const providerID = state.providerID ?? "";
  const modelID = state.modelID ?? "";

  if (!isTask) {
    sessionStore.upsert(sessionID, (next) => {
      next.pendingCompactTrigger = "plugin";
    });
    debugLog(`[handleCompact] ${formatSessionID(sessionID, false)} scheduled main-session compact for next idle`);
    return [
      `Compacting session ${formatSessionID(sessionID, false)}...`,
      contextInfo,
      `Model: ${providerID || "?"}/${modelID || "?"}`,
      "Main-session compaction scheduled. It will start automatically when the current turn becomes idle.",
      "Main session will receive auto-recovery message when compaction completes.",
    ].join("\n");
  }

  sessionStore.markCompacting(sessionID, Date.now(), "plugin");
  try {
    await client.session.summarize({
      path: { id: sessionID },
      body: { providerID, modelID },
    });
  } catch (error) {
    sessionStore.upsert(sessionID, (next) => {
      next.isCompacting = false;
      delete next.compactingSince;
      delete next.compactingTrigger;
    });
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to compact: ${message}\n${contextInfo}`;
  }

  return [
    `Compacting session ${formatSessionID(sessionID, isTask)}...`,
    contextInfo,
    `Model: ${providerID || "?"}/${modelID || "?"}`,
    "Compaction triggered. The session will be summarized and become IDLE.",
    "Parent agent will receive [WOPAL TASK COMPACTED] notification when done.",
  ].join("\n");
}
