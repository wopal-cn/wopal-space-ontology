import { extractSessionID, extractLatestUserPrompt, extractAgentName, type MessageWithInfo } from "./message-context.js";
import type { SessionStore } from "../session-store.js";
import type { LoggerInstance } from "../logger.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import { injectSkillReload, type SkillReloadInjectorContext } from "./skill-reload-injector.js";
import { injectRulesToMessage, type RuleMessageInjectorContext } from "./rule-message-injector.js";
import { injectMemoryToMessage, type MemoryMessageInjectorContext } from "./memory-message-injector.js";

/** Max recent messages to store for short-query context enrichment */
const MAX_RECENT_MESSAGES = 10;

interface MessagesTransformOutput {
  messages: MessageWithInfo[];
}

export interface MessageHookContext {
  sessionStore: SessionStore;
  contextLogger: LoggerInstance;
  projectDirectory: string;
  transformedMessagesMap: Map<string, MessageWithInfo[]>;
  skillReloadCtx: SkillReloadInjectorContext;
  ruleMessageCtx: RuleMessageInjectorContext;
  taskManager?: SimpleTaskManager | undefined;
  memoryMessageCtx: MemoryMessageInjectorContext;
}

export function createMessageHooks(ctx: MessageHookContext) {
  async function onMessagesTransform(
    _input: Record<string, never>,
    output: MessagesTransformOutput,
  ): Promise<MessagesTransformOutput> {
    const sessionID = extractSessionID(output.messages);
    if (!sessionID) {
      return output;
    }

    const existingState = ctx.sessionStore.get(sessionID);
    const shouldSeed = !existingState?.seededFromHistory;
    const agentName = extractAgentName(output.messages);

    if (shouldSeed) {
      const userPrompt = extractLatestUserPrompt(output.messages);
      const recentMessages = output.messages.slice(-MAX_RECENT_MESSAGES);

      ctx.sessionStore.upsert(sessionID, (state) => {
        if (userPrompt && !state.lastUserPrompt) {
          state.lastUserPrompt = userPrompt;
        }
        state.needsMemoryInjection = true;
        state.seededFromHistory = true;
        state.seedCount = (state.seedCount ?? 0) + 1;
        state.recentMessages = recentMessages;
        state.agent = agentName;
      });
    } else {
      ctx.sessionStore.upsert(sessionID, (state) => {
        state.agent = agentName;
      });
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

    await injectSkillReload(ctx.skillReloadCtx, sessionID, lastUserMsg);
    await injectRulesToMessage(ctx.ruleMessageCtx, sessionID, output.messages, lastUserMsg);
    await injectMemoryToMessage(ctx.memoryMessageCtx, sessionID, output.messages, lastUserMsg);

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
      }
    }
  }

  return {
    "experimental.chat.messages.transform": onMessagesTransform,
    "chat.message": onChatMessage,
  };
}
