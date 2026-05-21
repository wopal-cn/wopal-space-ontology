import type { WopalTask, OpenCodeClient, SessionMessage } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import type { ProgressNotifyTrigger } from "./task-monitor.js"
import { toErrorMessage } from "./utils.js"
import { CONTEXT_WARN_THRESHOLD } from "./task-monitor.js"
import { extractMessages } from "./session-messages.js"
import {
  formatElapsedRuntime,
  extractToolCallSummary,
  formatToolCallSummary,
  extractLastOutput,
  extractTodoSummary,
  formatTodoSummary,
  formatTodoPercentage,
} from "./notification-summary.js"

export interface TaskNotifierDeps {
  client: OpenCodeClient
  debugLog: LoggerInstance
}

const TRIGGER_LABELS: Record<ProgressNotifyTrigger, string> = {
  time_quota: 'time quota elapsed',
  context_milestone: 'context usage milestone',
}

export async function sendProgressNotification(
  deps: TaskNotifierDeps,
  task: WopalTask,
  messageCount: number,
  contextUsage: number | null,
  triggerReason?: ProgressNotifyTrigger,
): Promise<void> {
  const { client, debugLog } = deps

  // Fetch session messages for enrichment
  let messages: SessionMessage[] = []
  try {
    if (task.sessionID && client.session?.messages) {
      const messagesResult = await client.session.messages({ path: { id: task.sessionID } })
      messages = extractMessages(messagesResult)
    }
  } catch (err) {
    debugLog.debug(`[progressNotify] failed to fetch messages: ${toErrorMessage(err)}`)
  }

  // Elapsed runtime
  const elapsedLine = formatElapsedRuntime(task.startedAt)
  const elapsedStr = elapsedLine ? `\n**Runtime:** ${elapsedLine}` : ''

  // Context usage
  let contextLine = ''
  if (contextUsage !== null) {
    const warn = contextUsage >= CONTEXT_WARN_THRESHOLD ? ' ⚠️' : ''
    contextLine = `\n**Context:** ${contextUsage}% used${warn}`
  }

  // Trigger reason
  const triggerLine = triggerReason
    ? `\n**Trigger:** ${TRIGGER_LABELS[triggerReason]}`
    : ''

  // Tool-call summary
  const toolSummary = extractToolCallSummary(messages)
  const toolLine = toolSummary.total > 0
    ? `\n**Tools:** ${formatToolCallSummary(toolSummary)}`
    : ''

  // Last output (non-synthetic)
  const lastOutput = extractLastOutput(messages, 150)
  const outputLine = lastOutput
    ? `\n**Last output:** ${lastOutput}`
    : ''

  // Todo summary
  const todoSummary = extractTodoSummary(messages)
  const todoSummaryStr = formatTodoSummary(todoSummary)
  const todoLine = todoSummaryStr
    ? `\n**Todos:** ${todoSummaryStr} (${formatTodoPercentage(todoSummary)})`
    : ''

  const notification = `<system-reminder>
[WOPAL TASK PROGRESS]
**ID:** \`${task.id}\`
**Agent:** ${task.agent}
**Description:** ${task.description}${elapsedStr}
**Progress:** ${messageCount} messages${contextLine}${toolLine}${triggerLine}${todoLine}${outputLine}

Task is still running. Use \`wopal_task_output(task_id="${task.id}")\` for details.
</system-reminder>`

  const success = await sendNotification(deps, task.parentSessionID, notification)

  // Mirror to debug log with concise summary
  const debugSummary = `taskId=${task.id} msgs=${messageCount} runtime=${elapsedLine ?? 'unknown'} tools=${toolSummary.total} trigger=${triggerReason ?? 'unknown'}`
  debugLog.debug(`[progressNotify] ${success ? 'sent' : 'failed'}: ${debugSummary}`)
}

export async function sendNotification(
  deps: TaskNotifierDeps,
  parentSessionID: string,
  text: string,
  noReply?: boolean,
): Promise<boolean> {
  const { client, debugLog } = deps

  if (typeof client.session?.promptAsync !== "function") {
    debugLog.debug("[sendNotification] skipped: session.promptAsync unavailable")
    return false
  }

  try {
    await client.session.promptAsync({
      path: { id: parentSessionID },
      body: {
        noReply: noReply ?? false,
        parts: [{ type: "text", text }],
      },
    })
    return true
  } catch (err: unknown) {
    debugLog.debug(`[sendNotification] error: ${toErrorMessage(err)}`)
    return false
  }
}

export async function notifyParent(
  deps: TaskNotifierDeps,
  task: WopalTask,
): Promise<void> {
  if (!task.sessionID) return

  const { client, debugLog } = deps

  const statusText = task.idleNotified ? 'IDLE' : task.status.toUpperCase()

  // Error notifications remain concise (no enrichment)
  const errorLine = task.error ? `\n**Error:** ${task.error}` : ''

  // For IDLE notifications, add result summaries (fetch messages only if needed)
  let resultLine = ''
  if (task.idleNotified && !task.error) {
    let messages: SessionMessage[] = []
    try {
      if (client.session?.messages) {
        const messagesResult = await client.session.messages({ path: { id: task.sessionID } })
        messages = extractMessages(messagesResult)
      }
    } catch (err) {
      debugLog.debug(`[notifyParent] failed to fetch messages: ${toErrorMessage(err)}`)
    }

    const toolSummary = extractToolCallSummary(messages)
    const toolLine = toolSummary.total > 0
      ? `\n**Tools:** ${formatToolCallSummary(toolSummary)}`
      : ''

    const lastOutput = extractLastOutput(messages, 150)
    const outputLine = lastOutput
      ? `\n**Last output:** ${lastOutput}`
      : ''

    const todoSummary = extractTodoSummary(messages)
    const todoSummaryStr = formatTodoSummary(todoSummary)
    const todoPercentageStr = formatTodoPercentage(todoSummary)
    const todoLine = todoSummaryStr
      ? `\n**Todos:** ${todoSummaryStr} (${todoPercentageStr})`
      : ''

    resultLine = `${toolLine}${todoLine}${outputLine}`
  }

  const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Agent:** ${task.agent}
**Description:** ${task.description}${errorLine}${resultLine}

Use \`wopal_task_output(task_id="${task.id}")\` to retrieve the result.
</system-reminder>`

  const success = await sendNotification(deps, task.parentSessionID, notification)

  // Mirror to debug log
  const status = task.idleNotified ? 'IDLE' : task.status
  const debugSummary = `taskId=${task.id} status=${status}`
  debugLog.debug(`[notifyParent] ${success ? 'sent' : 'failed'}: ${debugSummary}`)
}

export async function notifyParentStuck(
  deps: TaskNotifierDeps,
  task: WopalTask,
  durationText: string,
): Promise<void> {
  if (!task.sessionID) return

  const { debugLog } = deps

  const notification = `<system-reminder>
[WOPAL TASK STUCK]
**ID:** \`${task.id}\`
**Agent:** ${task.agent}
**Description:** ${task.description}
**Duration:** No meaningful output for ${durationText}

The background task may be stuck in a reasoning loop. Use \`wopal_task_output(task_id="${task.id}", section="reasoning")\` to check its thinking content. If it's truly stuck, use \`wopal_task_reply(task_id="${task.id}", interrupt=true, message="Stop current attempt and report status")\` to interrupt it.
</system-reminder>`

  const success = await sendNotification(deps, task.parentSessionID, notification)
  debugLog.debug(`[notifyParentStuck] ${success ? 'sent' : 'failed'}: taskId=${task.id} duration=${durationText}`)
}
