import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMainSessionMonitorStrategy } from "./main-session-monitor.js"
import type { SessionStore } from "../session-store.js"
import type { OpenCodeClient } from "../types.js"
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

function createMockSessionStore(overrides?: {
  ids?: string[]
  states?: Record<string, ReturnType<SessionStore["get"]>>
}): {
  store: SessionStore
  queueContextWarning: ReturnType<typeof vi.fn>
} {
  const idsValue = overrides?.ids ?? []
  const statesValue = overrides?.states ?? {}

  const queueContextWarning = vi.fn().mockReturnValue(true)

  const store = {
    ids: vi.fn().mockReturnValue(idsValue),
    get: vi.fn((id: string) => statesValue[id] ?? undefined),
    upsert: vi.fn(),
    queueContextWarning,
  } as unknown as SessionStore

  return { store, queueContextWarning }
}

function createMockClient(contextPercent: number | null = 75): OpenCodeClient {
  return {
    config: {
      providers: vi.fn().mockResolvedValue({
        data: {
          providers: [
            {
              id: "test-provider",
              models: {
                "test-model": { limit: { context: 100_000 } },
              },
            },
          ],
        },
      }),
    },
    session: {
      messages: vi.fn().mockResolvedValue({
        data: contextPercent !== null
          ? [
              {
                info: {
                  role: "assistant",
                  providerID: "test-provider",
                  modelID: "test-model",
                  tokens: { input: contextPercent * 1000, cache: { read: 0 } },
                },
              },
            ]
          : [],
      }),
    },
  } as unknown as OpenCodeClient
}

describe("createMainSessionMonitorStrategy", () => {
  let logger: LoggerInstance

  beforeEach(() => {
    logger = createMockLogger()
  })

  it("queues warning when context pct >= 65", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_main_1"],
      states: {
        ses_main_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          providerID: "test-provider",
          modelID: "test-model",
          lastTokens: { input: 70_000, output: 100, updatedAt: Date.now() },
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }

    // Mock fetchContextPercent by providing store data + client config
    const client = createMockClient(75)

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client,
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    await strategy.tick()

    expect(queueContextWarning).toHaveBeenCalledWith("ses_main_1", expect.any(Number), expect.any(Number))
  })

  it("skips session below threshold", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_main_1"],
      states: {
        ses_main_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          providerID: "test-provider",
          modelID: "test-model",
          lastTokens: { input: 40_000, output: 100, updatedAt: Date.now() },
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }
    const client = createMockClient(40)

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client,
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    await strategy.tick()

    expect(queueContextWarning).not.toHaveBeenCalled()
  })

  it("skips task sessions", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_task_1"],
      states: {
        ses_task_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(true) }

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client: createMockClient(80),
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    await strategy.tick()

    expect(taskManager.isTaskSession).toHaveBeenCalledWith("ses_task_1")
    expect(queueContextWarning).not.toHaveBeenCalled()
  })

  it("reports compacting sessions from cached context without queueing warnings", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_main_1"],
      states: {
        ses_main_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          isCompacting: true,
          title: "Compacting session",
          contextLimit: 100_000,
          lastTokens: { input: 8_000, output: 100, updatedAt: Date.now() },
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }
    const client = createMockClient(80)

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client,
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    const result = await strategy.tick()

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions?.[0].text).toContain("Compacting session")
    expect(result.sessions?.[0].text).toContain("ctx:8% [compacting]")
    expect(client.config?.providers).not.toHaveBeenCalled()
    expect(client.session?.messages).not.toHaveBeenCalled()
    expect(queueContextWarning).not.toHaveBeenCalled()
  })

  it("continues scanning after one session throws", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_bad", "ses_good"],
      states: {
        ses_bad: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          providerID: "test-provider",
          modelID: "test-model",
          lastTokens: { input: 70_000, output: 100, updatedAt: Date.now() },
        },
        ses_good: {
          lastUpdated: 2,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          providerID: "test-provider",
          modelID: "test-model",
          lastTokens: { input: 70_000, output: 100, updatedAt: Date.now() },
        },
      },
    })

    // Make the first session's queueContextWarning throw
    queueContextWarning
      .mockImplementationOnce(() => { throw new Error("store error") })
      .mockReturnValueOnce(true)

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client: createMockClient(75),
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    await strategy.tick()

    // Should have been called for both sessions (first throws, second succeeds)
    expect(queueContextWarning).toHaveBeenCalledTimes(2)

    // Debug log should have recorded the error for first session
    const debugCalls = (logger.debug as ReturnType<typeof vi.fn>).mock.calls
    const errorLog = debugCalls.find((call: unknown[]) =>
      typeof call[0] === "string" && call[0].includes("error scanning session"),
    )
    expect(errorLog).toBeDefined()
  })

  it("handles fetchContextPercent returning null gracefully", async () => {
    const { store, queueContextWarning } = createMockSessionStore({
      ids: ["ses_main_1"],
      states: {
        ses_main_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }

    // Client that returns null context (no messages)
    const client = createMockClient(null)

    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client,
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    await strategy.tick()

    expect(queueContextWarning).not.toHaveBeenCalled()
  })

  it("returns main session entries with [main] label and full title", async () => {
    const longTitle = "Main session title should not be truncated in tick logs"
    const { store } = createMockSessionStore({
      ids: ["ses_main_1"],
      states: {
        ses_main_1: {
          lastUpdated: 1,
          seededFromHistory: false,
          seedCount: 0,
          recentMessages: [],
          loadedSkills: new Set(),
          title: longTitle,
          providerID: "test-provider",
          modelID: "test-model",
          lastTokens: { input: 40_000, output: 100, updatedAt: Date.now() },
        },
      },
    })

    const taskManager = { isTaskSession: vi.fn().mockReturnValue(false) }
    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client: createMockClient(40),
      directory: "/test",
      taskManager: taskManager as unknown as { isTaskSession: (id: string) => boolean },
      logger,
    })

    const result = await strategy.tick()

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions?.[0]).toMatchObject({ kind: "main" })
    expect(result.sessions?.[0].text).toContain(longTitle)
  })

  it("returns strategy with correct name", () => {
    const { store } = createMockSessionStore()
    const strategy = createMainSessionMonitorStrategy({
      sessionStore: store,
      client: createMockClient(),
      directory: "/test",
      logger,
    })

    expect(strategy.name).toBe("main-session-monitor")
    expect(typeof strategy.tick).toBe("function")
  })
})
