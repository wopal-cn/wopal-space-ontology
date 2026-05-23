import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { taskLogger, formatSessionID } from "../logger.js"
import { toErrorMessage } from "../tasks/utils.js"
import { armStopNotificationSuppression, clearStopNotificationSuppression } from "../tasks/task-stop-suppression.js"

export function createWopalTaskAbortTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: `Stop a running task immediately. No message sent, no wake-up — pure termination without redirect.

- Task running, just stop → abort
- Task running, needs correction → wopal_task_reply(interrupt=true)`,
    args: {
      task_id: tool.schema.string().describe("Task ID to abort. Sources: (1) System notification [WOPAL TASK IDLE/STUCK], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID"),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to abort task: current session ID is unavailable."
      }

      const { task_id } = args

      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return "Failed to abort task: task not found or not owned by this session."
      }

      // abort only works on running status tasks
      // idle/waiting/stuck tasks should use finish instead
      if (task.status !== "running") {
        return `Failed to abort task: task is ${task.status}. abort only works on running tasks. Use wopal_task_finish for idle/waiting/stuck tasks.`
      }

      if (!task.sessionID) {
        return "Failed to abort task: task has no active session."
      }

      const client = manager.getClient()

      try {
        const sessionClient = client?.session
        const canAbort = typeof sessionClient?.abort === "function"
        const suppression = canAbort
          ? armStopNotificationSuppression(task, "abort")
          : undefined

        task.status = 'idle'

        if (task.concurrencyKey) {
          task.waitingConcurrencyKey = task.concurrencyKey
        }

        manager.releaseConcurrencySlot(task)

        // Abort current execution
        if (canAbort) {
          try {
            await sessionClient.abort({ path: { id: task.sessionID } })
          } catch (abortErr) {
            if (suppression) {
              clearStopNotificationSuppression(task, suppression.id)
            }
            taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err: toErrorMessage(abortErr) }, "Abort failed; task may already be idle")
          }
        }

        taskLogger.info({ task_id: formatSessionID(task_id, true) }, "Task aborted")

        return `Task ${task_id} aborted. Execution stopped. Task is now idle awaiting your judgment: (1) wopal_task_finish to delete, or (2) TTL 30min auto cleanup. Use wopal_task_reply to wake up and redirect if needed.`
      } catch (err) {
        return `Failed to abort task: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}
