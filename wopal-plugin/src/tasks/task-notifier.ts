import type { WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"
import type { ProgressNotifyTrigger } from "./task-monitor.js"
import { toErrorMessage } from "./utils.js"
import { CONTEXT_WARN_THRESHOLD } from "./task-monitor.js"

export interface TaskNotifierDeps {
  client: {
    session?: {
      promptAsync?: (args: {
        path: { id: string }
        body: {
          noReply?: boolean
          parts: Array<{ type: string; text: string; synthetic?: boolean }>
        }
      }) => Promise<void>
    }
  }
  debugLog: DebugLog
}

const TRIGGER_LABELS: Record<ProgressNotifyTrigger, string> = {
  time_quota: 'time quota elapsed',
  message_count: 'message count threshold',
  context_threshold: `context warning (≥${CONTEXT_WARN_THRESHOLD}%)`,
  context_normal: 'context usage milestone',
}

export async function sendProgressNotification(
  deps: TaskNotifierDeps,
  task: WopalTask,
  messageCount: number,
  contextUsage: number | null,
  triggerReason?: ProgressNotifyTrigger,
): Promise<void> {
  const { debugLog } = deps

  let contextLine = ''
  if (contextUsage !== null) {
    const warn = contextUsage >= CONTEXT_WARN_THRESHOLD ? ' ⚠️' : ''
    contextLine = `\n**Context:** ${contextUsage}% used${warn}`
  }

  const triggerLine = triggerReason
    ? `\n**Trigger:** ${TRIGGER_LABELS[triggerReason]}`
    : ''

  const notification = `<system-reminder>
[WOPAL TASK PROGRESS]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Progress:** ${messageCount} messages${contextLine}${triggerLine}

Task is still running. Use \`wopal_task_output(task_id="${task.id}")\` for details.
</system-reminder>`

  await sendNotification(deps, task.parentSessionID, notification)
  debugLog(`[progressNotify] sent: taskId=${task.id} messages=${messageCount} trigger=${triggerReason ?? 'unknown'}`)
}

export async function sendNotification(
  deps: TaskNotifierDeps,
  parentSessionID: string,
  text: string,
  noReply?: boolean,
): Promise<void> {
  const { client, debugLog } = deps

  if (typeof client.session?.promptAsync !== "function") {
    debugLog("[sendNotification] skipped: session.promptAsync unavailable")
    return
  }

  await client.session.promptAsync({
    path: { id: parentSessionID },
    body: {
      noReply: noReply ?? false,
      parts: [{ type: "text", text, synthetic: true }],
    },
  }).catch((err: unknown) => {
    debugLog(`[sendNotification] error: ${toErrorMessage(err)}`)
  })
}

export async function notifyParent(
  deps: TaskNotifierDeps,
  task: WopalTask,
): Promise<void> {
  if (!task.sessionID) return

  const { debugLog } = deps

  const statusText = task.idleNotified ? 'IDLE' : task.status.toUpperCase()
  const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
${task.error ? `**Error:** ${task.error}` : ''}

Use \`wopal_task_output(task_id="${task.id}")\` to retrieve the result.
</system-reminder>`

  await sendNotification(deps, task.parentSessionID, notification)
  debugLog(`[notifyParent] success: taskId=${task.id}`)
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
**Description:** ${task.description}
**Duration:** No meaningful output for ${durationText}

The background task may be stuck in a reasoning loop. Use \`wopal_task_output(task_id="${task.id}", section="reasoning")\` to check its thinking content. If it's truly stuck, use \`wopal_task_reply(task_id="${task.id}", interrupt=true, message="Stop current attempt and report status")\` to interrupt it.
</system-reminder>`

  await sendNotification(deps, task.parentSessionID, notification)
  debugLog(`[notifyParentStuck] sent: taskId=${task.id} duration=${durationText}`)
}
