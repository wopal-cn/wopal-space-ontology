import type { SimpleTaskManager } from "./simple-task-manager.js"
import { taskLogger, formatSessionID, type LoggerInstance } from "../logger.js"
import { toErrorMessage } from "./utils.js"
import { sendNotification } from "./task-notifier.js"
import type { OpenCodeClient } from "../types.js"

const defaultDebugLog = taskLogger
const defaultWarnLog = taskLogger

export interface PermissionAskedEvent {
  sessionID: string
  requestID: string
  permission: string // 如 "bash", "write", etc.
  patterns?: string[]
}

/**
 * 处理权限请求事件
 * 
 * 子会话（任务）的权限请求自动批准并通知父代理；
 * 主会话的权限请求返回 false，让 TUI 处理。
 * 
 * @param event - 权限请求事件
 * @param taskManager - 任务管理器
 * @param client - OpenCode 客户端（可选，优先从 taskManager 获取）
 * @returns true 表示已处理，false 表示未处理（让 TUI 处理）
 */
export async function handlePermissionAsked(
  event: PermissionAskedEvent,
  taskManager: SimpleTaskManager,
  client?: OpenCodeClient,
  debugLog?: LoggerInstance,
): Promise<boolean> {
  const log = debugLog ?? defaultDebugLog
  const warnLog = defaultWarnLog

  const { sessionID, requestID, permission, patterns } = event

  // 检查是否是子会话（任务）
  const task = taskManager.findBySession(sessionID)
  if (!task) {
    // 主会话，让 TUI 处理
    log.debug(`[permission] ${formatSessionID(sessionID, false)} skipping auto-reply (main session)`)
    return false
  }

  // 子会话，自动批准权限
  log.debug(`[permission] child session, auto-replying: taskID=${task.id} permission=${permission} requestID=${requestID}`)

  // 获取客户端（v1 SDK: postSessionIdPermissionsPermissionId）
  const actualClient = client ?? taskManager.getClient()
  const clientAny = actualClient

  // v2 SDK: client.permission.reply({ requestID, reply: "once" })
  // v1 SDK: client.postSessionIdPermissionsPermissionId({ path: { id, permissionID }, body: { response } })
  const v2Reply = clientAny?.permission?.reply
  const v1Reply = clientAny?.postSessionIdPermissionsPermissionId

  if (typeof v1Reply === "function") {
    try {
      await v1Reply.call(clientAny, {
        path: { id: sessionID, permissionID: requestID },
        body: { response: "once" },
      })
      log.debug(`[permission] auto-replied 'once' via v1 SDK for task ${task.id}`)
      await notifyParentPermission(taskManager, task.id, permission, patterns, log)
      return true
    } catch (err) {
      warnLog.warn(`[permission] v1 reply failed for task ${task.id}: ${toErrorMessage(err)}`)
      return false
    }
  }

  if (typeof v2Reply === "function") {
    try {
      await v2Reply.call(clientAny.permission, { requestID, reply: "once" })
      log.debug(`[permission] auto-replied 'once' via v2 SDK for task ${task.id}`)
      await notifyParentPermission(taskManager, task.id, permission, patterns, log)
      return true
    } catch (err) {
      warnLog.warn(`[permission] v2 reply failed for task ${task.id}: ${toErrorMessage(err)}`)
      return false
    }
  }

  warnLog.warn(`[permission] no permission reply API available for task ${task.id}`)
  return false
}

async function notifyParentPermission(
  taskManager: SimpleTaskManager,
  taskId: string,
  permission: string,
  patterns?: string[],
  debugLog?: LoggerInstance,
): Promise<void> {
  const log = debugLog ?? defaultDebugLog

  const task = taskManager.getTask(taskId)
  if (!task) {
    log.debug(`[permission] task not found for notification: ${taskId}`)
    return
  }

  const notification = `<system-reminder>
[WOPAL TASK PERMISSION]
**Task ID:** \`${taskId}\`
**Permission:** ${permission}
${patterns && patterns.length > 0 ? `**Patterns:** ${patterns.join(", ")}` : ""}

Permission was auto-approved for this background task.
</system-reminder>`

  const client = taskManager.getClient()

  const success = await sendNotification({ client, debugLog: log }, task.parentSessionID, notification, true)
  log.debug(`[permission] ${success ? 'sent' : 'failed'} notification for task ${taskId}`)
}
