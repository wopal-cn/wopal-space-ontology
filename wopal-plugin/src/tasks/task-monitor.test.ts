import { describe, it, expect, vi } from "vitest"
import {
  checkStuckTasks,
  clearStuckState,
  DEFAULT_STUCK_TIMEOUT_MS,
  checkProgressNotifications,
  logTickStatus,
  PROGRESS_NOTIFY_TIME_THRESHOLD_MS,
  PROGRESS_NOTIFY_MESSAGE_MODULO,
  CONTEXT_WARN_THRESHOLD,
} from "./task-monitor.js"
import type { WopalTask } from "./types.js"
import { SessionStore } from "../session-store.js"

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

describe("checkStuckTasks", () => {
  it("should detect task stuck with no meaningful activity", () => {
    const tasks = [
      createTask({
        id: "stuck-1",
        progress: {
          toolCalls: 0,
          lastUpdate: new Date(),
          lastMeaningfulActivity: new Date(Date.now() - DEFAULT_STUCK_TIMEOUT_MS - 10_000),
        },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })

    expect(results).toHaveLength(1)
    expect(results[0].task.id).toBe("stuck-1")
    expect(results[0].durationMs).toBeGreaterThan(DEFAULT_STUCK_TIMEOUT_MS)
  })

  it("should not detect task with recent meaningful activity", () => {
    const tasks = [
      createTask({
        id: "active-1",
        progress: {
          toolCalls: 5,
          lastUpdate: new Date(),
          lastMeaningfulActivity: new Date(Date.now() - 30_000),
        },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })

    expect(results).toHaveLength(0)
  })

  it("should not detect task that is not running", () => {
    const tasks = [
      createTask({
        id: "completed-1",
        status: "completed",
        progress: {
          toolCalls: 0,
          lastUpdate: new Date(Date.now() - 300_000),
          lastMeaningfulActivity: new Date(Date.now() - 300_000),
        },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })

    expect(results).toHaveLength(0)
  })

  it("should skip task that already has stuckNotified", () => {
    const tasks = [
      createTask({
        id: "already-notified-1",
        stuckNotified: true,
        progress: {
          toolCalls: 0,
          lastUpdate: new Date(),
          lastMeaningfulActivity: new Date(Date.now() - 300_000),
        },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })

    expect(results).toHaveLength(0)
  })

  it("should use startedAt as fallback when no lastMeaningfulActivity", () => {
    const tasks = [
      createTask({
        id: "no-progress-1",
        startedAt: new Date(Date.now() - DEFAULT_STUCK_TIMEOUT_MS - 10_000),
        progress: { toolCalls: 0, lastUpdate: new Date() },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })

    expect(results).toHaveLength(1)
    expect(results[0].task.id).toBe("no-progress-1")
  })

  it("should handle empty task list", () => {
    const results = checkStuckTasks({ tasks: [], config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })
    expect(results).toHaveLength(0)
  })

  it("should handle task without sessionID", () => {
    const tasks = [
      createTask({
        id: "no-session-1",
        sessionID: undefined,
        progress: {
          toolCalls: 0,
          lastUpdate: new Date(),
          lastMeaningfulActivity: new Date(Date.now() - 300_000),
        },
      }),
    ]

    const results = checkStuckTasks({ tasks, config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS } })
    expect(results).toHaveLength(0)
  })
})

describe("clearStuckState", () => {
  it("should clear stuckNotified when task resumes activity", () => {
    const task = createTask({
      id: "resumed-1",
      stuckNotified: true,
      stuckNotifiedAt: new Date(Date.now() - 60_000),
      progress: {
        toolCalls: 5,
        lastUpdate: new Date(),
        lastMeaningfulActivity: new Date(Date.now() - 10_000),
      },
    })

    clearStuckState([task])

    expect(task.stuckNotified).toBe(false)
  })

  it("should not clear stuckNotified when activity is still old", () => {
    const task = createTask({
      id: "still-stuck-1",
      stuckNotified: true,
      stuckNotifiedAt: new Date(Date.now() - 60_000),
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
        lastMeaningfulActivity: new Date(Date.now() - 300_000),
      },
    })

    clearStuckState([task])

    expect(task.stuckNotified).toBe(true)
  })

  it("should skip non-running tasks", () => {
    const task = createTask({
      id: "completed-1",
      status: "completed",
      stuckNotified: true,
      stuckNotifiedAt: new Date(Date.now() - 60_000),
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
        lastMeaningfulActivity: new Date(Date.now() - 10_000),
      },
    })

    clearStuckState([task])

    expect(task.stuckNotified).toBe(true)
  })

  it("should skip task without stuckNotifiedAt", () => {
    const task = createTask({
      id: "never-notified-1",
      stuckNotified: true,
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
        lastMeaningfulActivity: new Date(Date.now() - 10_000),
      },
    })

    clearStuckState([task])

    expect(task.stuckNotified).toBe(true)
  })

  it("should handle empty list", () => {
    expect(() => clearStuckState([])).not.toThrow()
  })
})

// Task 4: progress notification tests
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
      debugLog: () => {},
      directory: "/test",
      notifyParentStuckFn: vi.fn(),
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].taskId).toBe("task-time")
    expect(results[0].triggerReason).toBe("time_quota")
    expect(sendNotification).toHaveBeenCalled()
  })

  it("should notify based on message count modulo", async () => {
    const task = createTask({
      id: "task-msg",
      startedAt: new Date(),
      sessionID: "session-msg",
    })
    const tasks = new Map([["task-msg", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({
      data: Array(PROGRESS_NOTIFY_MESSAGE_MODULO).fill({ id: "msg" }),
    })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: () => {},
      directory: "/test",
      notifyParentStuckFn: vi.fn(),
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("message_count")
    expect(results[0].messageCount).toBe(PROGRESS_NOTIFY_MESSAGE_MODULO)
  })

  it("should notify based on context threshold", async () => {
    const task = createTask({
      id: "task-ctx",
      startedAt: new Date(),
      sessionID: "session-ctx",
    })
    const tasks = new Map([["task-ctx", task]])
    const sessionStore = new SessionStore({ max: 10 })

    // Setup cached tokens in sessionStore
    sessionStore.upsert("session-ctx", (state) => {
      state.providerID = "anthropic"
      state.modelID = "claude-3"
      state.isTask = true
      state.lastTokens = {
        input: 50000,
        output: 1000,
        updatedAt: Date.now(),
      }
    })

    const mockConfig = vi.fn().mockResolvedValue({
      data: {
        providers: [{
          id: "anthropic",
          models: { "claude-3": { limit: { context: 100000 } } }
        }]
      }
    })

    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const sendNotification = vi.fn().mockResolvedValue(undefined)

    const deps = {
      tasks,
      sessionStore,
      client: {
        session: { messages: mockMessages },
        config: { providers: mockConfig },
      },
      debugLog: () => {},
      directory: "/test",
      notifyParentStuckFn: vi.fn(),
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(1)
    expect(results[0].triggerReason).toBe("context_threshold")
    expect(results[0].contextUsage).toBe(50) // 50000/100000 = 50%
  })

  it("should not notify for idle tasks", async () => {
    const task = createTask({
      id: "task-idle",
      status: "running",
      idleNotified: true,
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
      debugLog: () => {},
      directory: "/test",
      notifyParentStuckFn: vi.fn(),
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    expect(results).toHaveLength(0) // idle tasks filtered out
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("should deduplicate notifications by lastNotifyMessageCount", async () => {
    const task = createTask({
      id: "task-dedup",
      sessionID: "session-dedup",
      startedAt: new Date(Date.now() - 1000), // Started 1s ago (below time threshold)
      lastNotifyMessageCount: 20,
      lastNotifyTimeQuota: 0, // Already at quota 0
    })
    const tasks = new Map([["task-dedup", task]])
    const sessionStore = new SessionStore({ max: 10 })
    const mockMessages = vi.fn().mockResolvedValue({
      data: Array(20).fill({ id: "msg" }),
    })
    const sendNotification = vi.fn()

    const deps = {
      tasks,
      sessionStore,
      client: { session: { messages: mockMessages } },
      debugLog: () => {},
      directory: "/test",
      notifyParentStuckFn: vi.fn(),
      sendProgressNotificationFn: sendNotification,
    }

    const results = await checkProgressNotifications(deps as never)

    // Should not notify again for same message count
    expect(results[0].wasNotified).toBe(false)
    expect(sendNotification).not.toHaveBeenCalled()
  })
})

describe("logTickStatus", () => {
  it("should log running tasks with progress info", () => {
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
    const debugLog = vi.fn()

    logTickStatus(tasks, progressInfos, debugLog)

    expect(debugLog).toHaveBeenCalled()
    const logOutput = debugLog.mock.calls[0][0]
    expect(logOutput).toContain("wopal-task-abc123")
    expect(logOutput).toContain("15 msgs")
    expect(logOutput).toContain("Test logging")
    expect(logOutput).toContain("✓notified")
  })

  it("should skip logging when no running tasks", () => {
    const task = createTask({ status: "completed" })
    const tasks = new Map([["task-1", task]])
    const debugLog = vi.fn()

    logTickStatus(tasks, [], debugLog)

    expect(debugLog).not.toHaveBeenCalled()
  })

  it("should show warning emoji for high context usage", () => {
    const task = createTask({ startedAt: new Date(Date.now() - 65_000) })
    const tasks = new Map([["task-1", task]])
    const progressInfos = [{
      taskId: "task-1",
      messageCount: 10,
      wasNotified: false,
      contextUsage: 60, // Above CONTEXT_WARN_THRESHOLD
    }]
    const debugLog = vi.fn()

    logTickStatus(tasks, progressInfos, debugLog)

    const logOutput = debugLog.mock.calls[0][0]
    expect(logOutput).toContain("⚠️")
  })
})
