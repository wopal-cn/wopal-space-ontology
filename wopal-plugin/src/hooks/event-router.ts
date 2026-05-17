import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { DebugLog } from "../debug.js";
import { trackActivity } from "../tasks/progress.js";
import { createDebugLog, formatSessionID } from "../debug.js";
import { getSessionModelInfo } from "../tools/output-helpers.js";

import type { OpenCodeClient } from "../types.js";

interface EventPart {
  type?: string;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

export interface EventRouterHookContext {
  client: OpenCodeClient;
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  taskDebugLog: DebugLog;
  taskManager: SimpleTaskManager | undefined;
}

export function createEventRouter(ctx: EventRouterHookContext) {
  let recovered = false

  const contextLog = createDebugLog("[context] [tokens]", "context");

  async function onEvent(
    input: { event: { type: string; properties?: Record<string, unknown> } },
  ): Promise<void> {
    if (!ctx.taskManager) return

    const eventType = input.event.type
    const props = input.event.properties
    const sessionID = props?.sessionID as string | undefined

    // Lazy recovery: on first event from main session, restore child tasks
    // Early flag setting prevents concurrent events from triggering duplicate recovery
    if (!recovered && sessionID) {
      recovered = true // Set flag immediately to block concurrent events
      const client = ctx.client;
      if (typeof client?.session?.get === "function") {
        try {
const result = await client.session.get({ path: { id: sessionID } })
      const session = (result as { data?: { parentID?: string } } | undefined)?.data
          if (session && !session.parentID) {
            ctx.taskDebugLog(`[recover] main session detected: ${formatSessionID(sessionID, false)}, triggering recovery`)
            void ctx.taskManager.recoverFromSession(sessionID)
          }
        } catch {
          // Reset flag on failure so next event can retry
          recovered = false
        }
      } else {
        recovered = false // Reset if client unavailable
      }
    }

    if (eventType === "message.part.delta") {
      if (sessionID) {
        const task = ctx.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, "text")
        }
      }
    } else if (eventType === "message.part.updated") {
      const part = props?.part as EventPart | undefined

// Token usage logging for step-finish events (context debug module)
if (sessionID && part?.type === "step-finish" && part?.tokens) {
  const t = part.tokens
  const cache = t.cache ?? {}
  const isTask = !!ctx.taskManager?.findBySession(sessionID)
  const agent = ctx.sessionStore.get(sessionID)?.agent ?? "?"

  const used = (t.input ?? 0) + (cache.read ?? 0)

  // Get model info and context limit for percentage calculation
  let model = "?"
  let pctText = ""
  try {
    const modelInfo = await getSessionModelInfo(ctx.client, sessionID)
    if (modelInfo) {
      model = `${modelInfo.providerID}/${modelInfo.modelID}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configClient = ctx.client as any
      if (typeof configClient.config?.providers === "function") {
        const providersResult = await configClient.config.providers({ query: { directory: "" } })
        const providers = providersResult?.data?.providers ?? []
        const provider = providers.find((p: { id: string }) => p.id === modelInfo.providerID)
        const contextLimit = provider?.models?.[modelInfo.modelID]?.limit?.context
        if (contextLimit && contextLimit > 0) {
          pctText = ` pct=${Math.round((used / contextLimit) * 100)}%`
        }
      }
    }
  } catch {
    // ignore — percentage is informational only
  }

  contextLog(`${formatSessionID(sessionID, isTask)} agent=${agent} model=${model} tokens: input=${t.input ?? 0} output=${t.output ?? 0} cache_read=${cache.read ?? 0} cache_write=${cache.write ?? 0}${pctText}`)

  // Store token data in sessionStore for context usage calculation
  if (t.input || cache.read) {
    const modelInfo = await getSessionModelInfo(ctx.client, sessionID).catch(() => null)
    ctx.sessionStore.upsert(sessionID, (state) => {
      if (modelInfo) {
        state.providerID = modelInfo.providerID
        state.modelID = modelInfo.modelID
      }
      const cache = t.cache ? { ...t.cache } : undefined
      state.lastTokens = {
        input: t.input ?? 0,
        output: t.output ?? 0,
        ...(cache ? { cache } : {}),
        updatedAt: Date.now(),
      }
    })
  }
}

      if (sessionID) {
        const task = ctx.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, part?.type)
        }
      }
    }

    if (eventType === "session.idle") {
      if (!sessionID) return

      // Only handle wopal_task child sessions, skip main session idle
      const task = ctx.taskManager?.findBySession(sessionID)
      if (!task) return

      if (!task.idleNotified && task.status === 'running') {
        task.idleNotified = true
        // Release concurrency slot so new tasks can launch
        if (task.concurrencyKey) {
          ctx.taskManager.releaseConcurrencySlot(task)
          task.waitingConcurrencyKey = task.concurrencyKey
          task.concurrencyKey = undefined
        }
        ctx.taskDebugLog(`task ${task.id} idle`)
        ctx.taskManager.notifyParent(task.id).catch((err) => {
          ctx.taskDebugLog(`[notifyParent] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    }

    if (eventType === "session.compacted") {
      if (sessionID) {
        ctx.sessionStore.markCompacted(sessionID);
        ctx.contextDebugLog(`${formatSessionID(sessionID, false)} compact completed (event-driven)`);
      }
    }

    if (eventType === "session.error") {
      // Bug 2 fix: filter MessageAbortedError (user-initiated abort, not a real error)
      const errorName = (props?.error as { name?: string } | undefined)?.name
      if (errorName === "MessageAbortedError") {
        ctx.taskDebugLog(`[session.error] filtered MessageAbortedError`)
        return
      }

      const error = stringifyEventError(props?.error)

      if (sessionID) {
        const task = ctx.taskManager.markTaskErrorBySession(sessionID, error)
        if (task) {
          ctx.taskDebugLog(`task ${task.id} error: ${error}`)
          ctx.taskManager.notifyParent(task.id).catch((err) => {
            ctx.taskDebugLog(`[notifyParent] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
          })
        }
      }
    }

    // 权限请求事件
    if (eventType === "permission.asked") {
      const requestID = props?.id as string | undefined // OpenCode uses 'id', not 'requestID'
      const permission = props?.permission as string | undefined

      ctx.taskDebugLog(`[permission.asked] ${formatSessionID(sessionID ?? "?", !!ctx.taskManager?.findBySession(sessionID ?? ""))} id=${requestID} permission=${permission}`)

      if (sessionID && requestID && permission) {
        const { handlePermissionAsked } = await import("../tasks/permission-proxy.js")
        const patterns = props?.patterns as string[] | undefined
        await handlePermissionAsked(
          { sessionID, requestID, permission, ...(patterns ? { patterns } : {}) },
          ctx.taskManager!,
          ctx.client,
          ctx.taskDebugLog
        )
      }
    }

    // 问题请求事件
    if (eventType === "question.asked") {
      const requestID = props?.id as string | undefined

      if (sessionID && requestID && props?.questions) {
        const { handleQuestionAsked } = await import("../tasks/question-relay.js")
        const questions = props.questions as Array<{ header?: string; question?: string; options?: Array<{ label: string; description: string }> }>
        const firstQuestion = questions[0]
        if (firstQuestion) {
          await handleQuestionAsked(
            { sessionID, requestID: requestID!, question: firstQuestion },
            ctx.taskManager!,
            ctx.taskDebugLog
          )
        }
      }
    }
  }

  function stringifyEventError(error: unknown): string {
    if (typeof error === "string" && error.length > 0) {
      return error
    }

    if (error instanceof Error && error.message) {
      return error.message
    }

    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== "{}") {
        return serialized
      }
    } catch {
      // Ignore JSON serialization failures and fall back to String().
    }

    return String(error)
  }

  return {
    event: onEvent,
    _stringifyEventError: stringifyEventError,
  };
}
