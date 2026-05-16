import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { createDebugLog, formatSessionID } from "../debug.js"

const debugLog = createDebugLog("[task]", "task")

export function createWopalTaskDiffTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Show file changes made by a background task. More token-efficient than wopal_task_output for verifying code changes.",
    args: {
      task_id: tool.schema.string().describe("Task ID to check file changes for"),
    },
    execute: async (args: { task_id: string }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot check diff."
      }

      const { task_id } = args
      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return `Task not found for current session: ${task_id}`
      }

      if (!task.sessionID) {
        return "Task has no active session; cannot retrieve diff."
      }

      const v2Client = manager.getV2Client()
      if (typeof v2Client?.session?.diff !== "function") {
        return "File diff is unavailable (session.diff not supported). Use wopal_task_output to check the task output instead."
      }

      try {
        debugLog(`[diff] querying for ${formatSessionID(task.sessionID, true)}`)

        // First, get session messages to diagnose snapshot availability
        let snapshotDiagnosis = ""
        if (typeof v2Client.session?.messages === "function") {
          try {
            const messagesResult = await v2Client.session.messages({ sessionID: task.sessionID })
            const messages = ((messagesResult as Record<string, unknown>)?.data ?? messagesResult) as unknown
            debugLog(`[diff] messages count: ${Array.isArray(messages) ? messages.length : 'N/A'}`)

            if (Array.isArray(messages)) {
              let stepStartCount = 0
              let stepFinishCount = 0
              let stepStartWithSnapshot = 0
              let stepFinishWithSnapshot = 0

              for (const msg of messages) {
                if (Array.isArray(msg?.parts)) {
                  for (const part of msg.parts) {
                    if (part?.type === "step-start") {
                      stepStartCount++
                      if (part?.snapshot) stepStartWithSnapshot++
                    }
                    if (part?.type === "step-finish") {
                      stepFinishCount++
                      if (part?.snapshot) stepFinishWithSnapshot++
                    }
                  }
                }
              }

              debugLog(`[diff] step-start: ${stepStartCount} (with snapshot: ${stepStartWithSnapshot})`)
              debugLog(`[diff] step-finish: ${stepFinishCount} (with snapshot: ${stepFinishWithSnapshot})`)

              if (stepStartCount === 0 || stepFinishCount === 0) {
                snapshotDiagnosis = `\nDiagnostic: No step-start/step-finish parts found (start=${stepStartCount}, finish=${stepFinishCount}). Session may not have completed a full LLM cycle.`
              } else if (stepStartWithSnapshot === 0 || stepFinishWithSnapshot === 0) {
                snapshotDiagnosis = `\nDiagnostic: step-start/step-finish exist but missing snapshot fields (start_snapshot=${stepStartWithSnapshot}/${stepStartCount}, finish_snapshot=${stepFinishWithSnapshot}/${stepFinishCount}). OpenCode snapshot tracking may be disabled.`
              }
            }
          } catch (msgErr) {
            debugLog(`[diff] failed to get messages: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`)
          }
        }

        const directory = manager.getDirectory()
        debugLog(`[diff] calling session.diff: ${formatSessionID(task.sessionID, true)} directory=${directory}`)
        const result = await v2Client.session.diff({
          sessionID: task.sessionID,
          directory,
        })
        debugLog(`[diff] raw result: ${JSON.stringify(result)}`)

        const diffs = ((result as Record<string, unknown>)?.data ?? result) as unknown
        debugLog(`[diff] extracted diffs: ${JSON.stringify(diffs)} (isArray=${Array.isArray(diffs)}, len=${Array.isArray(diffs) ? diffs.length : 'N/A'})`)
        if (!Array.isArray(diffs) || diffs.length === 0) {
          return `No file changes in this task.${snapshotDiagnosis}`
        }

        let output = `**File changes for task ${task.id}:**\n\n`
        let totalAdditions = 0
        let totalDeletions = 0

        for (const diff of diffs) {
          const status = diff.status ?? "modified"
          const icon = status === "added" ? "+" : status === "deleted" ? "-" : "~"
          output += `[${icon}] ${diff.file} (+${diff.additions}/-${diff.deletions})\n`
          totalAdditions += diff.additions ?? 0
          totalDeletions += diff.deletions ?? 0
        }

        output += `\nTotal: ${diffs.length} files changed, +${totalAdditions}/-${totalDeletions} lines`
        return output
      } catch (err) {
        debugLog(`[diff] error: ${err instanceof Error ? err.message : String(err)}`)
        return `Failed to retrieve diff: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}