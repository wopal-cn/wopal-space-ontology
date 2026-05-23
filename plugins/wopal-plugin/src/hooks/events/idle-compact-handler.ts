/**
 * Idle/Compact Recovery Handler
 *
 * Handles session.idle and session.compacted events.
 * Manages deferred compact recovery and idle task notification.
 */

import type { OpenCodeClient, WopalTask } from "../../types.js"
import type { SessionStore } from "../../session-store.js"
import type { LoggerInstance } from "../../logger.js"
import type { SimpleTaskManager } from "../../tasks/simple-task-manager.js"
import { formatSessionID } from "../../logger.js"
import { classifyTaskStop } from "../../tasks/task-stop-classifier.js"
import { consumeStopNotificationSuppression } from "../../tasks/task-stop-suppression.js"

export interface IdleCompactHandlerContext {
  client: OpenCodeClient
  sessionStore: SessionStore
  taskManager: SimpleTaskManager | undefined
  contextLogger: LoggerInstance
  taskLogger: LoggerInstance
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
      ctx.contextLogger.debug(`${formatSessionID(sessionID, false)} summarize unavailable for deferred compact`)
      return
    }

    ctx.sessionStore.markCompacting(sessionID, Date.now(), "plugin")
    ctx.contextLogger.debug(`${formatSessionID(sessionID, false)} idle -> starting deferred compact`)

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
      ctx.contextLogger.debug({ session_id: formatSessionID(sessionID, false), err }, "Deferred compact failed")
    }
    return
  }

  // Child session idle: classify stop and notify parent
  const task = ctx.taskManager?.findBySession(sessionID)
  if (!task) return

  // Controlled-stop tools pre-set status to idle before session.abort emits session.idle.
  // Consume suppression before status gating so that exact controlled-stop event is swallowed once.
  const suppression = consumeStopNotificationSuppression(task)
  if (suppression) {
    ctx.taskLogger.trace({ task_id: formatSessionID(task.sessionID, true), reason: suppression.reason }, "Suppressed controlled stop notification")
    return
  }

  // Only classify running or waiting tasks
  if (task.status === "running" || task.status === "waiting") {
    const result = await classifyTaskStop({
      task,
      client: ctx.client,
      debugLog: ctx.taskLogger,
    })

    if (!result.statusChanged) return

    // Release concurrency slot so new tasks can launch
    if (task.concurrencyKey && ctx.taskManager) {
      task.waitingConcurrencyKey = task.concurrencyKey
      ctx.taskManager.releaseConcurrencySlot(task)
    }

    ctx.taskLogger.trace({ task_id: formatSessionID(task.sessionID, true), status: task.status }, "Task stop classified")
    if (ctx.taskManager) {
      ctx.taskManager.notifyParent(task.id).catch((err) => {
        ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err }, "[notifyParent] Failed")
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
  const isTask = !!ctx.taskManager?.isTaskSession(sessionID)
  ctx.contextLogger.info({ session_id: formatSessionID(sessionID, isTask) }, "Compact completed")

  // Only handle Plugin-initiated compacts (skip EllaMaka auto-compact or manual /compact)
  const state = compactedState
  if (!state?.compactingTrigger || !state?.needsAutoContinue) return

  const task = ctx.taskManager?.findBySession(sessionID)

  // Plugin-triggered: set recoverySent BEFORE sending (prevents messages.transform duplicate)
  ctx.sessionStore.upsert(sessionID, (s) => {
    s.recoverySent = true
  })

  let sendSuccess = false
  if (task) {
    // Child session: notify parent Agent via promptAsync
    sendSuccess = await sendCompactedNotification(ctx, task, state)
  } else {
    // Main session: send auto-continue recovery message
    sendSuccess = await sendAutoContinueForMain(ctx, sessionID, state)
  }

  // If send failed, rollback recoverySent and enable fallback injection
  if (!sendSuccess) {
    ctx.sessionStore.upsert(sessionID, (s) => {
      delete s.recoverySent
      delete s.compactingTrigger // Clear Plugin trigger state to avoid misclassification
      delete s.needsAutoContinue
      s.needsRecoveryInjection = true // Fallback: messages.transform will inject
    })
    ctx.contextLogger.debug({ session_id: formatSessionID(sessionID, !!task) }, "promptAsync failed; falling back to messages.transform injection")
    return // Do not continue - needsRecoveryInjection will trigger recovery
  }

  // Clear compactingTrigger AFTER recovery sent (messages.transform can check recoverySent)
  ctx.sessionStore.upsert(sessionID, (s) => {
    delete s.compactingTrigger
  })

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
): Promise<boolean> {
  const skills = state.loadedSkills?.size ? Array.from(state.loadedSkills).join(", ") : null
  const skillLine = skills ? `\n- Reload previously loaded skills: ${skills}` : ""

  const recoveryText = `<system-reminder>
The session context has been compacted. Execute recovery protocol immediately and continue working:
<CRITICAL_RULE>
- Read key files from the compaction summary (plans, specs, etc. — max 3)
- Search and load task-relevant memories (max 3)${skillLine}
- Check current session state (active tasks, pending work)
- Check related project git status (current branch, uncommitted changes)
- Respond in the user's preferred language (check USER.md if unsure)
- Briefly report what was recovered, then continue the previous work
</CRITICAL_RULE>
</system-reminder>`

  if (typeof ctx.client.session?.promptAsync !== "function") {
    ctx.taskLogger.debug({ session_id: formatSessionID(sessionID, false) }, "[autoContinue] promptAsync unavailable for main session")
    return false
  }

  try {
    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        noReply: false,
        parts: [{ type: "text", text: recoveryText }],
      },
    })
    ctx.taskLogger.debug({ session_id: formatSessionID(sessionID, false) }, "[autoContinue] Sent recovery to main session")
    return true
  } catch (err) {
    ctx.taskLogger.debug({ session_id: formatSessionID(sessionID, false), err }, "[autoContinue] Failed")
    return false
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
): Promise<boolean> {
  if (!task.sessionID || !task.parentSessionID) return false

  const skills = state.loadedSkills ? Array.from(state.loadedSkills).join(", ") : "none"

  const notification = `<system-reminder>
[WOPAL TASK COMPACTED]
Task ID: ${task.id}
Description: ${task.description}
Skills: ${skills}
The child session has been compacted and is now IDLE.
Use wopal_task_reply to send recovery instructions if the task should continue.
</system-reminder>`

  if (typeof ctx.client.session?.promptAsync !== "function") {
    ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "[compactedNotify] promptAsync unavailable")
    return false
  }

  try {
    await ctx.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: false,
        parts: [{ type: "text", text: notification }],
      },
    })
    ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true) }, "[compactedNotify] Sent to parent")
    return true
  } catch (err) {
    ctx.taskLogger.debug({ task_id: formatSessionID(task.sessionID, true), err }, "[compactedNotify] Failed")
    return false
  }
}
