import { describe, expect, it, vi } from "vitest"
import { createEventRouter } from "./event-router.js"
import { SessionStore } from "../session-store.js"

function createEventRouterWithTaskManager(taskManager: {
  markTaskCompletedBySession?: ReturnType<typeof vi.fn>
  markTaskErrorBySession: ReturnType<typeof vi.fn>
  markTaskWaitingBySession?: ReturnType<typeof vi.fn>
  notifyParent: ReturnType<typeof vi.fn>
  findBySession?: ReturnType<typeof vi.fn>
  getClient?: ReturnType<typeof vi.fn>
  releaseConcurrencySlot?: ReturnType<typeof vi.fn>
  recoverFromSession?: ReturnType<typeof vi.fn>
}) {
  const fullTaskManager = {
    findBySession: vi.fn().mockReturnValue(undefined),
    getClient: vi.fn().mockReturnValue({
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
    }),
    markTaskWaitingBySession: vi.fn(),
    markTaskCompletedBySession: vi.fn(),
    releaseConcurrencySlot: vi.fn(),
    recoverFromSession: vi.fn().mockResolvedValue(undefined),
    ...taskManager,
  }
  const sessionStore = new SessionStore({ max: 10 });
  const ctx = {
    client: {
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync: vi.fn().mockResolvedValue(undefined),
      },
    },
    sessionStore,
    debugLog: () => {},
    taskDebugLog: () => {},
    taskManager: fullTaskManager as never,
  };
  const hooks = createEventRouter(ctx as never);
  return { hooks, ctx, taskManager: fullTaskManager };
}

describe("OpenCodeRulesRuntime event handling", () => {
  it("marks running task idle on session.idle and notifies parent", async () => {
    const mockTask = { id: "task-1", sessionID: "child-1", status: "running" }
    // Mock messages with an assistant message that has finish: "stop" and no question
    const mockMessages = [
      {
        info: { role: "assistant", finish: "stop" },
        parts: [{ type: "text", text: "Task completed successfully." }],
      },
    ]

    const sessionStore = new SessionStore({ max: 10 });
    const ctx = {
      client: {
        session: {
          messages: vi.fn().mockResolvedValue({ data: mockMessages }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      debugLog: () => {},
      taskDebugLog: () => {},
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskErrorBySession: vi.fn(),
        markTaskWaitingBySession: vi.fn(),
        notifyParent: vi.fn().mockResolvedValue(undefined),
        releaseConcurrencySlot: vi.fn(),
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    };
    const hooks = createEventRouter(ctx as never);

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(ctx.taskManager.findBySession).toHaveBeenCalledWith("child-1")
    // Phase 3: idle sets idleNotified flag instead of markTaskCompletedBySession
    expect(mockTask.idleNotified).toBe(true)
    expect(ctx.taskManager.markTaskCompletedBySession).not.toHaveBeenCalled()
    expect(ctx.taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("filters MessageAbortedError and does not mark task as error", async () => {
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      markTaskErrorBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: {
        type: "session.error",
        properties: {
          sessionID: "child-1",
          error: { name: "MessageAbortedError", message: "Aborted by user" },
        },
      },
    })

    // MessageAbortedError should be filtered, no error marking
    expect(taskManager.markTaskErrorBySession).not.toHaveBeenCalled()
    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("marks running task errored on session.error and notifies parent", async () => {
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      markTaskErrorBySession: vi.fn().mockReturnValue({ id: "task-1" }),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: {
        type: "session.error",
        properties: { sessionID: "child-1", error: { code: "boom" } },
      },
    })

    expect(taskManager.markTaskErrorBySession).toHaveBeenCalledWith(
      "child-1",
      JSON.stringify({ code: "boom" }),
    )
    expect(taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("does not process idle event for non-wopal_task session", async () => {
    // findBySession returns undefined means this is not a wopal_task child session
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      findBySession: vi.fn().mockReturnValue(undefined),
      markTaskErrorBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "main-session" } },
    })

    expect(taskManager.findBySession).toHaveBeenCalledWith("main-session")
    expect(taskManager.markTaskCompletedBySession).not.toHaveBeenCalled()
    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("does not notify when idle event arrives after task already finalized", async () => {
    // Task is in completed state (not running), so markTaskCompletedBySession returns undefined
    const completedTask = { id: "task-1", sessionID: "child-1", status: "completed" }
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      findBySession: vi.fn().mockReturnValue(completedTask),
      markTaskErrorBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("does not notify when error event arrives after task already finalized", async () => {
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      markTaskErrorBySession: vi.fn().mockReturnValue(undefined),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: {
        type: "session.error",
        properties: { sessionID: "child-1", error: "boom" },
      },
    })

    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })
})
