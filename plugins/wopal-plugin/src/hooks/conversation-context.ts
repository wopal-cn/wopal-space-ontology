/**
 * Conversation Context - Context extraction for memory retrieval
 *
 * Provides conversation context extraction and enriched query building.
 */

import type { LoggerInstance } from "../logger.js";
import { loadSessionContext } from "../memory/session-context.js";
import type { MessageWithInfo } from "./message-context.js";

/**
 * Clean and truncate noisy text for embedding.
 * Removes code blocks, system logs, and truncates to max length.
 */
export function cleanAndTruncateForEmbedding(
  text: string,
  maxLen = 300,
): string {
  // 1. Remove Markdown code blocks
  let result = text.replace(/```[\s\S]*?```/g, "<code_omitted>");

  // 2. Remove typical log noise lines (e.g., [WARN]..., [INFO]..., [Pasted...])
  result = result.replace(/^\[(WARN|INFO|DEBUG|ERROR|Pasted).*?\][^\n]*/gm, "");

  // 3. Compress excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  // 4. Truncate keeping core info
  if (result.length > maxLen) {
    const half = Math.floor(maxLen / 2);
    return `${result.slice(0, half)}\n...<omitted>...\n${result.slice(-half)}`;
  }

  return result;
}

/**
 * Extract the most recent complete conversation turn from messages.
 */
export function extractConversationContext(
  messages: MessageWithInfo[],
): string | null {
  if (messages.length < 3) return null;

  // Find current user message (last user in the list)
  let currentUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i]!.role || messages[i]!.info?.role;
    if (role === "user") {
      currentUserIdx = i;
      break;
    }
  }
  if (currentUserIdx < 0) return null;

  // Walk backwards from before current user to find: assistant -> previous user
  let assistantText: string | null = null;
  let previousUserText: string | null = null;

  for (let i = currentUserIdx - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const role = msg.role || msg.info?.role;
    const parts = msg.parts || [];

    if (role === "assistant") {
      // Extract all human-facing text parts, concatenated
      const textParts = parts
        .filter(
          (p: { type?: string; text?: string; synthetic?: boolean; ignored?: boolean }) =>
            p.type === "text" && p.text && !p.synthetic && !p.ignored,
        )
        .map((p: { text?: string }) => p.text!.trim())
        .filter(Boolean);

      if (textParts.length > 0 && !assistantText) {
        assistantText = textParts.join("\n");
      }
      continue;
    }

    if (role === "user" && assistantText) {
      const userTexts = parts
        .filter(
          (p: { type?: string; text?: string; synthetic?: boolean }) =>
            p.type === "text" && p.text && !p.synthetic,
        )
        .map((p: { text?: string }) => p.text!.trim())
        .filter(Boolean);

      if (userTexts.length > 0) {
        previousUserText = userTexts.join(" ");
        break;
      }
    }
  }

  if (assistantText && previousUserText) {
    const cleanUser = cleanAndTruncateForEmbedding(previousUserText, 250);
    const cleanAsst = cleanAndTruncateForEmbedding(assistantText, 250);
    return `上一轮 User: ${cleanUser}\n上一轮 Assistant: ${cleanAsst}`;
  }

  return null;
}

/**
 * Build context-enriched query for memory retrieval.
 */
export function buildEnrichedQuery(
  debugLog: LoggerInstance,
  sessionID: string,
  userQuery: string,
  messages: MessageWithInfo[],
): string | null {
  const trimmed = userQuery.trim();

  // Skip commands and shell shortcuts
  if (
    trimmed[0] === "/" ||
    trimmed[0] === "!" ||
    trimmed.startsWith("# /")
  ) {
    return null;
  }

  // Extract conversation context from message history
  const conversation = extractConversationContext(messages);

  // Load session summary
  const sessCtx = loadSessionContext(sessionID);
  const summaryText = sessCtx?.summary?.text
    ? `近期背景 (Session): ${sessCtx.summary.text}\n`
    : "";

  let result: string
  if (conversation) {
    result = `当前意图: ${trimmed}\n---\n${summaryText}${conversation}`
  } else if (summaryText) {
    result = `当前意图: ${trimmed}\n---\n${summaryText}`
  } else {
    result = trimmed
  }

  debugLog.debug(`[enrichedQuery]\n  ${result.replace(/\n/g, '\n  ')}`)
  return result
}
