/**
 * Deduplication Logic for Memory Extraction
 *
 * Two-stage deduplication: vector pre-filter + LLM decision with merge.
 */

import type { MemoryCategory } from "./types.js";
import type { MemoryStore } from "./store.js";
import type { EmbeddingClient } from "./embedder.js";
import type { LLMClient } from "../llm-client.js";
import { memoryLogger } from "../logger.js";
import { validateCategory, getDefaultImportance } from "./categories.js";
import { buildBatchDedupPrompt } from "./prompts.js";

// Maximum L2 distance to consider "similar" for dedup purposes
const DEDUP_MAX_DISTANCE = 1.0;

/**
 * Input candidate for deduplication
 */
export interface DedupCandidate {
  category: MemoryCategory;
  body: string;
  tags: string[];
}

/**
 * Result of deduplication process
 */
export interface DedupResult {
  create: Array<{
    text: string;
    vector: Float32Array;
    category: MemoryCategory;
    importance: number;
    tags: string[];
    metadata: Record<string, unknown>;
  }>;
  merge: Array<{
    existingId: string;
    existingBody: string;
    body: string;
    vector: Float32Array;
    tags: string[];
    metadata: Record<string, unknown>;
  }>;
  skip: Array<{ reason: string }>;
}

/**
 * Perform two-stage deduplication
 *
 * 1. Vector pre-filter: embed new memories → search similar
 * 2. Per-candidate LLM decision: ask LLM to decide create/merge/skip/replace
 * 3. For merge/replace: call LLM merge prompt
 */
export async function performDeduplication(
  candidates: DedupCandidate[],
  store: MemoryStore,
  embedder: EmbeddingClient,
  llm: LLMClient,
): Promise<DedupResult> {
  const result: DedupResult = {
    create: [],
    merge: [],
    skip: [],
  };

  // Validate & fix category via title prefix before embedding
  const validated = candidates.map((m) => validateCategory(m.category, m.body));

  // Embed all new memories
  const embeddings = await embedder.embed(validated.map((m) => m.body));

  // Vector pre-filter: collect similar existing memories for each candidate
  const candidatesForPrompt = validated.map((v, i) => ({
    index: i + 1,
    category: v.category,
    body: v.body,
  }));

  const existingByCandidate = new Map<number, Array<{ index: number; body: string; id: string; tags: string; metadata: Record<string, unknown> }>>();
  for (let i = 0; i < validated.length; i++) {
    const vector = embedder.toFloat32Array(embeddings[i]);
    const similar = await store.search(vector, 5);
    const filtered = similar.filter((m) => {
      const dist = typeof m._distance === "number" ? m._distance : Infinity;
      return dist <= DEDUP_MAX_DISTANCE;
    });
    if (filtered.length > 0) {
      existingByCandidate.set(i + 1, filtered.map((m, idx) => ({
        index: idx + 1,
        body: m.text,
        id: m.id,
        tags: m.tags ?? "",
        metadata: (m.metadata as Record<string, unknown>) ?? {},
      })));
    }
  }

  // Candidates without similar existing memories can be created directly
  for (let i = 0; i < validated.length; i++) {
    if (!existingByCandidate.has(i + 1)) {
      const { category, body } = validated[i];
      const vector = embedder.toFloat32Array(embeddings[i]);
      const importance = getDefaultImportance(category);
      result.create.push({
        text: body, vector, category, importance,
        tags: candidates[i].tags ?? [],
        metadata: {},
      });
    }
  }

  // Skip LLM dedup entirely if no candidate has similar existing memories
  const candidatesNeedingDedup = candidatesForPrompt.filter(
    (c) => existingByCandidate.has(c.index) && existingByCandidate.get(c.index)!.length > 0
  );

  if (candidatesNeedingDedup.length === 0) {
    memoryLogger.trace({ direct_created: result.create.length }, "[deduplicate] No similar memories, all created directly");
    return result;
  }

  const dedupPrompt = buildBatchDedupPrompt(candidatesForPrompt, existingByCandidate);

  interface BatchDecision {
    decisions: Array<{
      index: number;
      action: string;
      merge_into?: number;
      replace_existing?: number;
      merged_body?: string;
      tags?: string[];
    }>;
  }

  let batchResult: BatchDecision;
  try {
    batchResult = await llm.completeJson<BatchDecision>(dedupPrompt);
  } catch (error) {
    memoryLogger.warn({ err: error }, "[deduplicate] Batch LLM failed, creating all as new");
    // On LLM failure, create all candidates that needed dedup as new memories
    for (let i = 0; i < validated.length; i++) {
      if (existingByCandidate.has(i + 1)) {
        const { category, body } = validated[i];
        const vector = embedder.toFloat32Array(embeddings[i]);
        const importance = getDefaultImportance(category);
        result.create.push({
          text: body, vector, category, importance,
          tags: candidates[i].tags ?? [],
          metadata: {},
        });
      }
    }
    return result;
  }

  for (const dec of batchResult.decisions ?? []) {
    const i = dec.index - 1;
    if (i < 0 || i >= validated.length) continue;

    const { category, body } = validated[i];
    const vector = embedder.toFloat32Array(embeddings[i]);
    const importance = getDefaultImportance(category);
    const tags: string[] = candidates[i].tags ?? [];
    const metadata: Record<string, unknown> = {};

    if (dec.action === "skip") {
      result.skip.push({ reason: "duplicate" });
    } else if (dec.action === "create") {
      result.create.push({ text: body, vector, category, importance, tags, metadata });
    } else if ((dec.action === "merge" || dec.action === "replace") && (dec.merge_into !== undefined || dec.replace_existing !== undefined)) {
      const matchIdx = dec.action === "replace" ? dec.replace_existing! : dec.merge_into!;
      const existingList = existingByCandidate.get(dec.index);
      const matchedExisting = existingList?.[matchIdx - 1];
      if (!matchedExisting) {
        memoryLogger.warn({ candidate: dec.index, match_idx: matchIdx }, "[deduplicate] match index out of range");
        result.create.push({ text: body, vector, category, importance, tags, metadata });
        continue;
      }

      const mergedBody = dec.action === "replace" ? body : (dec.merged_body ?? body);
      const mergedConcepts = Array.from(
        new Set([
          ...(matchedExisting.tags?.split(",") ?? []),
          ...(dec.tags ?? []),
        ])
      );

      const [mergedEmbedding] = await embedder.embed([mergedBody]);
      const mergedVector = embedder.toFloat32Array(mergedEmbedding);

      result.merge.push({
        existingId: matchedExisting.id,
        existingBody: matchedExisting.body,
        body: mergedBody,
        vector: mergedVector,
        tags: mergedConcepts,
        metadata: {},
      });
    } else {
      result.create.push({ text: body, vector, category, importance, tags, metadata });
    }
  }

  return result;
}