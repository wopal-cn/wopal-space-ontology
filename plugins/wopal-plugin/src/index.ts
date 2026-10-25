/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_task_output, wopal_task_reply).
 * Task is a perpetual dialog channel - no terminal states, only running/waiting/error.
 */

import type {
  PluginInput,
  Hooks,
  PluginOptions,
  SystemPromptMetadata,
} from "@wopal/ellamaka-plugin";
import type { OpenCodeClient } from "./types.js";
import { createOpencodeClient as createV2OpencodeClient } from "@wopal/ellamaka-sdk/v2";
import { discoverRuleFiles, type DiscoveredRule } from "./rules/index.js";
import { createHookContext, createAllHooks } from "./hooks/index.js";
import { sessionStore } from "./session-store-instance.js";
import {
  bindLoggerRuntime,
  createPluginLoggers,
  type PluginLoggers,
} from "./logger.js";
import { SimpleTaskManager } from "./tasks/simple-task-manager.js";
import { MonitorEngine } from "./monitor/monitor-engine.js";
import { createMainSessionMonitorStrategy } from "./monitor/main-session-monitor.js";
import { registerManagerForCleanup } from "./lifecycle/process-cleanup.js";
import { createWopalTools } from "./tools/index.js";
import { SessionSkillOverlay } from "./session-skill-overlay.js";
import {
  createRuntimeContext,
  type RuntimeContext,
} from "./runtime-context.js";
import {
  loadRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./runtime-environment.js";
import { createContextPrompts, type ContextPrompts } from "./context/index.js";
import { MemoryInjector } from "./memory/injector.js";
import { MemoryRetriever } from "./memory/retriever.js";
import { DistillEngine } from "./context/index.js";
import { loadWopalConfig, type WopalPluginConfig } from "./config/index.js";
import {
  resolveResources,
  type PluginResources,
  type ResourceRuntime,
} from "./resources/index.js";

interface MemorySystem {
  injector: MemoryInjector;
}

export interface PluginRuntime {
  context: RuntimeContext;
  env: RuntimeEnvironment;
  loggers: PluginLoggers;
  prompts: ContextPrompts;
  config: WopalPluginConfig;
}

interface RuntimePluginInput {
  directory: string;
  wopalSpaceRoot?: string;
  /**
   * Engine-delivered slice `PluginInput.pluginConfig["wopal-plugin"]` —
   * already merged across the three settings layers by the engine. Absent
   * (or undefined) means the space declares no entry; defaults apply.
   */
  pluginConfig?: Record<string, unknown>;
  /**
   * Inline mount options (the plugin's second argument), the compatibility
   * layer between the built-in defaults and the engine-delivered slice.
   */
  inlineOptions?: Record<string, unknown>;
}

export function createPluginRuntime(input: RuntimePluginInput): PluginRuntime {
  const context = createRuntimeContext({
    directory: input.directory,
    ...(process.env.WOPAL_HOME ? { wopalHome: process.env.WOPAL_HOME } : {}),
    ...(input.wopalSpaceRoot !== undefined
      ? { wopalSpaceRoot: input.wopalSpaceRoot }
      : {}),
  });
  const env = loadRuntimeEnvironment(context);
  const config = loadWopalConfig({
    ...(input.inlineOptions !== undefined
      ? { inlineOptions: input.inlineOptions }
      : {}),
    ...(input.pluginConfig !== undefined
      ? { pluginConfig: input.pluginConfig }
      : {}),
    fallbackEnvironment: env,
  });
  const { logLevel, logFile, logModules } = config;
  const logConfig = {
    ...(logLevel !== undefined ? { level: logLevel } : {}),
    ...(logFile !== undefined ? { file: logFile } : {}),
    ...(logModules !== undefined ? { modules: logModules } : {}),
  };
  const loggers = createPluginLoggers(context, env, logConfig);
  // Module-level singletons (`contextLogger` and friends) are process-wide but
  // the process can host several runtimes; point them at this runtime's log
  // destination so singleton call sites land in this space's log, not the
  // global `<WOPAL_HOME>/logs` file.
  bindLoggerRuntime(context, env, logConfig);
  const prompts = createContextPrompts(context, loggers.context);
  return Object.freeze({ context, env, loggers, prompts, config });
}

async function createPluginResources(
  runtime: PluginRuntime,
): Promise<PluginResources> {
  const resourceRuntime: ResourceRuntime = {
    context: runtime.context,
    env: runtime.env,
    loggers: {
      core: runtime.loggers.core,
      memory: runtime.loggers.memory,
    },
  };
  return resolveResources(runtime.config, resourceRuntime);
}

const openCodeRulesPlugin = async (
  pluginInput: PluginInput,
  options?: PluginOptions,
): Promise<Hooks> => {
  // `PluginInput` from `@wopal/ellamaka-plugin` already declares the fork's
  // `wopalSpaceRoot` and `pluginConfig` extensions, so no local cast is needed
  // to read them.
  const input = pluginInput;
  // The engine delivers the whole `wopal.pluginConfig` table (contract 2.0.7);
  // the plugin takes its own entry and keeps the inline mount options
  // (`options`, the compatibility layer) beneath it. The optional chain
  // tolerates an engine that predates the contract field — absent table /
  // entry = inline options or built-in defaults.
  const pluginConfigSlice = input.pluginConfig?.["wopal-plugin"];
  const runtime = createPluginRuntime({
    directory: input.directory,
    ...(input.wopalSpaceRoot !== undefined
      ? { wopalSpaceRoot: input.wopalSpaceRoot }
      : {}),
    ...(pluginConfigSlice !== undefined
      ? { pluginConfig: pluginConfigSlice }
      : {}),
    ...(options !== undefined ? { inlineOptions: options } : {}),
  });
  const { context: runtimeCtx, loggers } = runtime;
  const {
    core: coreLogger,
    rules: rulesLogger,
    context: contextLogger,
  } = loggers;

  coreLogger.debug(`Loading plugin: ${input.directory}`);
  coreLogger.info(
    {
      wopal_space: runtimeCtx.isWopalSpace,
      ...(runtimeCtx.wopalSpaceRoot
        ? { space_root: runtimeCtx.wopalSpaceRoot }
        : {}),
      wopal_home: runtimeCtx.wopalHome,
    },
    "Runtime context initialized",
  );

  coreLogger.info({ config: runtime.config }, "Effective wopal config loaded");

  // Rules injection is opt-in: config `pluginConfig["wopal-plugin"].rules.enabled`
  // defaults to false, so discovery is skipped entirely unless the switch is
  // turned on.
  const rulesInjectionEnabled = runtime.config.rules.enabled === true;
  let ruleFiles: DiscoveredRule[] = [];
  if (rulesInjectionEnabled) {
    ruleFiles = await discoverRuleFiles(undefined, rulesLogger, {
      wopalHome: runtimeCtx.wopalHome,
      ...(runtimeCtx.wopalSpaceRoot
        ? { wopalSpaceRoot: runtimeCtx.wopalSpaceRoot }
        : {}),
    });
  } else {
    coreLogger.info(
      { module: "rules", reason: "disabled_by_config" },
      "Rules injection disabled",
    );
  }

  // Resource layer initialization — memory resources depend on memory.enabled,
  // LLM resource depends on context.enabled (dependency-driven minimal set).
  const resources = await createPluginResources(runtime);
  // D-06: MemorySystem assembly requires only store + embedder. LLM is consumed
  // by context capabilities (distillation, title generation, auto-recovery), so
  // context.enabled=false no longer tears down the memory system.
  const memory: MemorySystem | null =
    resources.store && resources.embedder
      ? {
          injector: new MemoryInjector(
            new MemoryRetriever(
              resources.store,
              resources.embedder,
              loggers.memory,
            ),
            loggers.memory,
          ),
        }
      : null;

  // Context capability (D-04): LLM-driven context abilities (distillation,
  // title generation, auto-recovery) are gated by context.enabled. Compaction
  // is never gated (D-05).
  const contextEnabled = runtime.config.context.enabled !== false;
  const distillEngine =
    contextEnabled && resources.store && resources.embedder && resources.llm
      ? new DistillEngine(
          resources.store,
          resources.embedder,
          resources.llm,
          runtime.prompts,
          loggers.context,
        )
      : undefined;

  coreLogger.debug(
    {
      store: resources.store !== undefined,
      embedder: resources.embedder !== undefined,
      llm: resources.llm !== undefined,
      context_enabled: contextEnabled,
    },
    "Resources resolved",
  );

  // Extract the internal fetch from v1 client (which uses Server.Default().fetch
  // to route requests to the in-process Hono server, bypassing real HTTP).
  // We must pass it to v2 client so question.reply reaches the Question service.
  const client = pluginInput.client as unknown as
    | { _client?: { getConfig?: () => { fetch?: typeof globalThis.fetch } } }
    | undefined;
  const internalFetch =
    client?._client?.getConfig?.()?.fetch ?? globalThis.fetch;

  const v2Client = createV2OpencodeClient({
    baseUrl: pluginInput.serverUrl.toString(),
    directory: pluginInput.directory,
    fetch: internalFetch,
  });

  const skillOverlay = new SessionSkillOverlay(
    v2Client,
    sessionStore,
    pluginInput.directory,
    loggers.task,
  );

  const taskManager = new SimpleTaskManager(
    pluginInput.client as unknown as OpenCodeClient,
    v2Client as unknown as OpenCodeClient,
    pluginInput.directory,
    pluginInput.serverUrl,
    sessionStore,
    loggers.task,
    skillOverlay,
  );

  // Create MonitorEngine and register strategies
  const monitorEngine = new MonitorEngine({
    strategies: [
      taskManager.createMonitorStrategy(),
      createMainSessionMonitorStrategy({
        sessionStore,
        client: pluginInput.client as unknown as OpenCodeClient,
        directory: pluginInput.directory,
        taskManager,
        logger: contextLogger,
      }),
    ],
    logger: coreLogger,
  });
  monitorEngine.start();

  // Register monitor engine for process cleanup
  registerManagerForCleanup(monitorEngine);

  const systemSnapshots = new Map<string, string[]>();
  const systemMetadataMap = new Map<string, SystemPromptMetadata>();
  const systemInjectionsMap = new Map<string, string[]>();

  // Config → capability state conversion happens here; hooks consume only
  // the resolved state (never env or the raw config object).
  const ctx = createHookContext({
    client: input.client as OpenCodeClient,
    directory: input.directory,
    projectDirectory: input.directory,
    logDir: runtimeCtx.logDir,
    ruleFiles,
    sessionStore,
    coreLogger: coreLogger,
    rulesLogger: loggers.rules,
    taskLogger: loggers.task,
    memoryLogger: loggers.memory,
    contextLogger: loggers.context,
    taskManager,
    memoryInjector: memory?.injector,
    skillOverlay,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    capabilities: {
      memoryInjectionEnabled: runtime.config.memory.injection,
      contextEnabled,
      rulesInjectionEnabled,
    },
    ...(contextEnabled && resources.llm
      ? {
          generateSessionTitle: async (summary: string) =>
            resources.llm!.completeJson(
              runtime.prompts.loadTitlePrompt().replace("{{summary}}", summary),
            ),
        }
      : {}),
  });

  const { hooks: hookHandlers, transformedMessagesMap } = createAllHooks(ctx);

  // memory_manage registration follows store availability (single source of
  // truth). The embedder is optional: embedder-dependent capabilities degrade
  // inside the tool rather than blocking registration. MemorySystem (injector)
  // still requires store + embedder, which is why the two are passed directly.
  const tools = createWopalTools(
    taskManager,
    resources.store,
    resources.embedder,
    sessionStore,
    skillOverlay,
  );

  // memory_manage registration is resource-availability driven (single source
  // of truth — resolveResources already consulted config.memory.enabled).
  if (!tools.memory_manage) {
    const reason =
      runtime.config.memory.enabled === false
        ? "disabled_by_config"
        : "initialization_failed";
    coreLogger.info(
      {
        tool: "memory_manage",
        reason,
        ...(reason === "initialization_failed"
          ? {
              store: resources.store !== undefined,
              embedder: resources.embedder !== undefined,
              llm: resources.llm !== undefined,
            }
          : {}),
      },
      "memory_manage not registered",
    );
  }

  // context_manage is session/context management — independent of memory system
  const { createContextManageTool } = await import("./tools/context-manage.js");
  tools.context_manage = createContextManageTool(
    pluginInput.client as unknown as OpenCodeClient,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    transformedMessagesMap,
    pluginInput.directory,
    sessionStore,
    taskManager,
    runtimeCtx.logDir,
    { contextEnabled },
    distillEngine,
  );

  coreLogger.debug(
    { log_file: loggers.logFile, log_level: loggers.logLevel },
    "Logger config",
  );
  coreLogger.info(
    { tools: Object.keys(tools).join(", "), memory: !!memory },
    "Plugin initialized",
  );

  return {
    ...hookHandlers,
    tool: tools,
  };
};

export default {
  id: "wopal-plugin",
  server: openCodeRulesPlugin,
};
