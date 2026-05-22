/**
 * Main Session Monitor Strategy
 *
 * Scans non-task sessions and queues context warnings when usage >= threshold.
 * Does NOT send prompts — only records pending state for later consumption.
 */

import type { MonitorStrategy, TickResult } from "./monitor-engine.js"
import type { SessionStore } from "../session-store.js"
import type { OpenCodeClient } from "../types.js"
import type { TaskSessionInspector } from "../session-runtime-info.js"
import type { LoggerInstance } from "../logger.js"
import { fetchContextPercent } from "../session-runtime-info.js"
import { formatSessionID } from "../logger.js"

/** Context usage percentage threshold to trigger warning */
const MAIN_SESSION_CONTEXT_WARNING_THRESHOLD_PCT = 65

export interface MainSessionMonitorArgs {
  sessionStore: SessionStore
  client: OpenCodeClient
  directory: string
  taskManager?: TaskSessionInspector
  logger: LoggerInstance
}

/**
 * Create a MainSessionMonitorStrategy for registration with MonitorEngine.
 *
 * On each tick, scans all sessions in SessionStore:
 * - Skips task sessions, compacting sessions
 * - Calls fetchContextPercent() for each main session
 * - If pct >= threshold, queues a pending context warning via SessionStore
 * - Does NOT call promptAsync
 */
export function createMainSessionMonitorStrategy(
  args: MainSessionMonitorArgs,
): MonitorStrategy {
  return {
    name: "main-session-monitor",
    tick: async (): Promise<TickResult> => {
      const sessionIDs = args.sessionStore.ids()
      const nowMs = Date.now()
      const lines: string[] = []

      for (const sessionID of sessionIDs) {
        try {
          // Skip task sessions
          if (args.taskManager?.isTaskSession(sessionID)) continue

          const state = args.sessionStore.get(sessionID)
          if (!state) continue

          // Skip compacting sessions
          if (state.isCompacting) continue

          // Fetch context usage
          const ctxInfo = await fetchContextPercent(
            args.client,
            args.sessionStore,
            args.directory,
            sessionID,
            args.logger,
            args.taskManager,
          )

          const shortId = sessionID.slice(-10)
          const title = state.title?.slice(0, 40) ?? ''
          const titleText = title ? `"${title}" ` : ''

          if (!ctxInfo) {
            lines.push(`${shortId}(main) ${titleText}ctx:—`)
            continue
          }

          const warnMark = ctxInfo.pct >= MAIN_SESSION_CONTEXT_WARNING_THRESHOLD_PCT ? ' ⚠️' : ''
          lines.push(`${shortId}(main) ${titleText}ctx:${ctxInfo.pct}%${warnMark}`)

          if (ctxInfo.pct >= MAIN_SESSION_CONTEXT_WARNING_THRESHOLD_PCT) {
            const queued = args.sessionStore.queueContextWarning(sessionID, ctxInfo.pct, nowMs)
            if (queued) {
              args.logger.trace(
                `[mainSessionMonitor] ${shortId} context warning queued at ${ctxInfo.pct}%`,
              )
            }
          }
        } catch (err) {
          args.logger.debug(
            `[mainSessionMonitor] error scanning session ${formatSessionID(sessionID, false)}: ${err instanceof Error ? err.message : String(err)}`,
          )
          continue
        }
      }

      return { mainSessions: { count: lines.length, lines } }
    },
  }
}
