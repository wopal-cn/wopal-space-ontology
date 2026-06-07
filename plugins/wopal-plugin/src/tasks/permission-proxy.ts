import type { SimpleTaskManager } from "./simple-task-manager.js"
import { taskLogger, formatSessionID, type LoggerInstance } from "../logger.js"
import type { OpenCodeClient } from "../types.js"

const defaultDebugLog = taskLogger
const defaultWarnLog = taskLogger

export interface PermissionAskedEvent {
  sessionID: string
  requestID: string
  permission: string
  patterns?: string[]
}

/**
 * 处理权限请求事件
 *
 * 子会话（任务）的权限请求自动批准并记录日志；
 * 主会话的权限请求返回 false，让 TUI 处理。
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

  const task = taskManager.findBySession(sessionID)
  if (!task) {
    log.debug(`[permission] ${formatSessionID(sessionID, false)} skipping auto-reply (main session)`)
    return false
  }

  const taskID = formatSessionID(sessionID, true)

  log.info(
    { task_id: taskID, permission, patterns: patterns?.join(",") ?? "" },
    `Permission auto-approved for background task`,
  )

  const actualClient = client ?? taskManager.getClient()
  const clientAny = actualClient

  const v2Reply = clientAny?.permission?.reply
  const v1Reply = clientAny?.postSessionIdPermissionsPermissionId

  if (typeof v1Reply === "function") {
    try {
      await v1Reply.call(clientAny, {
        path: { id: sessionID, permissionID: requestID },
        body: { response: "once" },
      })
      return true
    } catch (err) {
      warnLog.warn({ err, task_id: taskID }, `[permission] v1 reply failed`)
      return false
    }
  }

  if (typeof v2Reply === "function") {
    try {
      await v2Reply.call(clientAny.permission, { requestID, reply: "once" })
      return true
    } catch (err) {
      warnLog.warn({ err, task_id: taskID }, `[permission] v2 reply failed`)
      return false
    }
  }

  warnLog.warn({ task_id: taskID }, `[permission] no permission reply API available`)
  return false
}
