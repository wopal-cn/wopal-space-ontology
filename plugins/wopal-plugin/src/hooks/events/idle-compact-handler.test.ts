import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  handleSessionCompacted,
  type IdleCompactHandlerContext,
} from "./idle-compact-handler.js"
import { SessionStore } from "../../session-store.js"
import type { LoggerInstance } from "../../logger.js"
import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import type { WopalTask } from "../../types.js"
import {
  loadSessionContext,
  clearSessionContext,
} from "../../memory/session-context.js"
import { join } from "path"
import { existsSync, mkdirSync, rmSync } from "fs"
import { homedir } from "os"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockCompleteJson } = vi.hoisted(() => ({
  mockCompleteJson: vi.fn().mockResolvedValue({ title: "Generated Session Title" }),
}))

vi.mock("../../llm-client.js", () => ({
  getLLMClient: vi.fn().mockReturnValue({
    completeJson: mockCompleteJson,
  }),
}))

import { getLLMClient } from "../../llm-client.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createMockContext(overrides?: {
  sessionStore?: SessionStore
  taskManager?: Partial<SimpleTaskManager>
  promptAsync?: ReturnType<typeof vi.fn>
  updateSessionTitle?: ReturnType<typeof vi.fn>
}): {
  ctx: IdleCompactHandlerContext
  sessionStore: SessionStore
  promptAsync: ReturnType<typeof vi.fn>
  updateSessionTitle: ReturnType<typeof vi.fn>
} {
  const sessionStore = overrides?.sessionStore ?? new SessionStore({ max: 100 })
  const promptAsync = overrides?.promptAsync ?? vi.fn().mockResolvedValue(undefined)
  const updateSessionTitle = overrides?.updateSessionTitle ?? vi.fn().mockResolvedValue(undefined)

  const ctx: IdleCompactHandlerContext = {
    client: {
      session: {
        promptAsync,
        update: updateSessionTitle,
      },
    } as unknown as IdleCompactHandlerContext["client"],
    sessionStore,
    taskManager: overrides?.taskManager as SimpleTaskManager | undefined,
    contextLogger: createMockLogger(),
    taskLogger: createMockLogger(),
  }

  return { ctx, sessionStore, promptAsync, updateSessionTitle }
}

// ---------------------------------------------------------------------------
// Recovery message tests
// ---------------------------------------------------------------------------

