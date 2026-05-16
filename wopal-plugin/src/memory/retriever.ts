/**
 * Memory Retriever - Vector Search with Dynamic Threshold
 *
 * Uses vector similarity as the sole recall path (FTS/LIKE removed —
 * ineffective for Chinese). Applies dynamic threshold based on
 * similarity distribution (top-quartile cutoff) so only truly
 * relevant memories are injected, regardless of total memory count.
 */

import type { MemoryStore, Memory } from "./store.js";
import type { EmbeddingClient } from "./embedder.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[memory]", "memory");

const DEFAULT_LIMIT = 8;

const DECAY_FACTOR = 0.005;

export interface RetrieveOptions {
  limit?: number;
}

interface MemoryWithScore extends Memory {
  score: number;
  similarityScore: number;
  recencyScore: number;
  conceptBoost: number;
}

export class MemoryRetriever {
  private store: MemoryStore;
  private embedder: EmbeddingClient;
  private emptyCache: boolean | undefined;

  constructor(store: MemoryStore, embedder: EmbeddingClient) {
    this.store = store;
    this.embedder = embedder;
  }

  async isEmpty(): Promise<boolean> {
    if (this.emptyCache === false) return false;
    const count = await this.store.count();
    const empty = count === 0;
    if (!empty) this.emptyCache = false;
    return empty;
  }

  /**
   * Retrieve relevant memories for a query
   *
   * Steps:
   * 1. Embed query → vector
   * 2. Vector search only (limit * 2 for recall buffer)
   * 3. Rank by similarity (primary) + recency/importance (boost)
   * 4. Deduplicate by id
   * 5. Dynamic threshold: top-quartile similarity as cutoff
   * 6. Hard limit on result count
   */
  async retrieve(
    query: string,
    options?: RetrieveOptions,
  ): Promise<Memory[]> {
    const limit = options?.limit ?? DEFAULT_LIMIT;

    const queryVector = this.embedder.toFloat32Array(
      await this.embedder.embedSingle(query),
    );

    const vectorResults = await this.store.search(queryVector, limit * 2);

    if (vectorResults.length === 0) {
      debugLog("No vector search results");
      return [];
    }

    const queryTerms = this.extractEnglishTerms(query);
    const scoredMemories = this.rankMemories(vectorResults, queryTerms);
    const deduplicated = this.deduplicateByContent(this.deduplicateById(scoredMemories));

    const threshold = this.computeDynamicThreshold(deduplicated);
    const filtered = deduplicated.filter(m => m.similarityScore >= threshold);

    return filtered.slice(0, limit);
  }

  /**
   * Compute dynamic threshold using adaptive gap strategy.
   *
   * Strategy: topSimilarity - 0.15, with absolute floor 0.20.
   * - If topSimilarity < 0.15 → return 1.0 (inject nothing)
   * - Otherwise: return Math.max(0.20, topSimilarity - 0.15)
   *
   * This ensures low-similarity queries inject few/no memories,
   * while high-similarity queries get relevant results.
   */
  private computeDynamicThreshold(memories: MemoryWithScore[]): number {
    const topSimilarity = Math.max(...memories.map(m => m.similarityScore));
    if (topSimilarity < 0.15) return 1.0;
    return Math.max(0.15, topSimilarity - 0.20);
  }

  private extractEnglishTerms(query: string): string[] {
    const terms = query.match(/[a-zA-Z][\w-]*/g) ?? [];
    return terms.filter(t => t.length >= 3);
  }

  private computeConceptBoost(memory: Memory, queryTerms: string[]): number {
    const tags = (typeof memory.tags === "string" && memory.tags.length > 0)
      ? memory.tags.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    if (tags.length === 0) return 0;

    const matchCount = queryTerms.filter(term =>
      tags.some((t: string) =>
        t.toLowerCase().includes(term.toLowerCase())
      )
    ).length;

    return Math.min(matchCount * 0.05, 0.15);
  }

  private rankMemories(memories: Memory[], queryTerms?: string[]): MemoryWithScore[] {
    const now = Date.now();
    const hoursSinceCreation = (createdAt: number) =>
      (now - createdAt) / (1000 * 60 * 60);

    const terms = queryTerms ?? [];

    return memories.map((memory) => {
      const distance = typeof memory._distance === "number" ? memory._distance : 1.0;
      const similarityScore = 1 - (distance * distance) / 2;

      const hours = hoursSinceCreation(memory.created_at);
      const recencyScore = 0.05 / (1 + DECAY_FACTOR * hours);

      const conceptBoost = this.computeConceptBoost(memory, terms);

      const score = similarityScore + conceptBoost + memory.importance * 0.03 + recencyScore;

      return {
        ...memory,
        score,
        similarityScore,
        recencyScore,
        conceptBoost,
      };
    });
  }

  private deduplicateById(memories: MemoryWithScore[]): MemoryWithScore[] {
    const byId = new Map<string, MemoryWithScore>();

    for (const memory of memories) {
      const existing = byId.get(memory.id);
      if (!existing || memory.score > existing.score) {
        byId.set(memory.id, memory);
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.score - a.score);
  }

  private deduplicateByContent(memories: MemoryWithScore[]): MemoryWithScore[] {
    const byContent = new Map<string, MemoryWithScore>();

    for (const memory of memories) {
      const key = `${memory.category}\u0000${String(memory.text).trim()}`;
      const existing = byContent.get(key);
      if (!existing || memory.score > existing.score) {
        byContent.set(key, memory);
      }
    }

    return Array.from(byContent.values()).sort((a, b) => b.score - a.score);
  }
}
