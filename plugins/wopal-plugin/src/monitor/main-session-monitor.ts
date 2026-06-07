/**
 * Main Session Monitor Strategy
 *
 * Scans non-task sessions and queues context warnings when usage >= threshold.
 * Does NOT send prompts — only records pending state for later consumption.
 */

import type { MonitorStrategy, TickResult, TickSessionEntry } from "./monitor-engine.js"
import type { SessionStore } from "../session-store.js"
import type { OpenCodeClient } from "../types.js"
import type { TaskSessionInspector } from "../session-runtime-info.js"
import type { LoggerInstance } from "../logger.js"
import { extractContextFromStore, fetchContextPercent } from "../session-runtime-info.js"
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
 * - Skips task sessions
 * - Reports compacting sessions from cached sessionStore context only
 * - Calls fetchContextPercent() for each non-compacting main session
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
      const sessions: TickSessionEntry[] = []

      for (const sessionID of sessionIDs) {
        try {
          // Skip task sessions
          if (args.taskManager?.isTaskSession(sessionID)) continue

          const state = args.sessionStore.get(sessionID)
          if (!state) continue

          const sessionLabel = formatSessionID(sessionID, false)
          const title = state.title ?? ''
          const titleText = title ? `"${title}" ` : ''

          if (state.isCompacting) {
            const cachedCtx = extractContextFromStore(
              args.sessionStore,
              sessionID,
              [],
              args.logger,
              args.taskManager,
            )
            const ctxText = cachedCtx ? `${cachedCtx.pct}%` : '—'
            sessions.push({
              kind: "main",
              text: `${sessionLabel} ${titleText}ctx:${ctxText} [compacting]`,
            })
            continue
          }

          // Fetch context usage
          const ctxInfo = await fetchContextPercent(
            args.client,
            args.sessionStore,
            args.directory,
            sessionID,
            args.logger,
            args.taskManager,
          )

          if (!ctxInfo) {
            sessions.push({
              kind: "main",
              text: `${sessionLabel} ${titleText}ctx:—`,
            })
            continue
          }

          const warnMark = ctxInfo.pct >= MAIN_SESSION_CONTEXT_WARNING_THRESHOLD_PCT ? ' ⚠️' : ''
          sessions.push({
            kind: "main",
            text: `${sessionLabel} ${titleText}ctx:${ctxInfo.pct}%${warnMark}`,
          })

          if (ctxInfo.pct >= MAIN_SESSION_CONTEXT_WARNING_THRESHOLD_PCT) {
            const queued = args.sessionStore.queueContextWarning(sessionID, ctxInfo.pct, nowMs)
            if (queued) {
              args.logger.trace(
                `[mainSessionMonitor] ${sessionLabel} context warning queued at ${ctxInfo.pct}%`,
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

      return { sessions }
    },
  }
}
