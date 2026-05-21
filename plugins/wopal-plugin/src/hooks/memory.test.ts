import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { injectMemoryToMessage, type MemoryMessageInjectorContext } from './memory-message-injector.js';
import { SessionStore } from '../session-store.js';
import type { MessageWithInfo } from './message-context.js';
import type { MemoryInjector } from '../memory/index.js';
import type { LoggerInstance } from '../logger.js';

function createMockLogger(): LoggerInstance {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

let savedInjectionEnv: Record<string, string | undefined>;

function saveAndClearInjectionEnv() {
  savedInjectionEnv = {
    WOPAL_RULES_INJECTION_ENABLED: process.env.WOPAL_RULES_INJECTION_ENABLED,
    WOPAL_MEMORY_INJECTION_ENABLED: process.env.WOPAL_MEMORY_INJECTION_ENABLED,
  };
  delete process.env.WOPAL_RULES_INJECTION_ENABLED;
  delete process.env.WOPAL_MEMORY_INJECTION_ENABLED;
}

function restoreInjectionEnv() {
  if (savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_RULES_INJECTION_ENABLED = savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED;
  }
  if (savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_MEMORY_INJECTION_ENABLED = savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED;
  }
}

// Helper: create a memory message injector context with mocked dependencies
function createMemoryCtx(opts?: {
  retrieveAndFormat?: ReturnType<typeof vi.fn>;
  isEmpty?: ReturnType<typeof vi.fn>;
  isChildSession?: boolean;
  memoryInjectionEnabled?: boolean;
}) {
  const sessionStore = new SessionStore({ max: 10 });
  const childSessionCache = new Map<string, boolean>();

  if (opts?.isChildSession !== undefined) {
    // Will be set per session in tests
  }

  const memoryInjector = {
    isEmpty: opts?.isEmpty ?? vi.fn().mockResolvedValue(false),
    retrieveAndFormat:
      opts?.retrieveAndFormat ??
      vi.fn().mockResolvedValue('Relevant memories (ordered by relevance, first is most relevant):\n\n```markdown\n- test memory\n```'),
  } as unknown as MemoryInjector;

  const ctx: MemoryMessageInjectorContext = {
    memoryInjectorCtx: {
      client: {
        session: {
          get: vi.fn().mockResolvedValue({ data: {} }),
        },
      } as any,
      sessionStore,
      memoryLogger: createMockLogger(),
      memoryInjector,
      childSessionCache,
      taskManager: undefined,
    },
    memoryInjector,
    sessionStore,
    memoryLogger: createMockLogger(),
    memoryInjectionEnabled: opts?.memoryInjectionEnabled ?? true,
  };

  return { ctx, sessionStore, childSessionCache, memoryInjector };
}

function createUserMsg(text: string): MessageWithInfo {
  return {
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

describe('injectMemoryToMessage', () => {
  beforeEach(() => {
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    restoreInjectionEnv();
  });

  it('stores injectedRawText after successful injection', async () => {
    const { ctx, sessionStore } = createMemoryCtx();

    sessionStore.upsert('ses_1', (state) => {
      state.lastUserPrompt = 'show me memory';
      state.needsMemoryInjection = true;
    });

    const lastUserMsg = createUserMsg('show me memory');
    const messages: MessageWithInfo[] = [
      { role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
      lastUserMsg,
    ];

    await injectMemoryToMessage(ctx, 'ses_1', messages, lastUserMsg);

    // Should have a synthetic part with <memory-context> wrapper
    expect(lastUserMsg.parts!.length).toBe(2);
    const injected = lastUserMsg.parts![1]!;
    expect(injected.synthetic).toBe(true);
    expect(injected.text).toContain('<memory-context>');
    expect(injected.text).toContain('Relevant memories (ordered by relevance');
    expect(injected.text).toContain('</memory-context>');

    expect(sessionStore.get('ses_1')?.injectedRawText).toContain('Relevant memories (ordered by relevance');
    expect(sessionStore.get('ses_1')?.needsMemoryInjection).toBe(false);
  });

  it('clears injectedRawText when current turn skips memory injection (command)', async () => {
    const { ctx, sessionStore } = createMemoryCtx();

    sessionStore.upsert('ses_2', (state) => {
      state.lastUserPrompt = '/memory list';
      state.needsMemoryInjection = true;
      state.injectedRawText = 'old memory';
    });

    const lastUserMsg = createUserMsg('/memory list');
    const messages: MessageWithInfo[] = [lastUserMsg];

    await injectMemoryToMessage(ctx, 'ses_2', messages, lastUserMsg);

    // No extra part should be added (command is filtered by buildEnrichedQuery)
    expect(lastUserMsg.parts!.length).toBe(1);
    expect(sessionStore.get('ses_2')?.injectedRawText).toBeUndefined();
  });

  it('clears injectedRawText when no relevant memories are found', async () => {
    const { ctx, sessionStore } = createMemoryCtx({
      retrieveAndFormat: vi.fn().mockResolvedValue(undefined),
    });

    sessionStore.upsert('ses_3', (state) => {
      state.lastUserPrompt = 'unrelated query';
      state.needsMemoryInjection = true;
      state.injectedRawText = 'old memory';
    });

    const lastUserMsg = createUserMsg('unrelated query');
    const messages: MessageWithInfo[] = [lastUserMsg];

    await injectMemoryToMessage(ctx, 'ses_3', messages, lastUserMsg);

    expect(lastUserMsg.parts!.length).toBe(1);
    expect(sessionStore.get('ses_3')?.injectedRawText).toBeUndefined();
  });

  it('skips memory injection for child sessions (task tool)', async () => {
    const retrieveAndFormat = vi.fn().mockResolvedValue('<memory>');
    const { ctx, sessionStore, childSessionCache } = createMemoryCtx({
      retrieveAndFormat,
    });
    childSessionCache.set('ses_child', true);

    sessionStore.upsert('ses_child', (state) => {
      state.lastUserPrompt = 'do something';
      state.needsMemoryInjection = true;
    });

    const lastUserMsg = createUserMsg('do something');
    const messages: MessageWithInfo[] = [lastUserMsg];

    await injectMemoryToMessage(ctx, 'ses_child', messages, lastUserMsg);

    expect(lastUserMsg.parts!.length).toBe(1);
    expect(retrieveAndFormat).not.toHaveBeenCalled();
    expect(sessionStore.get('ses_child')?.injectedRawText).toBeUndefined();
  });

  it('does not inject when needsMemoryInjection flag is false', async () => {
    const retrieveAndFormat = vi.fn().mockResolvedValue('# memory');
    const { ctx, sessionStore } = createMemoryCtx({ retrieveAndFormat });

    sessionStore.upsert('ses_4', (state) => {
      state.lastUserPrompt = 'hello';
      state.needsMemoryInjection = false;
    });

    const lastUserMsg = createUserMsg('hello');
    const messages: MessageWithInfo[] = [lastUserMsg];

    await injectMemoryToMessage(ctx, 'ses_4', messages, lastUserMsg);

    expect(lastUserMsg.parts!.length).toBe(1);
    expect(retrieveAndFormat).not.toHaveBeenCalled();
  });

  it('skips injection when memoryInjectionEnabled is false', async () => {
    const retrieveAndFormat = vi.fn().mockResolvedValue('# memory');
    const { ctx, sessionStore } = createMemoryCtx({
      retrieveAndFormat,
      memoryInjectionEnabled: false,
    });

    sessionStore.upsert('ses_5', (state) => {
      state.lastUserPrompt = 'hello';
      state.needsMemoryInjection = true;
    });

    const lastUserMsg = createUserMsg('hello');
    const messages: MessageWithInfo[] = [lastUserMsg];

    await injectMemoryToMessage(ctx, 'ses_5', messages, lastUserMsg);

    expect(lastUserMsg.parts!.length).toBe(1);
    expect(retrieveAndFormat).not.toHaveBeenCalled();
    // Flag not consumed when disabled
    expect(sessionStore.get('ses_5')?.needsMemoryInjection).toBe(true);
  });

  it('clears injectedRawText when lastUserMsg is undefined', async () => {
    const { ctx, sessionStore } = createMemoryCtx();

    sessionStore.upsert('ses_6', (state) => {
      state.lastUserPrompt = 'hello';
      state.needsMemoryInjection = true;
      state.injectedRawText = 'old memory';
    });

    await injectMemoryToMessage(ctx, 'ses_6', [], undefined);

    expect(sessionStore.get('ses_6')?.injectedRawText).toBeUndefined();
  });

  it('uses messages parameter for enriched query (not API)', async () => {
    const retrieveAndFormat = vi.fn().mockResolvedValue('# memory');
    const { ctx, sessionStore } = createMemoryCtx({ retrieveAndFormat });

    sessionStore.upsert('ses_7', (state) => {
      state.lastUserPrompt = 'what did we discuss?';
      state.needsMemoryInjection = true;
    });

    const lastUserMsg = createUserMsg('what did we discuss?');
    const messages: MessageWithInfo[] = [
      { role: 'user', parts: [{ type: 'text', text: 'previous question' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'previous answer' }] },
      lastUserMsg,
    ];

    await injectMemoryToMessage(ctx, 'ses_7', messages, lastUserMsg);

    expect(retrieveAndFormat).toHaveBeenCalledTimes(1);
    // The enriched query should contain context from the messages
    const enrichedQuery = retrieveAndFormat.mock.calls[0]![0] as string;
    expect(enrichedQuery).toContain('what did we discuss?');
  });
});