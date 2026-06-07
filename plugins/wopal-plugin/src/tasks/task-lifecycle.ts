import type { CancelResult, WopalTask } from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import { toErrorMessage } from "./utils.js"
import { sessionIDToTaskID } from "./task-launcher.js"
import { taskIDToSessionID } from "../session-ref.js"

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

/**
 * Mark task as idle (stopped execution, awaiting parent decision).
 * Used by: markTaskErrorBySession, interruptTask, abort, shutdown.
 */
export function setIdleStatus(
  deps: TaskLifecycleDeps,
  task: WopalTask,
): boolean {
  const { debugLog, releaseConcurrencySlot } = deps

  // Skip if already in inactive state
  if (task.status !== 'running') {
    debugLog.debug({ task_id: formatSessionID(task.sessionID, true), status: task.status }, "setIdle skipped: task already inactive")
    return false
  }

  releaseConcurrencySlot(task)
  task.status = 'idle'
  debugLog.debug({ task_id: formatSessionID(task.sessionID, true) }, "Task stopped, classified as idle")
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
    debugLog.debug({ task_id: formatSessionID(sessionID, true), err: toErrorMessage(err) }, "[abortSession] Failed")
  }
}

export function markTaskIdleBySession(
  deps: TaskLifecycleDeps,
  sessionID: string,
): WopalTask | undefined {
  const { tasks, debugLog } = deps

  const task = tasks.get(sessionIDToTaskID(sessionID))
  if (!task) {
    debugLog.debug({ task_id: formatSessionID(sessionID, true) }, "[markIdle] Skipped; task not found")
    return undefined
  }

  // Skip if already in inactive state
  if (task.status !== 'running') {
    debugLog.debug({ task_id: formatSessionID(task.sessionID, true), status: task.status }, "markIdle skipped: task already inactive")
    return undefined
  }

  if (!setIdleStatus(deps, task)) {
    return undefined
  }

  debugLog.debug({ task_id: formatSessionID(sessionID, true) }, "Task stopped, marked as idle")
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
    debugLog.debug({ task_id: formatSessionID(taskIDToSessionID(id), true) }, "[interrupt] Failed; task not found or ownership mismatch")
    return 'not_found'
  }
  if (task.status !== 'running') {
    debugLog.debug({ task_id: formatSessionID(task.sessionID, true), status: task.status }, "[interrupt] Failed; task not running")
    return 'not_running'
  }

  // Save concurrency key for potential reply resume
  if (task.concurrencyKey) {
    task.waitingConcurrencyKey = task.concurrencyKey
  }
  releaseConcurrencySlot(task)

  // Set status to idle (task stopped, awaiting parent decision)
  task.status = 'idle'

  // Abort session execution
  if (task.sessionID) {
    try {
      await client.session?.abort?.({
        path: { id: task.sessionID },
      })
      debugLog.debug({ task_id: formatSessionID(task.sessionID, true) }, "[interrupt] Aborted session")
    } catch (err) {
      debugLog.debug({ task_id: formatSessionID(task.sessionID, true), err: toErrorMessage(err) }, "[interrupt] Abort failed; task may already be idle")
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

  // 3. Abort all running tasks and set to idle
  const runningTasks = Array.from(tasks.values()).filter(
    (t) => t.status === 'running'
  )

  for (const task of runningTasks) {
    debugLog.debug({ task_id: formatSessionID(task.sessionID, true) }, "[shutdown] Aborting task")
    releaseConcurrencySlot(task)
    await abortSessionFn(task.sessionID)
    // Shutdown sets idle status to mark task as stopped
    task.status = 'idle'
  }

  // 4. Wait for all tasks to reach inactive state (max 5 seconds)
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
