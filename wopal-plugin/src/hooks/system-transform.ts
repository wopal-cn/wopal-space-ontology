/**
 * System Transform Hook - Facade for rule + memory injection
 *
 * Coordinates rule-injector and memory-injector modules.
 */

import type { DiscoveredRule } from "../rules/index.js";
import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DebugLog } from "../debug.js";
import type { SystemPromptMetadata } from "../types.js";
import type { MessageWithInfo } from "./message-context.js";
import { createDebugLog } from "../debug.js";
import type { Model } from "@opencode-ai/sdk";

const ctxDebugLog = createDebugLog("[wopal-context]", "context");
import { writeContextDump } from "../tools/dump-formatter.js";
import {
  injectRules,
  queryAvailableToolIDs,
  type RuleInjectorContext,
} from "./rule-injector.js";
import {
  injectMemoriesIntoSystem,
  isChildSession,
  type MemoryInjectorContext,
  type SystemTransformOutput,
} from "./memory-injector.js";

interface SystemTransformInput {
  sessionID?: string;
  model: Model;
  systemMetadata?: SystemPromptMetadata;
}

export interface SystemTransformHookContext {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog: DebugLog;
  injectDebugLog: DebugLog;
  now: () => number;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  taskManager: { findBySession: (sessionID: string) => unknown } | undefined;
  systemSnapshots?: Map<string, string[]>;
  systemMetadataMap?: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]>;
  transformedMessagesMap?: Map<string, MessageWithInfo[]>;
}

export function createSystemTransformHooks(ctx: SystemTransformHookContext) {
  // Build sub-module contexts
  const ruleInjectorCtx: RuleInjectorContext = {
    client: ctx.client,
    directory: ctx.directory,
    ruleFiles: ctx.ruleFiles,
    debugLog: ctx.debugLog,
  };

  const memoryInjectorCtx: MemoryInjectorContext = {
    client: ctx.client,
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    injectDebugLog: ctx.injectDebugLog,
    memoryInjector: ctx.memoryInjector,
    childSessionCache: ctx.childSessionCache,
    taskManager: ctx.taskManager,
  };

  async function onSystemTransform(
    hookInput: SystemTransformInput,
    output: SystemTransformOutput | null,
  ): Promise<SystemTransformOutput> {
    const sessionID = hookInput?.sessionID;
    const sessionState = sessionID
      ? ctx.sessionStore.get(sessionID)
      : undefined;

    if (sessionID) {
      const skip = ctx.sessionStore.shouldSkipInjection(sessionID);
      if (skip) {
        ctx.debugLog(
          `Session ${sessionID} is compacting - skipping rule injection`,
        );
        return output ?? { system: [] };
      }
    }

    if (!output) {
      output = { system: [] };
    }
    if (!output.system) {
      output.system = [];
    }

    // Record initial length before plugin injections
    const initialSystemLength = output.system.length;

    // Rule injection
    const rulesInjectionEnabled = process.env.WOPAL_RULES_INJECTION_ENABLED !== "false";

    if (rulesInjectionEnabled) {
      const contextPaths = sessionState
        ? Array.from(sessionState.contextPaths).sort()
        : [];
      const userPrompt = sessionState?.lastUserPrompt;

      const formattedRules = await injectRules(
        ruleInjectorCtx,
        contextPaths,
        userPrompt,
      );

      if (formattedRules) {
        output.system.push(formattedRules);
      }
    } else {
      ctx.debugLog("Rules injection disabled by environment variable");
    }

    // Memory injection (after rules, into same system array)
    const memoryInjectionEnabled = process.env.WOPAL_MEMORY_INJECTION_ENABLED !== "false";

    if (memoryInjectionEnabled && sessionID) {
      await injectMemoriesIntoSystem(memoryInjectorCtx, sessionID, output);
    } else if (!memoryInjectionEnabled) {
      ctx.debugLog("Memory injection disabled by environment variable");
    }

    // Snapshot system prompt for context dump
    if (sessionID && ctx.systemSnapshots) {
      ctx.systemSnapshots.set(sessionID, [...output.system]);
    }

    // Store structured metadata if available
    if (sessionID && hookInput.systemMetadata && ctx.systemMetadataMap) {
      ctx.systemMetadataMap.set(sessionID, hookInput.systemMetadata);
      ctx.debugLog(`Stored systemMetadata for session ${sessionID}: ${hookInput.systemMetadata.sections.length} sections`);
    } else if (sessionID && ctx.systemMetadataMap) {
      ctx.debugLog(`No systemMetadata in hook input for session ${sessionID} (keys in map: ${ctx.systemMetadataMap.size})`);
    }

    // Store plugin injections (content appended after OpenCode's original system blocks)
    if (sessionID && ctx.systemInjectionsMap && output.system.length > initialSystemLength) {
      ctx.systemInjectionsMap.set(sessionID, output.system.slice(initialSystemLength));
    }

    // Auto-dump: requires explicit "context" module (not triggered by "all" wildcard)
    const debug = process.env.WOPAL_PLUGIN_DEBUG;
    const explicitContext = debug && debug.toLowerCase().split(",").map(m => m.trim()).includes("context");
    if (sessionID && explicitContext) {
      ctxDebugLog(`[auto-dump] triggered for session ${sessionID}`);
      void writeContextDump({
        sessionID,
        baseDir: ctx.directory,
        filenamePrefix: "AUTO-CTXDUMP",
        systemSnapshots: ctx.systemSnapshots ?? new Map(),
        systemMetadataMap: ctx.systemMetadataMap ?? new Map(),
        systemInjectionsMap: ctx.systemInjectionsMap ?? new Map(),
        transformedMessagesMap: ctx.transformedMessagesMap ?? new Map(),
        client: ctx.client,
        detail: false,
      }).catch(err => ctx.debugLog(`[auto-dump] error: ${err}`));
    }

    return output;
  }

  return {
    "experimental.chat.system.transform": onSystemTransform,
    // Expose internal methods for testing
    _queryAvailableToolIDs: () => queryAvailableToolIDs(ruleInjectorCtx),
    _isChildSession: (sessionID: string) =>
      isChildSession(memoryInjectorCtx, sessionID),
    _onSystemTransform: onSystemTransform,
  };
}