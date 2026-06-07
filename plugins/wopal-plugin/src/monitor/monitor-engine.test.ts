import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MonitorEngine, type MonitorStrategy } from "./monitor-engine.js"
import type { LoggerInstance } from "../logger.js"

function createMockLogger(): LoggerInstance {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}

function createStrategy(name: string, fn?: () => Promise<void>): MonitorStrategy {
  return {
    name,
    tick: fn ?? (() => Promise.resolve()),
  }
}

describe("MonitorEngine", () => {
  let logger: LoggerInstance

  beforeEach(() => {
    vi.useFakeTimers()
    logger = createMockLogger()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("runOnceForTesting", () => {
    it("executes strategies in registration order", async () => {
      const order: string[] = []
      const s1 = createStrategy("s1", async () => { order.push("s1") })
      const s2 = createStrategy("s2", async () => { order.push("s2") })
      const s3 = createStrategy("s3", async () => { order.push("s3") })

      const engine = new MonitorEngine({ strategies: [s1, s2, s3], logger })
      await engine.runOnceForTesting()

      expect(order).toEqual(["s1", "s2", "s3"])
    })

    it("isolates strategy errors and continues execution", async () => {
      const order: string[] = []
      const s1 = createStrategy("s1", async () => { order.push("s1") })
      const s2 = createStrategy("s2", async () => { throw new Error("boom") })
      const s3 = createStrategy("s3", async () => { order.push("s3") })

      const engine = new MonitorEngine({ strategies: [s1, s2, s3], logger })
      await engine.runOnceForTesting()

      expect(order).toEqual(["s1", "s3"])
      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: "s2" }),
        expect.stringContaining("s2"),
      )
    })

    it("handles non-Error throws in strategy", async () => {
      const s1 = createStrategy("s1", async () => { throw "string error" })
      const engine = new MonitorEngine({ strategies: [s1], logger })
      await engine.runOnceForTesting()

      expect(logger.error).toHaveBeenCalledTimes(1)
    })

    it("always logs main sessions before task sessions", async () => {
      const taskStrategy: MonitorStrategy = {
        name: "task-monitor",
        tick: async () => ({
          sessions: [{ kind: "task", text: "task-1(task) [running] \"Task\" 1 msgs, 0m10s" }],
        }),
      }
      const mainStrategy: MonitorStrategy = {
        name: "main-session-monitor",
        tick: async () => ({
          sessions: [{ kind: "main", text: "main-1(main) \"Main\" ctx:4%" }],
        }),
      }

      const engine = new MonitorEngine({ strategies: [taskStrategy, mainStrategy], logger })
      await engine.runOnceForTesting()

      expect(logger.debug).toHaveBeenCalledWith(
        `[tick] 2 sessions:\n  [0] main-1(main) "Main" ctx:4%\n  [1] task-1(task) [running] "Task" 1 msgs, 0m10s`,
      )
    })
  })

  describe("start / stop idempotency", () => {
    it("does not create a second interval on repeated start()", async () => {
      let tickCount = 0
      const s1 = createStrategy("s1", async () => { tickCount++ })
      const engine = new MonitorEngine({ strategies: [s1], logger, intervalMs: 10_000 })
      engine.start()
      engine.start() // second call must be no-op

      // Advance by two intervals, flushing async ticks
      await vi.advanceTimersByTimeAsync(20_000)
      engine.stop()

      // If a second interval were created, tickCount would be 4 (2 intervals × 2 ticks)
      expect(tickCount).toBe(2)
    })

    it("stop() is idempotent", () => {
      const engine = new MonitorEngine({ strategies: [], logger, intervalMs: 10_000 })
      engine.start()
      engine.stop()
      engine.stop() // second call should not throw
    })

    it("start() after stop() does not restart", () => {
      const tickFn = vi.fn()
      const s1 = createStrategy("s1", async () => { tickFn() })
      const engine = new MonitorEngine({ strategies: [s1], logger, intervalMs: 10_000 })

      engine.start()
      engine.stop()
      engine.start() // should be no-op after stop

      vi.advanceTimersByTime(30_000)
      expect(tickFn).not.toHaveBeenCalled()
    })
  })

  describe("shutdown", () => {
    it("clears interval and is idempotent", () => {
      const tickFn = vi.fn()
      const s1 = createStrategy("s1", async () => { tickFn() })
      const engine = new MonitorEngine({ strategies: [s1], logger, intervalMs: 10_000 })

      engine.start()
      vi.advanceTimersByTime(10_000)
      expect(tickFn).toHaveBeenCalledTimes(1)

      engine.shutdown()
      vi.advanceTimersByTime(30_000)
      expect(tickFn).toHaveBeenCalledTimes(1) // no more ticks after shutdown

      engine.shutdown() // idempotent, no throw
    })
  })

  describe("tickRunning mutual exclusion", () => {
    it("skips tick if previous tick is still running", async () => {
      let resolveFirst: () => void
      const firstTickPromise = new Promise<void>((r) => { resolveFirst = r })
      let tickCount = 0

      const s1 = createStrategy("slow", async () => {
        tickCount++
        if (tickCount === 1) {
          await firstTickPromise
        }
      })

      const engine = new MonitorEngine({ strategies: [s1], logger, intervalMs: 10_000 })
      engine.start()

      // Fire first tick
      vi.advanceTimersByTime(10_000)
      // Wait for async to start
      await vi.advanceTimersByTimeAsync(0)

      // Second tick fires while first is still running
      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      // Resolve the first tick
      resolveFirst!()
      await vi.advanceTimersByTimeAsync(0)

      // Third tick should fire now
      vi.advanceTimersByTime(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(tickCount).toBe(2) // first and third, second was skipped
      engine.stop()
    })
  })

  describe("default interval", () => {
    it("defaults to 30_000ms interval", async () => {
      const tickCount = { value: 0 }
      const strategy: MonitorStrategy = {
        name: "test",
        tick: async () => {
          tickCount.value++
        },
      }

      const engine = new MonitorEngine({ strategies: [strategy], logger })
      engine.start()

      // No tick at 29s
      vi.advanceTimersByTime(29_000)
      expect(tickCount.value).toBe(0)

      // One tick at 30s
      vi.advanceTimersByTime(1_000)
      await vi.advanceTimersByTimeAsync(0)
      expect(tickCount.value).toBe(1)

      engine.stop()
    })
  })
})
