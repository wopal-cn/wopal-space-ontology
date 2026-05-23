/**
 * Task Stop Classifier
 *
 * Centralized stop-event classification for running/waiting tasks.
 * When a task stops (session.idle, session.error, promptAsync reject),
 * this classifier determines the final status:
 *   - idle:  task stopped AND produced new non-synthetic assistant text
 *   - stuck: task stopped but no new assistant text (or text unchanged)
 */

import type { WopalTask, OpenCodeClient, SessionMessage } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import { extractMessages, getLastAssistantMessage, extractAssistantText } from "./session-messages.js"

export interface ClassifyTaskStopDeps {
  task: WopalTask
  client: OpenCodeClient
  debugLog: LoggerInstance
}

export interface ClassifyResult {
  status: "idle" | "stuck" | WopalTask["status"]
  lastAssistantMessage?: string | undefined
}

/**
 * Classify a stopped task as idle or stuck based on latest assistant text.
 *
 * Rule:
 *   latest = latest non-synthetic assistant text from session messages
 *   if latest exists AND latest !== task.lastAssistantMessage:
 *     task.lastAssistantMessage = latest, status = idle
 *   else:
 *     status = stuck
 *
 * Skips classification for tasks not in running/waiting state.
 */
export async function classifyTaskStop(deps: ClassifyTaskStopDeps): Promise<ClassifyResult> {
  const { task, client, debugLog } = deps
  const taskId = formatSessionID(task.sessionID, true)

  // Only classify running or waiting tasks
  if (task.status !== "running" && task.status !== "waiting") {
    debugLog.debug(`[classifyTaskStop] skipped: task_id=${taskId} status=${task.status}`)
    return { status: task.status, lastAssistantMessage: task.lastAssistantMessage }
  }

  // Fetch session messages
  let messages: SessionMessage[] = []
  try {
    if (task.sessionID && client.session?.messages) {
      const messagesResult = await client.session.messages({ path: { id: task.sessionID } })
      messages = extractMessages(messagesResult)
    }
  } catch (err) {
    debugLog.debug(`[classifyTaskStop] messages fetch failed: task_id=${taskId} err=${err instanceof Error ? err.message : String(err)}`)
  }

  // Find latest non-synthetic assistant text
  const latestAssistantMsg = getLastAssistantMessage(messages)
  const latestText = latestAssistantMsg
    ? extractAssistantText(latestAssistantMsg)
    : ""

  // Classify: new text → idle; no text or unchanged → stuck
  const hasNewText = latestText.length > 0 && latestText !== task.lastAssistantMessage

  if (hasNewText) {
    task.lastAssistantMessage = latestText
    task.status = "idle"
    // Clear pendingQuestionID if transitioning from waiting
    if (task.pendingQuestionID) {
      delete task.pendingQuestionID
    }
    debugLog.debug(`[classifyTaskStop] idle: task_id=${taskId} text_len=${latestText.length}`)
  } else {
    task.status = "stuck"
    // Clear pendingQuestionID if transitioning from waiting
    if (task.pendingQuestionID) {
      delete task.pendingQuestionID
    }
    debugLog.debug(`[classifyTaskStop] stuck: task_id=${taskId} reason=${latestText.length === 0 ? "no_text" : "text_unchanged"}`)
  }

  return { status: task.status, lastAssistantMessage: task.lastAssistantMessage }
}