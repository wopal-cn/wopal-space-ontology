/**
 * Task Monitor Strategy
 *
 * Wraps existing task monitor tick body into a MonitorStrategy.
 * Execution order preserved: checkProgressNotifications → logTickStatus
 */

import type { MonitorStrategy, TickResult } from "../monitor/monitor-engine.js"
import type { WopalTask, OpenCodeClient } from "../types.js"
import type { SessionStore } from "../session-store.js"
import type { LoggerInstance } from "../logger.js"
import type { TaskSessionInspector } from "../session-runtime-info.js"
import type { ProgressNotifyTrigger, ProgressTaskInfo } from "./progress-notify.js"
import {
  checkProgressNotifications,
  formatTaskTickLines,
} from "./task-monitor.js"

export interface TaskMonitorRuntimeDeps {
  tasks: Map<string, WopalTask>
  sessionStore: SessionStore
  client: OpenCodeClient
  debugLog: LoggerInstance
  directory: string
  taskManager?: TaskSessionInspector
  sendProgressNotificationFn: (task: WopalTask, messageCount: number, contextUsage: number | null, trigger?: ProgressNotifyTrigger) => Promise<void>
}

/**
 * Run one tick of the task monitor.
 * Preserves the original tick body order from SimpleTaskManager.
 * Returns TickResult for MonitorEngine to log.
 */
export async function runTaskMonitorTick(deps: TaskMonitorRuntimeDeps): Promise<TickResult> {
  // Step 1: Check progress notifications (returns ProgressTaskInfo[])
  const taskInfos: ProgressTaskInfo[] = await checkProgressNotifications(deps)

  // Step 2: Format task tick lines and wrap as task sessions
  const lines = formatTaskTickLines(deps.tasks, taskInfos, deps.sessionStore)
  return {
    sessions: lines.map((text) => ({ kind: "task" as const, text })),
  }
}

/**
 * Create a TaskMonitorStrategy for registration with MonitorEngine.
 * The `getDeps` function is called on each tick to get fresh deps (closure over manager state).
 */
export function createTaskMonitorStrategy(args: {
  getDeps: () => TaskMonitorRuntimeDeps
}): MonitorStrategy {
  return {
    name: "task-monitor",
    tick: async () => {
      const deps = args.getDeps()
      return runTaskMonitorTick(deps)
    },
  }
}
