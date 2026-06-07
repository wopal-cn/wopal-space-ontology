/**
 * Rule formatting for system prompt injection
 * Keywords-only matching with agent scope filtering
 */

import { getCachedRule, type DiscoveredRule } from "./discoverer.js";
import { promptMatchesKeywords } from "./matcher.js";

/**
 * Matched rule description for logging
 */
export interface MatchedRuleInfo {
  name: string;
  reason: string;
}

/**
 * Result of readAndFormatRules
 */
export interface FormattedRulesResult {
  /** Formatted rules content for injection */
  content: string;
  /** Array of matched rule info for logging (e.g. rule name with match reason) */
  matchedRules: MatchedRuleInfo[];
}

/**
 * Check if a rule is eligible for the given agent based on its path.
 * - Root-level rules (no subdirectory in relativePath) match all agents
 * - Agent-scoped rules (relativePath like "fae/rules.md") only match when agentName matches
 *
 * @param relativePath - Relative path of the rule from the rules directory root
 * @param agentName - Current agent name, or undefined for generic matching
 * @returns true if the rule is eligible for the current agent
 */
function isEligibleForAgent(
  relativePath: string,
  agentName?: string,
): boolean {
  const slashIndex = relativePath.indexOf("/");
  if (slashIndex === -1) {
    // Root-level rule: matches all agents
    return true;
  }
  // Agent-scoped rule: only matches when agentName equals the scope prefix
  const scope = relativePath.substring(0, slashIndex);
  return agentName === scope;
}

/**
 * Read and format rule files for system prompt injection
 * Rules are filtered by:
 * 1. Agent scope: agent-scoped rules only match the corresponding agent
 * 2. Keywords: rules without keywords are skipped (no "unconditional" injection)
 * 3. Keyword matching: only rules whose keywords match the user prompt are included
 *
 * @param files - Array of discovered rule files with paths
 * @param agentName - Optional agent name for agent-scoped rule filtering
 * @param userPrompt - Optional user prompt text (used for keyword matching)
 * @returns Object with formatted content and matched rules info
 */
export async function readAndFormatRules(
  files: DiscoveredRule[],
  agentName?: string,
  userPrompt?: string,
): Promise<FormattedRulesResult> {
  if (files.length === 0) {
    return { content: "", matchedRules: [] };
  }

  const ruleContents: string[] = [];
  const matchedRules: MatchedRuleInfo[] = [];

  for (const { filePath, relativePath } of files) {
    // Agent scope filtering: skip rules not eligible for current agent
    if (!isEligibleForAgent(relativePath, agentName)) {
      continue;
    }

    // Use cached rule data with mtime-based invalidation
    const cachedRule = await getCachedRule(filePath);
    if (!cachedRule) {
      continue; // Error already logged by getCachedRule
    }

    const { metadata, strippedContent } = cachedRule;

    // Rules without keywords are skipped (no "unconditional" injection)
    if (!metadata?.keywords || metadata.keywords.length === 0) {
      continue;
    }

    // Keyword matching: requires a user prompt
    if (!userPrompt) {
      continue;
    }

    const matchingKeywords = metadata.keywords.filter((keyword) =>
      promptMatchesKeywords(userPrompt, [keyword]),
    );

    if (matchingKeywords.length === 0) {
      continue;
    }

    matchedRules.push({
      name: relativePath,
      reason: `keyword: ${matchingKeywords.join(", ")}`,
    });

    // Use list items + individual markdown blocks
    ruleContents.push(
      `- **${relativePath}**\n\n\`\`\`markdown\n${strippedContent}\n\`\`\``,
    );
  }

  if (ruleContents.length === 0) {
    return { content: "", matchedRules: [] };
  }

  const content =
    `Matched rules — apply if relevant:\n\n` +
    ruleContents.join("\n\n");

  return { content, matchedRules };
}