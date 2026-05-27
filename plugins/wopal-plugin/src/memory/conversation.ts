/**
 * Conversation Text Extraction
 *
 * Extracts and filters conversation text from session messages for distillation.
 *
 * Two-layer filtering mechanism:
 * 1. Structural: skip synthetic parts (all roles) — handles messages.transform injections (memory, rules)
 * 2. Tag-based: filter <wopal-notify> blocks — handles all promptAsync injections
 * Plus: filter <system-reminder> blocks from OpenCode's read tool.
 */

import type { SessionMessage } from "../types.js";

// Extraction thresholds
export const MIN_CONVERSATION_LENGTH = 100; // Minimum characters to extract
export const MAX_CONVERSATION_LENGTH = 8000; // Truncate to this length

/**
 * Filter out non-user content from extracted text.
 *
 * - <system-reminder>: promptAsync injections (compaction recovery, task notifications, etc.)
 *   Note: messages.transform injections (memory-context, rule-context) are filtered by synthetic flag.
 */
export function filterInjectedBlocks(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

/**
 * Extract conversation text from session messages
 *
 * Strategy:
 * - skip synthetic parts (all roles) — machine-generated content from messages.transform
 * - skip compaction messages entirely
 * - merge consecutive same-role messages
 * - filter plugin-injected blocks from final output
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

      // Skip synthetic parts (all roles).
      // synthetic = machine-generated via messages.transform (memory context, rule injection, etc.)
      // User slash command expansions use `ignored` flag (not synthetic) and are preserved.
      const partData = part as { text: string; synthetic?: boolean };
      if (partData.synthetic) continue;

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

  return filterInjectedBlocks(json);
}
