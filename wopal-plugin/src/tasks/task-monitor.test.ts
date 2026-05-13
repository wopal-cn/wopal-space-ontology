import { describe, it, expect } from "vitest"
import {
  checkStuckTasks,
  clearStuckState,
  DEFAULT_STUCK_TIMEOUT_MS,
} from "./task-monitor.js"
import type { WopalTask } from "./types.js"

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
