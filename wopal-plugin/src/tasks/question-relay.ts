import type { SimpleTaskManager } from "./simple-task-manager.js"
import { createDebugLog, type DebugLog } from "../debug.js"
import { toErrorMessage } from "./utils.js"

const defaultDebugLog = createDebugLog("[wopal-task]", "task")

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
  debugLog?: DebugLog,
): Promise<boolean> {
  const log = debugLog ?? defaultDebugLog

  const { sessionID, requestID, question } = event

  // 检查是否是子会话（任务）
  const task = taskManager.findBySession(sessionID)
  if (!task) {
    // 主会话，让 TUI 处理
    log(`[question] main session, skipping relay: sessionID=${sessionID}`)
    return false
  }

  // 子会话，设置 waiting 状态（让 wopal_reply 能找到此任务）
  if (task.status === "running") {
    task.status = "waiting"
    task.waitingReason = "question_tool"
    if (requestID) {
      task.pendingQuestionID = requestID
    }
    log(`[question] set task ${task.id} to waiting (question_tool), requestID=${requestID ?? "N/A"}`)
  }

  log(`[question] child session, relaying to parent: taskID=${task.id}`)

  try {
    await notifyParentQuestion(taskManager, task.id, question, log)
    return true
  } catch (err) {
    // 捕获异常，不传播
    log(`[question] relay failed for task ${task.id}: ${toErrorMessage(err)}`)
    return false
  }
}

async function notifyParentQuestion(
  taskManager: SimpleTaskManager,
  taskId: string,
  question: QuestionAskedEvent["question"],
  debugLog?: DebugLog,
): Promise<void> {
  const log = debugLog ?? defaultDebugLog

  const task = taskManager.getTask(taskId)
  if (!task) {
    log(`[question] task not found: ${taskId}`)
    return
  }

  // 构造通知消息
  const header = question.header ?? "Question from background task"
  const body = question.question ?? header
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = taskManager.getClient() as any

  if (typeof client?.session?.promptAsync !== "function") {
    log(`[question] session.promptAsync unavailable for notification`)
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
    log(`[question] notified parent for task ${taskId}`)
  } catch (err) {
    log(`[question] notify parent failed for task ${taskId}: ${toErrorMessage(err)}`)
    throw err // Re-throw so caller knows it failed
  }
}
