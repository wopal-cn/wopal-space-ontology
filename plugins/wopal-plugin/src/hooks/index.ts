import { coreLogger, rulesLogger, taskLogger, memoryLogger, contextLogger, type LoggerInstance } from "../logger.js";
import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DiscoveredRule } from "../rules/index.js";
import type { SystemPromptMetadata, OpenCodeClient } from "../types.js";
import type { MessageWithInfo } from "./message-context.js";
import { createCommandHooks } from "./command-hooks.js";
import { createMessageHooks } from "./message-hooks.js";
import { createSystemTransformHooks } from "./system-transform.js";
import { createEventRouter } from "./event-router.js";
import { createCompactionHooks } from "./compaction.js";
import type { RuleInjectorContext } from "./rule-injector.js";
import type { MemoryInjectorContext } from "./memory-injection-utils.js";

export interface HookContextOptions {
  client: OpenCodeClient;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  coreLogger?: LoggerInstance;
  now?: () => number;
  taskManager?: SimpleTaskManager;
  memoryInjector?: MemoryInjector | undefined;
  systemSnapshots?: Map<string, string[]>;
  systemMetadataMap?: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]>;
  rulesInjectionEnabled?: boolean;    // Default true
  memoryInjectionEnabled?: boolean;   // Default true
}

export interface HookContext {
  client: OpenCodeClient;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  coreLogger: LoggerInstance;     // Plugin lifecycle (passed from index.ts)
  rulesLogger: LoggerInstance;      // Rule discovery and injection
  taskLogger: LoggerInstance;       // Task delegation and monitoring
  memoryLogger: LoggerInstance;     // Memory system (store, retrieval)
  contextLogger: LoggerInstance;    // Session state, snapshots, compaction
  now: () => number;
  taskManager: SimpleTaskManager | undefined;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  systemSnapshots: Map<string, string[]>;
  systemMetadataMap: Map<string, SystemPromptMetadata>;
  systemInjectionsMap: Map<string, string[]>;
  rulesInjectionEnabled: boolean;
  memoryInjectionEnabled: boolean;
}

export function createHookContext(opts: HookContextOptions): HookContext {
  return {
    client: opts.client,
    directory: opts.directory,
    projectDirectory: opts.projectDirectory,
    ruleFiles: opts.ruleFiles,
    sessionStore: opts.sessionStore,
    coreLogger: opts.coreLogger ?? coreLogger,
    rulesLogger: rulesLogger,
    taskLogger: taskLogger,
    memoryLogger: memoryLogger,
    contextLogger: contextLogger,
    now: opts.now ?? (() => Date.now()),
    taskManager: opts.taskManager ?? undefined,
    memoryInjector: opts.memoryInjector,
    childSessionCache: new Map<string, boolean>(),
    systemSnapshots: opts.systemSnapshots ?? new Map(),
    systemMetadataMap: opts.systemMetadataMap ?? new Map(),
    systemInjectionsMap: opts.systemInjectionsMap ?? new Map(),
    rulesInjectionEnabled: opts.rulesInjectionEnabled ?? true,
    memoryInjectionEnabled: opts.memoryInjectionEnabled ?? true,
  };
}

export interface AllHooksResult {
  [key: string]: unknown;
  hooks: Record<string, unknown>;
  transformedMessagesMap: Map<string, MessageWithInfo[]>;
}

export function createAllHooks(ctx: HookContext): AllHooksResult {
  // Shared map for transformed messages (contains synthetic parts)
  const transformedMessagesMap = new Map<string, MessageWithInfo[]>();

  const commandHooks = createCommandHooks({
    sessionStore: ctx.sessionStore,
    contextLogger: ctx.contextLogger,
    projectDirectory: ctx.projectDirectory,
  });

  const messageHooks = createMessageHooks({
    sessionStore: ctx.sessionStore,
    contextLogger: ctx.contextLogger,
    projectDirectory: ctx.projectDirectory,
    transformedMessagesMap,
    skillReloadCtx: {
      sessionStore: ctx.sessionStore,
      contextLogger: ctx.contextLogger,
    },
    ruleMessageCtx: {
      sessionStore: ctx.sessionStore,
      ruleInjectorCtx: {
        directory: ctx.directory,
        ruleFiles: ctx.ruleFiles,
        rulesLogger: ctx.rulesLogger,
      } satisfies RuleInjectorContext,
      client: ctx.client,
      taskManager: ctx.taskManager,
      childSessionCache: ctx.childSessionCache,
      rulesLogger: ctx.rulesLogger,
      rulesInjectionEnabled: ctx.rulesInjectionEnabled,
    },
    memoryMessageCtx: {
      memoryInjectorCtx: {
        client: ctx.client,
        sessionStore: ctx.sessionStore,
        memoryLogger: ctx.memoryLogger,
        memoryInjector: ctx.memoryInjector,
        childSessionCache: ctx.childSessionCache,
        taskManager: ctx.taskManager,
      } satisfies MemoryInjectorContext,
      memoryInjector: ctx.memoryInjector,
      sessionStore: ctx.sessionStore,
      memoryLogger: ctx.memoryLogger,
      memoryInjectionEnabled: ctx.memoryInjectionEnabled,
    },
  });

  const systemTransformHooks = createSystemTransformHooks({
    client: ctx.client,
    directory: ctx.directory,
    projectDirectory: ctx.projectDirectory,
    sessionStore: ctx.sessionStore,
    memoryLogger: ctx.memoryLogger,
    contextLogger: ctx.contextLogger,
    now: ctx.now,
    childSessionCache: ctx.childSessionCache,
    taskManager: ctx.taskManager,
    systemSnapshots: ctx.systemSnapshots,
    systemMetadataMap: ctx.systemMetadataMap,
    systemInjectionsMap: ctx.systemInjectionsMap,
    transformedMessagesMap,
  });

  const eventRouter = createEventRouter({
    client: ctx.client,
    sessionStore: ctx.sessionStore,
    contextLogger: ctx.contextLogger,
    taskLogger: ctx.taskLogger,
    taskManager: ctx.taskManager,
  });

  const compactionHooks = createCompactionHooks({
    sessionStore: ctx.sessionStore,
    contextLogger: ctx.contextLogger,
    now: ctx.now,
    ...(ctx.taskManager ? { taskManager: ctx.taskManager } : {}),
  });

  return {
    hooks: {
      ...commandHooks,
      ...messageHooks,
      ...systemTransformHooks,
      ...eventRouter,
      ...compactionHooks,
    },
    transformedMessagesMap,
  };
}

// Re-export for backward compatibility with tests that import OpenCodeRulesRuntime
// This class wraps the new functional hooks API
export { createSystemTransformHooks } from "./system-transform.js";
export { createEventRouter } from "./event-router.js";
