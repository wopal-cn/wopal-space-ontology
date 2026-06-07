import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"

export function createWopalTaskFinishTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: `Terminate a non-running task and delete its session. Use sparingly — idle sessions retain valuable context.

Only finish when:
- Verification passed, no further work needed (e.g., rook final PASS)
- Session context too high, continuation impractical

Running tasks: abort or reply(interrupt=true) first.

Prefer wopal_task_reply for iteration cycles — finish+new-task wastes context on rebuilding.`,
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
