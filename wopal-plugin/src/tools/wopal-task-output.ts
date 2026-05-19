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

export function createWopalOutputTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Get status and output for a background task. Use `section` param: 'tools' (tool calls), 'reasoning' (thinking), 'text' (output). Omit for summary.",
    args: {
      task_id: tool.schema.string().describe("Task ID returned by wopal_task"),
      section: tool.schema.enum(["tools", "reasoning", "text"]).optional().describe("Content section to retrieve: 'tools' (tool calls & results), 'reasoning' (thinking process), 'text' (text output). Omit for summary only."),
      last_n: tool.schema.number().optional().describe("Only output the last N messages. Default: all messages."),
    },
    execute: async (args: { task_id: string; section?: OutputSection; last_n?: number }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot read task status."
      }

      const { task_id, section, last_n } = args

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
        result += `\nUse wopal_task_reply with interrupt=true to abort and redirect.`
      }

      if (task.status === 'error') {
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
              const statusMap = (statusResult.data ?? statusResult) as Record<string, { type?: string }>
              sessionStatus = statusMap[task.sessionID]?.type ?? "unknown"
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
              const contextUsage = await getContextUsage(client, task.sessionID!, manager.getDirectory(), manager.getSessionStore())

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
        // waiting 状态显示等待原因
        if (task.waitingReason) {
          result += `\n**Waiting reason:** ${task.waitingReason}`
        }

        // waiting 状态：如果指定了 section 则按分类获取，否则用 section="text" 获取文本内容
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
      } else if (task.status === 'waiting') {
        result += `\nTask is waiting.`
        if (task.waitingReason) {
          result += `\n**Waiting reason:** ${task.waitingReason}`
        }
      }

      // section 模式：按分类获取内容
      const shouldShowSection = section && task.status !== 'waiting' && task.sessionID
      if (shouldShowSection) {
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
