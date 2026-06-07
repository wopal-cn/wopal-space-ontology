/**
 * Rule Injector - Rule injection into system prompt
 */

import {
  readAndFormatRules,
  type DiscoveredRule,
} from "../rules/index.js";
import type { LoggerInstance } from "../logger.js";
import { formatSessionID } from "../logger.js";

export interface RuleInjectorContext {
  directory: string;
  ruleFiles: DiscoveredRule[];
  rulesLogger: LoggerInstance;
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
    const sid = formatSessionID(sessionID, !!isTask);
    const idLines = result.matchedRules.map((r, i) => `  [${i + 1}] ${r.name} (${r.reason})`).join("\n");
    ctx.rulesLogger.info(
      `[inject] ${sid} matched=${result.matchedRules.length}\n${idLines}`,
    );
    return result.content;
  } else {
    return undefined;
  }
}
