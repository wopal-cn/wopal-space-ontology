import type { CancelResult, WopalTask } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import { toErrorMessage } from "./utils.js"
import { sessionIDToTaskID } from "./task-launcher.js"
import { isIdleTask } from "./task-phase.js"

export interface TaskLifecycleDeps {
  tasks: Map<string, WopalTask>
  client: {
    session?: {
      abort?: (args: { path: { id: string } }) => Promise<unknown>
      delete?: (args: { path: { id: string } }) => Promise<unknown>
    }
  }
  debugLog: LoggerInstance
  releaseConcurrencySlot: (task: WopalTask) => void
}

export function failTask(
  deps: TaskLifecycleDeps,
  task: WopalTask,
  error: string,
): boolean {
  const { debugLog, releaseConcurrencySlot } = deps

  if (task.status === 'error') {
    debugLog.debug(`[failTask] skipped: taskId=${task.id} status=${task.status} (already error)`)
    return false
  }

  releaseConcurrencySlot(task)
  task.status = 'error'
  task.error = error
  task.completedAt = task.completedAt ?? new Date()
  debugLog.debug(`[failTask] taskId=${task.id} error="${error.substring(0, 100)}"`)
  return true
}

export async function abortSession(
  client: TaskLifecycleDeps["client"],
  debugLog: LoggerInstance,
  sessionID: string | undefined,
): Promise<void> {
  if (!sessionID || typeof client.session?.abort !== "function") {
    return
  }

  try {
    await client.session.abort({
      path: { id: sessionID },
    })
  } catch (err) {
    debugLog.debug(`[abortSession] error for ${formatSessionID(sessionID, true)}: ${toErrorMessage(err)}`)
  }
}

export function markTaskErrorBySession(
  deps: TaskLifecycleDeps,
  sessionID: string,
  error: string,
): WopalTask | undefined {
  const { tasks, debugLog } = deps

  const task = tasks.get(sessionIDToTaskID(sessionID))
  if (!task) {
    debugLog.debug(`[markError] skipped: no task found for ${formatSessionID(sessionID, true)}`)
    return undefined
  }

  // Don't change status if task was already interrupted (idle phase)
  if (isIdleTask(task) && task.status === 'running') {
    debugLog.debug(`[markError] skipped: taskId=${task.id} was interrupted (idle phase), preserving running state`)
    return undefined
  }

  if (!failTask(deps, task, error)) {
    debugLog.debug(`[markError] skipped: taskId=${task.id} status=${task.status} (already terminal)`)
    return undefined
  }

  debugLog.debug(`[markError] taskId=${task.id} ${formatSessionID(sessionID, true)} error="${error.substring(0, 100)}"`)
  return task
}

export async function interruptTask(
  deps: TaskLifecycleDeps,
  id: string,
  parentSessionID: string,
): Promise<CancelResult> {
  const { tasks, client, debugLog, releaseConcurrencySlot } = deps

  const task = tasks.get(id) ?? [...tasks.values()].find(t => t.id === id)

  if (!task || task.parentSessionID !== parentSessionID) {
    debugLog.debug(`[interrupt] failed: taskId=${id} not found or ownership mismatch`)
    return 'not_found'
  }
  if (task.status !== 'running') {
    debugLog.debug(`[interrupt] failed: taskId=${id} status=${task.status}`)
    return 'not_running'
  }

  // Mark idleNotified so session.error event won't change status
  task.idleNotified = true
  if (task.concurrencyKey) {
    task.waitingConcurrencyKey = task.concurrencyKey
  }
  releaseConcurrencySlot(task)

  // Only abort session, don't change status
  // Status remains running, waiting for user reply to wake up
  if (task.sessionID) {
    try {
      await client.session?.abort?.({
        path: { id: task.sessionID },
      })
      debugLog.debug(`[interrupt] aborted session for taskId=${id}`)
    } catch (err) {
      debugLog.debug(`[interrupt] abort error (task may already be idle): ${toErrorMessage(err)}`)
    }
  }

  return 'interrupted'
}

export interface ShutdownDeps extends TaskLifecycleDeps {
  concurrency: { clear(): void }
  abortSessionFn: (sessionID: string | undefined) => Promise<void>
}

export async function shutdownManager(
  deps: ShutdownDeps,
): Promise<void> {
  const { tasks, debugLog, concurrency, releaseConcurrencySlot, abortSessionFn } = deps

  debugLog.debug('[shutdown] initiating graceful shutdown')

  // 2. Cancel all waiting tasks in concurrency queue
  concurrency.clear()

  // 3. Abort all running tasks
  const runningTasks = Array.from(tasks.values()).filter(
    (t) => t.status === 'running'
  )

  for (const task of runningTasks) {
    debugLog.debug(`[shutdown] aborting task: ${task.id}`)
    releaseConcurrencySlot(task)
    await abortSessionFn(task.sessionID)
    // Shutdown sets error status to mark task as terminated
    task.status = 'error'
    task.error = 'Shutdown: task interrupted'
    task.completedAt = new Date()
  }

  // 4. Wait for all tasks to reach terminal state (max 5 seconds)
  const start = Date.now()
  while (Date.now() - start < 5000) {
    const hasRunning = Array.from(tasks.values()).some(
      (t) => t.status === 'running'
    )
    if (!hasRunning) break
    await new Promise((r) => setTimeout(r, 100))
  }

  debugLog.debug('[shutdown] completed')
}
