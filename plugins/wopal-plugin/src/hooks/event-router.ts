/**
 * Event Router - Assembly Layer
 *
 * Routes OpenCode events to appropriate handlers.
 * Delegates to specialized handler modules for each event type.
 */

import type { SessionStore } from "../session-store.js"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { LoggerInstance } from "../logger.js"
import type { OpenCodeClient } from "../types.js"
import { formatSessionID } from "../logger.js"

// Import specialized handlers
import { handleMessageUpdated, handleMessagePartDelta, handleMessagePartUpdated } from "./events/message-token-handler.js"
import { handleSessionIdle, handleSessionCompacted } from "./events/idle-compact-handler.js"
import { handleSessionError, stringifyEventError } from "./events/error-handler.js"

export interface EventRouterHookContext {
  client: OpenCodeClient
  sessionStore: SessionStore
  contextLogger: LoggerInstance
  taskLogger: LoggerInstance
  coreLogger: LoggerInstance
  taskManager: SimpleTaskManager | undefined
}

export function createEventRouter(ctx: EventRouterHookContext) {
  let recovered = false

  async function onEvent(
    input: { event: { type: string; properties?: Record<string, unknown> } },
  ): Promise<void> {
    if (!ctx.taskManager) return

    const eventType = input.event.type
    const props = input.event.properties
    const sessionID = props?.sessionID as string | undefined

    // Lazy recovery: on first event from main session, restore child tasks
    if (!recovered && sessionID) {
      recovered = true
      const client = ctx.client
      if (typeof client?.session?.get === "function") {
        try {
          const result = await client.session.get({ path: { id: sessionID } })
          const session = (result as { data?: { parentID?: string; title?: string } } | undefined)?.data
          if (session && !session.parentID) {
            // Ensure main session is registered in sessionStore with title
            ctx.sessionStore.upsert(sessionID, (s) => {
              if (session.title) s.title = session.title
            })
            ctx.coreLogger.info(`[recover] main session detected: ${formatSessionID(sessionID, false)}, triggering recovery`)
            void ctx.taskManager.recoverFromSession(sessionID)
          }
        } catch {
          recovered = false
        }
      } else {
        recovered = false
      }
    }

    // Route to specialized handlers
    if (eventType === "message.updated") {
      if (sessionID) {
        const info = props?.info as { agent?: string; providerID?: string; modelID?: string; model?: { providerID?: string; modelID?: string } } | undefined
        const providerID = info?.providerID ?? info?.model?.providerID
        const modelID = info?.modelID ?? info?.model?.modelID
        ctx.contextLogger.trace(
          {
            session_id: formatSessionID(sessionID, typeof ctx.taskManager?.isTaskSession === "function" && ctx.taskManager.isTaskSession(sessionID)),
            message_id: props?.messageID ?? props?.messageId ?? props?.id ?? "?",
            agent: info?.agent ?? "?",
            model: providerID && modelID ? `${providerID}/${modelID}` : "?",
            prop_keys: Object.keys(props ?? {}),
          },
          "Message updated",
        )
        handleMessageUpdated(
          { client: ctx.client, sessionStore: ctx.sessionStore, taskManager: ctx.taskManager, contextLog: ctx.contextLogger },
          sessionID,
          info,
        )
      }
    } else if (eventType === "message.part.delta") {
      handleMessagePartDelta(
        { client: ctx.client, sessionStore: ctx.sessionStore, taskManager: ctx.taskManager, contextLog: ctx.contextLogger },
        sessionID,
      )
    } else if (eventType === "message.part.updated") {
      const part = props?.part as { type?: string; snapshot?: unknown; tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } } | undefined
      await handleMessagePartUpdated(
        { client: ctx.client, sessionStore: ctx.sessionStore, taskManager: ctx.taskManager, contextLog: ctx.contextLogger },
        sessionID,
        part,
      )
    }

    if (eventType === "session.idle") {
      await handleSessionIdle(
        {
          client: ctx.client,
          sessionStore: ctx.sessionStore,
          taskManager: ctx.taskManager,
          contextLogger: ctx.contextLogger,
          taskLogger: ctx.taskLogger,
        },
        sessionID ?? "",
      )
    }

    if (eventType === "session.next.compaction.ended") {
      const text = props?.text as string | undefined
      if (sessionID && text) {
        ctx.sessionStore.setCompactionSummary(sessionID, text)
        ctx.contextLogger.debug(`[compaction.ended] cached compaction summary for ${formatSessionID(sessionID, !!ctx.taskManager?.isTaskSession(sessionID))} (${text.length} chars)`)
      }
    }

    if (eventType === "session.compacted") {
      await handleSessionCompacted(
        {
          client: ctx.client,
          sessionStore: ctx.sessionStore,
          taskManager: ctx.taskManager,
          contextLogger: ctx.contextLogger,
          taskLogger: ctx.taskLogger,
        },
        sessionID ?? "",
      )
    }

    if (eventType === "session.error") {
      await handleSessionError(
        { taskManager: ctx.taskManager, client: ctx.client, taskLogger: ctx.taskLogger },
        sessionID,
        props?.error,
      )
    }

    // Permission/question relay handlers (keep dynamic imports for code splitting)
    if (eventType === "permission.asked") {
      const requestID = props?.id as string | undefined
      const permission = props?.permission as string | undefined

      ctx.taskLogger.debug(`[permission.asked] ${formatSessionID(sessionID ?? "?", !!sessionID && !!ctx.taskManager?.isTaskSession(sessionID))} id=${requestID} permission=${permission}`)

      if (sessionID && requestID && permission) {
        const { handlePermissionAsked } = await import("../tasks/permission-proxy.js")
        const patterns = props?.patterns as string[] | undefined
        await handlePermissionAsked(
          { sessionID, requestID, permission, ...(patterns ? { patterns } : {}) },
          ctx.taskManager!,
          ctx.client,
          ctx.taskLogger,
        )
      }
    }

    if (eventType === "question.asked") {
      const requestID = props?.id as string | undefined

      if (sessionID && requestID && props?.questions) {
        const { handleQuestionAsked } = await import("../tasks/question-relay.js")
        const questions = props.questions as Array<{ header?: string; question?: string; options?: Array<{ label: string; description: string }> }>
        const firstQuestion = questions[0]
        if (firstQuestion) {
          await handleQuestionAsked(
            { sessionID, requestID, question: firstQuestion },
            ctx.taskManager!,
            ctx.taskLogger,
          )
        }
      }
    }
  }

  return {
    event: onEvent,
    _stringifyEventError: stringifyEventError,
  }
}
