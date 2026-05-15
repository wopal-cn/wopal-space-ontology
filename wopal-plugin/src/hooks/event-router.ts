import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { DebugLog } from "../debug.js";
import { trackActivity } from "../tasks/progress.js";
import { createInfoLog } from "../debug.js";
import { getSessionModelInfo } from "../tools/output-helpers.js";
import type { IdleDiagnostic } from "../tasks/idle-diagnostic.js";

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
  client: unknown;
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
  taskDebugLog: DebugLog;
  taskManager: SimpleTaskManager | undefined;
}

export function createEventRouter(ctx: EventRouterHookContext) {
  let recovered = false

  const infoLog = createInfoLog("[plugin] [tokens]");

  async function onEvent(
    input: { event: { type: string; properties?: Record<string, unknown> } },
  ): Promise<void> {
    if (!ctx.taskManager) return

    const eventType = input.event.type
    const props = input.event.properties
    const sessionID = props?.sessionID as string | undefined

    // Lazy recovery: on first event from main session, restore child tasks
    if (!recovered && sessionID) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = ctx.client as any
      if (typeof client?.session?.get === "function") {
        try {
          const result = await client.session.get({ path: { id: sessionID } })
          const session = result?.data
          if (session && !session.parentID) {
            recovered = true
            ctx.taskDebugLog(`[recover] main session detected: ${sessionID.slice(0, 16)}, triggering recovery`)
            void ctx.taskManager.recoverFromSession(sessionID)
          }
        } catch {
          // Next event will retry
        }
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

      // Token usage logging for all step-finish events (always-on, no debug flag needed)
      if (sessionID && part?.type === "step-finish" && part?.tokens) {
        const t = part.tokens
        const cache = t.cache ?? {}
        const isTask = !!ctx.taskManager?.findBySession(sessionID)
        const role = isTask ? "task" : "main"
        const modelInfo = await getSessionModelInfo(ctx.client, sessionID)
        const model = modelInfo ? ` model=${modelInfo.providerID}/${modelInfo.modelID}` : ""
        infoLog(`${sessionID.slice(0, 16)}(${role}) tokens: input=${t.input ?? 0} output=${t.output ?? 0} cache_read=${cache.read ?? 0} cache_write=${cache.write ?? 0}${model}`)
      }

      if (sessionID) {
        const task = ctx.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, part?.type)
          // Cache context usage when step finishes (tokens are populated)
          if (part?.type === "step-finish") {
            void ctx.taskManager?.cacheContextUsage(sessionID)
          }
        }
      }
    }

    if (eventType === "session.idle") {
      if (!sessionID) return

      // 检查是否是 wopal_task 子会话
      const task = ctx.taskManager?.findBySession(sessionID)
      if (!task) {
        ctx.taskDebugLog(`[onEvent] session.idle for ${sessionID.slice(0, 16)}: no matching task found`)
        return
      }

      // 拉取消息并诊断
      const diagnostic = await diagnoseIdleSession(sessionID)

      // Phase 3: 所有 idle 统一走 idleNotified 路径，判断权交给 Wopal
      if (!task.idleNotified && task.status === 'running') {
        task.idleNotified = true
        // Release concurrency slot so new tasks can launch
        if (task.concurrencyKey) {
          ctx.taskManager.releaseConcurrencySlot(task)
          task.waitingConcurrencyKey = task.concurrencyKey
          task.concurrencyKey = undefined
        }
        ctx.taskDebugLog(`task ${task.id} idle: verdict=${diagnostic.verdict}, reason=${diagnostic.reason}`)
        ctx.taskManager.notifyParent(task.id).catch((err) => {
          ctx.taskDebugLog(`[notifyParent] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
        })

        // Task completion notification (sound + marker file)
        if (diagnostic.verdict === "completed") {
          const { notifyTaskCompletion } = await import("../tasks/task-completion-notify.js")
          notifyTaskCompletion(sessionID)
        }
      }
    }

    if (eventType === "session.compacted") {
      if (sessionID) {
        ctx.sessionStore.markCompacted(sessionID);
        ctx.contextDebugLog(`Session ${sessionID} compact completed (event-driven)`);
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

      ctx.taskDebugLog(`[permission.asked] event received: sessionID=${sessionID} id=${requestID} permission=${permission}`)

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

  async function diagnoseIdleSession(sessionID: string): Promise<IdleDiagnostic> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = ctx.client as any
      if (typeof client?.session?.messages !== "function") {
        return { verdict: 'error', reason: 'no_message_access' }
      }

      const result = await client.session.messages({
        path: { id: sessionID },
        query: { limit: 10 }
      })
      const messages = result?.data ?? []
      ctx.taskDebugLog(`diagnoseIdleSession: fetched ${messages.length} messages (limit: 10)`)

      const { diagnoseIdle } = await import("../tasks/idle-diagnostic.js")
      return diagnoseIdle(messages)
    } catch (err) {
      ctx.taskDebugLog(`diagnoseIdleSession error: ${err}`)
      return { verdict: 'error', reason: 'diagnostic_failed' }
    }
  }

  return {
    event: onEvent,
    _diagnoseIdleSession: diagnoseIdleSession,
    _stringifyEventError: stringifyEventError,
  };
}