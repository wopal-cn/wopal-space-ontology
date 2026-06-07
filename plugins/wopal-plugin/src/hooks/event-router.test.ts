import { describe, expect, it, vi } from "vitest"
import { createEventRouter } from "./event-router.js"
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

const mockLoggers = {
  coreLogger: createMockLogger(),
  rulesLogger: createMockLogger(),
  taskLogger: createMockLogger(),
  memoryLogger: createMockLogger(),
  contextLogger: createMockLogger(),
}

function createEventRouterWithTaskManager(taskManager: {
  markTaskCompletedBySession?: ReturnType<typeof vi.fn>
  markTaskIdleBySession: ReturnType<typeof vi.fn>
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
    coreLogger: createMockLogger(),
    rulesLogger: createMockLogger(),
    taskLogger: createMockLogger(),
    memoryLogger: createMockLogger(),
    contextLogger: createMockLogger(),
    taskManager: fullTaskManager as never,
  };
  const hooks = createEventRouter(ctx as never);
  return { hooks, ctx, taskManager: fullTaskManager };
}

describe("OpenCodeRulesRuntime event handling", () => {
  it("marks running task idle on session.idle when new assistant text exists, and notifies parent", async () => {
    const mockTask = { id: "task-1", sessionID: "child-1", status: "running" }

    const sessionStore = new SessionStore({ max: 10 });
    const ctx = {
      client: {
        session: {
          messages: vi.fn().mockResolvedValue({ data: [
            { info: { role: "assistant" }, parts: [{ type: "text", text: "Task output" }] },
          ] }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
    contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
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
    expect(mockTask.status).toBe("idle")
    expect(ctx.taskManager.markTaskCompletedBySession).not.toHaveBeenCalled()
    expect(ctx.taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("preserves waitingConcurrencyKey before releasing slot on session.idle", async () => {
    const mockTask: { id: string; sessionID: string; status: string; concurrencyKey?: string; waitingConcurrencyKey?: string } = {
      id: "task-1",
      sessionID: "child-1",
      status: "running",
      concurrencyKey: "default",
    }
    const releaseConcurrencySlot = vi.fn((task: typeof mockTask) => {
      task.concurrencyKey = undefined
    })

    const sessionStore = new SessionStore({ max: 10 })
    const ctx = {
      client: {
        session: {
          messages: vi.fn().mockResolvedValue({ data: [
            { info: { role: "assistant" }, parts: [{ type: "text", text: "Task output" }] },
          ] }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
        notifyParent: vi.fn().mockResolvedValue(undefined),
        releaseConcurrencySlot,
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    }
    const hooks = createEventRouter(ctx as never)

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(releaseConcurrencySlot).toHaveBeenCalledWith(mockTask)
    expect(mockTask.waitingConcurrencyKey).toBe("default")
    expect(mockTask.concurrencyKey).toBeUndefined()
  })

  it("marks running task error on session.idle when no assistant activity evidence exists, and notifies parent", async () => {
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
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
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
    expect(mockTask.status).toBe("error")
    expect(ctx.taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("marks running task stuck on session.idle when assistant tool activity exists but no text", async () => {
    const mockTask = { id: "task-1", sessionID: "child-1", status: "running" }

    const sessionStore = new SessionStore({ max: 10 });
    const ctx = {
      client: {
        session: {
          messages: vi.fn().mockResolvedValue({ data: [
            { info: { role: "assistant" }, parts: [{ type: "tool", tool: "bash" }] },
          ] }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
        notifyParent: vi.fn().mockResolvedValue(undefined),
        releaseConcurrencySlot: vi.fn(),
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    };
    const hooks = createEventRouter(ctx as never);

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(mockTask.status).toBe("stuck")
    expect(ctx.taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("suppresses one controlled stop idle notification for a running task", async () => {
    const mockTask = {
      id: "task-1",
      sessionID: "child-1",
      status: "running",
      stopNotificationSuppressions: [{ id: 1, reason: "abort", requestedAt: Date.now() }],
    }
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const mockNotifyParent = vi.fn().mockResolvedValue(undefined)

    const sessionStore = new SessionStore({ max: 10 })
    const ctx = {
      client: {
        session: {
          messages: mockMessages,
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
        notifyParent: mockNotifyParent,
        releaseConcurrencySlot: vi.fn(),
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    }
    const hooks = createEventRouter(ctx as never)

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(mockTask.status).toBe("running")
    expect(mockTask.stopNotificationSuppressions).toBeUndefined()
    expect(mockMessages).not.toHaveBeenCalled()
    expect(mockNotifyParent).not.toHaveBeenCalled()
  })

  it("consumes controlled stop suppression even when task is already idle", async () => {
    const mockTask = {
      id: "task-1",
      sessionID: "child-1",
      status: "idle",
      stopNotificationSuppressions: [{ id: 1, reason: "interrupt", requestedAt: Date.now() }],
    }
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      findBySession: vi.fn().mockReturnValue(mockTask),
      markTaskIdleBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(mockTask.stopNotificationSuppressions).toBeUndefined()
    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("does not leak controlled stop suppression between task sessions", async () => {
    const suppressedTask = {
      id: "task-1",
      sessionID: "child-1",
      status: "running",
      stopNotificationSuppressions: [{ id: 1, reason: "abort", requestedAt: Date.now() }],
    }
    const normalTask = { id: "task-2", sessionID: "child-2", status: "running" }
    const mockNotifyParent = vi.fn().mockResolvedValue(undefined)

    const sessionStore = new SessionStore({ max: 10 })
    const ctx = {
      client: {
        session: {
          messages: vi.fn().mockResolvedValue({ data: [
            { info: { role: "assistant" }, parts: [{ type: "text", text: "done" }] },
          ] }),
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn((sessionID: string) => sessionID === "child-1" ? suppressedTask : normalTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
        notifyParent: mockNotifyParent,
        releaseConcurrencySlot: vi.fn(),
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    }
    const hooks = createEventRouter(ctx as never)

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-2" } },
    })

    expect(normalTask.status).toBe("idle")
    expect(mockNotifyParent).toHaveBeenCalledWith("task-2")
    expect(suppressedTask.stopNotificationSuppressions).toHaveLength(1)
  })

  it("filters MessageAbortedError and does not mark task as error", async () => {
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      markTaskIdleBySession: vi.fn(),
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
    expect(taskManager.markTaskIdleBySession).not.toHaveBeenCalled()
    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("classifies running task on session.error via stop classifier and notifies parent", async () => {
    const mockTask = { id: "task-1", sessionID: "child-1", status: "running", concurrencyKey: "default" }
    const mockMessages = vi.fn().mockResolvedValue({ data: [] })
    const mockNotifyParent = vi.fn().mockResolvedValue(undefined)
    const mockReleaseSlot = vi.fn()

    const sessionStore = new SessionStore({ max: 10 })
    const ctx = {
      client: {
        session: {
          messages: mockMessages,
          promptAsync: vi.fn().mockResolvedValue(undefined),
        },
      },
      sessionStore,
      taskLogger: createMockLogger(),
      coreLogger: createMockLogger(),
      contextLogger: createMockLogger(),
      taskManager: {
        findBySession: vi.fn().mockReturnValue(mockTask),
        markTaskCompletedBySession: vi.fn(),
        markTaskIdleBySession: vi.fn(),
        notifyParent: mockNotifyParent,
        releaseConcurrencySlot: mockReleaseSlot,
        recoverFromSession: vi.fn().mockResolvedValue(undefined),
      } as never,
    }
    const hooks = createEventRouter(ctx as never)

    await hooks.event({
      event: {
        type: "session.error",
        properties: { sessionID: "child-1", error: { code: "boom" } },
      },
    })

    // Classifier called with empty messages and no activity evidence → error
    expect(mockTask.status).toBe("error")
    expect(mockReleaseSlot).toHaveBeenCalled()
    expect(mockNotifyParent).toHaveBeenCalledWith("task-1")
  })

  it("does not process idle event for non-wopal_task session", async () => {
    // findBySession returns undefined means this is not a wopal_task child session
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      findBySession: vi.fn().mockReturnValue(undefined),
      markTaskIdleBySession: vi.fn(),
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
      markTaskIdleBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    })

    await hooks.event({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("does not notify when error event arrives after task already finalized", async () => {
    const { hooks, taskManager } = createEventRouterWithTaskManager({
      markTaskIdleBySession: vi.fn().mockReturnValue(undefined),
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
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined), // No task = main session
          isTaskSession: vi.fn().mockReturnValue(false),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskIdleBySession: vi.fn(),
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
      expect(messageText).toContain("Check current session state")
      expect(messageText).toContain("Check related project git status")
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
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(mockTask), // Has task = child session
          isTaskSession: vi.fn().mockReturnValue(true),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskIdleBySession: vi.fn(),
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
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
          isTaskSession: vi.fn().mockReturnValue(false),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskIdleBySession: vi.fn(),
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

    it("sets recoverySent before sending recovery (prevents duplicate injection)", async () => {
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
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
          isTaskSession: vi.fn().mockReturnValue(false),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskIdleBySession: vi.fn(),
          notifyParent: vi.fn(),
          releaseConcurrencySlot: vi.fn(),
          recoverFromSession: vi.fn().mockResolvedValue(undefined),
        } as never,
      }
      
      // Pre-condition: Plugin-initiated compact
      sessionStore.markCompacting("main-session", Date.now(), "plugin")
      sessionStore.upsert("main-session", (state) => {
        state.loadedSkills = new Set(["space-master"])
      })
      
      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: { type: "session.compacted", properties: { sessionID: "main-session" } },
      })

      // Verify recoverySent was set during recovery
      const stateAfter = sessionStore.get("main-session")
      expect(stateAfter?.recoverySent).toBe(true)
    })
  })

  // Compaction summary event routing chain
  describe("session.next.compaction.ended → session.compacted chain", () => {
    it("caches summary on compaction.ended then consumes on session.compacted with full wiring", async () => {
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
        taskLogger: createMockLogger(),
        coreLogger: createMockLogger(),
        contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
          isTaskSession: vi.fn().mockReturnValue(false),
          getClient: vi.fn().mockReturnValue({
            session: {
              messages: vi.fn().mockResolvedValue({ data: [] }),
            },
          }),
          markTaskCompletedBySession: vi.fn(),
          markTaskIdleBySession: vi.fn(),
          notifyParent: vi.fn(),
          releaseConcurrencySlot: vi.fn(),
          recoverFromSession: vi.fn().mockResolvedValue(undefined),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      // Pre-condition: Plugin-initiated compact
      sessionStore.markCompacting("chain-session", Date.now(), "plugin")
      sessionStore.upsert("chain-session", (s) => {
        s.loadedSkills = new Set(["test-skill"])
      })

      // Step 1: Fire session.next.compaction.ended → router caches summary
      await hooks.event({
        event: {
          type: "session.next.compaction.ended",
          properties: {
            sessionID: "chain-session",
            text: "## Goal\nTest chain routing\n## Instructions\nDetails",
          },
        },
      })

      // Assert: compaction summary cached in sessionStore
      const stateAfterEnded = sessionStore.get("chain-session")
      expect(stateAfterEnded?.compactionSummaryText).toBe("## Goal\nTest chain routing\n## Instructions\nDetails")

      // Step 2: Fire session.compacted → handler consumes summary + sends recovery
      await hooks.event({
        event: { type: "session.compacted", properties: { sessionID: "chain-session" } },
      })

      // Assert: summary consumed (cache cleared)
      const stateAfterCompacted = sessionStore.get("chain-session")
      expect(stateAfterCompacted?.compactionSummaryText).toBeUndefined()

      // Assert: recovery message sent (without compaction summary injection)
      expect(mockPromptAsync).toHaveBeenCalled()
      const callArgs = mockPromptAsync.mock.calls[0][0]
      expect(callArgs.body.parts[0].text).not.toContain("## Compaction Summary")
      expect(callArgs.body.parts[0].text).toContain("CRITICAL_RULE")
    })
  })

  // Task 4: message/token tracking tests
  describe("message.token tracking", () => {
    it("stores agent info on message.updated event", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const ctx = {
        client: { session: { messages: vi.fn().mockResolvedValue({ data: [] }) } },
        sessionStore,
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "message.updated",
          properties: {
            sessionID: "session-1",
            info: { agent: "fae" },
          },
        },
      })

      const state = sessionStore.get("session-1")
      expect(state?.agent).toBe("fae")
    })

    it("stores token usage on step-finish part", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const mockConfig = vi.fn().mockResolvedValue({
        data: {
          providers: [{
            id: "anthropic",
            models: {
              "claude-3": { limit: { context: 100000 } }
            }
          }]
        }
      })

      const ctx = {
        client: {
          session: {
            messages: vi.fn().mockResolvedValue({
              data: [{
                info: {
                  role: "assistant",
                  providerID: "anthropic",
                  modelID: "claude-3",
                }
              }]
            }),
          },
          config: { providers: mockConfig },
        },
        sessionStore,
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined),
          isTaskSession: vi.fn().mockReturnValue(false),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "message.part.updated",
          properties: {
            sessionID: "session-1",
            part: {
              type: "step-finish",
              tokens: {
                input: 5000,
                output: 2000,
                cache: { read: 1000, write: 500 },
              },
            },
          },
        },
      })

      const state = sessionStore.get("session-1")
      expect(state?.lastTokens).toMatchObject({
        input: 5000,
        output: 2000,
        cache: { read: 1000, write: 500 },
      })
      expect(state?.providerID).toBe("anthropic")
      expect(state?.modelID).toBe("claude-3")
      expect(state?.contextLimit).toBe(100000)
    })

    it("skips token storage for non-step-finish parts", async () => {
      const sessionStore = new SessionStore({ max: 10 })
      const ctx = {
        client: { session: { messages: vi.fn() } },
        sessionStore,
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: { findBySession: vi.fn() } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "message.part.updated",
          properties: {
            sessionID: "session-1",
            part: { type: "text", tokens: { input: 100 } },
          },
        },
      })

      const state = sessionStore.get("session-1")
      expect(state?.lastTokens).toBeUndefined()
    })
  })

  // Task 4: permission/question relay tests
  describe("permission.asked relay", () => {
    it("relays permission request for child session", async () => {
      const mockTask = { id: "task-1", sessionID: "child-1", parentSessionID: "parent-1" }
      const mockPermissionReply = vi.fn().mockResolvedValue(undefined)

      const ctx = {
        client: {
          permission: { reply: mockPermissionReply },
        },
        sessionStore: new SessionStore({ max: 10 }),
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(mockTask),
          isTaskSession: vi.fn().mockReturnValue(true),
          getClient: vi.fn().mockReturnValue({
            permission: { reply: mockPermissionReply },
          }),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "permission.asked",
          properties: {
            sessionID: "child-1",
            id: "perm-123",
            permission: "bash",
            patterns: ["npm install"],
          },
        },
      })

      expect(mockPermissionReply).toHaveBeenCalledWith({
        requestID: "perm-123",
        reply: "once",
      })
    })

    it("skips permission relay for main session", async () => {
      const mockPermissionReply = vi.fn()
      const ctx = {
        client: { permission: { reply: mockPermissionReply } },
        sessionStore: new SessionStore({ max: 10 }),
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined), // No task = main session
          isTaskSession: vi.fn().mockReturnValue(false),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "permission.asked",
          properties: {
            sessionID: "main-session",
            id: "perm-123",
            permission: "bash",
          },
        },
      })

      expect(mockPermissionReply).not.toHaveBeenCalled()
    })
  })

  describe("question.asked relay", () => {
    it("relays question request for child session and sets waiting status", async () => {
      const mockTask = {
        id: "task-1",
        sessionID: "child-1",
        status: "running",
        parentSessionID: "parent-1",
        description: "Test task",
      }
      const mockPromptAsync = vi.fn().mockResolvedValue(undefined)

      const ctx = {
        client: { session: { promptAsync: mockPromptAsync } },
        sessionStore: new SessionStore({ max: 10 }),
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(mockTask),
          getClient: vi.fn().mockReturnValue({ session: { promptAsync: mockPromptAsync } }),
          getTask: vi.fn().mockReturnValue(mockTask),
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "question.asked",
          properties: {
            sessionID: "child-1",
            id: "q-123",
            questions: [{
              header: "Choice",
              question: "Which option?",
              options: [
                { label: "Option A", description: "First choice" },
                { label: "Option B", description: "Second choice" },
              ],
            }],
          },
        },
      })

      // Should set task to waiting status
      expect(mockTask.status).toBe("waiting")
      expect(mockTask.pendingQuestionID).toBe("q-123")

      // Should notify parent session
      expect(mockPromptAsync).toHaveBeenCalledWith({
        path: { id: "parent-1" },
        body: {
          noReply: true,
          parts: [{
            type: "text",
            text: expect.stringContaining("[WOPAL TASK QUESTION]"),
            synthetic: true,
          }],
        },
      })

      const callArgs = mockPromptAsync.mock.calls[0][0]
      const messageText = callArgs.body.parts[0].text
      expect(messageText).toContain("**Task ID:** `task-1`")
      expect(messageText).toContain("Which option?")
      expect(messageText).toContain("Option A — First choice")
    })

    it("skips question relay for main session", async () => {
      const mockPromptAsync = vi.fn()
      const ctx = {
        client: { session: { promptAsync: mockPromptAsync } },
        sessionStore: new SessionStore({ max: 10 }),
        taskLogger: createMockLogger(),
    contextLogger: createMockLogger(),
        taskManager: {
          findBySession: vi.fn().mockReturnValue(undefined), // No task = main session
        } as never,
      }

      const hooks = createEventRouter(ctx as never)

      await hooks.event({
        event: {
          type: "question.asked",
          properties: {
            sessionID: "main-session",
            id: "q-123",
            questions: [{ question: "Test?" }],
          },
        },
      })

      expect(mockPromptAsync).not.toHaveBeenCalled()
    })
  })
})
