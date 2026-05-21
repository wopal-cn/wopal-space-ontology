/**
 * Distill Engine - Memory Extraction from Sessions
 *
 * Extracts structured memories from conversation history using LLM,
 * with two-stage deduplication (vector pre-filter + LLM decision).
 */

import type { MemoryStore } from "./store.js";
import type { MemoryCategory } from "./types.js";
import type { EmbeddingClient } from "./embedder.js";
import type { DistillLLMClient } from "./llm-client.js";
import type { SessionMessage } from "../types.js";
import { memoryLogger, formatSessionID } from "../logger.js";
import { loadSessionContext, saveSessionContext, clearSessionContext, type SessionContext } from "./session-context.js";
import { CATEGORY_LABELS, validateCategory, getDefaultImportance } from "./categories.js";
import { MIN_CONVERSATION_LENGTH, extractConversationText } from "./conversation.js";
import { buildExtractionPrompt, type ExtractResult } from "./prompts.js";
import { performDeduplication, type DedupResult } from "./dedup.js";

/**
 * Result of distillation process
 */
export interface DistillResult {
  memoriesCreated: number;
  memoriesMerged: number;
  memoriesSkipped: number;
  title: string | null;
  depth: "shallow";
}

/**
 * Preview candidate memory before deduplication
 */
export interface PreviewCandidate {
  category: MemoryCategory;
  body: string;
  tags: string[];
  importance: number;
}

// Session storage for pending confirmations
const pendingConfirmations = new Map<string, { candidates: PreviewCandidate[]; title: string | null }>();

export function getPendingConfirmation(sessionID: string): { candidates: PreviewCandidate[]; title: string | null } | undefined {
  return pendingConfirmations.get(sessionID);
}

export function setPendingConfirmation(sessionID: string, data: { candidates: PreviewCandidate[]; title: string | null }): void {
  pendingConfirmations.set(sessionID, data);
}

export function clearPendingConfirmation(sessionID: string): void {
  pendingConfirmations.delete(sessionID);
}

/**
 * Load extraction state from disk (delegates to SessionContext)
 */
export function loadExtractionState(sessionID: string): SessionContext | null {
  return loadSessionContext(sessionID);
}

/**
 * Clear extraction state for a session (delegates to SessionContext)
 */
export function clearExtractionState(sessionID: string): void {
  clearSessionContext(sessionID);
}

/**
 * Distill Engine - Extract memories from session conversation
 */
export class DistillEngine {
  private store: MemoryStore;
  private embedder: EmbeddingClient;
  private llm: DistillLLMClient;

  constructor(store: MemoryStore, embedder: EmbeddingClient, llm: DistillLLMClient) {
    this.store = store;
    this.embedder = embedder;
    this.llm = llm;
  }

  /**
   * Distill memories from session messages
   */
  async distill(sessionID: string, messages: SessionMessage[], project: string = "wopal-space"): Promise<DistillResult> {
    memoryLogger.debug(`[distill] ${formatSessionID(sessionID, false)} project=${project} messages=${messages.length}`);

    const existingState = loadExtractionState(sessionID);
    if (existingState?.distill) {
      memoryLogger.debug(`[distill] Already extracted at ${existingState.distill.extractedAt}`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: existingState.title, depth: "shallow" };
    }

    const conversation = extractConversationText(messages);
    if (conversation.length < MIN_CONVERSATION_LENGTH) {
      memoryLogger.debug(`[distill] Too short (${conversation.length} chars), skip`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: null, depth: "shallow" };
    }

    const extractionPrompt = buildExtractionPrompt(conversation);
    let extractResult: ExtractResult;
    try {
      extractResult = await this.llm.completeJson<ExtractResult>(extractionPrompt);
    } catch (error) {
      memoryLogger.warn(`[distill] LLM extraction failed: ${error}`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: null, depth: "shallow" };
    }

    if (!extractResult.memories || extractResult.memories.length === 0) {
      memoryLogger.debug(`[distill] No memories extracted`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: extractResult.title ?? null, depth: "shallow" };
    }

    const dedupResult = await performDeduplication(
      extractResult.memories, this.store, this.embedder, this.llm
    );

    await this.writeDedupResult(dedupResult, sessionID, project);

    const ctx: SessionContext = {
      sessionID,
      title: extractResult.title ?? null,
      distill: { messageCount: messages.length, extractedAt: new Date().toISOString(), depth: "shallow" },
    };
    saveSessionContext(ctx);

    memoryLogger.debug(`[distill] Done: created=${dedupResult.create.length}, merged=${dedupResult.merge.length}, skipped=${dedupResult.skip.length}`);
    return {
      memoriesCreated: dedupResult.create.length,
      memoriesMerged: dedupResult.merge.length,
      memoriesSkipped: dedupResult.skip.length,
      title: extractResult.title ?? null,
      depth: "shallow",
    };
  }

