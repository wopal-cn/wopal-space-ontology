/**
 * Error Routing Handler
 *
 * Handles session.error events.
 * Filters MessageAbortedError and classifies task stop (idle/stuck).
 */

import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import type { LoggerInstance } from "../../logger.js"
import type { OpenCodeClient } from "../../types.js"
import { formatSessionID } from "../../logger.js"
import { classifyTaskStop } from "../../tasks/task-stop-classifier.js"

export interface ErrorHandlerContext {
  taskManager: SimpleTaskManager | undefined
  client: OpenCodeClient
  taskLogger: LoggerInstance
}

/**
 * Stringify event error for display
 */
export function stringifyEventError(error: unknown): string {
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
    // Ignore JSON serialization failures and fall back to String()
  }

  return String(error)
}

/**
 * Handle session.error event - filter MessageAbortedError and classify task stop
 */
export async function handleSessionError(
  ctx: ErrorHandlerContext,
  sessionID: string | undefined,
  error: unknown,
): Promise<void> {
  // Bug 2 fix: filter MessageAbortedError (user-initiated abort, not a real error)
  const errorObj = error as { name?: string } | undefined
  if (errorObj?.name === "MessageAbortedError") {
    ctx.taskLogger.debug(`[session.error] filtered MessageAbortedError`)
    return
  }

  const errorText = stringifyEventError(error)

  if (sessionID) {
    const task = ctx.taskManager?.findBySession(sessionID)
      if (task && (task.status === "running" || task.status === "waiting")) {
      // Release concurrency slot before classification
      if (task.concurrencyKey && ctx.taskManager) {
        ctx.taskManager.releaseConcurrencySlot(task)
        task.waitingConcurrencyKey = task.concurrencyKey
        task.concurrencyKey = undefined
      }

      const result = await classifyTaskStop({
        task,
        client: ctx.client,
        debugLog: ctx.taskLogger,
        errorText,
      })

      ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), error: errorText, status: task.status }, "session.error classified")

      if (result.statusChanged && ctx.taskManager) {
        ctx.taskManager.notifyParent(task.id).catch((err) => {
          ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err }, "[notifyParent] Failed")
        })
      }
    }
  }
}
