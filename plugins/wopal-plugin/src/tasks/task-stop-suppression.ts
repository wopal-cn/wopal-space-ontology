import type { TaskStopSuppression, TaskStopSuppressionReason, WopalTask } from "../types.js"

export const STOP_NOTIFICATION_SUPPRESSION_TTL_MS = 30_000
let nextSuppressionID = 1

export function armStopNotificationSuppression(
  task: WopalTask,
  reason: TaskStopSuppressionReason,
  now = Date.now(),
): TaskStopSuppression {
  const suppression: TaskStopSuppression = {
    id: nextSuppressionID++,
    reason,
    requestedAt: now,
  }

  task.stopNotificationSuppressions = [
    ...(task.stopNotificationSuppressions ?? []).filter((item) => now - item.requestedAt <= STOP_NOTIFICATION_SUPPRESSION_TTL_MS),
    suppression,
  ]

  return suppression
}

export function consumeStopNotificationSuppression(
  task: WopalTask,
  now = Date.now(),
): TaskStopSuppression | undefined {
  const queue = task.stopNotificationSuppressions?.filter((item) => now - item.requestedAt <= STOP_NOTIFICATION_SUPPRESSION_TTL_MS) ?? []
  const suppression = queue.shift()

  if (queue.length > 0) {
    task.stopNotificationSuppressions = queue
  } else {
    delete task.stopNotificationSuppressions
  }

  return suppression
}

export function clearStopNotificationSuppression(task: WopalTask, id: number): void {
  const queue = task.stopNotificationSuppressions?.filter((item) => item.id !== id) ?? []
  if (queue.length > 0) {
    task.stopNotificationSuppressions = queue
  } else {
    delete task.stopNotificationSuppressions
  }
}
