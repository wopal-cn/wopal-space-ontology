import { describe, it, expect, vi } from 'vitest'
import {
  fetchProvidersConfig,
  extractModelFromMessages,
  extractContextUsage,
  extractContextFromStore,
  fetchContextPercent,
  formatTokenCount,
  formatContextUsage,
} from './session-runtime-info.js'
import type { SessionMessage, OpenCodeClient } from './types.js'
import { SessionStore } from './session-store.js'

function createMockMessage(role: string, overrides?: Partial<SessionMessage>): SessionMessage {
  return {
    info: {
      role,
      ...overrides?.info,
    },
    ...overrides,
  }
}

describe('fetchProvidersConfig', () => {
  it('returns null when config.providers is not a function', async () => {
    const result = await fetchProvidersConfig(undefined, '/test/dir')
    expect(result).toBeNull()
  })

  it('returns providers when config API succeeds', async () => {
    const mockConfig = {
      providers: vi.fn().mockResolvedValue({
        data: {
          providers: [
            { id: 'openai', models: { 'gpt-4': { limit: { context: 128000 } } } },
          ],
        },
      }),
    }

    const result = await fetchProvidersConfig(mockConfig as never, '/test/dir')

    expect(result?.providers).toHaveLength(1)
    expect(result?.providers[0].id).toBe('openai')
  })

  it('returns null when config API fails', async () => {
    const mockConfig = {
      providers: vi.fn().mockRejectedValue(new Error('API error')),
    }

    const result = await fetchProvidersConfig(mockConfig as never, '/test/dir')
    expect(result).toBeNull()
  })
})

describe('extractModelFromMessages', () => {
  it('extracts model info from last assistant message', () => {
    const messages: SessionMessage[] = [
      createMockMessage('user'),
      createMockMessage('assistant', {
        info: {
          role: 'assistant',
          providerID: 'anthropic',
          modelID: 'claude-3',
          tokens: { input: 1000 },
        },
      }),
    ]

    const result = extractModelFromMessages(messages)

    expect(result).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-3',
    })
  })

  it('extracts model info from nested model object', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: {
          role: 'assistant',
          model: { providerID: 'openai', modelID: 'gpt-4' },
          tokens: { input: 500 },
        },
      }),
    ]

    const result = extractModelFromMessages(messages)

    expect(result).toEqual({
      providerID: 'openai',
      modelID: 'gpt-4',
    })
  })

  it('returns null when no assistant message', () => {
    const messages: SessionMessage[] = [
      createMockMessage('user'),
    ]

    const result = extractModelFromMessages(messages)
    expect(result).toBeNull()
  })

  it('returns null when assistant message missing model info', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: { role: 'assistant' },
      }),
    ]

    const result = extractModelFromMessages(messages)
    expect(result).toBeNull()
  })
})

describe('extractContextUsage', () => {
  const providers = [
    { id: 'anthropic', models: { 'claude-3': { limit: { context: 200000 } } } },
  ]

  it('extracts context usage percentage', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: {
          role: 'assistant',
          providerID: 'anthropic',
          modelID: 'claude-3',
          tokens: { input: 50000, cache: { read: 10000 } },
        },
      }),
    ]

    const result = extractContextUsage(messages, providers)

    expect(result).toEqual({
      pct: 30, // 60000 / 200000 * 100
      used: 60000,
      contextLimit: 200000,
    })
  })

  it('returns null when no assistant with tokens', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: { role: 'assistant' },
      }),
    ]

    const result = extractContextUsage(messages, providers)
    expect(result).toBeNull()
  })

  it('returns null when used=0', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: {
          role: 'assistant',
          providerID: 'anthropic',
          modelID: 'claude-3',
          tokens: { input: 0 },
        },
      }),
    ]

    const result = extractContextUsage(messages, providers)
    expect(result).toBeNull()
  })

  it('returns null when provider not found', () => {
    const messages: SessionMessage[] = [
      createMockMessage('assistant', {
        info: {
          role: 'assistant',
          providerID: 'unknown',
          modelID: 'unknown-model',
          tokens: { input: 1000 },
        },
      }),
    ]

    const result = extractContextUsage(messages, providers)
    expect(result).toBeNull()
  })
})

