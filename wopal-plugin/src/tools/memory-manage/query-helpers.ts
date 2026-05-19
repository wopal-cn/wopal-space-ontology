/**
 * Memory Query Helpers - Unified memory query operations
 *
 * Consolidates repeated full-table scans, short-ID resolution, and result deduplication
 * from memory-manage/crud.ts. Eliminates scattered full-scan patterns.
 */

import type { Memory, MemoryStore } from "../../memory/store.js"

/** Full-table scan parameters */
const FULL_SCAN_PARAMS = {
  limit: 1000,
  type: "like" as const,
  columns: ["text"],
}

/**
 * Load all memories via full-table scan.
 * Used by list/stats/delete/update operations.
 */
export async function loadAllMemories(store: MemoryStore): Promise<Memory[]> {
  return store.searchByQuery("", FULL_SCAN_PARAMS.limit, FULL_SCAN_PARAMS.type, FULL_SCAN_PARAMS.columns)
}

/**
 * Resolve memory by short ID (first 8 chars of UUID).
 * Returns null if not found.
 *
 * @param store - Memory store instance
 * @param rawId - Raw ID input (may be full UUID or short ID)
 * @param allMemories - Optional pre-loaded memories (avoid repeated scan)
 */
export async function resolveMemoryByShortId(
  store: MemoryStore,
  rawId: string,
  allMemories?: Memory[],
): Promise<Memory | null> {
  // Try full ID first
  const memory = await store.get(rawId)
  if (memory) return memory

  // Fall back to short ID match
  const all = allMemories ?? await loadAllMemories(store)
  return all.find((r) => r.id.startsWith(rawId)) ?? null
}

/**
 * Merge search results from multiple query types (fts + like).
 * Dedup by memory ID.
 */
export function mergeSearchResults(
  ftsResults: Memory[],
  likeResults: Memory[],
): Memory[] {
  const seen = new Set<string>()
  const merged: Memory[] = []

  for (const r of [...ftsResults, ...likeResults]) {
    if (!seen.has(r.id)) {
      seen.add(r.id)
      merged.push(r)
    }
  }

  return merged
}

/**
 * Sort memories by creation time (most recent first).
 */
export function sortByCreatedAt(memories: Memory[]): Memory[] {
  return memories.sort((a, b) => b.created_at - a.created_at)
}

/**
 * Filter memories by category.
 */
export function filterByCategory(memories: Memory[], category?: string): Memory[] {
  if (!category) return memories
  return memories.filter((r) => r.category === category)
}

/**
 * Slice memories to limit with pagination info.
 */
export function sliceWithPagination(
  memories: Memory[],
  limit?: number,
): { displayed: Memory[]; total: number; remaining: number } {
  const total = memories.length
  const displayed = memories.slice(0, limit ?? 100)
  const remaining = total - displayed.length

  return { displayed, total, remaining }
}