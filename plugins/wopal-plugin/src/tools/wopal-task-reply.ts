import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { WopalTask, OpenCodeClient } from "../types.js"
import { taskLogger, formatSessionID } from "../logger.js"
import { trackActivity } from "../tasks/progress.js"
import { isResumableTask } from "../tasks/task-phase.js"
import { armStopNotificationSuppression, clearStopNotificationSuppression } from "../tasks/task-stop-suppression.js"

function resetTaskForResume(task: WopalTask): void {
  task.status = "running"
  // Note: waitingConcurrencyKey is NOT deleted here.
  // It is only cleared by reacquireSlotOnWakeUp when tryAcquire succeeds.
  // If tryAcquire failed (concurrency limit reached), waitingConcurrencyKey remains
  // to preserve retry semantics.
  // Reset progress time baseline so the 3-minute time quota restarts,
  // but total runtime (startedAt) is preserved.
  task.progressNotifyTimeBaseline = new Date()
  task.lastNotifyTimeQuota = 0
  trackActivity(task, "text")
}

function preserveSlotForRetry(task: WopalTask, manager: SimpleTaskManager): void {
  if (task.concurrencyKey) {
    task.waitingConcurrencyKey = task.concurrencyKey
  }
  manager.releaseConcurrencySlot(task)
}

function concurrencyLimitMessage(task: WopalTask): string {
  return `Error: Concurrency limit reached; task remains ${task.status}. Try again after running tasks finish.`
}

async function replyQuestion(task: WopalTask, manager: SimpleTaskManager, clientArg: OpenCodeClient, requestID: string, message: string) {
  const v2Client = manager.getV2Client()
  if (typeof v2Client?.question?.reply === "function") {
    const result = await v2Client.question.reply({
      requestID,
      answers: [[message]],
    })
    // v2 client has ThrowOnError=false by default — must check for error manually
    const resultObj = result as Record<string, unknown> | undefined
    if (resultObj?.error) {
      throw new Error(`question.reply returned error: ${JSON.stringify(resultObj.error)}`)
    }
    taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), request_id: requestID }, "Question resolved via v2 client")
    return
  }

  const questionClient = (clientArg?.question ?? {}) as { reply?: (args: { requestID: string; answers: string[][] }) => Promise<unknown> }
  if (typeof questionClient.reply === "function") {
    await questionClient.reply({
      requestID,
      answers: [[message]],
    })
    return
  }

  const serverUrl = manager.getServerUrl()
  if (!serverUrl) {
    throw new Error("question.reply is unavailable")
  }

  const client = manager.getClient() as Record<string, unknown> | undefined
  const internalClient = client?._client as { getConfig?: () => { fetch?: typeof globalThis.fetch } } | undefined
  const internalFetch = internalClient?.getConfig?.()?.fetch ?? globalThis.fetch

  const url = new URL(`/question/${requestID}/reply`, serverUrl)
  const response = await internalFetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      answers: [[message]],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`question.reply fallback failed: ${response.status} ${response.statusText} — ${body}`)
  }

  taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), request_id: requestID }, "Question resolved via HTTP fallback")
}

