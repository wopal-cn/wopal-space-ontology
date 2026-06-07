import { describe, it, expect, vi } from "vitest"
import {
  checkProgressNotifications,
  formatTaskTickLines,
  logTickStatus,
  PROGRESS_NOTIFY_TIME_THRESHOLD_MS,
  CONTEXT_WARN_THRESHOLD,
  getContextMilestone,
} from "./task-monitor.js"
import type { WopalTask } from "./types.js"
import { SessionStore } from "../session-store.js"
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

function createTask(overrides: Partial<WopalTask> = {}): WopalTask {
  return {
    id: "task-1",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "test",
    parentSessionID: "parent-1",
    createdAt: new Date(),
    startedAt: new Date(Date.now() - 300_000),
    sessionID: "session-1",
    progress: { toolCalls: 0, lastUpdate: new Date() },
    ...overrides,
  } as WopalTask
}

describe("getContextMilestone", () => {
  it("returns null below 40%", () => {
    expect(getContextMilestone(0)).toBeNull()
    expect(getContextMilestone(25)).toBeNull()
    expect(getContextMilestone(39)).toBeNull()
  })

  it("returns 40 for 40-49%", () => {
    expect(getContextMilestone(40)).toBe(40)
    expect(getContextMilestone(41)).toBe(40)
    expect(getContextMilestone(44)).toBe(40)
    expect(getContextMilestone(49)).toBe(40)
  })

  it("returns multiples of 5 from 50 onward", () => {
    expect(getContextMilestone(50)).toBe(50)
    expect(getContextMilestone(51)).toBe(50)
    expect(getContextMilestone(54)).toBe(50)
    expect(getContextMilestone(55)).toBe(55)
    expect(getContextMilestone(56)).toBe(55)
    expect(getContextMilestone(60)).toBe(60)
    expect(getContextMilestone(73)).toBe(70)
    expect(getContextMilestone(100)).toBe(100)
  })
})

