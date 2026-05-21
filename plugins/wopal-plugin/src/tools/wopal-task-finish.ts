import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"

export function createWopalTaskFinishTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description:
      "Task finisher. Terminates pending/idle/error/waiting tasks and deletes child session. Direct termination — child agent NOT woken up. Use after verification passed or to clean up failed/pending tasks. Running tasks: use wopal_task_abort or wopal_task_reply(interrupt=true) first.",
    args: {
      task_id: tool.schema.string().describe("Task ID to finish. Sources: (1) System notification [WOPAL TASK IDLE], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID"),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to finish task: current session ID is unavailable."
      }

      const result = await manager.finishTask(args.task_id, context.sessionID)

      return result.ok
        ? result.message
        : `Failed to finish task: ${result.message}`
    },
  })
}
