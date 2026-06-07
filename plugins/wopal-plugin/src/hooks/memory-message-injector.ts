/**
 * Memory Message Injector - Memory injection into user message
 *
 * Retrieves relevant memories and injects them into the last user message
 * as a synthetic part wrapped with <memory-context> tags.
 */

import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { LoggerInstance } from "../logger.js";
import type { MessageWithInfo } from "./message-context.js";
import type { MemoryInjectorContext } from "./memory-injection-utils.js";
import { clearInjectedMemory } from "./memory-injection-utils.js";
import { isChildSession } from "./session-utils.js";
import { buildEnrichedQuery } from "./conversation-context.js";

export interface MemoryMessageInjectorContext {
  memoryInjectorCtx: MemoryInjectorContext;
  memoryInjector: MemoryInjector | undefined;
  sessionStore: SessionStore;
  memoryLogger: LoggerInstance;
  memoryInjectionEnabled: boolean;
}

/**
 * Inject relevant memories into the last user message as a synthetic part.
 *
 * Trigger conditions (checked in order):
 * 1. memoryInjectionEnabled must be true
 * 2. memoryInjector must exist
 * 3. needsMemoryInjection flag must be set (consumed immediately)
 * 4. Not a child session
 * 5. Memory store not empty
 * 6. User query available
 */
export async function injectMemoryToMessage(
  ctx: MemoryMessageInjectorContext,
  sessionID: string,
  messages: MessageWithInfo[],
  lastUserMsg: MessageWithInfo | undefined,
): Promise<void> {
  if (!ctx.memoryInjectionEnabled) return;
  if (!ctx.memoryInjector) return;

  const state = ctx.sessionStore.get(sessionID);

  // Gate: only proceed when flagged by chat.message or history seed
  if (!state?.needsMemoryInjection) return;

  // Consume the flag immediately — tool-use re-enters will skip entirely
  ctx.sessionStore.upsert(sessionID, (s) => {
    s.needsMemoryInjection = false;
  });

  // No user message to inject into
  if (!lastUserMsg) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    return;
  }

  // Skip child sessions — check early to avoid wasted retrieval work
  const isChild = await isChildSession(sessionID, {
    client: ctx.memoryInjectorCtx.client,
    taskManager: ctx.memoryInjectorCtx.taskManager,
    cache: ctx.memoryInjectorCtx.childSessionCache,
  });
  if (isChild) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    ctx.memoryLogger.debug("Skipped memory injection for child session");
    return;
  }

  // Skip entirely if memory store is empty
  try {
    if (await ctx.memoryInjector.isEmpty()) {
      clearInjectedMemory(ctx.sessionStore, sessionID);
      return;
    }
  } catch {
    // Store not initialized yet, skip silently
    clearInjectedMemory(ctx.sessionStore, sessionID);
    return;
  }

  const userQuery = state.lastUserPrompt;
  if (!userQuery) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    ctx.memoryLogger.debug("Skipped memory injection (no user query)");
    return;
  }

  // Build enriched query from messages parameter (not API call)
  const enrichedQuery = buildEnrichedQuery(
    ctx.memoryLogger,
    sessionID,
    userQuery,
    messages,
  );

  if (!enrichedQuery) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    ctx.memoryLogger.debug(
      `Skipped memory injection for short/command input: "${userQuery}"`,
    );
    return;
  }

  // Execute retrieval + injection with timeout guard
  try {
    let timedOut = false;
    const injectPromise = doInjectMemory(
      ctx,
      sessionID,
      lastUserMsg,
      enrichedQuery,
      () => timedOut,
    );
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 8_000),
    );
    const result = await Promise.race([injectPromise, timeoutPromise]);
    if (result === "timeout") {
      timedOut = true;
      clearInjectedMemory(ctx.sessionStore, sessionID);
      ctx.memoryLogger.warn("Memory injection timed out (8s), skipping");
    }
    // Suppress unhandled rejection from the loser of Promise.race
    injectPromise.catch(() => {});
  } catch (error) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    ctx.memoryLogger.warn(`Memory injection failed: ${error}`);
  }
}

/**
 * Pure retrieval + injection into user message. All skip decisions are made by the caller.
 */
async function doInjectMemory(
  ctx: MemoryMessageInjectorContext,
  sessionID: string,
  lastUserMsg: MessageWithInfo,
  enrichedQuery: string,
  isCancelled?: () => boolean,
): Promise<void> {
  const injector = ctx.memoryInjector;
  if (!injector) return;

  const memoryText = await injector.retrieveAndFormat(enrichedQuery, sessionID);
  if (!memoryText) {
    clearInjectedMemory(ctx.sessionStore, sessionID);
    ctx.memoryLogger.debug("No relevant memories found");
    return;
  }

  if (isCancelled?.()) return;

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: `<memory-context>\n${memoryText}\n</memory-context>`,
    synthetic: true,
  });

  ctx.sessionStore.upsert(sessionID, (state) => {
    state.injectedRawText = memoryText;
  });
}
