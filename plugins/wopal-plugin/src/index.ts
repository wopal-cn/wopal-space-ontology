/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_task_output, wopal_task_reply).
 * Task is a perpetual dialog channel - no terminal states, only running/waiting/error.
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import type { SystemPromptMetadata, OpenCodeClient } from "./types.js";
import { createOpencodeClient as createV2OpencodeClient } from "@opencode-ai/sdk/v2";
import { discoverRuleFiles, type DiscoveredRule } from "./rules/index.js";
import { createHookContext, createAllHooks } from "./hooks/index.js";
import { sessionStore } from "./session-store-instance.js";
import { coreLogger, memoryLogger, rulesLogger } from "./logger.js";
import { SimpleTaskManager } from "./tasks/simple-task-manager.js";
import { createWopalTools } from "./tools/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";



function loadWopalEnv(rootDir: string): void {
  const envPath = join(rootDir, ".wopal", ".env");
  if (!existsSync(envPath)) return;

  coreLogger.debug(`Loading env: ${envPath}`);
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("WOPAL_") && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    coreLogger.warn({ err }, "Failed to load .env");
  }
}

let _memorySystem: {
  injector: import("./memory/injector").MemoryInjector;
  distillEngine: import("./memory/distill").DistillEngine;
  store: import("./memory/store").MemoryStore;
  embedder: import("./memory/embedder").EmbeddingClient;
  llm: import("./memory/llm-client").DistillLLMClient;
} | null = null;

async function ensureMemorySystem(): Promise<typeof _memorySystem> {
  if (_memorySystem) return _memorySystem;

  try {
    const { MemoryStore } = await import("./memory/store");
    const { EmbeddingClient } = await import("./memory/embedder");
    const { DistillLLMClient } = await import("./memory/llm-client");
    const { DistillEngine } = await import("./memory/distill");
    const { MemoryRetriever } = await import("./memory/retriever");
    const { MemoryInjector } = await import("./memory/injector");

    const store = new MemoryStore();
    await store.init();

    const embedder = new EmbeddingClient();
    const llm = new DistillLLMClient();
    const distillEngine = new DistillEngine(store, embedder, llm);
    const retriever = new MemoryRetriever(store, embedder);
    const injector = new MemoryInjector(retriever);

    _memorySystem = { injector, distillEngine, store, embedder, llm };
    memoryLogger.info("Memory system initialized (LanceDB + Embedding + LLM)");
    return _memorySystem;
  } catch (error) {
    coreLogger.warn({ err: error instanceof Error ? error : new Error(String(error)) }, "Memory system initialization failed (non-fatal)");
    return null;
  }
}

const openCodeRulesPlugin = async (pluginInput: PluginInput): Promise<Hooks> => {
  const { directory } = pluginInput;

  coreLogger.debug(`Loading plugin: ${directory}`);
  loadWopalEnv(directory);

  // Read switches after loadWopalEnv (ensure .env has taken effect)
  const rulesInjectionEnabled = process.env.WOPAL_RULES_INJECTION_ENABLED !== "false";
  const memoryEnabled = process.env.WOPAL_MEMORY_ENABLED !== "false";
  const memoryInjectionEnabled = process.env.WOPAL_MEMORY_INJECTION_ENABLED !== "false";

  // Rules module initialization
  let ruleFiles: DiscoveredRule[];
  if (rulesInjectionEnabled) {
    ruleFiles = await discoverRuleFiles(pluginInput.directory, rulesLogger);
  } else {
    coreLogger.info("Rules module disabled");
    ruleFiles = [];
  }

  // Memory module initialization
  let memory: typeof _memorySystem;
  if (memoryEnabled) {
    memory = await ensureMemorySystem();
  } else {
    coreLogger.debug("Memory module disabled");
    memory = null;
  }

  coreLogger.debug(`Tools registered: wopal_task, wopal_task_output, wopal_task_reply, memory_manage, context_manage`);

  // Extract the internal fetch from v1 client (which uses Server.Default().fetch
  // to route requests to the in-process Hono server, bypassing real HTTP).
  // We must pass it to v2 client so question.reply reaches the Question service.
  const client = pluginInput.client as unknown as { _client?: { getConfig?: () => { fetch?: typeof globalThis.fetch } } } | undefined
  const internalFetch = client?._client?.getConfig?.()?.fetch ?? globalThis.fetch;

  const v2Client = createV2OpencodeClient({
    baseUrl: pluginInput.serverUrl.toString(),
    directory: pluginInput.directory,
    fetch: internalFetch,
  });

  const taskManager = new SimpleTaskManager(
    pluginInput.client as unknown as OpenCodeClient,
    v2Client as unknown as OpenCodeClient,
    pluginInput.directory,
    pluginInput.serverUrl,
    sessionStore,
  );

  const systemSnapshots = new Map<string, string[]>();
  const systemMetadataMap = new Map<string, SystemPromptMetadata>();
  const systemInjectionsMap = new Map<string, string[]>();

  const ctx = createHookContext({
    client: pluginInput.client as OpenCodeClient,
    directory: pluginInput.directory,
    projectDirectory: pluginInput.directory,
    ruleFiles,
    sessionStore,
    coreLogger: coreLogger,
    taskManager,
    memoryInjector: memory?.injector,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    rulesInjectionEnabled,
    memoryInjectionEnabled,
  });

  const { hooks: hookHandlers, transformedMessagesMap } = createAllHooks(ctx);

  const tools = createWopalTools(taskManager, memory?.store, memory?.embedder, sessionStore, memory?.distillEngine, pluginInput.client);

  if (memory) {
    const { createContextManageTool } = await import("./tools/context-manage");

    tools.context_manage = createContextManageTool(
      memory.llm,
      pluginInput.client as unknown as OpenCodeClient,
      systemSnapshots,
      systemMetadataMap,
      systemInjectionsMap,
      transformedMessagesMap,
      pluginInput.directory,
      sessionStore,
      taskManager,
    );
  }

  coreLogger.info({ tools: Object.keys(tools).join(", "), memory: !!memory }, "Plugin initialized");

  return {
    ...hookHandlers,
    tool: tools,
  };
};

export default {
  id: "wopal-wopal-plugin",
  server: openCodeRulesPlugin,
};
