import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { taskLogger } from "../logger.js"
import { toErrorMessage } from "../tasks/utils.js"

export function createWopalTaskAbortTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Abort active running task. Stops execution immediately — no message sent, no wake-up. Task enters idle phase awaiting finish/TTL cleanup. Use this when you only want to stop a running task without redirecting. For redirect, use wopal_task_reply(interrupt=true).",
    args: {
      task_id: tool.schema.string().describe("Task ID to abort. Sources: (1) System notification [WOPAL TASK IDLE/STUCK], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID"),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to abort task: current session ID is unavailable."
      }

      const { task_id } = args
      taskLogger.debug(`wopal_abort called: task_id=${task_id}`)

      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return "Failed to abort task: task not found or not owned by this session."
      }

      // abort only works on running status tasks that are NOT in idle phase
      // idle phase tasks (running + idleNotified) should use finish instead
      if (task.status !== "running") {
        return `Failed to abort task: task is ${task.status}. abort only works on running tasks. Use wopal_task_finish for idle/error/waiting tasks.`
      }

      if (task.idleNotified) {
        return `Failed to abort task: task is already in idle phase. Use wopal_task_finish to delete, or wopal_task_reply to wake up and redirect.`
      }

      if (!task.sessionID) {
        return "Failed to abort task: task has no active session."
      }

      const client = manager.getClient()

      try {
        // Abort current execution
        if (typeof client?.session?.abort === "function") {
          try {
            await client.session.abort({ path: { id: task.sessionID } })
            taskLogger.debug(`task ${task_id} aborted`)
          } catch (abortErr) {
            taskLogger.debug(`abort failed (task may already be idle): ${toErrorMessage(abortErr)}`)
          }
        }

        // Mark as idle to prevent error status change on session.error event
        // and to prevent promptAsync wake-up (reply will clear this flag)
        task.idleNotified = true

        // Preserve concurrency key for potential reply resume
        if (task.concurrencyKey) {
          task.waitingConcurrencyKey = task.concurrencyKey
        }

        // Release concurrency slot
        manager.releaseConcurrencySlot(task)

        taskLogger.debug(`task ${task_id} aborted, now in idle phase`)

        return `Task ${task_id} aborted. Execution stopped. Task is now in idle phase awaiting your judgment: (1) wopal_task_finish to delete, or (2) TTL 30min auto cleanup. Use wopal_task_reply to wake up and redirect if needed.`
      } catch (err) {
        taskLogger.debug(`wopal_abort error: ${err}`)
        return `Failed to abort task: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}