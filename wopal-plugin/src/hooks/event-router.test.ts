import { describe, expect, it, vi } from "vitest"
import { createEventRouter } from "./event-router.js"
import { SessionStore } from "../session-store.js"

function createEventRouterWithTaskManager(taskManager: {
  markTaskCompletedBySession?: ReturnType<typeof vi.fn>
  markTaskErrorBySession: ReturnType<typeof vi.fn>
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
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskErrorBySession: vi.fn(),
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
    // Task is in completed state (not running), so no notification
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

  // Task 3: session.compacted event handling tests
  describe("session.compacted event handling", () => {
    it("sends auto-continue message for main session when needsAutoContinue is true", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      
      const ctx = {
        client: {
          session: {
            messages: vi.fn().mockResolvedValue({ data: [] }),
            promptAsync: mockPromptAsync,
          },
        },
        sessionStore,
        contextDebugLog: () => {},
        taskDebugLog: () => {},
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined), // No task = main session
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskErrorBySession: vi.fn(),
          notifyParent: vi.fn(),
          releaseConcurrencySlot: vi.fn(),
          recoverFromSession: vi.fn().mockResolvedValue(undefined),
        } as never,
      }
      
      // Pre-condition: Plugin-initiated compact (via context_manage tool)
      sessionStore.markCompacting("main-session", Date.now(), "plugin")
      sessionStore.upsert("main-session", (state) => {
        state.loadedSkills = new Set(["space-master"])
      })
      
      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: { type: "session.compacted", properties: { sessionID: "main-session" } },
      })

      // Verify markCompacted was called and then consumed by recovery
      const state = sessionStore.get("main-session")
      expect(state?.compactingTrigger).toBeUndefined() // consumed by event handler

      // Verify promptAsync was called with recovery message
      expect(mockPromptAsync).toHaveBeenCalledWith({
        path: { id: "main-session" },
        body: {
          noReply: false,
          parts: [{
            type: "text",
            text: expect.stringContaining("The session context has been compacted"),
            synthetic: true,
          }],
        },
      })

      // Verify message contains recovery protocol and skill reload instruction
      const callArgs = mockPromptAsync.mock.calls[0][0]
      const messageText = callArgs.body.parts[0].text
      expect(messageText).toContain("Execute recovery protocol immediately")
      expect(messageText).toContain("Reload previously loaded skills: space-master")
      expect(messageText).toContain("<CRITICAL_RULE>")
      expect(messageText).toContain("Search and load task-relevant memories")
    })

    it("sends compacted notification for child session when needsAutoContinue is true", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      
      const mockTask = {
        id: "wopal-task-123",
        sessionID: "child-session",
        description: "Test task",
        parentSessionID: "parent-session",
      }
      
      const ctx = {
        client: {
          session: {
            messages: vi.fn().mockResolvedValue({ data: [] }),
            promptAsync: mockPromptAsync,
          },
        },
        sessionStore,
        contextDebugLog: () => {},
        taskDebugLog: () => {},
        taskManager: {
          findBySession: vi.fn().mockReturnValue(mockTask), // Has task = child session
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskErrorBySession: vi.fn(),
          notifyParent: vi.fn(),
          releaseConcurrencySlot: vi.fn(),
          recoverFromSession: vi.fn().mockResolvedValue(undefined),
        } as never,
      }
      
      // Pre-condition: Plugin-initiated compact (via context_manage tool)
      sessionStore.markCompacting("child-session", Date.now(), "plugin")
      
      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: { type: "session.compacted", properties: { sessionID: "child-session" } },
      })

      // Verify markCompacted was called and then consumed by notification
      const state = sessionStore.get("child-session")
      expect(state?.compactingTrigger).toBeUndefined() // consumed by event handler

      // Verify promptAsync was called to parent session with [WOPAL TASK COMPACTED]
      expect(mockPromptAsync).toHaveBeenCalledWith({
        path: { id: "parent-session" },
        body: {
          noReply: false,
          parts: [{
            type: "text",
            text: expect.stringContaining("[WOPAL TASK COMPACTED]"),
            synthetic: true,
          }],
        },
      })

      // Verify message contains task info and recovery instruction
      const callArgs = mockPromptAsync.mock.calls[0][0]
      const messageText = callArgs.body.parts[0].text
      expect(messageText).toContain("Task ID: wopal-task-123")
      expect(messageText).toContain("Description: Test task")
      expect(messageText).toContain("Use wopal_task_reply to send recovery instructions")
    })

    it("skips recovery when session was not compacting before event (non-Plugin trigger)", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)
      
      const ctx = {
        client: {
          session: {
            messages: vi.fn().mockResolvedValue({ data: [] }),
            promptAsync: mockPromptAsync,
          },
        },
        sessionStore,
        contextDebugLog: () => {},
        taskDebugLog: () => {},
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskErrorBySession: vi.fn(),
          notifyParent: vi.fn(),
          releaseConcurrencySlot: vi.fn(),
          recoverFromSession: vi.fn().mockResolvedValue(undefined),
        } as never,
      }
      
      const hooks = createEventRouter(ctx as never)

      // Simulate compacted event WITHOUT prior compacting state
      // (This happens when EllaMaka auto-compacts or other non-Plugin triggers)
      await hooks.event({
        event: { type: "session.compacted", properties: { sessionID: "main-session" } },
      })

      // markCompacted should still be called (sets needsAutoContinue=true)
      const state = sessionStore.get("main-session")
      expect(state?.needsAutoContinue).toBe(true)
      
      // But there's no compactingSince record, so Plugin should skip recovery
      expect(state?.compactingSince).toBeUndefined()
      expect(mockPromptAsync).not.toHaveBeenCalled()
    })
  })
})
