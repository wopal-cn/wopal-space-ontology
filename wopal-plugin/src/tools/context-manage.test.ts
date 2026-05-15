import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _clearPendingConfirmation,
  _getPendingConfirmation,
  _setPendingConfirmation,
} from '../memory/distill.js';
import { createContextManageTool } from './context-manage.js';
import { existsSync, readFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute;
}

function makeUserMsg(parts: Array<{ type: string; text?: string; synthetic?: boolean }>) {
  return { info: { role: 'user' }, parts };
}

function makeAssistantMsg(parts: Array<{ type: string; text?: string }>) {
  return { info: { role: 'assistant' }, parts };
}

const mockComplete = vi.fn();
const mockMessages = vi.fn();
const mockUpdate = vi.fn();

const distillLLM = { complete: mockComplete };
const summaryClient = {
  session: { messages: mockMessages, update: mockUpdate },
};

const summaryCtx = { sessionID: 'ses-summary-test' } as { sessionID: string };

describe('context_manage: handleSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue('测试会话摘要');
    mockUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out synthetic parts from user messages', async () => {
    const messages = [
      makeUserMsg([
        { type: 'text', text: '真实用户消息' },
        { type: 'text', text: '[WOPAL TASK COMPLETED] 任务完成', synthetic: true },
      ]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).not.toContain('WOPAL TASK COMPLETED');
    expect(mockComplete).toHaveBeenCalledOnce();
    const promptArg = mockComplete.mock.calls[0][0] as string;
    expect(promptArg).toContain('真实用户消息');
    expect(promptArg).not.toContain('WOPAL TASK');
  });

  it('skips compaction messages entirely', async () => {
    const messages = [
      makeUserMsg([{ type: 'compaction' }, { type: 'text', text: '压缩消息内容' }]),
      makeUserMsg([{ type: 'text', text: '最新用户消息' }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    await execute({ action: 'summary' }, summaryCtx);

    const promptArg = mockComplete.mock.calls[0][0] as string;
    expect(promptArg).not.toContain('压缩消息内容');
    expect(promptArg).toContain('最新用户消息');
  });

  it('truncates from tail keeping latest messages', async () => {
    // 3 messages with unique markers to verify truncation behavior
    const oldText = 'X'.repeat(5000); // Will be truncated
    const newText = 'Y'.repeat(1000); // Will be kept
    const messages = [
      makeUserMsg([{ type: 'text', text: oldText }]),
      makeUserMsg([{ type: 'text', text: newText }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    await execute({ action: 'summary' }, summaryCtx);

    const promptArg = mockComplete.mock.calls[0][0] as string;
    // Combined: 5000 + 10 (sep) + 1000 = 6010; slice(-3000) → last 3000 chars
    // That's ~1990 X's + separator + 1000 Y's. Y should definitely be present.
    expect(promptArg).toContain('YYY');
    // X content is present due to overlap (5000 > 3000 - 1000 - 10)
    // Instead verify truncation happened at all: combined is 6010 but prompt user text < 3100
    const userMsgSection = promptArg.split('用户消息：\n')[1]?.split('\n\n要求：')[0] ?? '';
    expect(userMsgSection.length).toBeLessThanOrEqual(3000);
  });

  it('returns message for empty sessions', async () => {
    mockMessages.mockResolvedValue({ data: [] });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).toContain('No messages');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('returns message when no user messages exist', async () => {
    const messages = [
      makeAssistantMsg([{ type: 'text', text: '助手回复' }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).toContain('No user messages');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  });

// --- Dump action tests ---

const dumpMockMessages = vi.fn();
const dumpMockGet = vi.fn();

const dumpClient = {
  session: { messages: dumpMockMessages, get: dumpMockGet },
};

const dumpCtx = { sessionID: 'ses_test1' } as { sessionID: string };
const testTmpDir = join(tmpdir(), 'wopal-test-dump');

describe('context_manage: handleDump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dumpMockMessages.mockResolvedValue({ data: [] });
    dumpMockGet.mockResolvedValue({ data: { title: 'Test Session' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try { rmSync(testTmpDir, { recursive: true, force: true }); } catch {}
  });

  it('U1: dumps session with snapshot and messages', async () => {
    const snapshots = new Map<string, string[]>();
    snapshots.set('ses_test1', ['env content', 'Instructions from: AGENTS.md\nrule content']);
    const msgs = [
      makeUserMsg([{ type: 'text', text: 'hello' }]),
      makeAssistantMsg([{ type: 'text', text: 'world' }]),
    ];
    dumpMockMessages.mockResolvedValue({ data: msgs });

    const tool = createContextManageTool(distillLLM, dumpClient, snapshots, new Map(), new Map(), new Map(), testTmpDir);
    const execute = getExecute(tool);
    const result = await execute({ action: 'dump' }, dumpCtx);

    expect(result).toContain('Context dumped to');
    expect(result).toContain('ses_test1');
    expect(result).toContain('System prompt:** parsed from 2 raw blocks');
    expect(result).toContain('Messages:** 2');

    const files = findDumpFiles(join(testTmpDir, 'logs'), 'CTXDUMP');
    expect(files.length).toBe(1);
    const content = readFileSync(files[0], 'utf-8');
    expect(content).toContain('# Context Dump');
    expect(content).toContain('ses_test1');
    expect(content).toContain('Test Session');
    expect(content).toContain('env content');
    expect(content).toContain('Sources:');
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('hello');
    expect(content).toContain('world');
  });

  it('U2: converts wopal-task-xxx session_id to ses_xxx', async () => {
    const snapshots = new Map<string, string[]>();
    snapshots.set('ses_abc123', ['system content']);

    const tool = createContextManageTool(distillLLM, dumpClient, snapshots, new Map(), new Map(), new Map(), testTmpDir);
    const execute = getExecute(tool);
    const result = await execute({ action: 'dump', session_id: 'wopal-task-abc123' }, dumpCtx);

    expect(result).toContain('ses_abc123');
    expect(result).not.toContain('wopal-task-abc123');

    const files = findDumpFiles(join(testTmpDir, 'logs'), 'CTXDUMP-TASK');
    expect(files.length).toBe(1);
    const content = readFileSync(files[0], 'utf-8');
    expect(content).toContain('system content');
  });

  it('U3: graceful degradation when no snapshot', async () => {
    const snapshots = new Map<string, string[]>();

    const tool = createContextManageTool(distillLLM, dumpClient, snapshots, new Map(), new Map(), new Map(), testTmpDir);
    const execute = getExecute(tool);
    const result = await execute({ action: 'dump', session_id: 'ses_nonexist' }, dumpCtx);

    expect(result).toContain('Context dumped to');
    const files = findDumpFiles(join(testTmpDir, 'logs'), 'CTXDUMP');
    expect(files.length).toBe(1);
    const content = readFileSync(files[0], 'utf-8');
    expect(content).toContain('No snapshot available');
  });

  it('U4: graceful degradation when client API fails', async () => {
    const snapshots = new Map<string, string[]>();
    snapshots.set('ses_test1', ['sys content']);
    dumpMockGet.mockRejectedValue(new Error('API error'));
    dumpMockMessages.mockResolvedValue({ data: null });

    const tool = createContextManageTool(distillLLM, dumpClient, snapshots, new Map(), new Map(), new Map(), testTmpDir);
    const execute = getExecute(tool);
    const result = await execute({ action: 'dump' }, dumpCtx);

    expect(result).toContain('Context dumped to');
    const files = findDumpFiles(join(testTmpDir, 'logs'), 'CTXDUMP');
    expect(files.length).toBe(1);
    const content = readFileSync(files[0], 'utf-8');
    expect(content).toContain('sys content');
    expect(content).toContain('No messages');
  });

  });

function findDumpFiles(dir: string, pattern: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.includes(pattern))
    .map((f: string) => join(dir, f));
}