export function createWopalReplyTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: `Resume or redirect a non-running task (idle/waiting/stuck) by injecting a message into its session. Error tasks are not resumable; finish them and launch a new task. With interrupt=true, aborts active execution first, then injects the message — use for course correction on running tasks. Re-acquires concurrency slot on wake-up.

Decision guide:
- Task idle/waiting/stuck → reply (resume or redirect)
- Task running, needs correction → reply with interrupt=true (abort + redirect)
- Task running, just stop it → wopal_task_abort (stop without message)
- Task error/done, clean up → wopal_task_finish (terminate + delete)`,
    args: {
      task_id: tool.schema.string().describe("Task ID to communicate. Sources: (1) System notification [WOPAL TASK IDLE/STUCK/WAITING/ERR], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID"),
      message: tool.schema.string().describe("The message to send to the background task"),
      interrupt: tool.schema.boolean().optional().default(false).describe("Abort active execution and send redirect message. Only for running tasks. Equivalent to wopal_task_abort + message injection. Use wopal_task_abort if you only want to stop without redirecting."),
    },
    execute: async (args: { task_id: string; message: string; interrupt?: boolean }, context: ToolContext) => {
      const { task_id, message, interrupt = false } = args
      taskLogger.debug({ task_id: formatSessionID(task_id, true), interrupt }, "wopal_reply called")

      if (!context.sessionID) {
        return "Error: Current session ID is unavailable; cannot reply to task."
      }

      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return "Error: Task not found or not owned by this session"
      }

      if (task.status === "error") {
        return "Error: Task is in error state and cannot be resumed. Use wopal_task_finish to clean it up, then launch a new task with a valid configuration."
      }

      // interrupt only works on running status tasks (any running, including idle)
      if (interrupt && task.status !== "running") {
        return `Error: interrupt only works on running tasks. Task is ${task.status}. Use reply without interrupt to resume.`
      }

      // reply without interrupt only works on resumable tasks (idle, waiting, stuck)
      // running needs interrupt to abort and redirect
      if (!interrupt && !isResumableTask(task)) {
        return `Error: Task is actively running. Use interrupt=true to abort and redirect, or use wopal_task_abort to stop without redirecting.`
      }

      if (!task.sessionID) {
        return "Error: Task has no active session"
      }

      const client = manager.getClient() as OpenCodeClient

      // Handle interrupt mode
      if (interrupt) {
        const sessionClient = client?.session
        const canAbort = typeof sessionClient?.abort === "function"
        const suppression = canAbort
          ? armStopNotificationSuppression(task, "interrupt")
          : undefined

        if (task.concurrencyKey) {
          task.waitingConcurrencyKey = task.concurrencyKey
        }
        manager.releaseConcurrencySlot(task)
        task.status = "idle"

        // Phase 1: Abort current execution
        if (canAbort) {
          try {
            await sessionClient.abort({ path: { id: task.sessionID } })
            taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "Task aborted before interrupt reply")
          } catch (abortErr) {
            if (suppression) {
              clearStopNotificationSuppression(task, suppression.id)
            }
            taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err: abortErr }, "Interrupt abort failed; task may already be idle")
          }
        }

        // Phase 2: Re-acquire concurrency slot BEFORE sending message
        // This must happen while task is still idle so reacquireSlotOnWakeUp can execute its logic
        if (!manager.reacquireSlotOnWakeUp(task)) {
          return concurrencyLimitMessage(task)
        }

        // Phase 3: Send corrective message
        try {
          if (typeof client?.session?.promptAsync !== "function") {
            // Rollback: release the slot we just acquired
            preserveSlotForRetry(task, manager)
            return "Error: session.promptAsync is unavailable"
          }

          await client.session.promptAsync({
            path: { id: task.sessionID },
            body: {
              agent: task.agent,
              parts: [{ type: "text", text: message }],
            },
          })

          // Phase 4: Reset task state AFTER successful message injection
          // Now safe to reset status to running
          resetTaskForResume(task)

          taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "Task interrupted and resumed")

          return `Interrupt sent to task ${task_id}. Previous execution aborted, new message injected. Task will continue with new direction.`
        } catch (err) {
          // Rollback: release the slot we acquired before the failed message
          preserveSlotForRetry(task, manager)
          taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err }, "wopal_reply interrupt failed")
          return `Failed to send interrupt: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      // Non-interrupt mode
      // Phase 1: Re-acquire concurrency slot BEFORE sending message
      if (!manager.reacquireSlotOnWakeUp(task)) {
        return concurrencyLimitMessage(task)
      }

      try {
        if (task.pendingQuestionID) {
          const questionID = task.pendingQuestionID
          taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), request_id: questionID }, "Resolving deferred question")

          await replyQuestion(task, manager, client, questionID, message)

          taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), request_id: questionID }, "Question resolved")
          delete task.pendingQuestionID

          // Reset state after successful question reply
          resetTaskForResume(task)
          taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "Task resumed via question.reply")

          return `Reply sent to task ${task_id}. The background task will continue execution.`
        }

          if (typeof client?.session?.promptAsync !== "function") {
            // Rollback: release the slot we just acquired
            preserveSlotForRetry(task, manager)
            return "Error: session.promptAsync is unavailable"
          }

        await client.session.promptAsync({
          path: { id: task.sessionID },
          body: {
            agent: task.agent,
            parts: [{ type: "text", text: message }],
          },
        })

        // Reset state after successful promptAsync
        resetTaskForResume(task)
        taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "Task resumed")

        return `Reply sent to task ${task_id}. The background task will continue execution.`
      } catch (err) {
        // Rollback: release the slot we acquired before the failed operation
        preserveSlotForRetry(task, manager)
        taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err }, "wopal_reply failed")
        return `Failed to send reply: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}
