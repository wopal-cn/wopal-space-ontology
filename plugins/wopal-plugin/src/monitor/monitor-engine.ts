import type { LoggerInstance } from "../logger.js"
import { coreLogger } from "../logger.js"

export type TickSessionKind = "main" | "task"

export interface TickSessionEntry {
  kind: TickSessionKind
  text: string
}

export interface TickResult {
  /** Unified view: all sessions (main + tasks) with status labels */
  sessions?: TickSessionEntry[]
}

export interface MonitorStrategy {
  name: string
  tick(): Promise<TickResult | void>
}

export class MonitorEngine {
  private readonly strategies: MonitorStrategy[]
  private readonly intervalMs: number
  private readonly logger: LoggerInstance
  private timer: ReturnType<typeof setInterval> | undefined = undefined
  private tickRunning = false
  private stopped = false

  constructor(args: {
    intervalMs?: number
    strategies: MonitorStrategy[]
    logger?: LoggerInstance
  }) {
    this.intervalMs = args.intervalMs ?? 30_000
    this.strategies = args.strategies
    this.logger = args.logger ?? coreLogger
  }

  start(): void {
    if (this.timer) return
    if (this.stopped) return

    this.timer = setInterval(() => {
      if (this.tickRunning) return
      this.tickRunning = true
      void this.runTick().finally(() => {
        this.tickRunning = false
      })
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
    }
    this.timer = undefined
    this.stopped = true
  }

  shutdown(): void {
    this.stop()
  }

  async runOnceForTesting(): Promise<TickResult[]> {
    return this.runTick()
  }

  private async runTick(): Promise<TickResult[]> {
    const results: TickResult[] = []
    for (const strategy of this.strategies) {
      try {
        const result = await strategy.tick()
        if (result) results.push(result)
      } catch (error) {
        this.logger.error(
          { err: error instanceof Error ? error : new Error(String(error)), strategy: strategy.name },
          `[monitor] strategy ${strategy.name} failed`,
        )
      }
    }

    const mainSessions: TickSessionEntry[] = []
    const taskSessions: TickSessionEntry[] = []

    for (const result of results) {
      for (const session of result.sessions ?? []) {
        if (session.kind === "main") {
          mainSessions.push(session)
        } else {
          taskSessions.push(session)
        }
      }
    }

    const orderedSessions = [...mainSessions, ...taskSessions]
    const sessionCount = orderedSessions.length

    if (sessionCount > 0) {
      const numberedLines = orderedSessions.map((session, i) => `  [${i}] ${session.text}`)
      this.logger.debug(`[tick] ${sessionCount} sessions:\n${numberedLines.join('\n')}`)
    }
    return results
  }
}
