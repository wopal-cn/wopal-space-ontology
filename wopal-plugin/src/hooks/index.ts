import { createDebugLog, type DebugLog } from "../debug.js";
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
  debugLog?: DebugLog;
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
  pluginDebugLog: DebugLog;     // Plugin lifecycle (passed from index.ts)
  rulesDebugLog: DebugLog;      // Rule discovery and injection
  taskDebugLog: DebugLog;       // Task delegation and monitoring
  memoryDebugLog: DebugLog;     // Memory system (store, retrieval)
  contextDebugLog: DebugLog;    // Session state, snapshots, compaction
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
    pluginDebugLog: opts.debugLog ?? createDebugLog("[plugin]", "plugin"),
    rulesDebugLog: createDebugLog("[rules]", "rules"),
    taskDebugLog: createDebugLog("[task]", "task"),
    memoryDebugLog: createDebugLog("[memory]", "memory"),
    contextDebugLog: createDebugLog("[context]", "context"),
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
    contextDebugLog: ctx.contextDebugLog,
    projectDirectory: ctx.projectDirectory,
  });

  const messageHooks = createMessageHooks({
    sessionStore: ctx.sessionStore,
    contextDebugLog: ctx.contextDebugLog,
    projectDirectory: ctx.projectDirectory,
    transformedMessagesMap,
    skillReloadCtx: {
      sessionStore: ctx.sessionStore,
      contextDebugLog: ctx.contextDebugLog,
    },
    ruleMessageCtx: {
      sessionStore: ctx.sessionStore,
      ruleInjectorCtx: {
        directory: ctx.directory,
        ruleFiles: ctx.ruleFiles,
        rulesDebugLog: ctx.rulesDebugLog,
      } satisfies RuleInjectorContext,
      client: ctx.client,
      taskManager: ctx.taskManager,
      childSessionCache: ctx.childSessionCache,
      rulesDebugLog: ctx.rulesDebugLog,
      rulesInjectionEnabled: ctx.rulesInjectionEnabled,
    },
    memoryMessageCtx: {
      memoryInjectorCtx: {
        client: ctx.client,
        sessionStore: ctx.sessionStore,
        memoryDebugLog: ctx.memoryDebugLog,
        memoryInjector: ctx.memoryInjector,
        childSessionCache: ctx.childSessionCache,
        taskManager: ctx.taskManager,
      } satisfies MemoryInjectorContext,
      memoryInjector: ctx.memoryInjector,
      sessionStore: ctx.sessionStore,
      memoryDebugLog: ctx.memoryDebugLog,
      memoryInjectionEnabled: ctx.memoryInjectionEnabled,
    },
  });

  const systemTransformHooks = createSystemTransformHooks({
    client: ctx.client,
    directory: ctx.directory,
    projectDirectory: ctx.projectDirectory,
    sessionStore: ctx.sessionStore,
    memoryDebugLog: ctx.memoryDebugLog,
    contextDebugLog: ctx.contextDebugLog,
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
    contextDebugLog: ctx.contextDebugLog,
    taskDebugLog: ctx.taskDebugLog,
    taskManager: ctx.taskManager,
  });

  const compactionHooks = createCompactionHooks({
    sessionStore: ctx.sessionStore,
    contextDebugLog: ctx.contextDebugLog,
    now: ctx.now,
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