  /**
   * Preview memories from session messages without writing to database
   */
  async preview(sessionID: string, messages: SessionMessage[]): Promise<{ candidates: PreviewCandidate[]; title: string | null }> {
    memoryLogger.debug(`[preview] ${formatSessionID(sessionID, false)} messages=${messages.length}`);

    const conversation = extractConversationText(messages);
    if (conversation.length < MIN_CONVERSATION_LENGTH) {
      memoryLogger.debug(`[preview] Too short (${conversation.length} chars), skip`);
      return { candidates: [], title: null };
    }

    const extractionPrompt = buildExtractionPrompt(conversation);
    let extractResult: ExtractResult;
    try {
      extractResult = await this.llm.completeJson<ExtractResult>(extractionPrompt);
    } catch (error) {
      memoryLogger.warn(`[preview] LLM extraction failed: ${error}`);
      return { candidates: [], title: null };
    }

    if (!extractResult.memories || extractResult.memories.length === 0) {
      memoryLogger.debug(`[preview] No memories extracted`);
      return { candidates: [], title: extractResult.title ?? null };
    }

    const candidates: PreviewCandidate[] = extractResult.memories.map((m) => {
      const validated = validateCategory(m.category, m.body);
      return { category: validated.category, body: validated.body, tags: m.tags ?? [], importance: getDefaultImportance(validated.category) };
    });

    memoryLogger.debug(`[preview] ${candidates.length} candidates`);
    return { candidates, title: extractResult.title ?? null };
  }

  /**
   * Confirm and write selected candidates with deduplication
   */
  async confirmCandidates(
    sessionID: string,
    candidates: PreviewCandidate[],
    project: string = "wopal-space"
  ): Promise<{ created: number; merged: number; skipped: number; mergeDetails: Array<{ existingId: string; existingPreview: string; mergedPreview: string }> }> {
    if (candidates.length === 0) {
      return { created: 0, merged: 0, skipped: 0, mergeDetails: [] };
    }

    memoryLogger.debug(`[confirm] Starting dedup for ${candidates.length} candidates`);

    const dedupResult = await performDeduplication(
      candidates.map((c) => ({ category: c.category, body: c.body, tags: c.tags })),
      this.store, this.embedder, this.llm
    );

    await this.writeDedupResult(dedupResult, sessionID, project);

    memoryLogger.debug(`[confirm] Done: created=${dedupResult.create.length}, merged=${dedupResult.merge.length}, skipped=${dedupResult.skip.length}`);
    return {
      created: dedupResult.create.length,
      merged: dedupResult.merge.length,
      skipped: dedupResult.skip.length,
      mergeDetails: dedupResult.merge.map((m) => ({
        existingId: m.existingId,
        existingPreview: m.existingBody.split("\n")[0].slice(0, 80),
        mergedPreview: m.body.split("\n")[0].slice(0, 80),
      })),
    };
  }

  /**
   * Write deduplication result to store
   */
  private async writeDedupResult(dedupResult: DedupResult, sessionID: string, project: string): Promise<void> {
    for (const memory of dedupResult.create) {
      await this.store.add({
        text: memory.text, vector: memory.vector, category: memory.category,
        project, session_id: sessionID, importance: memory.importance,
        tags: memory.tags, metadata: memory.metadata,
      });
    }
    for (const merge of dedupResult.merge) {
      await this.store.update(merge.existingId, {
        text: merge.body, vector: merge.vector,
        tags: merge.tags.join(","), metadata: merge.metadata,
      });
    }
  }

  /**
   * Get category label for display
   */
  getCategoryLabel(category: MemoryCategory): string {
    return CATEGORY_LABELS[category] ?? category;
  }

  /**
   * Expose embed method for external use
   */
  embed(text: string): Promise<number[]> {
    return this.embedder.embedSingle(text);
  }

  /**
   * Expose toFloat32Array for external use
   */
  toFloat32Array(embedding: number[]): Float32Array {
    return this.embedder.toFloat32Array(embedding);
  }
}