// Progress notification tests
describe("checkProgressNotifications", () => {
  it("should notify based on time quota", async () => {
    const task = createTask({
      id: "task-time",
      startedAt: new Date(Date.now() - PROGRESS_NOTIFY_TIME_THRESHOLD_MS - 1000),
      sessionID: "session-time",
    })
    const tasks = new Map([["task-time", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].taskId).toBe("task-time")
    expect(results[0].triggerReason).toBe("time_quota")
    expect(sendNotification).toHaveBeenCalled()
  })

  it("should not trigger on message count (removed trigger type)", async () => {
    const task = createTask({
      id: "task-msg",
      startedAt: new Date(),
      sessionID: "session-msg",
    })
    const tasks = new Map([["task-msg", task]])
    const sessionStore = new SessionStore({ max: 10 })
    // 20 messages — previously would have triggered message_count
    const mockMessages = vi.fn().mockResolvedValue({
      data: Array(20).fill({ id: "msg" }),
    })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    // message_count trigger no longer exists
    expect(results).toHaveLength(1)
    expect(results[0].wasNotified).toBe(false)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should notify when context crosses 40% (39→41)", async () => {
    const task = createTask({
      id: "task-ctx-40",
      startedAt: new Date(),
      sessionID: "session-ctx-40",
      lastNotifyTimeQuota: 0, // suppress time trigger
    })
    const tasks = new Map([["task-ctx-40", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // 41% context = 41000/100000
    sessionStore.upsert("session-ctx-40", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.lastTokens = { input: 41000, output: 1000, updatedAt: Date.now() }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: { providers: [{ id: "anthropic", models: { "claude-3": { limit: { context: 100000 } } } }] },
    })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages }, config: { providers: mockConfig } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("context_milestone")
    expect(results[0].contextUsage).toBe(41)
    // Dedup field updated to milestone value (40)
    expect(task.lastNotifyContextPct).toBe(40)
  })

  it("should notify when context crosses 50% (49→52)", async () => {
    const task = createTask({
      id: "task-ctx-50",
      startedAt: new Date(),
      sessionID: "session-ctx-50",
      lastNotifyTimeQuota: 0,
      lastNotifyContextPct: 40, // already notified at 40%
    })
    const tasks = new Map([["task-ctx-50", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // 52% context
    sessionStore.upsert("session-ctx-50", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.lastTokens = { input: 52000, output: 1000, updatedAt: Date.now() }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: { providers: [{ id: "anthropic", models: { "claude-3": { limit: { context: 100000 } } } }] },
    })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages }, config: { providers: mockConfig } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("context_milestone")
    expect(results[0].contextUsage).toBe(52)
    expect(task.lastNotifyContextPct).toBe(50)
  })

  it("should notify when context crosses 55% (54→56)", async () => {
    const task = createTask({
      id: "task-ctx-55",
      startedAt: new Date(),
      sessionID: "session-ctx-55",
      lastNotifyTimeQuota: 0,
      lastNotifyContextPct: 50, // already notified at 50%
    })
    const tasks = new Map([["task-ctx-55", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // 56% context
    sessionStore.upsert("session-ctx-55", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.lastTokens = { input: 56000, output: 1000, updatedAt: Date.now() }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: { providers: [{ id: "anthropic", models: { "claude-3": { limit: { context: 100000 } } } }] },
    })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages }, config: { providers: mockConfig } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("context_milestone")
    expect(results[0].contextUsage).toBe(56)
    expect(task.lastNotifyContextPct).toBe(55)
  })

  it("should not notify when context stays within same milestone", async () => {
    const task = createTask({
      id: "task-ctx-same",
      startedAt: new Date(),
      sessionID: "session-ctx-same",
      lastNotifyTimeQuota: 0,
      lastNotifyContextPct: 50, // already notified at 50%
    })
    const tasks = new Map([["task-ctx-same", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // 54% = still milestone 50, no new milestone crossed
    sessionStore.upsert("session-ctx-same", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.lastTokens = { input: 54000, output: 1000, updatedAt: Date.now() }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: { providers: [{ id: "anthropic", models: { "claude-3": { limit: { context: 100000 } } } }] },
    })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn()

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages }, config: { providers: mockConfig } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results[0].wasNotified).toBe(false)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should not notify when context is below 40%", async () => {
    const task = createTask({
      id: "task-ctx-low",
      startedAt: new Date(),
      sessionID: "session-ctx-low",
      lastNotifyTimeQuota: 0,
    })
    const tasks = new Map([["task-ctx-low", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // 30% context — below first milestone
    sessionStore.upsert("session-ctx-low", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.lastTokens = { input: 30000, output: 1000, updatedAt: Date.now() }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: { providers: [{ id: "anthropic", models: { "claude-3": { limit: { context: 100000 } } } }] },
    })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn()

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages }, config: { providers: mockConfig } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results[0].wasNotified).toBe(false)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should not notify for idle tasks", async () => {
    const task = createTask({
      id: "task-idle",
      status: "idle",
      sessionID: "session-idle",
    })
    const tasks = new Map([["task-idle", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({ data: Array(20).fill({}) })
    const sendNotification = vi.fn()

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(0) // idle tasks filtered out
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should use progressNotifyTimeBaseline for time quota calculation", async () => {
    // Task started 10 minutes ago but was reactivated 1 minute ago
    const baseline = new Date(Date.now() - 60_000) // 1 min ago
    const task = createTask({
      id: "task-reactivated",
      startedAt: new Date(Date.now() - 600_000), // 10 min ago (total runtime)
      progressNotifyTimeBaseline: baseline,
      lastNotifyTimeQuota: 0,
      sessionID: "session-reactivated",
    })
    const tasks = new Map([["task-reactivated", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn()

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    // Only 1 min since reactivation, so no time quota trigger (needs 3 min)
    expect(results).toHaveLength(1)
    expect(results[0].wasNotified).toBe(false)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should trigger time quota based on progressNotifyTimeBaseline after reactivation", async () => {
    // Task started 10 min ago, reactivated 4 min ago — time trigger should fire
    const baseline = new Date(Date.now() - PROGRESS_NOTIFY_TIME_THRESHOLD_MS - 60_000)
    const task = createTask({
      id: "task-reactivated-time",
      startedAt: new Date(Date.now() - 600_000),
      progressNotifyTimeBaseline: baseline,
      lastNotifyTimeQuota: 0,
      sessionID: "session-reactivated-time",
    })
    const tasks = new Map([["task-reactivated-time", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: createMockLogger(),
      directory: "/test",
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("time_quota")
    expect(sendNotification).toHaveBeenCalled()
  })
})

describe("logTickStatus", () => {
  it("should log running tasks with progress info (debug level)", () => {
    const task = createTask({
      id: "wopal-task-abc123",
      description: "Test logging",
      startedAt: new Date(Date.now() - 65_000),
      progress: { toolCalls: 5, lastUpdate: new Date() },
    })
    const tasks = new Map([["wopal-task-abc123", task]])
    const progressInfos = [{
      taskId: "wopal-task-abc123",
      messageCount: 15,
      wasNotified: true,
      contextUsage: 30,
    }]

    const debugLog = createMockLogger()
    logTickStatus(tasks, progressInfos, debugLog)

    expect(debugLog.debug).toHaveBeenCalledTimes(1)
    expect(debugLog.debug).toHaveBeenCalledWith(expect.stringContaining("[tick] 1 tasks:"))
    expect(debugLog.debug).toHaveBeenCalledWith(expect.stringContaining("(task)"))
  })

  it("should log tasks regardless of status", () => {
    const task = createTask({ status: "idle" })
    const tasks = new Map([["task-1", task]])
    const debugLog = createMockLogger()

    logTickStatus(tasks, [], debugLog)

    expect(debugLog.debug).toHaveBeenCalledTimes(1)
    expect(debugLog.debug).toHaveBeenCalledWith(expect.stringContaining("[tick] 1 tasks:"))
    expect(debugLog.debug).toHaveBeenCalledWith(expect.stringContaining("[idle]"))
  })

  it("should show cached context usage for idle tasks", () => {
    const task = createTask({ status: "idle", sessionID: "session-idle" })
    const tasks = new Map([["task-1", task]])
    const sessionStore = new SessionStore({ max: 10 })

    sessionStore.upsert("session-idle", (state) => {
      state.contextLimit = 100_000
      state.lastTokens = {
        input: 33_000,
        output: 100,
        cache: { read: 10_000 },
        updatedAt: Date.now(),
      }
    })

    const lines = formatTaskTickLines(tasks, [], sessionStore)

    expect(lines[0]).toContain("[idle]")
    expect(lines[0]).toContain("ctx:43%")
  })

  it("should not log when tasks map is empty", () => {
    const tasks = new Map<string, WopalTask>()
    const debugLog = createMockLogger()

    logTickStatus(tasks, [], debugLog)

    expect(debugLog.debug).not.toHaveBeenCalled()
  })

  it("should use createdAt when pending task has no startedAt", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-23T00:00:20.000Z"))

    const task = createTask({
      status: "idle",
      startedAt: undefined,
      createdAt: new Date("2026-05-23T00:00:00.000Z"),
    })
    const tasks = new Map([["task-1", task]])
    const debugLog = createMockLogger()

    logTickStatus(tasks, [], debugLog)

    expect(debugLog.debug).toHaveBeenCalledWith(expect.stringContaining("0m20s"))

    vi.useRealTimers()
  })

  it("should not throw for high context usage (debug level)", () => {
    const task = createTask({ startedAt: new Date(Date.now() - 65_000) })
    const tasks = new Map([["task-1", task]])
    const progressInfos = [{
      taskId: "task-1",
      messageCount: 10,
      wasNotified: false,
      contextUsage: 60, // Above CONTEXT_WARN_THRESHOLD
    }]

    const debugLog = createMockLogger()
    logTickStatus(tasks, progressInfos, debugLog)

    expect(debugLog.debug).toHaveBeenCalledTimes(1)
  })
})
