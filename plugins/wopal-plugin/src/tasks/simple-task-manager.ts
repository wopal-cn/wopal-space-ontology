import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
  OpenCodeClient,
} from "../types.js"
import type { LoggerInstance } from "../logger.js"
import type { SessionStore } from "../session-store.js"
import { taskLogger } from "../logger.js"
import { sessionStore as globalSessionStore } from "../session-store-instance.js"
import { clearStuckState } from "./task-monitor.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup.js"
import {
  launchTask,
  DEFAULT_CONCURRENCY_LIMIT,
} from "./task-launcher.js"
import { notifyParent, notifyParentStuck, sendProgressNotification } from "./task-notifier.js"
import {
  checkProgressNotifications,
  checkStuckTasksAndNotify,
  logTickStatus,
  type ProgressNotifyTrigger,
} from "./task-monitor.js"
import {
  failTask,
  abortSession,
  markTaskErrorBySession,
  interruptTask,
  shutdownManager,
} from "./task-lifecycle.js"
import { sessionIDToTaskID } from "../session-ref.js"
import { getDisplayStatus, isResumableTask, canDeleteTask } from "./task-phase.js"
import { isSessionDeleteResult } from "../types.js"

export class SimpleTaskManager {
  private tasks = new Map<string, WopalTask>()
  private taskSessions = new Set<string>()
  private client: OpenCodeClient
  private v2Client: OpenCodeClient
  private serverUrl?: URL
  private directory: string
  private debugLog: LoggerInstance
  private sessionStore: SessionStore
  private tickerInterval: ReturnType<typeof setInterval> | undefined = undefined
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_KEY = 'default'
  private isShuttingDown = false
  private tickRunning = false
  private unregistered = false
  private recoveredSessions = new Set<string>()
  private recoveringSessions = new Set<string>()

