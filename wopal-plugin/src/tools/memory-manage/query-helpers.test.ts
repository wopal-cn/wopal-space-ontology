import { describe, it, expect, vi } from 'vitest'
import {
  loadAllMemories,
  resolveMemoryByShortId,
  mergeSearchResults,
  sortByCreatedAt,
  filterByCategory,
  sliceWithPagination,
} from './query-helpers.js'
import type { Memory } from '../../memory/store.js'

function createMemory(id: string, overrides?: Partial<Memory>): Memory {
  return {
    id,
    text: `Memory ${id}`,
    vector: new Float32Array(768),
    category: 'knowledge',
    project: '',
    session_id: '',
    importance: 0.5,
    created_at: Date.now(),
    updated_at: Date.now(),
    access_count: 0,
    tags: '',
    metadata: {},
    ...overrides,
  }
}

describe('loadAllMemories', () => {
  it('calls searchByQuery with correct parameters', async () => {
    const mockStore = {
      searchByQuery: vi.fn().mockResolvedValue([
        createMemory('mem-1'),
      ]),
    } as never

    const result = await loadAllMemories(mockStore)

    expect(mockStore.searchByQuery).toHaveBeenCalledWith('', 1000, 'like', ['text'])
    expect(result).toHaveLength(1)
  })
})

describe('resolveMemoryByShortId', () => {
  it('returns memory by full ID', async () => {
    const mem1 = createMemory('abc12345-def6-7890')
    const mockStore = {
      get: vi.fn().mockResolvedValue(mem1),
      searchByQuery: vi.fn().mockResolvedValue([]),
    } as never

    const result = await resolveMemoryByShortId(mockStore, 'abc12345-def6-7890')

    expect(result).toEqual(mem1)
    expect(mockStore.get).toHaveBeenCalledWith('abc12345-def6-7890')
  })

  it('returns memory by short ID (8 chars)', async () => {
    const mem1 = createMemory('abc12345-def6-7890')
    const allMemories = [mem1]
    const mockStore = {
      get: vi.fn().mockResolvedValue(null),
      searchByQuery: vi.fn().mockResolvedValue(allMemories),
    } as never

    const result = await resolveMemoryByShortId(mockStore, 'abc12345', allMemories)

    expect(result).toEqual(mem1)
    expect(mockStore.get).toHaveBeenCalledWith('abc12345')
    expect(mockStore.searchByQuery).not.toHaveBeenCalled() // Uses pre-loaded memories
  })

  it('returns null when memory not found', async () => {
    const mockStore = {
      get: vi.fn().mockResolvedValue(null),
      searchByQuery: vi.fn().mockResolvedValue([]),
    } as never

    const result = await resolveMemoryByShortId(mockStore, 'notfound')

    expect(result).toBeNull()
  })

  it('loads all memories when not provided', async () => {
    const mem1 = createMemory('abc12345-def6-7890')
    const mockStore = {
      get: vi.fn().mockResolvedValue(null),
      searchByQuery: vi.fn().mockResolvedValue([mem1]),
    } as never

    const result = await resolveMemoryByShortId(mockStore, 'abc12345')

    expect(result).toEqual(mem1)
    expect(mockStore.searchByQuery).toHaveBeenCalled()
  })
})

describe('mergeSearchResults', () => {
  it('merges results from fts and like queries', () => {
    const mem1 = createMemory('mem-1')
    const mem2 = createMemory('mem-2')
    const mem3 = createMemory('mem-3')

    const ftsResults = [mem1, mem2]
    const likeResults = [mem2, mem3]

    const merged = mergeSearchResults(ftsResults, likeResults)

    expect(merged).toHaveLength(3)
    expect(merged.map(m => m.id)).toEqual(['mem-1', 'mem-2', 'mem-3'])
  })

  it('deduplicates by ID', () => {
    const mem1 = createMemory('mem-1')

    const ftsResults = [mem1]
    const likeResults = [mem1]

    const merged = mergeSearchResults(ftsResults, likeResults)

    expect(merged).toHaveLength(1)
  })
})

describe('sortByCreatedAt', () => {
  it('sorts memories by created_at descending', () => {
    const now = Date.now()
    const mem1 = createMemory('mem-1', { created_at: now - 100 })
    const mem2 = createMemory('mem-2', { created_at: now })
    const mem3 = createMemory('mem-3', { created_at: now - 200 })

    const sorted = sortByCreatedAt([mem1, mem2, mem3])

    expect(sorted[0].id).toBe('mem-2') // Most recent
    expect(sorted[1].id).toBe('mem-1')
    expect(sorted[2].id).toBe('mem-3')
  })
})

describe('filterByCategory', () => {
  it('filters memories by category', () => {
    const mem1 = createMemory('mem-1', { category: 'knowledge' })
    const mem2 = createMemory('mem-2', { category: 'profile' })
    const mem3 = createMemory('mem-3', { category: 'knowledge' })

    const filtered = filterByCategory([mem1, mem2, mem3], 'knowledge')

    expect(filtered).toHaveLength(2)
    expect(filtered.map(m => m.id)).toEqual(['mem-1', 'mem-3'])
  })

  it('returns all memories when category undefined', () => {
    const mem1 = createMemory('mem-1')
    const mem2 = createMemory('mem-2')

    const filtered = filterByCategory([mem1, mem2])

    expect(filtered).toHaveLength(2)
  })
})

describe('sliceWithPagination', () => {
  it('slices memories to limit with pagination info', () => {
    const memories = [
      createMemory('mem-1'),
      createMemory('mem-2'),
      createMemory('mem-3'),
    ]

    const result = sliceWithPagination(memories, 2)

    expect(result.displayed).toHaveLength(2)
    expect(result.total).toBe(3)
    expect(result.remaining).toBe(1)
  })

  it('uses default limit of 100', () => {
    const memories = Array.from({ length: 150 }, (_, i) =>
      createMemory(`mem-${i}`)
    )

    const result = sliceWithPagination(memories)

    expect(result.displayed).toHaveLength(100)
    expect(result.total).toBe(150)
    expect(result.remaining).toBe(50)
  })
})