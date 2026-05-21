/**
 * Conversation Text Extraction
 *
 * Extracts and filters conversation text from session messages for distillation.
 */

import type { SessionMessage } from "../types.js";

// Extraction thresholds
export const MIN_CONVERSATION_LENGTH = 100; // Minimum characters to extract
export const MAX_CONVERSATION_LENGTH = 8000; // Truncate to this length

/**
 * Filter out <system-reminder> blocks from text
 * These are appended by OpenCode's read tool and should not be distilled
 */
export function filterSystemReminder(text: string): string {
  // Match <system-reminder>...</system-reminder> blocks (including newlines)
  const filtered = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  return filtered;
}

/**
 * Extract conversation text from session messages
 *
 * Strategy:
 * - user messages: only text parts that are not ignored
 * - assistant messages: only text parts that are not synthetic
 * - skip compaction messages entirely
 * - merge consecutive same-role messages
 * - filter <system-reminder> tags from final output
 * - output as JSON array of {role, content}
 */
export function extractConversationText(messages: SessionMessage[]): string {
  interface DialogueTurn { role: "user" | "assistant"; content: string }

  const turns: DialogueTurn[] = [];
  let skipNext = false;

  for (const msg of messages) {
    const role = msg.info?.role;
    if (role !== "user" && role !== "assistant") continue;
    if (!msg.parts) continue;

    // Skip compaction messages AND their immediate response.
    // OpenCode compaction creates a pair: user "What did we do so far?"
    // (has compaction part) + assistant summary (text-only, no compaction part).
    // Both must be skipped to prevent summary leakage.
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (msg.parts.some((p) => p.type === "compaction")) {
      skipNext = true;
      continue;
    }

    const textParts: string[] = [];

    for (const part of msg.parts) {
      // Only extract text parts
      if (part.type !== "text" || !part.text) continue;

      // assistant: skip synthetic parts (tool output replayed as text)
      // Note: user `ignored` parts are NOT filtered — slash command expansions
      // and other system-attached text carry user intent; removing them breaks
      // conversation continuity and degrades distillation quality.
      const partData = part as { text: string; synthetic?: boolean };
      if (role === "assistant" && partData.synthetic) continue;

      textParts.push(part.text);
    }

    if (textParts.length === 0) continue;

    const content = textParts.join("\n\n");

    // Merge with previous turn if same role
    if (turns.length > 0 && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].content += "\n\n" + content;
    } else {
      turns.push({ role, content });
    }
  }

  if (turns.length === 0) return "";

  // Truncate from the front: keep most recent turns that fit within limit.
  // This ensures the JSON output is never cut mid-string.
  let kept: DialogueTurn[] = [];
  let charBudget = MAX_CONVERSATION_LENGTH;
  for (let i = turns.length - 1; i >= 0; i--) {
    const estimated = JSON.stringify(turns[i]).length + 4; // +4 for comma/newline overhead
    // Hard cap: even the first (most recent) turn must not exceed budget alone
    if (estimated > charBudget) break;
    if (kept.length > 0 && charBudget < estimated) break;
    charBudget -= estimated;
    kept.unshift(turns[i]);
  }

  const json = JSON.stringify(
    kept.map((t) => ({ role: t.role, content: t.content })),
    null,
    2
  );

  return filterSystemReminder(json);
}