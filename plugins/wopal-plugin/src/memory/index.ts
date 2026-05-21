/**
 * Memory Module - Public API
 *
 * Provides memory storage, embedding, LLM distillation, retrieval, and injection capabilities.
 */

export { MemoryStore } from "./store.js";
export type { Memory, MemoryInput, MemoryCategory, MemoryUpdate, QueryType } from "./types.js";
export { EmbeddingClient } from "./embedder.js";
export { DistillLLMClient } from "./llm-client.js";

// Core engine exports
export {
  DistillEngine,
  loadExtractionState,
  clearExtractionState,
  getPendingConfirmation,
  setPendingConfirmation,
  clearPendingConfirmation,
} from "./distill.js";
export type {
  DistillResult,
  PreviewCandidate,
} from "./distill.js";
export type { ExtractResult } from "./prompts.js";
export { MemoryRetriever } from "./retriever.js";
export type { RetrieveOptions } from "./retriever.js";
export { MemoryInjector } from "./injector.js";

// Category exports
export {
  CATEGORY_LABELS,
  TAG_TO_CATEGORY,
  validateCategory,
  getDefaultImportance,
} from "./categories.js";