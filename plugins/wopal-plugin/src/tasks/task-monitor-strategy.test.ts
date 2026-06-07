import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  runTaskMonitorTick,
  createTaskMonitorStrategy,
  type TaskMonitorRuntimeDeps,
} from "./task-monitor-strategy.js"
import type { WopalTask } from "../types.js"
import type { ProgressTaskInfo } from "./task-monitor.js"
import { PROGRESS_NOTIFY_TIME_THRESHOLD_MS, CONTEXT_WARN_THRESHOLD } from "./task-monitor.js"

// --- Call-order tracking via vi.mock (hoisted) ---
const callOrder: string[] = []
let formatTickReceivedInfos: ProgressTaskInfo[] | undefined

// Module-level references to mock functions for per-test override (var for hoisting compatibility)
var checkProgressNotificationsMock: ReturnType<typeof vi.fn>
var formatTaskTickLinesMock: ReturnType<typeof vi.fn>

vi.mock("./task-monitor.js", async (importOriginal) => {
  const actual = await importOriginal() as any
  checkProgressNotificationsMock = vi.fn(async (deps: any) => {
    callOrder.push("checkProgressNotifications")
    return actual.checkProgressNotifications(deps)
  })
  formatTaskTickLinesMock = vi.fn((tasks: any, infos: any) => {
    callOrder.push("formatTaskTickLines")
    formatTickReceivedInfos = infos
    return actual.formatTaskTickLines(tasks, infos)
  })
  return {
    ...actual,
    checkProgressNotifications: checkProgressNotificationsMock,
    formatTaskTickLines: formatTaskTickLinesMock,
  }
})

function createMockDeps(overrides?: Partial<TaskMonitorRuntimeDeps>): TaskMonitorRuntimeDeps {
  return {
    tasks: new Map<string, WopalTask>(),
    sessionStore: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      ids: vi.fn().mockReturnValue([]),
      lastTokens: vi.fn(),
    } as unknown as TaskMonitorRuntimeDeps["sessionStore"],
    client: {
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as TaskMonitorRuntimeDeps["client"],
    debugLog: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
    directory: "/test",
    taskManager: { isTaskSession: vi.fn().mockReturnValue(false) },
    sendProgressNotificationFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createRunningTask(overrides: Partial<WopalTask> = {}): WopalTask {
  return {
    id: "wopal-task-test-1",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "test",
    parentSessionID: "parent-1",
    createdAt: new Date(),
    startedAt: new Date(Date.now() - 300_000),
    sessionID: "ses_test-session-1",
    progress: { toolCalls: 0, lastUpdate: new Date(), lastMeaningfulActivity: new Date() },
    ...overrides,
  } as WopalTask
}

describe("task-monitor-strategy", () => {
  beforeEach(() => {
    callOrder.length = 0
    formatTickReceivedInfos = undefined
  })

  describe("runTaskMonitorTick", () => {
    it("executes in strict order: checkProgressNotifications → formatTaskTickLines", async () => {
      const task = createRunningTask()
      const tasks = new Map<string, WopalTask>()
      tasks.set(task.id, task)
      const deps = createMockDeps({ tasks })

      await runTaskMonitorTick(deps)

      expect(callOrder).toEqual([
        "checkProgressNotifications",
        "formatTaskTickLines",
      ])
    })

    it("passes progressInfos from checkProgressNotifications to formatTaskTickLines verbatim", async () => {
      // W-02 fix: Override mock to return sentinel array with unique marker
      const sentinelInfos: ProgressTaskInfo[] = [{ taskId: "SENTINEL-W02-UNIQUE", messageCount: 0, contextUsage: null }]

      // Override checkProgressNotifications for this test only
      checkProgressNotificationsMock.mockImplementationOnce(async () => sentinelInfos)

      const deps = createMockDeps()
      await runTaskMonitorTick(deps)

      // Verbatim pass-through: exact same reference
      expect(formatTickReceivedInfos).toBe(sentinelInfos)
    })

    it("wraps task lines as task sessions", async () => {
      const task = createRunningTask()
      const tasks = new Map<string, WopalTask>([[task.id, task]])
      const deps = createMockDeps({ tasks })

      const result = await runTaskMonitorTick(deps)

      expect(result.sessions).toHaveLength(1)
      expect(result.sessions?.[0]).toMatchObject({ kind: "task" })
    })
  })

  describe("createTaskMonitorStrategy", () => {
    it("returns a MonitorStrategy with correct name", () => {
      const deps = createMockDeps()
      const strategy = createTaskMonitorStrategy({ getDeps: () => deps })

      expect(strategy.name).toBe("task-monitor")
      expect(typeof strategy.tick).toBe("function")
    })

    it("tick() calls getDeps on each invocation", async () => {
      let callCount = 0
      const deps = createMockDeps()
      const strategy = createTaskMonitorStrategy({
        getDeps: () => {
          callCount++
          return deps
        },
      })

      await strategy.tick()
      expect(callCount).toBe(1)

      await strategy.tick()
      expect(callCount).toBe(2)
    })

    it("preserves sendProgressNotificationFn from getMonitorDeps", async () => {
      const sendProgressNotificationFn = vi.fn().mockResolvedValue(undefined)
      const task = createRunningTask()
      const tasks = new Map<string, WopalTask>()
      tasks.set(task.id, task)

      const deps = createMockDeps({ tasks, sendProgressNotificationFn })
      // Make the task trigger time-based notification (started 4 min ago)
      task.startedAt = new Date(Date.now() - PROGRESS_NOTIFY_TIME_THRESHOLD_MS - 60_000)
      // Provide messages
      ;(deps.client.session!.messages as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: "msg-1" }, { id: "msg-2" }, { id: "msg-3" }],
      })

      const strategy = createTaskMonitorStrategy({ getDeps: () => deps })
      await strategy.tick()

      expect(sendProgressNotificationFn).toHaveBeenCalled()
    })
  })

  describe("constant guards", () => {
    it("PROGRESS_NOTIFY_TIME_THRESHOLD_MS is 180_000", () => {
      expect(PROGRESS_NOTIFY_TIME_THRESHOLD_MS).toBe(180_000)
    })

    it("CONTEXT_WARN_THRESHOLD is 45", () => {
      expect(CONTEXT_WARN_THRESHOLD).toBe(45)
    })
  })
})