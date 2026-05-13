import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { DebugLog } from "../debug.js";
import { trackActivity } from "../tasks/progress.js";
import type { IdleDiagnostic } from "../tasks/idle-diagnostic.js";

export interface EventRouterHookContext {
  client: unknown;
  sessionStore: SessionStore;
  debugLog: DebugLog;
  taskDebugLog: DebugLog;
  taskManager: SimpleTaskManager | undefined;
}

export function createEventRouter(ctx: EventRouterHookContext) {
  let recovered = false

  async function onEvent(
    input: { event: { type: string; properties?: Record<string, unknown> } },
  ): Promise<void> {
    if (!ctx.taskManager) return

    const eventType = input.event.type
    const props = input.event.properties

    // Lazy recovery: trigger on first event with a sessionID
    if (!recovered && ctx.taskManager) {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        recovered = true
        void ctx.taskManager.recoverFromSession(sessionID).catch((err) => {
          ctx.taskDebugLog(`[recover] failed: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    }

    const ACTIONABLE_EVENTS = new Set(["session.idle"])
    if (ACTIONABLE_EVENTS.has(eventType)) {
      const eventSessionID = props?.sessionID as string | undefined
      ctx.taskDebugLog(`[onEvent] received event: ${eventType}${eventSessionID ? ` session=${eventSessionID}` : ''}`)
    }

    // Track meaningful activity from streaming events for stuck detection
    if (eventType === "message.part.delta") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        const task = ctx.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, "text")
        }
      }
    } else if (eventType === "message.part.updated") {
      const sessionID = props?.sessionID as string | undefined
      const part = props?.part as { type?: string } | undefined
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
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      // 检查是否是 wopal_task 子会话
      const task = ctx.taskManager?.findBySession(sessionID)
      if (!task) {
        ctx.taskDebugLog(`[onEvent] session.idle for ${sessionID.slice(0, 8)}: no matching task found`)
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
      const sessionID = props?.sessionID as string | undefined;
      if (sessionID) {
        ctx.sessionStore.markCompacted(sessionID);
        ctx.debugLog(`Session ${sessionID} compact completed (event-driven)`);
      }
    }

    if (eventType === "session.error") {
      // Bug 2 fix: filter MessageAbortedError (user-initiated abort, not a real error)
      const errorName = (props?.error as { name?: string } | undefined)?.name
      if (errorName === "MessageAbortedError") {
        ctx.taskDebugLog(`[session.error] filtered MessageAbortedError`)
        return
      }

      const sessionID = props?.sessionID as string | undefined
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
      const sessionID = props?.sessionID as string | undefined
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
      const sessionID = props?.sessionID as string | undefined
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