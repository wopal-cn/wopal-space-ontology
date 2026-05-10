import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "../types.js"
import type { DebugLog } from "../debug.js"
import type { IdleDiagnostic } from "./idle-diagnostic.js"
import { createDebugLog } from "../debug.js"
import { clearStuckState } from "./stuck-detector.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup.js"
import {
  launchTask,
  DEFAULT_CONCURRENCY_LIMIT,
  sessionIDToTaskID,
} from "./task-launcher.js"
import { notifyParent, notifyParentStuck } from "./task-notifier.js"
import { sendProgressNotification } from "./task-notifier-internals.js"
import {
  checkProgressNotifications,
  checkStuckTasksAndNotify,
  logTickStatus,
  getContextUsagePercent,
} from "./task-monitor.js"
import {
  failTask,
  abortSession,
  markTaskErrorBySession,
  markTaskWaitingBySession,
  interruptTask,
  cleanup,
  shutdownManager,
  CLEANUP_INTERVAL_MS,
  CLEANUP_MAX_AGE_MS,
} from "./task-lifecycle.js"

const defaultManagerLog = createDebugLog("[wopal-task]", "task")

export class SimpleTaskManager {
  private tasks = new Map<string, WopalTask>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private v2Client: any
  private serverUrl?: URL
  private directory: string
  private debugLog: DebugLog
  private cleanupInterval: ReturnType<typeof setInterval> | undefined = undefined
  private tickerInterval: ReturnType<typeof setInterval> | undefined = undefined
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_KEY = 'default'
  private isShuttingDown = false
  private tickRunning = false
  private unregistered = false

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    v2Client: any,
    directory: string,
    serverUrl?: URL,
    debugLog?: DebugLog,
  ) {
    this.client = client
    this.v2Client = v2Client
    this.directory = directory
    if (serverUrl !== undefined) {
      this.serverUrl = serverUrl
    }
    this.debugLog = debugLog ?? defaultManagerLog

    // Setup automatic cleanup interval
    this.cleanupInterval = setInterval(() => {
      cleanup(this.getLifecycleDeps(), CLEANUP_MAX_AGE_MS)
    }, CLEANUP_INTERVAL_MS)
    this.cleanupInterval.unref()

    // Setup stuck detection and progress notifications (every 30 seconds)
    this.tickerInterval = setInterval(() => {
      if (this.tickRunning) return
      this.tickRunning = true
      void (async () => {
        try {
          const taskInfos = await checkProgressNotifications(this.getMonitorDeps())
          clearStuckState(this.tasks.values())
          await checkStuckTasksAndNotify(this.getMonitorDeps())
          logTickStatus(this.tasks, taskInfos, this.debugLog)
        } finally {
          this.tickRunning = false
        }
      })()
    }, 30_000)
    this.tickerInterval.unref()

    registerManagerForCleanup(this)
  }

  unregisterFromCleanup(): void {
    if (this.unregistered) return
    this.unregistered = true
    unregisterManagerForCleanup(this)
  }

  getDirectory(): string {
    return this.directory
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(): any {
    return this.client
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getV2Client(): any {
    return this.v2Client
  }

  getServerUrl(): URL | undefined {
    return this.serverUrl
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cleanupInterval = undefined
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval)
    }
    this.tickerInterval = undefined
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true
    this.dispose()
    await shutdownManager({
      ...this.getLifecycleDeps(),
      concurrency: this.concurrency,
      abortSessionFn: (sessionID) => abortSession(this.client, this.debugLog, sessionID),
    })
  }

  async launch(input: LaunchInput): Promise<LaunchOutput> {
    return launchTask(this.getLauncherDeps(), input)
  }

  getTask(id: string): WopalTask | undefined {
    return this.tasks.get(id)
  }

  getTaskForParent(id: string, parentSessionID: string): WopalTask | undefined {
    const task = this.tasks.get(id)
    if (!task || task.parentSessionID !== parentSessionID) {
      return undefined
    }
    return task
  }

  findBySession(sessionID: string): WopalTask | undefined {
    return this.tasks.get(sessionIDToTaskID(sessionID))
  }

  markTaskCompletedBySession(sessionID: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task || task.status !== 'running') {
      return undefined
    }
    return task
  }

  markTaskErrorBySession(sessionID: string, error: string): WopalTask | undefined {
    return markTaskErrorBySession(this.getLifecycleDeps(), sessionID, error)
  }

  markTaskWaitingBySession(sessionID: string, diagnostic: IdleDiagnostic): WopalTask | undefined {
    return markTaskWaitingBySession(this.getLifecycleDeps(), sessionID, diagnostic)
  }

  async interrupt(id: string, parentSessionID: string): Promise<CancelResult> {
    return interruptTask(this.getLifecycleDeps(), id, parentSessionID)
  }

  async closeTask(taskId: string, parentSessionID: string): Promise<{ ok: boolean; message: string }> {
    const { tasks, client, debugLog, releaseConcurrencySlot } = this.getLifecycleDeps()

    const task = this.getTaskForParent(taskId, parentSessionID)
    if (!task) {
      return { ok: false, message: "Task not found or not owned by this session" }
    }

    if (task.status === 'running' && !task.idleNotified) {
      return { ok: false, message: "Task is still running. Please verify completion before deleting (use wopal_task_output to check status)." }
    }

    if (task.sessionID && client.session?.delete) {
      try {
        const result = await client.session.delete({ path: { id: task.sessionID } })
        if (result.error) {
          debugLog(`[closeTask] session.delete error for taskId=${taskId}: ${String(result.error).substring(0, 200)}`)
          return { ok: false, message: `Failed to delete session: ${String(result.error)}` }
        }
      } catch (err) {
        debugLog(`[closeTask] session.delete exception for taskId=${taskId}: ${String(err).substring(0, 200)}`)
        return { ok: false, message: `Failed to delete session: ${String(err)}` }
      }
    }

    tasks.delete(taskId)

    releaseConcurrencySlot(task)

    debugLog(`[closeTask] taskId=${taskId} deleted successfully`)
    return { ok: true, message: "Task deleted successfully. Session removed from OpenCode." }
  }

  async notifyParent(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    await notifyParent({ client: this.client, debugLog: this.debugLog }, task)
  }

  cleanup(maxAgeMs = 3600_000): void {
    cleanup(this.getLifecycleDeps(), maxAgeMs)
  }

  releaseConcurrencySlot(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }

  reacquireSlotOnWakeUp(task: WopalTask): void {
    if (task.status === 'waiting' || task.idleNotified) {
      if (this.concurrency.tryAcquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)) {
        task.concurrencyKey = this.CONCURRENCY_KEY
        this.debugLog(`[reacquireSlot] taskId=${task.id} acquired slot`)
      } else {
        this.debugLog(`[reacquireSlot] taskId=${task.id} concurrency limit reached, proceeding anyway`)
      }
      delete task.waitingConcurrencyKey
    }
  }

  getConcurrencyStatus(): { used: number; limit: number; available: number } {
    const used = this.concurrency.getCount(this.CONCURRENCY_KEY)
    return {
      used,
      limit: DEFAULT_CONCURRENCY_LIMIT,
      available: DEFAULT_CONCURRENCY_LIMIT - used,
    }
  }

  async cacheContextUsage(sessionID: string): Promise<void> {
    const task = this.findBySession(sessionID)
    if (!task?.sessionID) return
    try {
      const pct = await getContextUsagePercent(this.client, this.directory, sessionID, this.debugLog)
      if (pct !== null) {
        task.lastContextUsage = pct
        this.debugLog(`[ctxCache] session=${sessionID.slice(0, 8)} cached=${pct}%`)
      }
    } catch {
      // Graceful degradation
    }
  }

  async recoverFromSession(parentSessionID: string): Promise<void> {
    if (typeof this.client?.session?.children !== "function") {
      this.debugLog(`[recover] skipped: session.children is unavailable`)
      return
    }

    try {
      const result = await this.client.session.children({ path: { id: parentSessionID } })
      this.debugLog(`[recover] raw result keys: ${Object.keys(result ?? {}).join(', ')}`)
      const children = result?.data ?? result ?? []
      if (!Array.isArray(children)) {
        this.debugLog(`[recover] skipped: children is not an array, type=${typeof children}`)
        return
      }

      let recovered = 0
      for (const child of children) {
        const childSessionID = child.id
        if (!childSessionID) continue

        const taskID = sessionIDToTaskID(childSessionID)
        if (this.tasks.has(taskID)) continue

        const task: WopalTask = {
          id: taskID,
          sessionID: childSessionID,
          status: 'pending',
          description: child.title ?? '',
          agent: child.agent ?? 'unknown',
          prompt: '',
          parentSessionID,
          createdAt: new Date(child.time?.created ?? Date.now()),
          idleNotified: true,
        }
        this.tasks.set(taskID, task)
        recovered++
        this.debugLog(`[recover] restored task=${taskID} session=${childSessionID.slice(0, 8)} title="${child.title?.substring(0, 40) ?? ''}"`)
      }

      if (recovered > 0) {
        this.debugLog(`[recover] recovered ${recovered} task(s) from parent=${parentSessionID.slice(0, 8)}`)
      }
    } catch (err) {
      this.debugLog(`[recover] error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private getLauncherDeps() {
    return {
      tasks: this.tasks,
      client: this.client,
      debugLog: this.debugLog,
      concurrency: this.concurrency,
      concurrencyKey: this.CONCURRENCY_KEY,
      failTask: (task: WopalTask, error: string) =>
        failTask(this.getLifecycleDeps(), task, error),
      abortSession: (sessionID: string | undefined) =>
        abortSession(this.client, this.debugLog, sessionID),
    }
  }

  private getLifecycleDeps() {
    return {
      tasks: this.tasks,
      client: this.client,
      debugLog: this.debugLog,
      releaseConcurrencySlot: this.releaseConcurrencySlot.bind(this),
    }
  }

  private getMonitorDeps() {
    return {
      tasks: this.tasks,
      client: this.client,
      debugLog: this.debugLog,
      directory: this.directory,
      notifyParentStuckFn: async (task: WopalTask, durationText: string) =>
        await notifyParentStuck({ client: this.client, debugLog: this.debugLog }, task, durationText),
      sendProgressNotificationFn: async (task: WopalTask, msgCount: number, ctx: number | null) =>
        await sendProgressNotification({ client: this.client, debugLog: this.debugLog }, task, msgCount, ctx),
    }
  }
}