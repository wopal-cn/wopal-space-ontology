import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"

export function createWopalTaskDeleteTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description:
      "Delete a completed task and its child session from OpenCode. ⚠️ Only use after verifying task completion via wopal_task_output. Running tasks cannot be deleted — use wopal_task_reply(interrupt=true) to stop first if needed.",
    args: {
      task_id: tool.schema.string().describe("The ID of the task to delete"),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to delete task: current session ID is unavailable."
      }

      const result = await manager.closeTask(args.task_id, context.sessionID)

      return result.ok
        ? result.message
        : `Failed to delete task: ${result.message}`
    },
  })
}
