/**
 * Rules subsystem - unified exports
 */

// From discoverer
export {
  discoverRuleFiles,
  parseRuleMetadata,
  clearRuleCache,
  getCachedRule,
  stripFrontmatter,
  type DiscoveredRule,
  type RuleMetadata,
} from "./discoverer.js";

// From matcher
export {
  promptMatchesKeywords,
} from "./matcher.js";

// From formatter
export {
  readAndFormatRules,
  type MatchedRuleInfo,
  type FormattedRulesResult,
} from "./formatter.js";