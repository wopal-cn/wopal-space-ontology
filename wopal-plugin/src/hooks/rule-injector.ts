/**
 * Rule Injector - Rule injection into system prompt
 *
 * Handles tool ID querying and rule formatting/injection.
 */

import {
  readAndFormatRules,
  type DiscoveredRule,
} from "../rules/index.js";
import { extractConnectedMcpCapabilityIDs } from "./mcp-tools.js";
import type { DebugLog } from "../debug.js";

export interface RuleInjectorContext {
  client: unknown;
  directory: string;
  ruleFiles: DiscoveredRule[];
  rulesDebugLog: DebugLog;
}

/**
 * Query available tool IDs from OpenCode client.
 * Includes built-in tools + connected MCP capability IDs.
 */
export async function queryAvailableToolIDs(
  ctx: RuleInjectorContext,
): Promise<string[]> {
  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = ctx.client as any;
  const query = { directory: ctx.directory };

  const [toolResult, mcpResult] = await Promise.allSettled([
    client.tool?.ids?.({ query }),
    client.mcp?.status?.({ query }),
  ]);

  if (
    toolResult.status === "fulfilled" &&
    Array.isArray(toolResult.value?.data)
  ) {
    for (const id of toolResult.value.data) {
      ids.add(id);
    }
    ctx.rulesDebugLog(
      `Built-in tools: ${toolResult.value.data.slice(0, 10).join(", ")}${toolResult.value.data.length > 10 ? "..." : ""} (${toolResult.value.data.length} total)`,
    );
  } else if (toolResult.status === "rejected") {
    const message =
      toolResult.reason instanceof Error
        ? toolResult.reason.message
        : String(toolResult.reason);
    ctx.rulesDebugLog(`Warning: Failed to query tool IDs: ${message}`);
  }

  if (mcpResult.status === "fulfilled" && mcpResult.value?.data) {
    const mcpIds = extractConnectedMcpCapabilityIDs(mcpResult.value.data);
    for (const id of mcpIds) {
      ids.add(id);
    }
    if (mcpIds.length > 0) {
      ctx.rulesDebugLog(`MCP capability IDs: ${mcpIds.join(", ")}`);
    }
  } else if (mcpResult.status === "rejected") {
    const message =
      mcpResult.reason instanceof Error
        ? mcpResult.reason.message
        : String(mcpResult.reason);
    ctx.rulesDebugLog(`Warning: Failed to query MCP status: ${message}`);
  }

  return Array.from(ids);
}

/**
 * Inject rules into system prompt.
 *
 * @param ctx - Rule injector context
 * @param contextPaths - Current context paths (normalized)
 * @param userPrompt - Latest user prompt (optional)
 * @returns Formatted rules string or undefined if no applicable rules
 */
export async function injectRules(
  ctx: RuleInjectorContext,
  contextPaths: string[],
  userPrompt?: string,
): Promise<string | undefined> {
  const availableToolIDs = await queryAvailableToolIDs(ctx);

  const formattedRules = await readAndFormatRules(
    ctx.ruleFiles,
    contextPaths,
    userPrompt,
    availableToolIDs,
  );

  if (formattedRules) {
    ctx.rulesDebugLog("Injecting rules into system prompt");
    return formattedRules;
  } else {
    ctx.rulesDebugLog("No applicable rules for current context");
    return undefined;
  }
}