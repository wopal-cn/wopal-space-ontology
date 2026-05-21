/**
 * Rule Injector - Rule injection into system prompt
 */

import {
  readAndFormatRules,
  type DiscoveredRule,
  type MatchedRuleInfo,
} from "../rules/index.js";
import type { LoggerInstance } from "../logger.js";
import { formatSessionID } from "../logger.js";

export interface RuleInjectorContext {
  directory: string;
  ruleFiles: DiscoveredRule[];
  rulesLogger: LoggerInstance;
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
  isTask?: boolean,
): Promise<string | undefined> {
  const result = await readAndFormatRules(
    ctx.ruleFiles,
    agentName,
    userPrompt,
  );

  if (result.content) {
    const matchedRuleNames = formatMatchedRulesForLog(result.matchedRules);
    ctx.rulesLogger.debug(
      `${formatSessionID(sessionID, !!isTask)} agent=${agentName ?? "?"}: injected ${matchedRuleNames.length} rules → ${matchedRuleNames.join(", ")}`,
    );
    return result.content;
  } else {
    return undefined;
  }
}