describe("handleSessionCompacted — recovery message", () => {
  const testSessionID = "test-recovery-session-id"

  it("sends recovery message without compaction summary injection", async () => {
    const compactionText = "## Goal\nRefactor compaction handler\n## Instructions\nSome details"
    const { ctx, sessionStore, promptAsync } = createMockContext()

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    // Recovery message sent
    expect(promptAsync).toHaveBeenCalled()
    const callArgs = promptAsync.mock.calls[0][0]
    // Must NOT contain compaction summary
    expect(callArgs.body.parts[0].text).not.toContain("## Compaction Summary")
    expect(callArgs.body.parts[0].text).not.toContain("Refactor compaction handler")
    // Must contain recovery protocol
    expect(callArgs.body.parts[0].text).toContain("CRITICAL_RULE")
  })

  it("sends recovery message without compaction summary when no cache", async () => {
    const { ctx, sessionStore, promptAsync } = createMockContext()

    // No setCompactionSummary — simulates missing ended event
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    expect(promptAsync).toHaveBeenCalled()
    const callArgs = promptAsync.mock.calls[0][0]
    expect(callArgs.body.parts[0].text).not.toContain("## Compaction Summary")
  })

  it("child session notification without compaction summary injection", async () => {
    const compactionText = "## Goal\nChild task work"
    const task: WopalTask = {
      id: "task-1",
      sessionID: "child-session-id",
      parentSessionID: "parent-session-id",
      status: "running",
      description: "Test task",
      agent: "test-agent",
      prompt: "test",
      createdAt: new Date(),
    }
    const taskManager = {
      isTaskSession: vi.fn().mockReturnValue(true),
      findBySession: vi.fn().mockReturnValue(task),
    } as unknown as Partial<SimpleTaskManager>

    const { ctx, sessionStore, promptAsync } = createMockContext({ taskManager })

    sessionStore.setCompactionSummary("child-session-id", compactionText)
    sessionStore.upsert("child-session-id", (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, "child-session-id")

    expect(promptAsync).toHaveBeenCalled()
    const callArgs = promptAsync.mock.calls[0][0]
    expect(callArgs.path.id).toBe("parent-session-id")
    expect(callArgs.body.parts[0].text).toContain("[WOPAL TASK COMPACTED]")
    // Must NOT contain compaction summary text
    expect(callArgs.body.parts[0].text).not.toContain("Compaction Summary:")
    expect(callArgs.body.parts[0].text).not.toContain("Child task work")
  })
})

// ---------------------------------------------------------------------------
// Background title generation tests
// ---------------------------------------------------------------------------

describe("handleSessionCompacted — background title generation", () => {
  const testSessionID = "test-bg-title-session-id"

  beforeEach(() => {
    vi.clearAllMocks()
    mockCompleteJson.mockResolvedValue({ title: "Generated Session Title" })
  })

  afterEach(() => {
    clearSessionContext(testSessionID)
  })

  it("fires background title generation after compaction", async () => {
    const compactionText = "## Goal\nRefactor compaction handler\n## Instructions\nSome details"
    const { ctx, sessionStore, promptAsync, updateSessionTitle } = createMockContext()

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    // Recovery message sent immediately
    expect(promptAsync).toHaveBeenCalled()

    // Wait for background title generation to complete
    await vi.waitFor(() => {
      expect(getLLMClient).toHaveBeenCalled()
    })

    // Verify LLM was called with compaction summary in prompt
    expect(mockCompleteJson).toHaveBeenCalledWith(
      expect.stringContaining(compactionText),
    )

    // Verify session title was updated
    await vi.waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalledWith({
        path: { id: testSessionID },
        body: { title: "Generated Session Title" },
      })
    })
  })

  it("warns and degrades when title generation fails", async () => {
    const compactionText = "## Goal\nFallback test"
    const { ctx, sessionStore, promptAsync, updateSessionTitle } = createMockContext()

    mockCompleteJson.mockRejectedValueOnce(new Error("network unavailable"))

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    // Recovery message still sent
    expect(promptAsync).toHaveBeenCalled()

    // Session title NOT updated (LLM failed)
    expect(updateSessionTitle).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(ctx.contextLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: expect.any(String), err: expect.any(Error) }),
        "Session title generation failed",
      )
    })
  })

  it("recovery message NOT blocked by slow title generation", async () => {
    const compactionText = "## Goal\nSlow LLM test"
    const { ctx, sessionStore, promptAsync, updateSessionTitle } = createMockContext()

    // Make LLM slow (but still resolve)
    let resolveComplete: (value: { title: string }) => void
    mockCompleteJson.mockReturnValueOnce(new Promise((r) => { resolveComplete = r }))

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    // Recovery message was sent BEFORE title generation completed
    expect(promptAsync).toHaveBeenCalled()
    // Session title update NOT called yet (LLM still pending)
    expect(updateSessionTitle).not.toHaveBeenCalled()

    // Now resolve the LLM call
    resolveComplete!({ title: "Slow Title" })
    await vi.waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalled()
    })
  })

  it("skips placeholder title results without updating session state", async () => {
    const compactionText = "## Goal\nTitle placeholder test"
    const { ctx, sessionStore, promptAsync, updateSessionTitle } = createMockContext()
    mockCompleteJson.mockResolvedValueOnce({ title: "**Thread Title:**" })

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    expect(promptAsync).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(ctx.contextLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "placeholder_title" }),
        "Session title generation skipped",
      )
    })
    expect(updateSessionTitle).not.toHaveBeenCalled()
  })

  it("skips log line title results without updating session state", async () => {
    const compactionText = "## Goal\nLog line title test"
    const { ctx, sessionStore, updateSessionTitle } = createMockContext()
    mockCompleteJson.mockResolvedValueOnce({ title: "2026-05-27 13:45:06 [INFO] [core] LLM client ready" })

    sessionStore.setCompactionSummary(testSessionID, compactionText)
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    await vi.waitFor(() => {
      expect(ctx.contextLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "log_line" }),
        "Session title generation skipped",
      )
    })
    expect(updateSessionTitle).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Negative timing tests
// ---------------------------------------------------------------------------

describe("handleSessionCompacted — negative timing", () => {
  const testSessionID = "test-negative-timing-session-id"

  beforeEach(() => {
    clearSessionContext(testSessionID)
  })

  afterEach(() => {
    clearSessionContext(testSessionID)
  })

  it("handles compacted before ended: skips title, recovery sent without summary", async () => {
    const compactionText = "## Goal\nLate arriving summary"
    const { ctx, sessionStore, promptAsync } = createMockContext()

    // Step 1: handleSessionCompacted WITHOUT prior setCompactionSummary
    sessionStore.upsert(testSessionID, (s) => {
      s.compactingTrigger = "plugin"
      s.needsAutoContinue = true
    })

    await handleSessionCompacted(ctx, testSessionID)

    // Recovery message sent without compaction summary
    expect(promptAsync).toHaveBeenCalled()
    const callArgs = promptAsync.mock.calls[0][0]
    expect(callArgs.body.parts[0].text).not.toContain("## Compaction Summary")

    // Step 2: Late-arriving ended event writes to cache
    sessionStore.setCompactionSummary(testSessionID, compactionText)

    // Cache exists, pending next consumption
    const state = sessionStore.get(testSessionID)
    expect(state?.compactionSummaryText).toBe(compactionText)
  })
})
