import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import type { MessageWithInfo } from "./message-context.js";
import type { RuleInjectorContext } from "./rule-injector.js";
import { injectRules } from "./rule-injector.js";
import { extractLatestUserPrompt } from "./message-context.js";

/**
 * Extract agent name from messages.
 * Traverses from the end of messages backwards, returning the agent value
 * of the first message that has info.agent defined.
 * Returns undefined if no message has an agent field.
 */
export function extractAgentName(
  messages: MessageWithInfo[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const agent = messages[i].info?.agent;
    if (agent) return agent;
  }
  return undefined;
}

export interface RuleMessageInjectorContext {
  sessionStore: SessionStore;
  ruleInjectorCtx: RuleInjectorContext;
  rulesDebugLog: DebugLog;
  rulesInjectionEnabled: boolean;
}

export async function injectRulesToMessage(
  ctx: RuleMessageInjectorContext,
  sessionID: string,
  messages: MessageWithInfo[],
  lastUserMsg: MessageWithInfo | undefined,
  isTask?: boolean,
): Promise<void> {
  if (!ctx.rulesInjectionEnabled) return;
  if (!lastUserMsg) return;

  const userPrompt = extractLatestUserPrompt(messages);

  const agentName = extractAgentName(messages);
  const formattedRules = await injectRules(
    ctx.ruleInjectorCtx,
    agentName,
    userPrompt,
    sessionID,
    isTask,
  );

  if (!formattedRules) return;

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: `<rules-context>\n${formattedRules}\n</rules-context>`,
    synthetic: true,
  });
}