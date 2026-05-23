import type { SimpleTaskManager } from "./simple-task-manager.js"
import type { WopalTask } from "../types.js"
import { taskLogger, formatSessionID, type LoggerInstance } from "../logger.js"
import { toErrorMessage } from "./utils.js"
import type { OpenCodeClient } from "../types.js"

const defaultDebugLog = taskLogger

export interface QuestionAskedEvent {
  sessionID: string
  requestID?: string
  question: {
    header?: string
    question?: string
    options?: Array<{ label: string; description: string }>
    [key: string]: unknown
  }
}

/**
 * 处理问题请求事件
 * 
 * 子会话（任务）的问题请求会通知父代理；
 * 主会话的问题请求返回 false，让 TUI 处理。
 * 
 * @param event - 问题请求事件
 * @param taskManager - 任务管理器
 * @returns true 表示已处理，false 表示未处理（让 TUI 处理）
 */
export async function handleQuestionAsked(
  event: QuestionAskedEvent,
  taskManager: SimpleTaskManager,
  debugLog?: LoggerInstance,
): Promise<boolean> {
  const log = debugLog ?? defaultDebugLog

  const { sessionID, requestID, question } = event

  // 检查是否是子会话（任务）
  const task = taskManager.findBySession(sessionID)
  if (!task) {
    // 主会话，让 TUI 处理
    log.debug({ session_id: formatSessionID(sessionID, false) }, "[question] Skipped relay for main session")
    return false
  }

  // 子会话，设置 waiting 状态（让 wopal_reply 能找到此任务）
  if (task.status === "running") {
    task.status = "waiting"
    if (requestID) {
      task.pendingQuestionID = requestID
    }
    log.debug({ task_id: formatSessionID(task.sessionID, true), request_id: requestID ?? "N/A" }, "[question] Task set to waiting")
  }

  log.debug({ task_id: formatSessionID(task.sessionID, true) }, "[question] Relaying child question to parent")

  try {
    await notifyParentQuestion(taskManager, task, question, log)
    return true
  } catch (err) {
    // 捕获异常，不传播
    log.debug({ task_id: formatSessionID(task.sessionID, true), err: toErrorMessage(err) }, "[question] Relay failed")
    return false
  }
}

async function notifyParentQuestion(
  taskManager: SimpleTaskManager,
  task: WopalTask,
  question: QuestionAskedEvent["question"],
  debugLog?: LoggerInstance,
): Promise<void> {
  const log = debugLog ?? defaultDebugLog

  // 构造通知消息
  const header = question.header ?? "Question from background task"
  const body = question.question ?? header
  const taskId = task.id // Keep original taskId for notification text
  let optionsText = ""
  if (question.options && question.options.length > 0) {
    const formattedOptions = question.options
      .map((opt, i) => `  ${i + 1}. ${opt.label} — ${opt.description}`)
      .join("\n")
    optionsText = `\n**Options:**\n${formattedOptions}`
  }

  const notification = `<system-reminder>
[WOPAL TASK QUESTION]
**Task ID:** \`${taskId}\`
**Description:** ${task.description}
**Question:** ${body}${optionsText}

This question requires your attention. The background task is waiting.
</system-reminder>`

  const client = taskManager.getClient() as OpenCodeClient

  if (typeof client?.session?.promptAsync !== "function") {
    log.debug("[question] session.promptAsync unavailable for notification")
    return
  }

  try {
    await client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: notification, synthetic: true }],
      },
    })
    log.debug({ task_id: formatSessionID(task.sessionID, true) }, "[question] Notified parent")
  } catch (err) {
    log.debug({ task_id: formatSessionID(task.sessionID, true), err: toErrorMessage(err) }, "[question] Notify parent failed")
    throw err // Re-throw so caller knows it failed
  }
}
