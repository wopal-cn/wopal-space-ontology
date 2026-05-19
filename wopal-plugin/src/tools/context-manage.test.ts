import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _clearPendingConfirmation,
  _getPendingConfirmation,
  _setPendingConfirmation,
} from '../memory/distill.js';
import { createContextManageTool } from './context-manage.js';
import { SessionStore } from '../session-store.js';
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

// --- Status action tests ---

describe('context_manage: handleStatus', () => {
  it('S1: returns complete status for populated session state', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.upsert('ses_status_test', (state) => {
      state.agent = 'fae';
      state.isCompacting = false;
      state.providerID = 'anthropic';
      state.modelID = 'claude-sonnet';
      state.contextLimit = 200000;
      state.lastTokens = {
        input: 1234,
        output: 567,
        cache: { read: 89, write: 21 },
        updatedAt: Date.now(),
      };
      state.loadedSkills.add('project-worktrees');
      state.loadedSkills.add('another-skill');
    });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status' },
      { sessionID: 'ses_status_test', sessionStore: statusSessionStore },
    );

    expect(JSON.parse(result)).toEqual({
      sessionID: 'ses_status_test',
      agent: 'fae',
      isCompacting: false,
      lastTokens: {
        input: 1234,
        output: 567,
        cache: { read: 89, write: 21 },
      },
      model: {
        provider: 'anthropic',
        id: 'claude-sonnet',
      },
      loadedSkills: 2,
      pct: 1,
    });
  });

  it('S2: returns defaults when session state is missing', async () => {
    const statusSessionStore = new SessionStore();

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status' },
      { sessionID: 'ses_missing_status', sessionStore: statusSessionStore },
    );

    expect(JSON.parse(result)).toEqual({
      sessionID: 'ses_missing_status',
      agent: null,
      isCompacting: false,
      lastTokens: {
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      },
      model: {
        provider: null,
        id: null,
      },
      loadedSkills: 0,
      pct: null,
    });
  });

  it('S3: reflects compacting state correctly', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.markCompacting('ses_compacting_status', Date.now());

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status', session_id: 'ses_compacting_status' },
      { sessionID: 'ses_main', sessionStore: statusSessionStore },
    );

    expect(JSON.parse(result)).toMatchObject({
      sessionID: 'ses_compacting_status',
      isCompacting: true,
      pct: null,
    });
  });

  it('S4: main session includes tasks array when taskManager provided', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.upsert('ses_main_session', (state) => {
      state.agent = 'wopal';
      state.providerID = 'anthropic';
      state.modelID = 'claude-sonnet';
      state.lastTokens = {
        input: 5000,
        output: 1000,
        updatedAt: Date.now(),
      };
    });

    // Mock taskManager
    const mockTaskManager = {
      findBySession: vi.fn().mockReturnValue(undefined),
      listTasksForParent: vi.fn().mockReturnValue([
        { taskID: 'task-abc123', sessionID: 'ses_abc123', status: 'idle', description: 'Test task', agent: 'fae' },
        { taskID: 'task-def456', sessionID: 'ses_def456', status: 'running', description: 'Another task', agent: 'fae' },
      ]),
    };

    const tool = createContextManageTool(distillLLM, summaryClient, undefined, undefined, undefined, undefined, undefined, statusSessionStore, mockTaskManager as unknown as import('../tasks/simple-task-manager.js').SimpleTaskManager);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status' },
      { sessionID: 'ses_main_session', sessionStore: statusSessionStore },
    );

    const parsed = JSON.parse(result);
    expect(parsed.sessionID).toBe('ses_main_session');
    expect(parsed.tasks).toBeDefined();
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0]).toEqual({
      taskID: 'task-abc123',
      sessionID: 'ses_abc123',
      status: 'idle',
      description: 'Test task',
      agent: 'fae',
    });
    expect(mockTaskManager.listTasksForParent).toHaveBeenCalledWith('ses_main_session');
  });

  it('S5: child session does not include tasks array', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.upsert('ses_child123', (state) => {
      state.agent = 'fae';
      state.providerID = 'anthropic';
      state.modelID = 'claude-sonnet';
    });

    const mockTaskManager = {
      findBySession: vi.fn().mockReturnValue(undefined),
      listTasksForParent: vi.fn(),
    };

    const tool = createContextManageTool(distillLLM, summaryClient, undefined, undefined, undefined, undefined, undefined, statusSessionStore, mockTaskManager as unknown as import('../tasks/simple-task-manager.js').SimpleTaskManager);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status', session_id: 'wopal-task-child123' },
      { sessionID: 'ses_main', sessionStore: statusSessionStore },
    );

    const parsed = JSON.parse(result);
    expect(parsed.sessionID).toBe('ses_child123');
    expect(parsed.tasks).toBeUndefined();
    expect(mockTaskManager.listTasksForParent).not.toHaveBeenCalled();
  });

  it('S5b: raw child session ID is detected via session parentID', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.upsert('ses_child_raw', (state) => {
      state.agent = 'fae';
    });

    const mockTaskManager = {
      listTasksForParent: vi.fn(),
      findBySession: vi.fn().mockReturnValue(undefined),
    };

    const clientWithGet = {
      session: {
        ...summaryClient.session,
        get: vi.fn().mockResolvedValue({ data: { parentID: 'ses_parent' } }),
      },
    };

    const tool = createContextManageTool(distillLLM, clientWithGet, undefined, undefined, undefined, undefined, undefined, statusSessionStore, mockTaskManager as unknown as import('../tasks/simple-task-manager.js').SimpleTaskManager);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status', session_id: 'ses_child_raw' },
      { sessionID: 'ses_main', sessionStore: statusSessionStore },
    );

    const parsed = JSON.parse(result);
    expect(parsed.sessionID).toBe('ses_child_raw');
    expect(parsed.tasks).toBeUndefined();
    expect(mockTaskManager.listTasksForParent).not.toHaveBeenCalled();
  });

  it('S6: main session without taskManager omits tasks array', async () => {
    const statusSessionStore = new SessionStore();
    statusSessionStore.upsert('ses_no_manager', (state) => {
      state.agent = 'wopal';
    });

    const tool = createContextManageTool(distillLLM, summaryClient, undefined, undefined, undefined, undefined, undefined, statusSessionStore);
    const execute = getExecute(tool);
    const result = await execute(
      { action: 'status' },
      { sessionID: 'ses_no_manager', sessionStore: statusSessionStore },
    );

    const parsed = JSON.parse(result);
    expect(parsed.sessionID).toBe('ses_no_manager');
    expect(parsed.tasks).toBeUndefined();
  });
});

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

