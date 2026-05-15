/**
 * Rule Injector - Rule injection into system prompt
 */

import {
  readAndFormatRules,
  type DiscoveredRule,
  type MatchedRuleInfo,
} from "../rules/index.js";
import type { DebugLog } from "../debug.js";

export interface RuleInjectorContext {
  directory: string;
  ruleFiles: DiscoveredRule[];
  rulesDebugLog: DebugLog;
}



/**
 * Format matched rules info for logging.
 * @param matchedRules - Array of matched rule info
 * @returns Array of formatted strings like "typescript.md (match reason)"
 */
function formatMatchedRulesForLog(matchedRules: MatchedRuleInfo[]): string[] {
  return matchedRules.map((rule) =>
    rule.reason === "unconditional" ? rule.name : `${rule.name} (${rule.reason})`,
  );
}

/**
 * Inject rules into system prompt.
 *
 * @param ctx - Rule injector context
 * @param agentName - Optional agent name for agent-scoped rule filtering
 * @param userPrompt - Latest user prompt (optional)
 * @param sessionID - Session ID for logging (optional)
 * @returns Formatted rules string or undefined if no applicable rules
 */
export async function injectRules(
  ctx: RuleInjectorContext,
  agentName: string | undefined,
  userPrompt?: string,
  sessionID?: string,
): Promise<string | undefined> {
  const result = await readAndFormatRules(
    ctx.ruleFiles,
    agentName,
    userPrompt,
  );

  if (result.content) {
    const matchedRuleNames = formatMatchedRulesForLog(result.matchedRules);
    ctx.rulesDebugLog(
      `Injected ${matchedRuleNames.length} rules for session ${sessionID ?? "unknown"}: ${matchedRuleNames.join(", ")}`,
    );
    return result.content;
  } else {
    // No rules matched - show context for diagnosis
    const promptPreview = (userPrompt ?? "").slice(0, 50);
    ctx.rulesDebugLog(
      `No rules matched for session ${sessionID ?? "unknown"} (agent: ${agentName ?? "unknown"}; prompt: "${promptPreview}")`,
    );
    return undefined;
  }
}