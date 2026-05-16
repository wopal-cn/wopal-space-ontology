/**
 * context_manage Tool - Session Context Management
 *
 * Manages session-level state including summaries and status.
 * - summary: Generate session summary via LLM and update session title
 * - status: View current session context state and staleness
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
import { createDebugLog } from "../debug.js";
import { writeContextDump, findActualKey } from "./dump-formatter.js";

const debugLog = createDebugLog("[context]", "context");

function normalizeSessionID(id: string): string {
  if (id.startsWith("wopal-task-")) {
    return "ses_" + id.slice("wopal-task-".length);
  }
  return id;
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
): ToolDefinition {
  const snapshotMap = systemSnapshots ?? new Map<string, string[]>();
  const metadataMap = systemMetadataMap ?? new Map<string, SystemPromptMetadata>();
  const injectionsMap = systemInjectionsMap ?? new Map<string, string[]>();
  const messagesMap = transformedMessagesMap ?? new Map<string, MessageWithInfo[]>();
  const baseDir = workspaceDir ?? ".";

  return tool({
    description:
      "Session context tool. Actions:\n" +
      "- 'summary': Generate ≤50 char summary via LLM and update session title.\n" +
      "  MUST only call when user explicitly requests (e.g. \"摘要本次会话\"). Do not repeat after success.\n" +
      "- 'dump': Export session context to file.\n" +
      "  Default: dump current session (no session_id needed).\n" +
      "  Optional session_id: dump specific session (accepts 'ses_xxx' or 'wopal-task-xxx').\n" +
      "  Default is compact mode (truncates long content, recommended). Use detail=true only when user requests full content.",
    args: {
      action: tool.schema
        .enum(["summary", "dump"] as const)
        .describe("'summary' to generate summary and update title, 'dump' to export session context"),
      session_id: tool.schema
        .string()
        .optional()
        .describe("Optional session ID for cross-session dump. Default: dump current session. Accepts ses_xxx or wopal-task-xxx format."),
      detail: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Use full content mode for dump (default false = compact mode)"),
    },
    execute: async (args, context: ToolContext): Promise<string> => {
      const sessionID = context.sessionID;

      debugLog(`[context_manage] Action: ${args.action}, Session: ${sessionID ?? "N/A"}`);

      if (args.action === "dump") {
        const rawSessionID = args.session_id ?? sessionID;
        if (!rawSessionID) {
          return "Failed: no session ID available for dump.";
        }
        const dumpSessionID = normalizeSessionID(rawSessionID);
        const isChild = rawSessionID.startsWith("wopal-task-");
        const prefix = isChild ? "CTXDUMP-TASK" : "CTXDUMP";

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