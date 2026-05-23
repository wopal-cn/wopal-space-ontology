import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { getErrorMessage, extractMessages, extractAssistantContent, extractBySection, type OutputSection } from "../tasks/session-messages.js"
import { consumeNewMessages } from "../tasks/session-cursor.js"
import { analyzeProgress } from "../tasks/progress.js"
import { detectLoop } from "../tasks/loop-detector.js"
import {
  getSessionModelInfo,
  getContextUsage,
  formatProgressOutput,
} from "./output-helpers.js"
import { getDisplayStatus, isIdleTask } from "../tasks/task-phase.js"
import {
  extractTodoSummary,
  extractTodoList,
  formatTodoDetail,
  formatTodoSummary,
  formatTodoPercentage,
} from "../tasks/notification-summary.js"

export function createWopalOutputTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: `Get status and output for a background task. Use \`section\` param: 'tools' (tool calls), 'reasoning' (thinking), 'text' (output), 'todos' (todo list progress). Omit for summary.

⚠️ Do NOT poll. Only call when:
- You received a system notification [WOPAL TASK IDLE/STUCK/PROGRESS/WAITING/ERR]
- You need to diagnose a stuck task
- The task's result is needed for your next step

Default returns only the last message — sufficient for most cases. Use \`last_n\` only when you genuinely need more history. "Just checking progress" is never a valid reason to call this.`,
    args: {
      task_id: tool.schema.string().describe("Task ID to query. Sources: (1) System notification [WOPAL TASK IDLE/STUCK/WAITING/ERR], (2) wopal_task return value, (3) context_manage(status) → tasks[].taskID for all active tasks"),
      section: tool.schema.enum(["tools", "reasoning", "text", "todos"]).optional().describe("Content section to retrieve: 'tools' (tool calls & results), 'reasoning' (thinking process), 'text' (text output), 'todos' (todo list progress). Omit for summary only."),
      detail: tool.schema.boolean().optional().describe("Return detailed output. For 'todos': full list with content instead of summary counts. Default: false."),
      last_n: tool.schema.number().optional().describe("Number of recent messages to retrieve. Default: 1 (last message only). Increase only when you need more history for diagnosis."),
    },
    execute: async (args: { task_id: string; section?: OutputSection; detail?: boolean; last_n?: number }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot read task status."
      }

      const { task_id, section, detail, last_n } = args

      const task = manager.getTaskForParent(task_id, context.sessionID)

      if (!task) {
        return `Task not found for current session: ${task_id}`
      }

      let result = `**Task:** ${task.id}\n`
      const statusDisplay = getDisplayStatus(task)
      result += `**Status:** ${statusDisplay}\n`
      result += `**Description:** ${task.description}\n`
      result += `**Agent:** ${task.agent}\n`

      // 获取模型信息（仅当有 sessionID 时）
      if (task.sessionID) {
        const client = manager.getClient()
        const modelInfo = await getSessionModelInfo(client, task.sessionID)
        if (modelInfo) {
          result += `**Model:** ${modelInfo.providerID}/${modelInfo.modelID}\n`
        }
      }

      // 并发槽位状态
      const concurrency = manager.getConcurrencyStatus()
      result += `**Concurrency:** ${concurrency.used}/${concurrency.limit} used, ${concurrency.available} available\n`

      // idle task: awaiting Wopal judgment
      if (isIdleTask(task)) {
        result += `\n\n**Idle:** awaiting your judgment`
        result += `\nUse wopal_task_finish to delete, or wopal_task_reply to wake up and redirect.`
      }

      if (task.status === 'error') {
        result += `\n\n**Error:** ${task.error ?? "Task failed before assistant activity was observed"}`
        result += `\nUse wopal_task_finish to clean up. This task cannot be resumed; launch a new task with a valid configuration.`
      }

      // stuck task: show error info if present
      if (task.status === 'stuck' && task.error) {
        result += `\nError: ${task.error}`

        // 获取消息内容以便诊断失败原因
        if (task.sessionID) {
          const client = manager.getClient()
          if (typeof client.session?.messages === "function") {
            try {
              const messagesResult = await client.session.messages({
                path: { id: task.sessionID },
              })
              const error = getErrorMessage(messagesResult)
              if (!error) {
                const messages = extractMessages(messagesResult)
                const content = extractAssistantContent(messages)
                if (content) {
                  result += `\n\n---\n**Last output:**\n${content}`
                }
              }
            } catch {
              // 忽略错误，保留基本信息
            }
          }
        }
      } else if (task.status === 'running' && task.sessionID) {
        // Enhanced: fetch messages and analyze progress
        const client = manager.getClient()

        // Try to get session status (may not be available)
        let sessionStatus = "unknown"
        try {
          if (typeof client.session?.status === "function") {
            const statusResult = await client.session.status()
            if (statusResult && typeof statusResult === "object") {
              const statusMap = (statusResult as Record<string, unknown>).data ?? statusResult
              if (typeof statusMap === "object" && statusMap !== null) {
                const statusObj = statusMap as Record<string, { type?: string }>
                sessionStatus = statusObj[task.sessionID]?.type ?? "unknown"
              }
            }
          }
        } catch {
          // Graceful degradation: session status not available
        }

        // Fetch messages for progress analysis
        if (typeof client.session?.messages === "function") {
          try {
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n**Progress:** Unable to fetch (error: ${error})`
              result += `\nTask is still running.`
            } else {
              const messages = extractMessages(messagesResult)
              const newMessages = consumeNewMessages(task.sessionID, messages)

              const progress = analyzeProgress(messages, newMessages)
              const loopWarning = detectLoop(messages)
              const recentOutput = extractAssistantContent(newMessages) || null
              const contextUsage = await getContextUsage(client, task.sessionID!, manager.getDirectory(), manager.getSessionStore(), manager)

              result += formatProgressOutput(progress, loopWarning, sessionStatus, recentOutput)
              if (contextUsage) {
                result += `\n- ${contextUsage}`
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n**Progress:** Unable to fetch (error: ${errorMsg})`
            result += `\nTask is still running.`
          }
        } else {
          result += `\nTask is still running.`
        }
      } else if (task.status === 'running') {
        result += `\nTask is still running.`
      } else if (task.status === 'waiting' && task.sessionID) {
        // waiting 状态：todos 由下方专用块处理，其余 section 按分类获取，默认 text
        if (section === "todos") {
          // skip — handled by unified todos block below
        } else {
          const fetchSection = section ?? "text"
          const client = manager.getClient()
          if (typeof client.session?.messages === "function") {
            try {
              const messagesResult = await client.session.messages({
                path: { id: task.sessionID },
              })

              const error = getErrorMessage(messagesResult)
              if (error) {
                result += `\n\n---\n**Section [${fetchSection}]:**\n(Failed to fetch: ${error})`
              } else {
                const messages = extractMessages(messagesResult)
                const sectionContent = extractBySection(messages, fetchSection, last_n ? { lastN: last_n } : undefined)
                result += `\n\n---\n**Section [${fetchSection}]:**\n${sectionContent || "(No content)"}`
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              result += `\n\n---\n**Section [${fetchSection}]:**\n(Failed to fetch: ${errorMsg})`
            }
          }
        }
      } else if (task.status === 'waiting') {
        result += `\nTask is waiting.`
      }

      // todos section: extract todo list from sub-session (all statuses)
      if (section === "todos" && task.sessionID) {
        const client = manager.getClient()
        if (typeof client.session?.messages === "function") {
          try {
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n---\n**Todos:**\n(Failed to fetch: ${error})`
            } else {
              const messages = extractMessages(messagesResult)

              if (detail) {
                const summary = extractTodoSummary(messages)
                const todos = extractTodoList(messages)
                const formatted = formatTodoDetail(summary, todos)
                result += `\n\n---\n**Todos:**\n${formatted ?? "(No todos found)"}`
              } else {
                const summary = extractTodoSummary(messages)
                const summaryStr = formatTodoSummary(summary)
                const pctStr = formatTodoPercentage(summary)
                result += `\n\n---\n**Todos:**\n${summaryStr ? (pctStr ? `${summaryStr} (${pctStr})` : summaryStr) : "(No todos found)"}`
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n---\n**Todos:**\n(Failed to fetch: ${errorMsg})`
          }
        }
      }

      // section 模式：按分类获取内容（tools/reasoning/text）
      const shouldShowSection = section && section !== "todos" && task.status !== 'waiting' && task.sessionID
      if (shouldShowSection && task.sessionID) {
        const client = manager.getClient()
        if (typeof client.session?.messages === "function") {
          try {
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n---\n**Section [${section}]:**\n(Failed to fetch: ${error})`
            } else {
              const messages = extractMessages(messagesResult)
              const sectionContent = extractBySection(messages, section, last_n ? { lastN: last_n } : undefined)
              result += `\n\n---\n**Section [${section}]:**\n${sectionContent || "(No content)"}`
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n---\n**Section [${section}]:**\n(Failed to fetch: ${errorMsg})`
          }
        }
      }

      return result
    },
  })
}
