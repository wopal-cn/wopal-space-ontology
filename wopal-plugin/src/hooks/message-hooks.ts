import { extractSessionID, extractLatestUserPrompt, normalizeContextPath, toExtractableMessages, type MessageWithInfo } from "./message-context.js";
import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";

/** Max recent messages to store for short-query context enrichment */
const MAX_RECENT_MESSAGES = 10;

interface MessagesTransformOutput {
  messages: MessageWithInfo[];
}

export interface MessageHookContext {
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  projectDirectory: string;
  transformedMessagesMap: Map<string, MessageWithInfo[]>;
}

export function createMessageHooks(ctx: MessageHookContext) {
  async function onMessagesTransform(
    _input: Record<string, never>,
    output: MessagesTransformOutput,
  ): Promise<MessagesTransformOutput> {
    const sessionID = extractSessionID(output.messages);
    if (!sessionID) {
      ctx.contextDebugLog("No sessionID found in messages");
      return output;
    }

    const existingState = ctx.sessionStore.get(sessionID);
    const shouldSeed = !existingState?.seededFromHistory;

    if (shouldSeed) {
      const contextPaths = extractFilePathsFromMessages(
        toExtractableMessages(output.messages),
      );
      const userPrompt = extractLatestUserPrompt(output.messages);

      // Store recent messages for context enrichment (last N messages)
      const recentMessages = output.messages.slice(-MAX_RECENT_MESSAGES);

      ctx.sessionStore.upsert(sessionID, (state) => {
        for (const p of contextPaths) {
          state.contextPaths.add(normalizeContextPath(p, ctx.projectDirectory));
        }
        if (userPrompt && !state.lastUserPrompt) {
          state.lastUserPrompt = userPrompt;
        }
        state.needsMemoryInjection = true;
        state.seededFromHistory = true;
        state.seedCount = (state.seedCount ?? 0) + 1;
        state.recentMessages = recentMessages;
      });

      if (contextPaths.length > 0) {
        ctx.contextDebugLog(
          `Seeded ${contextPaths.length} context path(s) for session ${sessionID}: ${contextPaths
            .slice(0, 5)
            .join(", ")}${contextPaths.length > 5 ? "..." : ""}`,
        );
      }

      if (userPrompt) {
        ctx.contextDebugLog(
          `Seeded user prompt for session ${sessionID} (len=${userPrompt.length})`,
        );
      }
    } else {
      ctx.contextDebugLog(`Session ${sessionID} already seeded, skipping rescan`);
    }

    // Skill Reload injection: find last user message first, then consume
    let lastUserMsg: MessageWithInfo | undefined;
    for (let i = output.messages.length - 1; i >= 0; i--) {
      const message = output.messages[i];
      const role = message.info?.role ?? message.role;
      if (role === "user") {
        lastUserMsg = message;
        break;
      }
    }

    if (lastUserMsg) {
      const skillsToReload = ctx.sessionStore.consumeSkillReload(sessionID);
      if (skillsToReload && skillsToReload.length > 0) {
        const reminderText = [
          "<system-reminder>",
          `上下文已被压缩，之前加载的技能 [${skillsToReload.join(", ")}] 内容已丢失。`,
          "请重新加载这些技能以恢复完整的指令和工具链。",
          "</system-reminder>",
        ].join("\n");

        lastUserMsg.parts ??= [];
        lastUserMsg.parts.push({
          type: "text",
          text: reminderText,
          synthetic: true,
        });

        ctx.contextDebugLog(
          `Injected Skill Reload for session ${sessionID}: ${skillsToReload.join(", ")}`,
        );
      }
    }

    // Store transformed messages for auto dump
    ctx.transformedMessagesMap.set(sessionID, output.messages);

    return output;
  }

  async function onChatMessage(
    input: { sessionID?: string },
    output: {
      message?: { role?: string };
      parts?: Array<{ type?: string; text?: string; synthetic?: boolean }>;
    },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      ctx.contextDebugLog("No sessionID in chat.message hook input");
      return;
    }

    if (output?.message?.role === "assistant") {
      return;
    }

    if (output?.message?.role !== "user") {
      return;
    }

    const textParts: string[] = [];
    if (output.parts) {
      for (const part of output.parts) {
        if (part.synthetic) continue;

        if (part.type === "text" && part.text) {
          textParts.push(part.text);
        } else if (typeof part.text === "string" && !part.type) {
          textParts.push(part.text);
        }
      }
    }

    if (textParts.length > 0) {
      const userPrompt = textParts
        .map((t) => t.trim())
        .filter(Boolean)
        .join(" ")
        .trim();

      if (userPrompt) {
        ctx.sessionStore.upsert(sessionID, (state) => {
          state.lastUserPrompt = userPrompt;
          state.needsMemoryInjection = true;
        });

        ctx.contextDebugLog(
          `Updated lastUserPrompt for session ${sessionID} (len=${userPrompt.length}, parts=${textParts.length})`,
        );
      }
    }
  }

  return {
    "experimental.chat.messages.transform": onMessagesTransform,
    "chat.message": onChatMessage,
  };
}

// Re-export extractFilePathsFromMessages from message-context for onMessagesTransform
// (This is from rules/ path-extractor, used internally)
import { extractFilePathsFromMessages } from "../rules/index.js";