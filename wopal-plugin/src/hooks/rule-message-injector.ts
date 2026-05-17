import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import type { MessageWithInfo } from "./message-context.js";
import type { RuleInjectorContext } from "./rule-injector.js";
import { injectRules } from "./rule-injector.js";
import { extractLatestUserPrompt, extractAgentName } from "./message-context.js";

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

  // Deduplication: skip if rules already injected for this user prompt
  const state = ctx.sessionStore.get(sessionID);
  if (state?.lastRulesPrompt && state.lastRulesPrompt === userPrompt) return;

  const agentName = extractAgentName(messages);
  const formattedRules = await injectRules(
    ctx.ruleInjectorCtx,
    agentName,
    userPrompt,
    sessionID,
    isTask,
  );

  if (!formattedRules) return;

  // Record that we've injected rules for this prompt
  ctx.sessionStore.upsert(sessionID, (s) => {
    if (userPrompt) s.lastRulesPrompt = userPrompt;
  });

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: `<rules-context>\n${formattedRules}\n</rules-context>`,
    synthetic: true,
  });
}