/**
 * Idle/Compact Recovery Handler
 *
 * Handles session.idle and session.compacted events.
 * Manages deferred compact recovery and idle task notification.
 */

import type { OpenCodeClient, WopalTask } from "../../types.js"
import type { SessionStore } from "../../session-store.js"
import type { DebugLog } from "../../debug.js"
import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import { formatSessionID } from "../../debug.js"
import { isTaskActive } from "../../tasks/task-phase.js"

export interface IdleCompactHandlerContext {
  client: OpenCodeClient
  sessionStore: SessionStore
  taskManager: SimpleTaskManager | undefined
  contextDebugLog: DebugLog
  taskDebugLog: DebugLog
}

/**
 * Handle session.idle event - deferred compact recovery and task idle notification
 */
export async function handleSessionIdle(
  ctx: IdleCompactHandlerContext,
  sessionID: string,
): Promise<void> {
  if (!sessionID) return

  const state = ctx.sessionStore.get(sessionID)

  // Main session deferred compact: trigger summarize on idle session
  if (!ctx.taskManager?.findBySession(sessionID) && state?.pendingCompactTrigger === "plugin") {
    ctx.sessionStore.upsert(sessionID, (s) => {
      delete s.pendingCompactTrigger
    })

    const providerID = state.providerID ?? ""
    const modelID = state.modelID ?? ""
    if (typeof ctx.client.session?.summarize !== "function") {
      ctx.contextDebugLog(`${formatSessionID(sessionID, false)} summarize unavailable for deferred compact`)
      return
    }

    ctx.sessionStore.markCompacting(sessionID, Date.now(), "plugin")
    ctx.contextDebugLog(`${formatSessionID(sessionID, false)} idle -> starting deferred main-session compact`)

    try {
      await ctx.client.session.summarize({
        path: { id: sessionID },
        body: { providerID, modelID },
      })
    } catch (err) {
      ctx.sessionStore.upsert(sessionID, (s) => {
        s.isCompacting = false
        delete s.compactingSince
        delete s.compactingTrigger
      })
      ctx.contextDebugLog(`${formatSessionID(sessionID, false)} deferred compact failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    return
  }

  // Child session idle: notify parent
  const task = ctx.taskManager?.findBySession(sessionID)
  if (!task) return

  // Mark idle only for actively running tasks
  if (isTaskActive(task)) {
    task.idleNotified = true
    // Release concurrency slot so new tasks can launch
    if (task.concurrencyKey && ctx.taskManager) {
      ctx.taskManager.releaseConcurrencySlot(task)
      task.waitingConcurrencyKey = task.concurrencyKey
      task.concurrencyKey = undefined
    }
    ctx.taskDebugLog(`task ${task.id} idle`)
    if (ctx.taskManager) {
      ctx.taskManager.notifyParent(task.id).catch((err) => {
        ctx.taskDebugLog(`[notifyParent] error for ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  }
}

/**
 * Handle session.compacted event - auto-continue recovery
 */
export async function handleSessionCompacted(
  ctx: IdleCompactHandlerContext,
  sessionID: string,
): Promise<void> {
  if (!sessionID) return

  ctx.sessionStore.markCompacted(sessionID)
  const compactedState = ctx.sessionStore.get(sessionID)
  ctx.contextDebugLog(`${formatSessionID(sessionID, compactedState?.isTask ?? false)} compact completed (event-driven)`)

  // Only handle Plugin-initiated compacts (skip EllaMaka auto-compact or manual /compact)
  const state = compactedState
  if (!state?.compactingTrigger || !state?.needsAutoContinue) return

  const task = ctx.taskManager?.findBySession(sessionID)

  // Clear compactingTrigger immediately to mark as processed
  ctx.sessionStore.upsert(sessionID, (s) => {
    delete s.compactingTrigger
  })

  if (task) {
    // Child session: notify parent Agent via promptAsync
    await sendCompactedNotification(ctx, task, state)
  } else {
    // Main session: send auto-continue recovery message
    await sendAutoContinueForMain(ctx, sessionID, state)
  }

  // Clear needsAutoContinue after recovery/notification
  ctx.sessionStore.upsert(sessionID, (s) => {
    delete s.needsAutoContinue
  })
}

/**
 * Send auto-continue recovery message to main session after compact.
 * Main session IDLE after compact, no one can notify it, so Plugin must send recovery instruction.
 */
async function sendAutoContinueForMain(
  ctx: IdleCompactHandlerContext,
  sessionID: string,
  state: { loadedSkills?: Set<string> },
): Promise<void> {
  const skills = state.loadedSkills ? Array.from(state.loadedSkills).join(", ") : "none"

  const recoveryText = `<system-reminder>
The session context has been compacted. Execute recovery protocol immediately and continue working:
<CRITICAL_RULE>
1. Read key files from the compaction summary (plans, specs, etc. — max 3)
2. Search and load task-relevant memories (max 3)
3. Reload previously loaded skills: ${skills}
4. Briefly report what was recovered, then continue the previous work
</CRITICAL_RULE>
</system-reminder>`

  if (typeof ctx.client.session?.promptAsync === "function") {
    try {
      await ctx.client.session.promptAsync({
        path: { id: sessionID },
        body: {
          noReply: false,
          parts: [{ type: "text", text: recoveryText, synthetic: true }],
        },
      })
      ctx.taskDebugLog(`[autoContinue] sent recovery to main session: ${formatSessionID(sessionID, false)}`)
    } catch (err) {
      ctx.taskDebugLog(`[autoContinue] error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/**
 * Send compacted notification to parent Agent for child session.
 * Parent Agent decides how to recover child session via wopal_task_reply.
 */
async function sendCompactedNotification(
  ctx: IdleCompactHandlerContext,
  task: WopalTask,
  state: { loadedSkills?: Set<string> },
): Promise<void> {
  if (!task.sessionID || !task.parentSessionID) return

  const skills = state.loadedSkills ? Array.from(state.loadedSkills).join(", ") : "none"

  const notification = `<system-reminder>
[WOPAL TASK COMPACTED]
Task ID: ${task.id}
Description: ${task.description}
Skills: ${skills}
The child session has been compacted and is now IDLE.
Use wopal_task_reply to send recovery instructions if the task should continue.
</system-reminder>`

  if (typeof ctx.client.session?.promptAsync === "function") {
    try {
      await ctx.client.session.promptAsync({
        path: { id: task.parentSessionID },
        body: {
          noReply: false,
          parts: [{ type: "text", text: notification, synthetic: true }],
        },
      })
      ctx.taskDebugLog(`[compactedNotify] sent to parent: taskId=${task.id}`)
    } catch (err) {
      ctx.taskDebugLog(`[compactedNotify] error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}