  constructor(
    client: OpenCodeClient,
    v2Client: OpenCodeClient,
    directory: string,
    serverUrl?: URL,
    sessionStore?: SessionStore,
    debugLog?: LoggerInstance,
  ) {
    this.client = client
    this.v2Client = v2Client
    this.directory = directory
    if (serverUrl !== undefined) {
      this.serverUrl = serverUrl
    }
    this.sessionStore = sessionStore ?? globalSessionStore
    this.debugLog = debugLog ?? taskLogger

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

  getSessionStore(): SessionStore {
    return this.sessionStore
  }

  getClient(): OpenCodeClient {
    return this.client
  }

  getV2Client(): OpenCodeClient {
    return this.v2Client
  }

  getServerUrl(): URL | undefined {
    return this.serverUrl
  }

  dispose(): void {
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

  listTasksForParent(parentSessionID: string): Array<{
    taskID: string
    sessionID: string
    status: string
    description: string
    agent: string
  }> {
    const result: Array<{
      taskID: string
      sessionID: string
      status: string
      description: string
      agent: string
    }> = []

    for (const task of this.tasks.values()) {
      if (task.parentSessionID === parentSessionID) {
        const effectiveStatus = getDisplayStatus(task)
        result.push({
          taskID: task.id,
          sessionID: task.sessionID ?? '',
          status: effectiveStatus,
          description: task.description,
          agent: task.agent,
        })
      }
    }

    return result
  }

  findBySession(sessionID: string): WopalTask | undefined {
    return this.tasks.get(sessionIDToTaskID(sessionID))
  }

  registerTaskSession(sessionID: string): void {
    this.taskSessions.add(sessionID)
  }

  isTaskSession(sessionID: string): boolean {
    return this.taskSessions.has(sessionID)
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

  async interrupt(id: string, parentSessionID: string): Promise<CancelResult> {
    return interruptTask(this.getLifecycleDeps(), id, parentSessionID)
  }

  async finishTask(taskId: string, parentSessionID: string): Promise<{ ok: boolean; message: string }> {
    const { tasks, client, debugLog, releaseConcurrencySlot } = this.getLifecycleDeps()

    const task = this.getTaskForParent(taskId, parentSessionID)
    if (!task) {
      return { ok: false, message: "Task not found or not owned by this session" }
    }

    if (!canDeleteTask(task)) {
      return { ok: false, message: "Task is actively running. Use wopal_task_abort or wopal_task_reply(interrupt=true) to stop first, then finish." }
    }

    if (task.sessionID && client.session?.delete) {
      try {
        const result = await client.session.delete({ path: { id: task.sessionID } })
        if (isSessionDeleteResult(result) && result.error) {
          debugLog.debug(`[finishTask] session.delete error for taskId=${taskId}: ${String(result.error).substring(0, 200)}`)
          return { ok: false, message: `Failed to delete session: ${String(result.error)}` }
        }
      } catch (err) {
        debugLog.debug(`[finishTask] session.delete exception for taskId=${taskId}: ${String(err).substring(0, 200)}`)
        return { ok: false, message: `Failed to delete session: ${String(err)}` }
      }
    }

    tasks.delete(taskId)

    releaseConcurrencySlot(task)

    debugLog.debug(`[finishTask] taskId=${taskId} finished successfully`)
    return { ok: true, message: "Task finished successfully. Session deleted from OpenCode." }
  }

  async notifyParent(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    await notifyParent({ client: this.client, debugLog: this.debugLog }, task)
  }

  releaseConcurrencySlot(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }

  reacquireSlotOnWakeUp(task: WopalTask): void {
    // Reacquire slot for resumable tasks (waiting, idle, error)
    if (isResumableTask(task)) {
      if (this.concurrency.tryAcquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)) {
        task.concurrencyKey = this.CONCURRENCY_KEY
        delete task.waitingConcurrencyKey
        this.debugLog.debug(`[reacquireSlot] taskId=${task.id} acquired slot, cleared waitingConcurrencyKey`)
      } else {
        this.debugLog.debug(`[reacquireSlot] taskId=${task.id} concurrency limit reached, waitingConcurrencyKey preserved for retry`)
      }
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

  async recoverFromSession(parentSessionID: string): Promise<void> {
    if (this.recoveredSessions.has(parentSessionID)) {
      return
    }
    if (this.recoveringSessions.has(parentSessionID)) {
      return
    }
    this.recoveringSessions.add(parentSessionID)

    if (typeof this.client?.session?.children !== "function") {
      this.debugLog.debug(`[recover] skipped: session.children is unavailable`)
      this.recoveringSessions.delete(parentSessionID)
      return
    }

    try {
      const result = await this.client.session.children({ path: { id: parentSessionID } })
      const resultObj = result as Record<string, unknown> | undefined
      const children = (resultObj?.data ?? result) as unknown
      if (!Array.isArray(children)) {
        this.debugLog.debug(`[recover] skipped: children is not an array, type=${typeof children}`)
        this.recoveringSessions.delete(parentSessionID)
        return
      }

      let recovered = 0
      for (const child of children) {
        const childSessionID = child.id
        if (!childSessionID) continue

        const taskID = sessionIDToTaskID(childSessionID)
        if (this.tasks.has(taskID)) continue

        const now = new Date()
        const task: WopalTask = {
          id: taskID,
          sessionID: childSessionID,
          status: 'running',
          description: child.title ?? '',
          agent: child.agent ?? 'unknown',
          prompt: '',
          parentSessionID,
          createdAt: new Date(child.time?.created ?? Date.now()),
          startedAt: now,
          progress: {
            toolCalls: 0,
            lastUpdate: now,
            lastMeaningfulActivity: now,
          },
          idleNotified: true,
        }
        this.tasks.set(taskID, task)
        this.taskSessions.add(childSessionID)
        recovered++
        this.debugLog.debug(`[recover] restored task=${taskID} session=${childSessionID.slice(0, 16)} title="${child.title?.substring(0, 40) ?? ''}"`)
      }

      if (recovered > 0) {
        this.debugLog.info(`[recover] recovered ${recovered} task(s) from parent=${parentSessionID.slice(0, 16)}`)
      }
      this.recoveredSessions.add(parentSessionID)
    } catch (err) {
      this.debugLog.debug(`[recover] error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      this.recoveringSessions.delete(parentSessionID)
    }
  }

  private getLauncherDeps() {
    return {
      tasks: this.tasks,
      client: this.client,
      debugLog: this.debugLog,
      concurrency: this.concurrency,
      concurrencyKey: this.CONCURRENCY_KEY,
      taskManager: this,
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
      sessionStore: this.sessionStore,
      client: this.client,
      debugLog: this.debugLog,
      directory: this.directory,
      taskManager: this,
      notifyParentStuckFn: async (task: WopalTask, durationText: string) =>
        await notifyParentStuck({ client: this.client, debugLog: this.debugLog }, task, durationText),
      sendProgressNotificationFn: async (task: WopalTask, msgCount: number, ctx: number | null, trigger?: string) =>
        await sendProgressNotification({ client: this.client, debugLog: this.debugLog }, task, msgCount, ctx, trigger as ProgressNotifyTrigger | undefined),
    }
  }
}
