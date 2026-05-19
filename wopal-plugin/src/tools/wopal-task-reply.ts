import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import type { WopalTask, OpenCodeClient } from "../types.js"
import { createDebugLog } from "../debug.js"
import { trackActivity } from "../tasks/progress.js"
import { isResumableTask } from "../tasks/task-phase.js"

const debugLog = createDebugLog("[task]", "task")

function resetTaskForResume(task: WopalTask): void {
  task.status = "running"
  delete task.idleNotified
  delete task.waitingReason
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
    debugLog(`task ${taskId} resolved question via v2 client: requestID=${requestID} result=${JSON.stringify(result)}`)
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

  debugLog(`task ${taskId} resolved question via HTTP fallback: requestID=${requestID}`)
}

export function createWopalReplyTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Send a message to a background task to resume or redirect its execution. Works on any non-running task (waiting, idle, error). Reply re-acquires concurrency slot.",
    args: {
      task_id: tool.schema.string().describe("The ID of the task to reply to"),
      message: tool.schema.string().describe("The message to send to the background task"),
      interrupt: tool.schema.boolean().optional().default(false).describe("Abort current execution and send correction (only for running tasks)"),
    },
    execute: async (args: { task_id: string; message: string; interrupt?: boolean }, context: ToolContext) => {
      const { task_id, message, interrupt = false } = args
      debugLog(`wopal_reply called: task_id=${task_id} interrupt=${interrupt}`)

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
        return `Error: Task is running. Use interrupt=true to abort and redirect, or wait for idle.`
      }

      if (!task.sessionID) {
        return "Error: Task has no active session"
      }

      const client = manager.getClient() as OpenCodeClient

      // Handle interrupt mode
      if (interrupt) {
        try {
          // Abort current execution
          if (typeof client?.session?.abort === "function") {
            try {
              await client.session.abort({ path: { id: task.sessionID } })
              debugLog(`task ${task_id} aborted before interrupt reply`)
            } catch (abortErr) {
              debugLog(`abort failed (task may already be idle): ${abortErr}`)
            }
          }

          // Send corrective message
          if (typeof client?.session?.promptAsync !== "function") {
            return "Error: session.promptAsync is unavailable"
          }

          await client.session.promptAsync({
            path: { id: task.sessionID },
            body: {
              agent: task.agent,
              parts: [{ type: "text", text: message }],
            },
          })

          // Reset state
          resetTaskForResume(task)
          if (task.waitingConcurrencyKey) {
            manager.releaseConcurrencySlot(task)
          }
          debugLog(`task ${task_id} interrupted and resumed with new direction`)

          return `Interrupt sent to task ${task_id}. The background task will continue with new direction.`
        } catch (err) {
          debugLog(`wopal_reply interrupt error: ${err}`)
          return `Failed to send interrupt: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      // Re-acquire concurrency slot before resuming
      manager.reacquireSlotOnWakeUp(task)

      try {
        if (task.pendingQuestionID) {
          const questionID = task.pendingQuestionID
          debugLog(`resolving question deferred: requestID=${questionID}`)

          await replyQuestion(task_id, manager, client, questionID, message)

          debugLog(`question resolved: requestID=${questionID}`)
          delete task.pendingQuestionID

          resetTaskForResume(task)
          debugLog(`task ${task_id} resumed via question.reply`)

          return `Reply sent to task ${task_id}. The background task will continue execution.`
        }

        if (typeof client?.session?.promptAsync !== "function") {
          return "Error: session.promptAsync is unavailable"
        }

        await client.session.promptAsync({
          path: { id: task.sessionID },
          body: {
            agent: task.agent,
            parts: [{ type: "text", text: message }],
          },
        })

        resetTaskForResume(task)
        debugLog(`task ${task_id} resumed`)

        return `Reply sent to task ${task_id}. The background task will continue execution.`
      } catch (err) {
        debugLog(`wopal_reply error: ${err}`)
        return `Failed to send reply: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}
