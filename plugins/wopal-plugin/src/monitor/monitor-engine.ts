import type { LoggerInstance } from "../logger.js"
import { coreLogger } from "../logger.js"

export interface TickResult {
  tasks?: { count: number; lines: string[] }
  mainSessions?: { count: number; lines: string[] }
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

    const taskCount = results.reduce((sum, r) => sum + (r.tasks?.count ?? 0), 0)
    const mainCount = results.reduce((sum, r) => sum + (r.mainSessions?.count ?? 0), 0)

    if (taskCount > 0 || mainCount > 0) {
      const rawLines: string[] = []
      for (const r of results) {
        if (r.tasks?.lines) rawLines.push(...r.tasks.lines)
        if (r.mainSessions?.lines) rawLines.push(...r.mainSessions.lines)
      }
      const numberedLines = rawLines.map((line, i) => `[${i}] ${line}`)
      this.logger.info(`[tick] ${taskCount} tasks, ${mainCount} main sessions:\n${numberedLines.join('\n')}`)
    }
    return results
  }
}