// --- Compact action tests (Task 2) ---

const compactMockSummarize = vi.fn();
const compactMockGet = vi.fn();
const compactMockMessages = vi.fn();
const compactMockConfigProviders = vi.fn();

const compactClient = {
  session: {
    summarize: compactMockSummarize,
    get: compactMockGet,
    messages: compactMockMessages,
  },
  config: {
    providers: compactMockConfigProviders,
  },
};

const compactCtx = { sessionID: 'ses_compact_test' } as { sessionID: string };
const compactSessionStore = new SessionStore();
const compactTestDir = join(tmpdir(), 'wopal-test-compact');

describe('context_manage: handleCompact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compactSessionStore.reset();
    compactMockSummarize.mockResolvedValue({});
    compactMockGet.mockResolvedValue({ data: { id: 'ses_compact_test' } });
    compactMockMessages.mockResolvedValue({ data: [] });
    compactMockConfigProviders.mockResolvedValue({
      data: {
        providers: [
          {
            id: 'test-provider',
            models: {
              'test-model': { limit: { context: 100000 } },
            },
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C1: main session schedules deferred compact instead of calling summarize immediately', async () => {
    // Setup: sessionStore has model info from step-finish event
    compactSessionStore.upsert('ses_compact_test', (state) => {
      state.providerID = 'test-provider';
      state.modelID = 'test-model';
      state.lastTokens = { input: 50000, output: 1000, updatedAt: Date.now() };
    });

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    // Inject sessionStore via tool context (will be added in implementation)
    const execute = getExecute(tool);

    // Pass sessionStore in context (simulating runtime injection)
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };
    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(compactMockSummarize).not.toHaveBeenCalled();
    expect(compactSessionStore.get('ses_compact_test')?.pendingCompactTrigger).toBe('plugin');
    expect(result).toContain('Context: 50%');
    expect(result).toContain('Compacting session');
    expect(result).toContain('scheduled');
  });

  it('C2: normalizes wopal-task-xxx session_id to ses_xxx', async () => {
    compactSessionStore.upsert('ses_task123', (state) => {
      state.providerID = 'test-provider';
      state.modelID = 'test-model';
      state.lastTokens = { input: 30000, output: 500, updatedAt: Date.now() };
    });

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { sessionID: 'ses_main', sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact', session_id: 'wopal-task-task123' }, contextWithStore);

    expect(compactSessionStore.get('ses_task123')?.isCompacting).toBe(true);
    expect(compactMockSummarize).toHaveBeenCalledWith({
      path: { id: 'ses_task123' },
      body: { providerID: 'test-provider', modelID: 'test-model' },
    });
    expect(result).toContain('Context: 30%');
  });

  it('C3: returns error when session does not exist in sessionStore', async () => {
    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(compactMockSummarize).not.toHaveBeenCalled();
    expect(result).toContain('Failed: session not found');
  });

  it('C4: prevents double-compaction when isCompacting=true', async () => {
    compactSessionStore.markCompacting('ses_compact_test', Date.now());

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(compactMockSummarize).not.toHaveBeenCalled();
    expect(result).toContain('Already compacting');
  });

  it('C5: returns error when summarize API unavailable', async () => {
    compactSessionStore.upsert('ses_compact_test', (state) => {
      state.providerID = 'test-provider';
      state.modelID = 'test-model';
    });

    const clientWithoutSummarize = {
      session: {
        get: compactMockGet,
        messages: compactMockMessages,
      },
    };

    const tool = createContextManageTool(
      distillLLM,
      clientWithoutSummarize,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(result).toContain('Failed: session.summarize API unavailable');
  });

  it('C6: reports current context usage percentage before compaction', async () => {
    compactSessionStore.upsert('ses_compact_test', (state) => {
      state.providerID = 'test-provider';
      state.modelID = 'test-model';
      state.lastTokens = { input: 75000, output: 2000, updatedAt: Date.now() };
    });

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(result).toContain('Context: 75%');
    expect(result).toContain('used ⚠️');
  });

  it('C7: main session handles missing provider/model info by scheduling deferred compact', async () => {
    compactSessionStore.upsert('ses_compact_test', (state) => {
      state.lastTokens = { input: 50000, output: 1000, updatedAt: Date.now() };
    });

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { ...compactCtx, sessionStore: compactSessionStore };

    const result = await execute({ action: 'compact' }, contextWithStore);

    expect(compactMockSummarize).not.toHaveBeenCalled();
    expect(compactSessionStore.get('ses_compact_test')?.pendingCompactTrigger).toBe('plugin');
    expect(result).toContain('scheduled');
  });

  it('C8: child session with missing provider/model info still calls summarize immediately', async () => {
    compactSessionStore.upsert('ses_task123', (state) => {
      state.lastTokens = { input: 50000, output: 1000, updatedAt: Date.now() };
    });

    const tool = createContextManageTool(
      distillLLM,
      compactClient,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { sessionID: 'ses_main', sessionStore: compactSessionStore };

    await execute({ action: 'compact', session_id: 'wopal-task-task123' }, contextWithStore);

    expect(compactMockSummarize).toHaveBeenCalledWith({
      path: { id: 'ses_task123' },
      body: { providerID: '', modelID: '' },
    });
  });

  it('C9: raw child session ID is detected via session parentID and compacts immediately', async () => {
    compactSessionStore.upsert('ses_child_raw', (state) => {
      state.providerID = 'test-provider';
      state.modelID = 'test-model';
    });

    const clientWithGet = {
      ...compactClient,
      session: {
        ...compactClient.session,
        get: vi.fn().mockResolvedValue({ data: { parentID: 'ses_parent' } }),
      },
    };

    const tool = createContextManageTool(
      distillLLM,
      clientWithGet,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      compactTestDir,
    );
    const execute = getExecute(tool);
    const contextWithStore = { sessionID: 'ses_main', sessionStore: compactSessionStore };

    await execute({ action: 'compact', session_id: 'ses_child_raw' }, contextWithStore);

    expect(clientWithGet.session.summarize).toHaveBeenCalledWith({
      path: { id: 'ses_child_raw' },
      body: { providerID: 'test-provider', modelID: 'test-model' },
    });
  });
});
