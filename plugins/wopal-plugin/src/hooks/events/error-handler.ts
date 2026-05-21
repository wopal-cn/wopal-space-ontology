/**
 * Error Routing Handler
 *
 * Handles session.error events.
 * Filters MessageAbortedError and marks task errors.
 */

import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import type { LoggerInstance } from "../../logger.js"

export interface ErrorHandlerContext {
  taskManager: SimpleTaskManager | undefined
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
 * Handle session.error event - filter MessageAbortedError and mark task error
 */
export function handleSessionError(
  ctx: ErrorHandlerContext,
  sessionID: string | undefined,
  error: unknown,
): void {
  // Bug 2 fix: filter MessageAbortedError (user-initiated abort, not a real error)
  const errorObj = error as { name?: string } | undefined
  if (errorObj?.name === "MessageAbortedError") {
    ctx.taskLogger.debug(`[session.error] filtered MessageAbortedError`)
    return
  }

  const errorText = stringifyEventError(error)

  if (sessionID) {
    const task = ctx.taskManager?.markTaskErrorBySession(sessionID, errorText)
    if (task) {
      ctx.taskLogger.debug(`task ${task.id} error: ${errorText}`)
      ctx.taskManager?.notifyParent(task.id).catch((err) => {
        ctx.taskLogger.debug(`[notifyParent] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  }
}
