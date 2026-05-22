/**
 * Memory Query Helpers - Unified memory query operations
 *
 * Consolidates repeated full-table scans, short-ID resolution, and result deduplication
 * from memory-manage/crud.ts. Eliminates scattered full-scan patterns.
 */

import type { Memory, MemoryStore } from "../../memory/store.js"

export interface ScoredMemorySearchResult {
  memory: Memory
  score: number
  matchSummary: string
}

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

export function normalizeSearchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 6
  return Math.min(Math.max(Math.floor(limit ?? 6), 1), 12)
}

export function splitSearchTags(tags?: string): string[] {
  const normalized = (tags ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

export function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，、;；:：()（）\[\]{}"'`]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
}

function splitMemoryTags(memory: Memory): string[] {
  return String(memory.tags ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

function countTextMatches(searchableText: string, queryTerms: string[]): number {
  const uniqueTerms = new Set(queryTerms)
  let count = 0

  for (const term of uniqueTerms) {
    if (searchableText.includes(term)) count += 1
  }

  return count
}

export function scoreMemoryForSearch(
  memory: Memory,
  query: string,
  searchTags: string[],
): ScoredMemorySearchResult | null {
  const queryText = query.trim().toLowerCase()
  const queryTerms = tokenizeSearchQuery(query)
  const memoryTags = splitMemoryTags(memory)
  const memoryText = String(memory.text ?? "").toLowerCase()
  const fieldText = [memory.category, memory.project, memory.tags]
    .map((value) => String(value ?? "").toLowerCase())
    .join("\n")

  let tagExactMatches = 0
  let tagPartialMatches = 0

  for (const tag of new Set(searchTags)) {
    if (memoryTags.includes(tag)) {
      tagExactMatches += 1
      continue
    }

    if (memoryTags.some((memoryTag) => memoryTag.includes(tag))) {
      tagPartialMatches += 1
    }
  }

  const textPhraseMatch = queryText.length > 0 && memoryText.includes(queryText)
  const fieldPhraseMatch = queryText.length > 0 && fieldText.includes(queryText)
  const textMatches = countTextMatches(memoryText, queryTerms)
  const fieldMatches = countTextMatches(fieldText, queryTerms)
  const hasMatch =
    tagExactMatches > 0 ||
    tagPartialMatches > 0 ||
    textPhraseMatch ||
    fieldPhraseMatch ||
    textMatches > 0 ||
    fieldMatches > 0

  if (!hasMatch) return null

  const tagScore = tagExactMatches * 35 + tagPartialMatches * 18
  const phraseScore = textPhraseMatch ? 25 : fieldPhraseMatch ? 10 : 0
  const textScore = Math.min(textMatches * 8, 32)
  const fieldScore = Math.min(fieldMatches * 4, 16)
  const importanceScore = Math.round(memory.importance * 8)
  const score = Math.min(
    100,
    tagScore + phraseScore + textScore + fieldScore + importanceScore,
  )
  const tagTotal = searchTags.length
  const tagSummary = tagTotal > 0 ? `tags ${tagExactMatches + tagPartialMatches}/${tagTotal}` : "tags -"
  const fieldSummary = fieldMatches > 0 ? `, fields ${fieldMatches}` : ""
  const matchSummary = `${tagSummary}, text ${textMatches}${fieldSummary}`

  return { memory, score, matchSummary }
}

export function rankMemorySearchResults(
  memories: Memory[],
  query: string,
  tags?: string,
): ScoredMemorySearchResult[] {
  const searchTags = splitSearchTags(tags)

  return memories
    .map((memory) => scoreMemoryForSearch(memory, query, searchTags))
    .filter((result): result is ScoredMemorySearchResult => result !== null)
    .sort((a, b) =>
      b.score - a.score ||
      b.memory.importance - a.memory.importance ||
      b.memory.updated_at - a.memory.updated_at
    )
}
