import {
  coreLogger,
  rulesLogger,
  taskLogger,
  memoryLogger,
  contextLogger,
  type LoggerInstance,
} from "../logger.js";
import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DiscoveredRule } from "../rules/index.js";
import type { OpenCodeClient } from "../types.js";
import type { SystemPromptMetadata } from "@wopal/ellamaka-plugin";
import type { SessionSkillOverlay } from "../session-skill-overlay.js";
import type { MessageWithInfo } from "./message-context.js";
import { createCommandHooks } from "./command-hooks.js";
import { createMessageHooks } from "./message-hooks.js";
import { createSystemTransformHooks } from "./system-transform.js";
import { createEventRouter } from "./event-router.js";
import { createCompactionHooks } from "./compaction.js";
import type { RuleInjectorContext } from "./rule-injector.js";
import type { MemoryInjectorContext } from "./memory-injection-utils.js";
import { createSkillPermissionRulesHooks } from "./skill-permission-rules.js";

export interface HookCapabilities {
  memoryInjectionEnabled?: boolean; // Default true
  contextEnabled?: boolean; // Default true; gates LLM-driven context abilities (D-04)
  rulesInjectionEnabled?: boolean; // Default FALSE; rules injection is opt-in (wopal.rules.enabled)
}

export interface HookContextOptions {
  client: OpenCodeClient;
  directory: string;
  projectDirectory: string;
  logDir: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  coreLogger?: LoggerInstance;
  rulesLogger?: LoggerInstance;
  taskLogger?: LoggerInstance;
  memoryLogger?: LoggerInstance;
  contextLogger?: LoggerInstance;
  generateSessionTitle?: (summary: string) => Promise<{ title?: unknown }>;
  now?: () => number;
  taskManager?: SimpleTaskManager;
  memoryInjector?: MemoryInjector | undefined;
  skillOverlay?: SessionSkillOverlay;
  systemSnapshots?: Map<string, string[]>;
  systemMetadataMap?: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]>;
  capabilities?: HookCapabilities;
}

export interface HookContext {
  client: OpenCodeClient;
  directory: string;
  projectDirectory: string;
  /** Log root directory (e.g. <space>/.wopal-space/logs); dumps and diagnostics write here. */
  logDir: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  coreLogger: LoggerInstance; // Plugin lifecycle (passed from index.ts)
  rulesLogger: LoggerInstance; // Rule discovery and injection
  taskLogger: LoggerInstance; // Task delegation and monitoring
  memoryLogger: LoggerInstance; // Memory system (store, retrieval)
  contextLogger: LoggerInstance; // Session state, snapshots, compaction
  now: () => number;
  taskManager: SimpleTaskManager | undefined;
  memoryInjector: MemoryInjector | undefined;
  skillOverlay: SessionSkillOverlay | undefined;
  childSessionCache: Map<string, boolean>;
  systemSnapshots: Map<string, string[]>;
  systemMetadataMap: Map<string, SystemPromptMetadata>;
  systemInjectionsMap: Map<string, string[]>;
  capabilities: {
    memoryInjectionEnabled: boolean;
    contextEnabled: boolean;
    rulesInjectionEnabled: boolean;
  };
  generateSessionTitle:
    | ((summary: string) => Promise<{ title?: unknown }>)
    | undefined;
}

export function createHookContext(opts: HookContextOptions): HookContext {
  return {
    client: opts.client,
    directory: opts.directory,
    projectDirectory: opts.projectDirectory,
    logDir: opts.logDir,
    ruleFiles: opts.ruleFiles,
    sessionStore: opts.sessionStore,
    coreLogger: opts.coreLogger ?? coreLogger,
    rulesLogger: opts.rulesLogger ?? rulesLogger,
    taskLogger: opts.taskLogger ?? taskLogger,
    memoryLogger: opts.memoryLogger ?? memoryLogger,
    contextLogger: opts.contextLogger ?? contextLogger,
    now: opts.now ?? (() => Date.now()),
    taskManager: opts.taskManager ?? undefined,
    memoryInjector: opts.memoryInjector,
    skillOverlay: opts.skillOverlay,
    childSessionCache: new Map<string, boolean>(),
    systemSnapshots: opts.systemSnapshots ?? new Map(),
    systemMetadataMap: opts.systemMetadataMap ?? new Map(),
    systemInjectionsMap: opts.systemInjectionsMap ?? new Map(),
    capabilities: {
      memoryInjectionEnabled: opts.capabilities?.memoryInjectionEnabled ?? true,
      contextEnabled: opts.capabilities?.contextEnabled ?? true,
      // Default off: absent capabilities must not enable rules (opt-in switch).
      rulesInjectionEnabled: opts.capabilities?.rulesInjectionEnabled ?? false,
    },
    generateSessionTitle: opts.generateSessionTitle,
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
      capabilities: ctx.capabilities,
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
      capabilities: ctx.capabilities,
    },
    ...(ctx.skillOverlay
      ? {
          skillCatalogCtx: {
            skillOverlay: ctx.skillOverlay,
            sessionStore: ctx.sessionStore,
            logger: ctx.contextLogger,
          },
        }
      : {}),
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
      capabilities: ctx.capabilities,
    },
  });

  const systemTransformHooks = createSystemTransformHooks({
    client: ctx.client,
    directory: ctx.directory,
    projectDirectory: ctx.projectDirectory,
    logDir: ctx.logDir,
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
    coreLogger: ctx.coreLogger,
    taskManager: ctx.taskManager,
    directory: ctx.directory,
    capabilities: ctx.capabilities,
    // D-04: title generation is an LLM-driven context ability; context.enabled=false
    // withholds the generator so the event router falls back to its default title.
    ...(ctx.capabilities.contextEnabled && ctx.generateSessionTitle
      ? { generateSessionTitle: ctx.generateSessionTitle }
      : {}),
  });

  const skillPermissionHooks = createSkillPermissionRulesHooks(
    ctx.skillOverlay,
    ctx.taskLogger,
  );

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
      ...skillPermissionHooks,
      ...compactionHooks,
    },
    transformedMessagesMap,
  };
}

// Re-export for backward compatibility with tests that import OpenCodeRulesRuntime
// This class wraps the new functional hooks API
export { createSystemTransformHooks } from "./system-transform.js";
export { createEventRouter } from "./event-router.js";
