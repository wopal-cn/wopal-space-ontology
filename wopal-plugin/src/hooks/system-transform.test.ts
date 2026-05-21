import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SystemPromptMetadata } from '../types.js';
import type { MessageWithInfo } from './message-context.js';
import type { LoggerInstance } from '../logger.js';
import { SessionStore } from '../session-store.js';
import { createSystemTransformHooks } from './system-transform.js';
import { writeContextDump } from '../tools/dump-formatter.js';

vi.mock('../tools/dump-formatter.js', () => ({
  writeContextDump: vi.fn().mockResolvedValue({
    filepath: '/tmp/dump.md',
    hasMetadata: true,
    parsedFromRaw: false,
    blockCount: 1,
    messageCount: 1,
  }),
}));

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

function createHooks(messages: MessageWithInfo[] = []) {
  const transformedMessagesMap = new Map<string, MessageWithInfo[]>();
  const systemSnapshots = new Map<string, string[]>();
  const systemMetadataMap = new Map<string, SystemPromptMetadata>();
  const systemInjectionsMap = new Map<string, string[]>();
  const contextLogger = createMockLogger();

  transformedMessagesMap.set('ses_1', messages);

  const hooks = createSystemTransformHooks({
    client: { session: {} },
    directory: '/tmp',
    projectDirectory: '/tmp',
    sessionStore: new SessionStore({ max: 10 }),
    memoryLogger: createMockLogger(),
    contextLogger,
    now: () => Date.now(),
    childSessionCache: new Map<string, boolean>(),
    taskManager: undefined,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    transformedMessagesMap,
  });

  return {
    hooks,
    transformedMessagesMap,
    contextLogger,
  };
}

function flushAutoDump(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('system-transform auto dump deduplication', () => {
  beforeEach(() => {
    process.env.WOPAL_PLUGIN_LOG_LEVEL = 'trace';
    process.env.WOPAL_PLUGIN_LOG_MODULES = 'context';
    vi.mocked(writeContextDump).mockClear();
  });

  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_LOG_LEVEL;
    delete process.env.WOPAL_PLUGIN_LOG_MODULES;
    vi.resetAllMocks();
  });

  it('skips duplicate auto dump when context fingerprint is unchanged', async () => {
    const { hooks, contextLogger } = createHooks([
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    expect(writeContextDump).toHaveBeenCalledTimes(1);
  });

  it('writes a new auto dump when transformed messages change', async () => {
    const { hooks, transformedMessagesMap } = createHooks([
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    transformedMessagesMap.set('ses_1', [
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
      {
        info: { role: 'assistant', sessionID: 'ses_1', id: 'msg_2' },
        parts: [{ type: 'text', text: 'world' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    expect(writeContextDump).toHaveBeenCalledTimes(2);
  });

  it('writes a new auto dump when system metadata changes', async () => {
    const { hooks } = createHooks([
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: {
          version: 1,
          sections: [
            { kind: 'custom', content: 'Base prompt.' },
            { kind: 'instruction', content: 'Updated instruction.' },
          ],
        },
      },
      { system: ['Base prompt.', 'Updated instruction.'] },
    );
    await flushAutoDump();

    expect(writeContextDump).toHaveBeenCalledTimes(2);
  });
});

describe('auto-dump gate: negative cases', () => {
  afterEach(() => {
    delete process.env.WOPAL_PLUGIN_LOG_LEVEL;
    delete process.env.WOPAL_PLUGIN_LOG_MODULES;
    vi.resetAllMocks();
  });

  it('does not trigger auto-dump when WOPAL_PLUGIN_LOG_MODULES is empty', async () => {
    process.env.WOPAL_PLUGIN_LOG_LEVEL = 'debug';
    // WOPAL_PLUGIN_LOG_MODULES intentionally not set
    vi.mocked(writeContextDump).mockClear();

    const { hooks } = createHooks([
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    expect(writeContextDump).not.toHaveBeenCalled();
  });

  it('does not trigger auto-dump when WOPAL_PLUGIN_LOG_MODULES is a non-context module', async () => {
    process.env.WOPAL_PLUGIN_LOG_LEVEL = 'debug';
    process.env.WOPAL_PLUGIN_LOG_MODULES = 'task';
    vi.mocked(writeContextDump).mockClear();

    const { hooks } = createHooks([
      {
        info: { role: 'user', sessionID: 'ses_1', id: 'msg_1' },
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    await hooks._onSystemTransform(
      {
        sessionID: 'ses_1',
        model: { providerID: 'test', modelID: 'test' } as never,
        systemMetadata: { version: 1, sections: [{ kind: 'custom', content: 'Base prompt.' }] },
      },
      { system: ['Base prompt.'] },
    );
    await flushAutoDump();

    expect(writeContextDump).not.toHaveBeenCalled();
  });
});
