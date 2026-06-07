import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearPendingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
} from '../../memory/distill.js';
import { createMemoryManageTool } from './index.js';

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute;
}

const mockMessages = vi.fn();
const client = {
  session: { messages: mockMessages },
};

describe('memory_manage: distill/confirm/cancel', () => {
  afterEach(() => {
    clearPendingConfirmation('ses-test');
    vi.restoreAllMocks();
  });

  it('prevents duplicate concurrent confirm for same session', async () => {
    let resolveConfirm: ((value: { created: number; merged: number; skipped: number; mergeDetails: Array<{ existingId: string; existingPreview: string; mergedPreview: string }> }) => void) | undefined;
    const confirmCandidates = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    setPendingConfirmation('ses-test', {
      title: 'test title',
      candidates: [
        {
          category: 'knowledge',
          body: '## [技术知识]: 测试\n这是一个用于验证 confirm 重入保护的候选记忆正文，长度足够。',
          tags: ['test'],
          importance: 0.7,
        },
      ],
    });

    const mockStore = {
      searchByQuery: vi.fn().mockResolvedValue([]),
    } as never;

    const tool = createMemoryManageTool(
      mockStore,
      undefined,
      undefined,
      { confirmCandidates } as never,
      undefined,
      client,
    );
    const execute = getExecute(tool);

    const first = execute({ command: 'confirm' }, { sessionID: 'ses-test' });
    await Promise.resolve();

    const second = await execute({ command: 'confirm' }, { sessionID: 'ses-test' });

    expect(second).toBe('⚠️ Distillation confirm is already running for this session. Wait for it to finish.');
    expect(getPendingConfirmation('ses-test')).toBeUndefined();

    resolveConfirm?.({ created: 1, merged: 0, skipped: 0, mergeDetails: [] });
    const firstResult = await first;

    expect(firstResult).toContain('Distillation Complete');
    expect(confirmCandidates).toHaveBeenCalledTimes(1);
    expect(getPendingConfirmation('ses-test')).toBeUndefined();
  });
});