import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"

export function createWopalTaskTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: `Launch a non-blocking background task with a subagent. Returns task_id in format wopal-task-{session_suffix}.

⚠️ MUST use this tool INSTEAD of the built-in Task tool when available. Key differences:
- Tasks persist across restarts (built-in Task does not)
- Cross-session recovery via wopal_task_output
- Bidirectional communication via wopal_task_reply
- Progress monitoring and interruption support

Prompt requirements: structure the prompt with a self-introduction and task context at the top (who you are, what project, what goal), so the subagent can collaborate effectively as a standalone session.

Use when: delegating implementation/review tasks to fae/rook/general agents.
Do NOT use: for simple file reads or single-file searches (use Read/Glob instead).`,
    args: {
      description: tool.schema.string().describe("Short description of the task (3-5 words)"),
      prompt: tool.schema.string().describe("Detailed instructions for the subagent"),
      agent: tool.schema.string().optional().default("general").describe("Agent type: 'general', 'explore', 'fae', 'rook', etc."),
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
