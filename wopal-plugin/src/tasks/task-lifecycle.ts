import type { CancelResult, WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"
import type { IdleDiagnostic } from "./idle-diagnostic.js"
import { toErrorMessage } from "./utils.js"
import { sessionIDToTaskID } from "./task-launcher.js"

const CLEANUP_INTERVAL_MS = 600_000 // 10 minutes
const CLEANUP_MAX_AGE_MS = 3600_000 // 1 hour
const TASK_TTL_MS = 1_800_000       // 30 minutes for non-terminal tasks

export { CLEANUP_INTERVAL_MS, CLEANUP_MAX_AGE_MS, TASK_TTL_MS }

export interface TaskLifecycleDeps {
  tasks: Map<string, WopalTask>
  client: {
    session?: {
      abort?: (args: { path: { id: string } }) => Promise<void>
      delete?: (args: { path: { id: string } }) => Promise<{ data?: boolean; error?: unknown }>
    }
  }
  debugLog: DebugLog
  releaseConcurrencySlot: (task: WopalTask) => void
}

export function failTask(
  deps: TaskLifecycleDeps,
  task: WopalTask,
  error: string,
): boolean {
  const { debugLog, releaseConcurrencySlot } = deps

  if (task.status === 'error') {
    debugLog(`[failTask] skipped: taskId=${task.id} status=${task.status} (already error)`)
    return false
  }

  releaseConcurrencySlot(task)
  task.status = 'error'
  task.error = error
  task.completedAt = task.completedAt ?? new Date()
  debugLog(`[failTask] taskId=${task.id} error="${error.substring(0, 100)}"`)
  return true
}

export async function abortSession(
  client: TaskLifecycleDeps["client"],
  debugLog: DebugLog,
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
    debugLog(`[abortSession] error for ${sessionID}: ${toErrorMessage(err)}`)
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
    debugLog(`[markError] skipped: no task found for sessionID=${sessionID}`)
    return undefined
  }

  // Don't change status if task was already interrupted (idleNotified=true)
  if (task.idleNotified && task.status === 'running') {
    debugLog(`[markError] skipped: taskId=${task.id} was interrupted (idleNotified=true), preserving running state`)
    return undefined
  }

  if (!failTask(deps, task, error)) {
    debugLog(`[markError] skipped: taskId=${task.id} status=${task.status} (already terminal)`)
    return undefined
  }

  debugLog(`[markError] taskId=${task.id} sessionID=${sessionID} error="${error.substring(0, 100)}"`)
  return task
}

export function markTaskWaitingBySession(
  deps: TaskLifecycleDeps,
  sessionID: string,
  diagnostic: IdleDiagnostic,
): WopalTask | undefined {
  const { tasks, debugLog } = deps

  const task = tasks.get(sessionIDToTaskID(sessionID))
  if (!task || task.status !== 'running') {
    return undefined
  }

  // Note: waiting state doesn't release concurrency slot, task may resume
  task.status = 'waiting'
  task.waitingReason = diagnostic.reason
  if (diagnostic.lastMessage !== undefined) {
    task.lastAssistantMessage = diagnostic.lastMessage
  }
  debugLog(`[markWaiting] taskId=${task.id} sessionID=${sessionID} reason=${diagnostic.reason}`)
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
    debugLog(`[interrupt] failed: taskId=${id} not found or ownership mismatch`)
    return 'not_found'
  }
  if (task.status !== 'running') {
    debugLog(`[interrupt] failed: taskId=${id} status=${task.status}`)
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
      debugLog(`[interrupt] aborted session for taskId=${id}`)
    } catch (err) {
      debugLog(`[interrupt] abort error (task may already be idle): ${toErrorMessage(err)}`)
    }
  }

  return 'interrupted'
}

export function cleanup(
  deps: TaskLifecycleDeps,
  maxAgeMs = 3600_000,
): void {
  const { tasks, debugLog, releaseConcurrencySlot } = deps
  const now = Date.now()
  let cleanedCount = 0

  for (const [id, task] of tasks) {
    if (task.status === 'error') {
      if (task.completedAt && now - task.completedAt.getTime() > maxAgeMs) {
        tasks.delete(id)
        cleanedCount++
      }
      continue
    }

    const timestamp = task.status === 'pending'
      ? task.createdAt?.getTime()
      : task.startedAt?.getTime()

    if (timestamp && now - timestamp > TASK_TTL_MS) {
      releaseConcurrencySlot(task)
      tasks.delete(id)
      cleanedCount++
      debugLog(`[cleanup] pruned stale ${task.status} task: ${id}`)
    }
  }

  if (cleanedCount > 0) {
    debugLog(`[cleanup] removed ${cleanedCount} old task(s)`)
  }
}

export interface ShutdownDeps extends TaskLifecycleDeps {
  concurrency: { clear(): void }
  abortSessionFn: (sessionID: string | undefined) => Promise<void>
}

export async function shutdownManager(
  deps: ShutdownDeps,
): Promise<void> {
  const { tasks, debugLog, concurrency, releaseConcurrencySlot, abortSessionFn } = deps

  debugLog('[shutdown] initiating graceful shutdown')

  // 2. Cancel all waiting tasks in concurrency queue
  concurrency.clear()

  // 3. Abort all running tasks
  const runningTasks = Array.from(tasks.values()).filter(
    (t) => t.status === 'running'
  )

  for (const task of runningTasks) {
    debugLog(`[shutdown] aborting task: ${task.id}`)
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

  debugLog('[shutdown] completed')
}