/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_task_output, wopal_task_reply).
 * Task is a perpetual dialog channel - no terminal states, only running/waiting/error.
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import type { SystemPromptMetadata } from "./types.js";
import { createOpencodeClient as createV2OpencodeClient } from "@opencode-ai/sdk/v2";
import { discoverRuleFiles, type DiscoveredRule } from "./rules/index.js";
import { createHookContext, createAllHooks } from "./hooks/index.js";
import { sessionStore } from "./session-store-instance.js";
import { createDebugLog, createWarnLog } from "./debug.js";
import { SimpleTaskManager } from "./tasks/simple-task-manager.js";
import { createWopalTools } from "./tools/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";


const debugLog = createDebugLog();
const warnLog = createWarnLog("[plugin]");

// 按 directory 缓存的初始化结果（幂等守卫）
const pluginRegistry = new Map<string, Promise<Hooks>>();

function loadWopalEnv(rootDir: string): void {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

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
  } catch {
    // Silently ignore .env read errors
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
  const memoryDebugLog = createDebugLog("[memory]", "memory");

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
    memoryDebugLog("Memory system initialized (LanceDB + Embedding + LLM)");
    return _memorySystem;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog(`Memory system initialization failed (non-fatal): ${message}`);
    return null;
  }
}

const openCodeRulesPlugin = async (pluginInput: PluginInput): Promise<Hooks> => {
  const { directory } = pluginInput;

  // 幂等守卫：同一 directory 已初始化 → 直接返回
  const existing = pluginRegistry.get(directory);
  if (existing) {
    debugLog(`[plugin] Duplicate init skipped for ${directory}`);
    return existing;
  }

  // 首次初始化：缓存 Promise，失败时清除缓存允许重试
  const initPromise = initializePlugin(pluginInput).catch(err => {
    pluginRegistry.delete(directory);
    throw err;
  });
  pluginRegistry.set(directory, initPromise);
  return initPromise;
};

async function initializePlugin(pluginInput: PluginInput): Promise<Hooks> {
  debugLog(`[plugin] Initializing (directory: ${pluginInput.directory})`);

  loadWopalEnv(pluginInput.directory);

  // Read switches after loadWopalEnv (ensure .env has taken effect)
  const rulesInjectionEnabled = process.env.WOPAL_RULES_INJECTION_ENABLED !== "false";
  const memoryEnabled = process.env.WOPAL_MEMORY_ENABLED !== "false";
  const memoryInjectionEnabled = process.env.WOPAL_MEMORY_INJECTION_ENABLED !== "false";

  const rulesDebugLog = createDebugLog("[rules]", "rules");

  // Rules module initialization
  let ruleFiles: DiscoveredRule[];
  if (rulesInjectionEnabled) {
    ruleFiles = await discoverRuleFiles(pluginInput.directory, rulesDebugLog);
  } else {
    debugLog("Rules module disabled");
    ruleFiles = [];
  }

  // Memory module initialization
  let memory: typeof _memorySystem;
  if (memoryEnabled) {
    memory = await ensureMemorySystem();
  } else {
    debugLog("Memory module disabled");
    memory = null;
  }

  debugLog(`Tools registered: wopal_task, wopal_task_output, wopal_task_reply, memory_manage, context_manage`);

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
    pluginInput.client,
    v2Client,
    pluginInput.directory,
    pluginInput.serverUrl,
  );

  const systemSnapshots = new Map<string, string[]>();
  const systemMetadataMap = new Map<string, SystemPromptMetadata>();
  const systemInjectionsMap = new Map<string, string[]>();

  const ctx = createHookContext({
    client: pluginInput.client,
    directory: pluginInput.directory,
    projectDirectory: pluginInput.directory,
    ruleFiles,
    sessionStore,
    debugLog,
    taskManager,
    memoryInjector: memory?.injector,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    rulesInjectionEnabled,
    memoryInjectionEnabled,
  });

  const hooks = createAllHooks(ctx);

  const tools = createWopalTools(taskManager, memory?.store, memory?.embedder, sessionStore, memory?.distillEngine, pluginInput.client);

  if (memory) {
    const { createContextManageTool } = await import("./tools/context-manage");

    tools.context_manage = createContextManageTool(
      memory.llm,
      pluginInput.client,
      systemSnapshots,
      systemMetadataMap,
      systemInjectionsMap,
      pluginInput.directory,
    );
  }

  debugLog(`Plugin initialized: tools=[${Object.keys(tools).join(", ")}], memory=${!!memory}`);

  return {
    ...hooks,
    tool: tools,
  };
};

export default {
  id: "wopal-wopal-plugin",
  server: openCodeRulesPlugin,
};
