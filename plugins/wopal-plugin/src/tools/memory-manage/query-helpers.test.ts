import { describe, it, expect, vi } from 'vitest'
import {
  loadAllMemories,
  resolveMemoryByShortId,
  mergeSearchResults,
  normalizeSearchLimit,
  rankMemorySearchResults,
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

describe('normalizeSearchLimit', () => {
  it('uses compact default and caps large limits', () => {
    expect(normalizeSearchLimit()).toBe(6)
    expect(normalizeSearchLimit(0)).toBe(1)
    expect(normalizeSearchLimit(20)).toBe(12)
  })
})

describe('rankMemorySearchResults', () => {
  it('ranks exact tag matches above text-only matches', () => {
    const tagMatch = createMemory('mem-tag', {
      text: 'Tool description guidance',
      tags: 'wopal-plugin,tool-description,prompt-engineering',
      importance: 0.6,
      updated_at: 100,
    })
    const textOnly = createMemory('mem-text', {
      text: 'wopal plugin task tool description details',
      tags: 'plugin,tool,fix',
      importance: 1,
      updated_at: 200,
    })

    const results = rankMemorySearchResults(
      [textOnly, tagMatch],
      'tool description',
      'wopal-plugin,tool-description',
    )

    expect(results.map((r) => r.memory.id)).toEqual(['mem-tag', 'mem-text'])
    expect(results[0].matchSummary).toContain('tags 2/2')
  })

  it('filters unrelated memories instead of returning noisy results', () => {
    const unrelated = createMemory('mem-unrelated', {
      text: 'Git reset safety workflow',
      tags: 'git,reset,safety',
      importance: 1,
    })

    const results = rankMemorySearchResults(
      [unrelated],
      'memory search',
      'wopal-plugin',
    )

    expect(results).toEqual([])
  })

  it('does not treat generic memory tags as matches for specific search tags', () => {
    const generic = createMemory('mem-generic', {
      text: 'unrelated implementation note',
      tags: 'plugin,tool,fix',
      importance: 1,
    })
    const specific = createMemory('mem-specific', {
      text: 'tool description guidance',
      tags: 'wopal-plugin,tool-description',
      importance: 0.5,
    })

    const results = rankMemorySearchResults(
      [generic, specific],
      '',
      'tool-description',
    )

    expect(results.map((r) => r.memory.id)).toEqual(['mem-specific'])
  })

  it('uses updated_at as tie-break when score and importance match', () => {
    const older = createMemory('mem-old', {
      text: 'memory search tags',
      tags: 'memory,search',
      importance: 0.5,
      updated_at: 100,
    })
    const newer = createMemory('mem-new', {
      text: 'memory search tags',
      tags: 'memory,search',
      importance: 0.5,
      updated_at: 200,
    })

    const results = rankMemorySearchResults([older, newer], 'memory search', 'memory')

    expect(results.map((r) => r.memory.id)).toEqual(['mem-new', 'mem-old'])
  })
})
