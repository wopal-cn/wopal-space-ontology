import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"

export function createWopalTaskTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Launch a non-blocking background task with a subagent. Returns task_id in format wopal-task-{session_suffix}. Tasks persist across restarts and can be recovered via wopal_task_output.",
    args: {
      description: tool.schema.string().describe("Short description of the task (3-5 words)"),
      prompt: tool.schema.string().describe("Detailed instructions for the subagent"),
      agent: tool.schema.string().optional().default("general").describe("Agent type: 'general', 'explore', 'code-quality-reviewer', etc."),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to launch task: current session ID is unavailable."
      }

      const agent = args.agent ?? "general"
      const result = await manager.launch({
        description: args.description,
        prompt: args.prompt,
        agent,
        parentSessionID: context.sessionID,
      })

      if (!result.ok) {
        const taskLine = result.taskId ? `Task: ${result.taskId}\n` : ""
        return `Failed to launch task.\n${taskLine}Reason: ${result.error}`
      }

      return `Task launched: ${result.taskId}\nStatus: ${result.status}\n\nUse \`wopal_task_output(task_id="${result.taskId}")\` to check status and retrieve results.`
    },
  })
}
