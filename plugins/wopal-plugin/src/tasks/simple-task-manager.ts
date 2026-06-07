import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
  OpenCodeClient,
} from "../types.js"
import type { LoggerInstance } from "../logger.js"
import type { SessionStore } from "../session-store.js"
import type { MonitorStrategy } from "../monitor/monitor-engine.js"
import type { TaskMonitorRuntimeDeps } from "./task-monitor-strategy.js"
import { taskLogger, formatSessionID } from "../logger.js"
import { sessionStore as globalSessionStore } from "../session-store-instance.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup.js"
import {
  launchTask,
  DEFAULT_CONCURRENCY_LIMIT,
} from "./task-launcher.js"
import { notifyParent, sendProgressNotification } from "./task-notifier.js"
import { createTaskMonitorStrategy } from "./task-monitor-strategy.js"
import type { ProgressNotifyTrigger } from "./task-monitor.js"
import {
  abortSession,
  markTaskIdleBySession,
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
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_KEY = 'default'
  private isShuttingDown = false
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
    // Tick loop is now managed by MonitorEngine, nothing to clean up here.
    // Method retained for backward compatibility.
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

  markTaskIdleBySession(sessionID: string): WopalTask | undefined {
    return markTaskIdleBySession(this.getLifecycleDeps(), sessionID)
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
          debugLog.debug({ task_id: formatSessionID(task.sessionID, true), err: result.error }, "[finishTask] Session delete failed")
          return { ok: false, message: `Failed to delete session: ${String(result.error)}` }
        }
      } catch (err) {
        debugLog.debug({ task_id: formatSessionID(task.sessionID, true), err }, "[finishTask] Session delete threw")
        return { ok: false, message: `Failed to delete session: ${String(err)}` }
      }
    }

    tasks.delete(taskId)

    releaseConcurrencySlot(task)

    debugLog.info({ task_id: formatSessionID(task.sessionID, true) }, "[finishTask] Task finished")
    return { ok: true, message: "Task finished successfully. Session deleted from OpenCode." }
  }

  async notifyParent(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    await notifyParent({ client: this.client, debugLog: this.debugLog, sessionStore: this.sessionStore }, task)
  }

  /**
   * Create a MonitorStrategy that wraps the task monitor tick body.
   * Register the returned strategy with MonitorEngine.
   */
  createMonitorStrategy(): MonitorStrategy {
    return createTaskMonitorStrategy({
      getDeps: (): TaskMonitorRuntimeDeps => this.getMonitorDeps(),
    })
  }

  releaseConcurrencySlot(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }

  reacquireSlotOnWakeUp(task: WopalTask): boolean {
    if (!isResumableTask(task)) {
      return false
    }

    if (task.concurrencyKey) {
      delete task.waitingConcurrencyKey
      return true
    }

    if (this.concurrency.tryAcquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)) {
      task.concurrencyKey = this.CONCURRENCY_KEY
      delete task.waitingConcurrencyKey
      this.debugLog.debug({ task_id: formatSessionID(task.sessionID, true) }, "[reacquireSlot] Acquired slot")
      return true
    }

    this.debugLog.debug({ task_id: formatSessionID(task.sessionID, true) }, "[reacquireSlot] Concurrency limit reached")
    return false
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
          status: 'idle',
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
        }
        this.tasks.set(taskID, task)
        this.taskSessions.add(childSessionID)
        recovered++
        this.debugLog.debug({ task_id: formatSessionID(childSessionID, true), title: child.title ?? '' }, "[recover] Restored task")
      }

      if (recovered > 0) {
        this.debugLog.info({ recovered, parent_id: formatSessionID(parentSessionID, false) }, "[recover] Recovered tasks")
      }
      this.recoveredSessions.add(parentSessionID)
    } catch (err) {
      this.debugLog.debug({ err }, "[recover] Failed")
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

  private getMonitorDeps(): TaskMonitorRuntimeDeps {
    return {
      tasks: this.tasks,
      sessionStore: this.sessionStore,
      client: this.client,
      debugLog: this.debugLog,
      directory: this.directory,
      taskManager: this,
      sendProgressNotificationFn: async (task: WopalTask, msgCount: number, ctx: number | null, trigger?: string) =>
        await sendProgressNotification({ client: this.client, debugLog: this.debugLog, sessionStore: this.sessionStore }, task, msgCount, ctx, trigger as ProgressNotifyTrigger | undefined),
    }
  }
}
