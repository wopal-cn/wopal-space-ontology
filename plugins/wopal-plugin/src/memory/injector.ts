/**
 * Memory Injector - Memory retrieval and formatting for injection
 *
 * Retrieves relevant memories and formats them for injection.
 * Called from messages.transform hook via memory-message-injector.ts.
 */

import type { MemoryRetriever } from "./retriever.js";
import type { Memory } from "./store.js";
import { memoryLogger } from "../logger.js";

export class MemoryInjector {
  private retriever: MemoryRetriever;

  constructor(retriever: MemoryRetriever) {
    this.retriever = retriever;
  }

  async isEmpty(): Promise<boolean> {
    return this.retriever.isEmpty();
  }

  /**
   * Retrieve and format memories for injection.
   * Returns formatted string (pure content, no wrapping tags), or undefined if no memories found.
   */
  async retrieveAndFormat(userQuery: string): Promise<string | undefined> {
    try {
      const memories = await this.retriever.retrieve(userQuery);

      if (memories.length === 0) {
        memoryLogger.debug(`[inject] No relevant memories found`);
        return undefined;
      }

      const { formatted, injectedCount, injectedIds } = this.formatMemories(memories);
      const tokens = Math.ceil(formatted.length / 4);
      const idLines = injectedIds.map((id, i) => `  [${i + 1}] ${id}`).join("\n");
      memoryLogger.info(
        `[inject] retrieved=${memories.length}, injected=${injectedCount}, tokens=${tokens}\n${idLines}`
      );

      return formatted;
    } catch (error) {
      memoryLogger.debug(`[inject] Retrieval failed: ${error}`);
      return undefined;
    }
  }

  private formatMemories(memories: Memory[]): {
    formatted: string;
    injectedCount: number;
    injectedIds: string[];
  } {
    const TOKEN_BUDGET = 1500;
    const lines: string[] = [];
    let totalTokens = 0;
    const tokens = (s: string) => Math.ceil(s.length / 4);
    let injectedCount = 0;
    const injectedIds: string[] = [];

    for (const memory of memories) {
      const line = `- ${this.cleanBody(memory.text)}`;
      const t = tokens(line);
      if (totalTokens + t > TOKEN_BUDGET) break;
      lines.push(line);
      totalTokens += t;
      injectedCount++;
      const title = memory.text.split("\n")[0].slice(0, 40);
      injectedIds.push(`${memory.id.slice(0, 8)}(${title})`);
    }

    if (lines.length === 0) {
      return { formatted: "", injectedCount: 0, injectedIds: [] };
    }

    const content =
      "Relevant memories (ordered by relevance, first is most relevant):\n\n" +
      "```markdown\n" +
      lines.join("\n") +
      "\n```";

    return { formatted: content, injectedCount, injectedIds };
  }

  /**
   * Clean body text for injection
   *
   * Handles legacy format artifacts from pre-optimization memories:
   * - Strip ## [xxx]: category prefix
   * - Convert **Label**: bold labels to plain text
   */
  private cleanBody(text: string): string {
    let cleaned = text;
    cleaned = cleaned.replace(/^##\s*\[[^\]]+\]:\s*/, "");
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*[:：]/g, "$1：");
    return cleaned.trim();
  }
}
