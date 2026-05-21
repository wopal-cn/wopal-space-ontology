import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { WopalTask, OpenCodeClient } from "../types.js"
import { taskLogger } from "../logger.js"
import { trackActivity } from "../tasks/progress.js"
import { isResumableTask } from "../tasks/task-phase.js"

function resetTaskForResume(task: WopalTask): void {
  task.status = "running"
  delete task.idleNotified
  delete task.waitingReason
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

async function replyQuestion(taskId: string, manager: SimpleTaskManager, clientArg: OpenCodeClient, requestID: string, message: string) {
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
    taskLogger.debug(`task ${taskId} resolved question via v2 client: requestID=${requestID} result=${JSON.stringify(result)}`)
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

  taskLogger.debug(`task ${taskId} resolved question via HTTP fallback: requestID=${requestID}`)
}

export function createWopalReplyTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Task communication channel. Resumes/redirects idle/waiting/error tasks via message injection. interrupt=true aborts active execution + sends redirect message. Re-acquires concurrency slot on wake-up. Use wopal_task_abort for pure stop (no message, no wake-up).",
    args: {
      task_id: tool.schema.string().describe("Task ID to communicate. Sources: (1) System notification [WOPAL TASK IDLE/STUCK/WAITING], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID"),
      message: tool.schema.string().describe("The message to send to the background task"),
      interrupt: tool.schema.boolean().optional().default(false).describe("Abort active execution and send redirect message. Only for running tasks. Equivalent to wopal_task_abort + message injection. Use wopal_task_abort if you only want to stop without redirecting."),
    },
    execute: async (args: { task_id: string; message: string; interrupt?: boolean }, context: ToolContext) => {
      const { task_id, message, interrupt = false } = args
      taskLogger.debug(`wopal_reply called: task_id=${task_id} interrupt=${interrupt}`)

      if (!context.sessionID) {
        return "Error: Current session ID is unavailable; cannot reply to task."
      }

      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return "Error: Task not found or not owned by this session"
      }

      // interrupt only works on running status tasks (any running, including idle)
      if (interrupt && task.status !== "running") {
        return `Error: interrupt only works on running tasks. Task is ${task.status}. Use reply without interrupt to resume.`
      }

      // reply without interrupt only works on resumable tasks (waiting, idle, error)
      // running + idleNotified is resumable, but running without idleNotified needs interrupt
      if (!interrupt && !isResumableTask(task)) {
        return `Error: Task is actively running. Use interrupt=true to abort and redirect, or use wopal_task_abort to stop without redirecting.`
      }

      if (!task.sessionID) {
        return "Error: Task has no active session"
      }

      const client = manager.getClient() as OpenCodeClient

      // Handle interrupt mode
      if (interrupt) {
        // Phase 1: Abort current execution
        if (typeof client?.session?.abort === "function") {
          try {
            await client.session.abort({ path: { id: task.sessionID } })
            taskLogger.debug(`task ${task_id} aborted before interrupt reply`)
          } catch (abortErr) {
            taskLogger.debug(`abort failed (task may already be idle): ${abortErr}`)
          }
        }

        // Phase 2: Re-acquire concurrency slot BEFORE sending message
        // This must happen while task is still in idle phase (idleNotified=true)
        // so reacquireSlotOnWakeUp can execute its logic
        manager.reacquireSlotOnWakeUp(task)

        // Phase 3: Send corrective message
        try {
          if (typeof client?.session?.promptAsync !== "function") {
            // Rollback: release the slot we just acquired
            manager.releaseConcurrencySlot(task)
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
          // Now safe to clear idleNotified, waitingReason, waitingConcurrencyKey
          resetTaskForResume(task)

          taskLogger.debug(`task ${task_id} interrupted and resumed with new direction`)

          return `Interrupt sent to task ${task_id}. Previous execution aborted, new message injected. Task will continue with new direction.`
        } catch (err) {
          // Rollback: release the slot we acquired before the failed message
          manager.releaseConcurrencySlot(task)
          taskLogger.debug(`wopal_reply interrupt error: ${err}`)
          return `Failed to send interrupt: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      // Non-interrupt mode
      // Phase 1: Re-acquire concurrency slot BEFORE sending message
      manager.reacquireSlotOnWakeUp(task)

      try {
        if (task.pendingQuestionID) {
          const questionID = task.pendingQuestionID
          taskLogger.debug(`resolving question deferred: requestID=${questionID}`)

          await replyQuestion(task_id, manager, client, questionID, message)

          taskLogger.debug(`question resolved: requestID=${questionID}`)
          delete task.pendingQuestionID

          // Reset state after successful question reply
          resetTaskForResume(task)
          taskLogger.debug(`task ${task_id} resumed via question.reply`)

          return `Reply sent to task ${task_id}. The background task will continue execution.`
        }

        if (typeof client?.session?.promptAsync !== "function") {
          // Rollback: release the slot we just acquired
          manager.releaseConcurrencySlot(task)
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
        taskLogger.debug(`task ${task_id} resumed`)

        return `Reply sent to task ${task_id}. The background task will continue execution.`
      } catch (err) {
        // Rollback: release the slot we acquired before the failed operation
        manager.releaseConcurrencySlot(task)
        taskLogger.debug(`wopal_reply error: ${err}`)
        return `Failed to send reply: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}