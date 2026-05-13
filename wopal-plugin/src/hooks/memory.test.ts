import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createSystemTransformHooks } from './system-transform.js';
import { createHookContext } from './index.js';
import { SessionStore } from '../session-store.js';

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

// Helper: create a hook context with mocked memory injector
function createHooksWithMemory(opts?: {
  formatForSystem?: ReturnType<typeof vi.fn>;
  isEmpty?: ReturnType<typeof vi.fn>;
  isChildSession?: ReturnType<typeof vi.fn>;
}) {
  const sessionStore = new SessionStore({ max: 10 });
  const ctx = createHookContext({
    client: {
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
      tool: { ids: vi.fn().mockResolvedValue({ data: [] }) },
      mcp: { status: vi.fn().mockResolvedValue({ data: {} }) },
    } as any,
    directory: '/tmp',
    projectDirectory: '/tmp',
    ruleFiles: [],
    sessionStore,
    debugLog: () => {},
    memoryInjector: {
      isEmpty: opts?.isEmpty ?? vi.fn().mockResolvedValue(false),
      formatForSystem:
        opts?.formatForSystem ??
        vi.fn().mockResolvedValue('<system-reminder>\n# 相关记忆\n\n## 知识\n\n- test memory\n\n</system-reminder>'),
    } as any,
  });

  const hooks = createSystemTransformHooks(ctx as never);

  return { hooks, sessionStore, ctx };
}

describe('OpenCodeRulesRuntime memory injection state', () => {
  beforeEach(() => {
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    restoreInjectionEnv();
  });

  it('stores injectedRawText after successful injection', async () => {
    const { hooks, sessionStore } = createHooksWithMemory();

    sessionStore.upsert('ses_1', (state) => {
      state.lastUserPrompt = 'show me memory';
      state.needsMemoryInjection = true;
    });

    const result = await hooks._onSystemTransform(
      { sessionID: 'ses_1', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system.join('\n')).toContain('# 相关记忆');
    expect(sessionStore.get('ses_1')?.injectedRawText).toContain('# 相关记忆');
  });

  it('clears injectedRawText when current turn skips memory injection', async () => {
    const { hooks, sessionStore } = createHooksWithMemory();

    sessionStore.upsert('ses_2', (state) => {
      state.lastUserPrompt = '/memory list';
      state.needsMemoryInjection = true;
      state.injectedRawText = '<system-reminder>old memory</system-reminder>';
    });

    const result = await hooks._onSystemTransform(
      { sessionID: 'ses_2', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(sessionStore.get('ses_2')?.injectedRawText).toBeUndefined();
  });

  it('clears injectedRawText when no relevant memories are found', async () => {
    const { hooks, sessionStore } = createHooksWithMemory({
      formatForSystem: vi.fn().mockResolvedValue(undefined),
    });

    sessionStore.upsert('ses_3', (state) => {
      state.lastUserPrompt = 'unrelated query';
      state.needsMemoryInjection = true;
      state.injectedRawText = '<system-reminder>old memory</system-reminder>';
    });

    const result = await hooks._onSystemTransform(
      { sessionID: 'ses_3', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(sessionStore.get('ses_3')?.injectedRawText).toBeUndefined();
  });

  it('skips memory injection for child sessions (task tool)', async () => {
    const formatForSystem = vi.fn().mockResolvedValue('<memory>');
    const { hooks, sessionStore, ctx } = createHooksWithMemory({
      formatForSystem,
    });
    // Override isChildSession
    ctx.childSessionCache.set('ses_child', true);

    sessionStore.upsert('ses_child', (state) => {
      state.lastUserPrompt = 'do something';
      state.needsMemoryInjection = true;
    });

    const result = await hooks._onSystemTransform(
      { sessionID: 'ses_child', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(formatForSystem).not.toHaveBeenCalled();
    expect(sessionStore.get('ses_child')?.injectedRawText).toBeUndefined();
  });

  it('does not call buildEnrichedQuery for child sessions', async () => {
    const { hooks, sessionStore, ctx } = createHooksWithMemory();
    ctx.childSessionCache.set('ses_child2', true);

    sessionStore.upsert('ses_child2', (state) => {
      state.lastUserPrompt = 'hello';
      state.needsMemoryInjection = true;
    });

    const result = await hooks._onSystemTransform(
      { sessionID: 'ses_child2', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    // For child sessions, should skip memory injection entirely
    expect(result.system).toEqual(['Base prompt.']);
    expect(sessionStore.get('ses_child2')?.injectedRawText).toBeUndefined();
  });
});