describe('extractContextFromStore', () => {
  const providers = [
    { id: 'anthropic', models: { 'claude-3': { limit: { context: 200000 } } } },
  ]

  it('extracts context from cached contextLimit without provider lookup', () => {
    const sessionStore = new SessionStore({ max: 10 })
    sessionStore.upsert('ses_cached_limit', (state) => {
      state.lastTokens = {
        input: 50000,
        cache: { read: 10000 },
        updatedAt: Date.now(),
      }
      state.contextLimit = 100000
    })

    const result = extractContextFromStore(sessionStore, 'ses_cached_limit')

    expect(result).toEqual({
      pct: 60,
      used: 60000,
      contextLimit: 100000,
    })
  })

  it('extracts context from sessionStore cache', () => {
    const sessionStore = new SessionStore({ max: 10 })
    sessionStore.upsert('ses_1', (state) => {
      state.lastTokens = {
        input: 50000,
        cache: { read: 10000 },
        updatedAt: Date.now(),
      }
      state.providerID = 'anthropic'
      state.modelID = 'claude-3'
    })

    const result = extractContextFromStore(sessionStore, 'ses_1', providers)

    expect(result).toEqual({
      pct: 30,
      used: 60000,
      contextLimit: 200000,
    })
  })

  it('returns null when no lastTokens', () => {
    const sessionStore = new SessionStore({ max: 10 })
    const result = extractContextFromStore(sessionStore, 'ses_1', providers)
    expect(result).toBeNull()
  })

  it('returns null when missing provider/model info', () => {
    const sessionStore = new SessionStore({ max: 10 })
    sessionStore.upsert('ses_3', (state) => {
      state.lastTokens = {
        input: 1000,
        updatedAt: Date.now(),
      }
    })

    const result = extractContextFromStore(sessionStore, 'ses_3', providers)
    expect(result).toBeNull()
  })
})

describe('fetchContextPercent', () => {
  it('uses cache-first strategy from sessionStore', async () => {
    const sessionStore = new SessionStore({ max: 10 })
    sessionStore.upsert('ses_cache', (state) => {
      state.lastTokens = {
        input: 20000,
        updatedAt: Date.now(),
      }
      state.providerID = 'anthropic'
      state.modelID = 'claude-3'
      state.contextLimit = 200000
    })

    const mockClient: OpenCodeClient = {
      config: {
        providers: vi.fn().mockResolvedValue({
          data: {
            providers: [
              { id: 'anthropic', models: { 'claude-3': { limit: { context: 200000 } } } },
            ],
          },
        }),
      } as never,
    }

    const result = await fetchContextPercent(
      mockClient,
      sessionStore,
      '/test/dir',
      'ses_cache',
    )

    expect(result?.pct).toBe(10) // 20000 / 200000 * 100
    expect(mockClient.config?.providers).not.toHaveBeenCalled()
    expect(mockClient.session?.messages).toBeUndefined() // Should not call messages API
  })

  it('falls back to messages API when cache unavailable', async () => {
    const sessionStore = new SessionStore({ max: 10 })

    const mockClient: OpenCodeClient = {
      config: {
        providers: vi.fn().mockResolvedValue({
          data: {
            providers: [
              { id: 'anthropic', models: { 'claude-3': { limit: { context: 200000 } } } },
            ],
          },
        }),
      } as never,
      session: {
        messages: vi.fn().mockResolvedValue({
          data: [
            createMockMessage('assistant', {
              info: {
                role: 'assistant',
                providerID: 'anthropic',
                modelID: 'claude-3',
                tokens: { input: 30000 },
              },
            }),
          ],
        }),
      } as never,
    }

    const result = await fetchContextPercent(
      mockClient,
      sessionStore,
      '/test/dir',
      'ses_fallback',
    )

    expect(result?.pct).toBe(15) // 30000 / 200000 * 100
  })
})

describe('formatTokenCount', () => {
  it('formats millions with 1 decimal', () => {
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
  })

  it('formats thousands with K suffix', () => {
    expect(formatTokenCount(2_500)).toBe('3K') // Math.round(2500/1000) = 3
    expect(formatTokenCount(2_000)).toBe('2K')
  })

  it('formats small numbers without suffix', () => {
    expect(formatTokenCount(500)).toBe('500')
  })
})

describe('formatContextUsage', () => {
  it('formats usage without warning when pct <= 45', () => {
    const info = { pct: 30, used: 60000, contextLimit: 200000 }
    expect(formatContextUsage(info)).toBe('Context: 30% used (60K/200K)')
  })

  it('adds warning emoji when pct > 45', () => {
    const info = { pct: 50, used: 100000, contextLimit: 200000 }
    expect(formatContextUsage(info)).toBe('Context: 50% used (100K/200K) ⚠️')
  })

  it('returns null when info is null', () => {
    expect(formatContextUsage(null)).toBeNull()
  })
})
