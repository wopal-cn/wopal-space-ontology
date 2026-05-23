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
import { extractMessages, getLastAssistantMessage, extractAssistantText, hasAssistantExecutionPart } from "./session-messages.js"

export interface ClassifyTaskStopDeps {
  task: WopalTask
  client: OpenCodeClient
  debugLog: LoggerInstance
  errorText?: string | undefined
}

export interface ClassifyResult {
  status: "idle" | "stuck" | "error" | WopalTask["status"]
  lastAssistantMessage?: string | undefined
  statusChanged: boolean
}

function hasExecutionEvidence(task: WopalTask, messages: SessionMessage[]): boolean {
  return Boolean(
    task.lastAssistantMessage ||
    task.progress?.lastMeaningfulActivity ||
    (task.progress?.toolCalls ?? 0) > 0 ||
    hasAssistantExecutionPart(messages),
  )
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
  const { task, client, debugLog, errorText } = deps
  const taskId = formatSessionID(task.sessionID, true)
  const originalStatus = task.status

  // Only classify running or waiting tasks
  if (task.status !== "running" && task.status !== "waiting") {
    debugLog.trace(`[classifyTaskStop] skipped: ${taskId} status=${task.status}`)
    return { status: task.status, lastAssistantMessage: task.lastAssistantMessage, statusChanged: false }
  }

  task.status = "stuck"

  // Fetch session messages
  let messages: SessionMessage[] = []
  try {
    if (task.sessionID && client.session?.messages) {
      const messagesResult = await client.session.messages({ path: { id: task.sessionID } })
      messages = extractMessages(messagesResult)
    }
  } catch (err) {
    debugLog.trace(`[classifyTaskStop] messages fetch failed: ${taskId} err=${err instanceof Error ? err.message : String(err)}`)
  }

  // Find latest non-synthetic assistant text
  const latestAssistantMsg = getLastAssistantMessage(messages)
  const latestText = latestAssistantMsg
    ? extractAssistantText(latestAssistantMsg)
    : ""

  // Classify: new text → idle; assistant execution evidence without new text → stuck; no evidence → error
  const hasNewText = latestText.length > 0 && latestText !== task.lastAssistantMessage
  const hasEvidence = hasExecutionEvidence(task, messages)

  if (hasNewText) {
    task.lastAssistantMessage = latestText
    task.status = "idle"
    delete task.error
    // Clear pendingQuestionID if transitioning from waiting
    if (task.pendingQuestionID) {
      delete task.pendingQuestionID
    }
    debugLog.trace(`[classifyTaskStop] idle: ${taskId} text_len=${latestText.length}`)
  } else if (hasEvidence) {
    task.status = "stuck"
    if (errorText) {
      task.error = errorText
    } else {
      delete task.error
    }
    // Clear pendingQuestionID if transitioning from waiting
    if (task.pendingQuestionID) {
      delete task.pendingQuestionID
    }
    debugLog.trace(`[classifyTaskStop] stuck: ${taskId} reason=${latestText.length === 0 ? "no_text" : "text_unchanged"}`)
  } else {
    task.status = "error"
    task.error = errorText ?? "Task stopped before producing assistant activity"
    if (task.pendingQuestionID) {
      delete task.pendingQuestionID
    }
    debugLog.trace(`[classifyTaskStop] error: ${taskId} reason=no_assistant_activity`)
  }

  return { status: task.status, lastAssistantMessage: task.lastAssistantMessage, statusChanged: task.status !== originalStatus }
}
