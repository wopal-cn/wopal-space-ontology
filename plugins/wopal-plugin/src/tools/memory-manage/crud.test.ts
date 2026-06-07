import { describe, expect, it, vi } from 'vitest'
import { formatSearch } from './crud.js'
import type { Memory } from '../../memory/store.js'

function createMemory(id: string, overrides?: Partial<Memory>): Memory {
  return {
    id,
    text: `Memory ${id}`,
    vector: new Float32Array(768),
    category: 'knowledge',
    project: 'wopal-space',
    session_id: 'ses-test',
    importance: 0.5,
    created_at: 1710000000000,
    updated_at: 1710000000000,
    access_count: 0,
    tags: '',
    metadata: {},
    ...overrides,
  }
}

describe('formatSearch', () => {
  it('returns compact ranked markdown with default limit', async () => {
    const memories = Array.from({ length: 8 }, (_, index) =>
      createMemory(`mem-${index}`, {
        text: `memory search result ${index}`,
        tags: 'memory,search',
        importance: 0.5,
        updated_at: 1710000000000 + index,
      })
    )
    const store = {
      searchByQuery: vi.fn().mockResolvedValue(memories),
    } as never

    const result = await formatSearch(store, 'memory search', 'memory')

    expect(result).toContain('Shown: 6/8 matches (limit=6)')
    expect(result).toContain('score=')
    expect(result).toContain('match: tags 1/1')
    expect(result).not.toContain('access_count')
    expect(result).not.toContain('session_id')
  })

  it('does not return unrelated memories for tag-only search', async () => {
    const memories = [
      createMemory('mem-match', {
        text: 'tool description guidance',
        tags: 'wopal-plugin,tool-description',
      }),
      createMemory('mem-noise', {
        text: 'git reset safety workflow',
        tags: 'git,reset,safety',
      }),
    ]
    const store = {
      searchByQuery: vi.fn().mockResolvedValue(memories),
    } as never

    const result = await formatSearch(store, '', 'tool-description')

    expect(result).toContain('[mem-matc]')
    expect(result).not.toContain('[mem-nois]')
  })
})
