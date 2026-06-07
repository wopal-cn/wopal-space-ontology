import type { WopalTask, OpenCodeClient, SessionMessage } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import type { SessionStore } from "../session-store.js"
import { formatSessionID } from "../logger.js"
import { getSessionModelOverride } from "../session-model.js"
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
  sessionStore?: SessionStore
}

const TRIGGER_LABELS: Record<ProgressNotifyTrigger, string> = {
  time_quota: 'time quota elapsed',
  context_milestone: 'context usage milestone',
}

const IDLE_OUTPUT_MAX_CHARS = 4000

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
  const debugSummary = `task_id=${formatSessionID(task.sessionID, true)} msgs=${messageCount} runtime=${elapsedLine ?? 'unknown'} tools=${toolSummary.total} trigger=${triggerReason ?? 'unknown'}`
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
    const modelOverride = getSessionModelOverride(deps.sessionStore?.get(parentSessionID))
    await client.session.promptAsync({
      path: { id: parentSessionID },
      body: {
        ...(modelOverride ? { model: modelOverride } : {}),
        noReply: noReply ?? false,
        parts: [{ type: "text", text }],
      },
    })
    return true
  } catch (err: unknown) {
    debugLog.debug({ err: toErrorMessage(err) }, "[sendNotification] Failed")
    return false
  }
}

export async function notifyParent(
  deps: TaskNotifierDeps,
  task: WopalTask,
): Promise<void> {
  if (!task.sessionID) return

  const { client, debugLog } = deps

  const statusText = task.status === 'error' ? 'ERR' : task.status.toUpperCase()

  // Stuck notifications: concise, no enrichment
  const errorLine = task.error ? `\n**Error:** ${task.error}` : ''

  // For IDLE notifications, return full assistant output to avoid re-query
  let resultBlock = ''
  if (task.status === 'idle' && !task.error) {
    let messages: SessionMessage[] = []
    try {
      if (client.session?.messages) {
        const messagesResult = await client.session.messages({ path: { id: task.sessionID } })
        messages = extractMessages(messagesResult)
      }
    } catch (err) {
      debugLog.debug(`[notifyParent] failed to fetch messages: ${toErrorMessage(err)}`)
    }

    const todoSummary = extractTodoSummary(messages)
    const todoSummaryStr = formatTodoSummary(todoSummary)
    const todoPercentageStr = formatTodoPercentage(todoSummary)
    const todoLine = todoSummaryStr
      ? `\n**Todos:** ${todoSummaryStr} (${todoPercentageStr})`
      : ''

    const lastOutput = extractLastOutput(messages, IDLE_OUTPUT_MAX_CHARS)
    const truncated = lastOutput?.endsWith(" [...]")
    const outputLine = lastOutput
      ? `\n\n**Result:**\n${lastOutput}${truncated ? `\n\n[Output truncated to ${IDLE_OUTPUT_MAX_CHARS} chars. Call \`wopal_task_output(task_id="${task.id}")\` for full content.]` : ''}`
      : ''

    resultBlock = `${todoLine}${outputLine}`
  }

  let footerLine = ''
  if (task.status === 'stuck') {
    footerLine = `\n\nTask stopped after assistant activity, but no new assistant text was produced this round. Use \`wopal_task_output(task_id="${task.id}")\` to check content, \`wopal_task_reply(task_id="${task.id}")\` to continue, or \`wopal_task_finish(task_id="${task.id}")\` to clean up.`
  } else if (task.status === 'error') {
    footerLine = `\n\nTask failed before assistant activity was observed. This task cannot be resumed. Use \`wopal_task_output(task_id="${task.id}")\` to inspect details or \`wopal_task_finish(task_id="${task.id}")\` to clean up, then launch a new task with a valid configuration.`
  } else if (task.status === 'idle' && !task.error && !resultBlock.includes("wopal_task_output")) {
    footerLine = ''
  } else {
    footerLine = `\n\nUse \`wopal_task_output(task_id="${task.id}")\` to retrieve the result.`
  }

  const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Agent:** ${task.agent}
**Description:** ${task.description}${errorLine}${resultBlock}${footerLine}
</system-reminder>`

  const success = await sendNotification(deps, task.parentSessionID, notification)

  if (success) {
    debugLog.trace(`${formatSessionID(task.sessionID, true)} [${task.status.toUpperCase()}] notification sent`)
  } else {
    debugLog.warn(`${formatSessionID(task.sessionID, true)} [${task.status.toUpperCase()}] notification failed, parent session did not receive stop event`)
  }
}
