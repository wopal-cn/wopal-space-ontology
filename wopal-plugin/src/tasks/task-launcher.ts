import type {
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "../types.js"
import type { DebugLog } from "../debug.js"
import type { ConcurrencyManager } from "./concurrency-manager.js"

export const DEFAULT_CONCURRENCY_LIMIT = 5

export function sessionIDToTaskID(sessionID: string): string {
  const suffix = sessionID.replace(/^ses_/, '')
  return `wopal-task-${suffix}`
}

export interface TaskLauncherDeps {
  tasks: Map<string, WopalTask>
  client: {
    session?: {
      create?: (args: { parentID: string; title: string }) => Promise<{
        data?: { id?: string }
        id?: string
        info?: { id?: string }
      }>
      promptAsync?: (args: {
        path: { id: string }
        body: {
          agent: string
          parts: Array<{ type: string; text: string }>
          tools?: Record<string, boolean>
        }
      }) => PromiseLike<unknown> | unknown
      abort?: (args: { path: { id: string } }) => Promise<void>
    }
  }
  debugLog: DebugLog
  concurrency: ConcurrencyManager
  concurrencyKey: string
  failTask: (task: WopalTask, error: string) => boolean
  abortSession: (sessionID: string | undefined) => Promise<void>
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error.length > 0) {
    return error
  }

  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== "{}") {
      return serialized
    }
  } catch {
    // Ignore JSON serialization failures and fall back to String().
  }

  return String(error)
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value
}

export async function launchTask(
  deps: TaskLauncherDeps,
  input: LaunchInput,
): Promise<LaunchOutput> {
  const { tasks, client, debugLog, concurrency, concurrencyKey, failTask, abortSession } = deps

  debugLog(`[launch] starting: description="${input.description}" agent="${input.agent}" parentSessionID=${input.parentSessionID}`)

  if (!concurrency.tryAcquire(concurrencyKey, DEFAULT_CONCURRENCY_LIMIT)) {
    debugLog(`[launch] concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT})`)
    return { ok: false, status: 'error', error: `Concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT}). Wait for running tasks to finish.` }
  }

  if (!input.parentSessionID) {
    debugLog(`[launch] failed: parent session ID is required`)
    return {
      ok: false,
      status: 'error',
      error: "Background task launch failed: parent session ID is required",
    }
  }

  if (typeof client.session?.create !== "function") {
    debugLog(`[launch] failed: session.create is unavailable`)
    return {
      ok: false,
      status: 'error',
      error: "Background task launch failed: session.create is unavailable",
    }
  }

  let sessionID: string | undefined
  try {
    const session = await client.session.create({
      parentID: input.parentSessionID,
      title: input.description,
    })

    debugLog(`[launch] session.create returned: ${JSON.stringify(session)}`)
    const extractedSessionID = session?.data?.id ?? session?.id ?? session?.info?.id
    if (extractedSessionID) {
      sessionID = extractedSessionID
    } else {
      const error = "Background task launch failed: child session did not provide an ID"
      debugLog(`[launch] failed: child session did not provide an ID`)
      concurrency.release(concurrencyKey)
      return { ok: false, status: 'error', error }
    }
  } catch (err) {
    debugLog(`[launch] session.create error: ${err}`)
    const error = `Background task launch failed: ${toErrorMessage(err)}`
    concurrency.release(concurrencyKey)
    return { ok: false, status: 'error', error }
  }

  const taskId = sessionIDToTaskID(sessionID)

  const task: WopalTask = {
    id: taskId,
    sessionID,
    status: 'pending',
    description: input.description,
    agent: input.agent,
    prompt: input.prompt,
    parentSessionID: input.parentSessionID,
    createdAt: new Date(),
    concurrencyKey,
  }
  tasks.set(taskId, task)

  if (typeof client.session?.promptAsync !== "function") {
    const error = "Background task launch failed: session.promptAsync is unavailable"
    debugLog(`[launch] failed: session.promptAsync is unavailable`)
    await abortSession(task.sessionID)
    failTask(task, error)
    return { ok: false, taskId, status: 'error', error }
  }

  const promptResult = client.session.promptAsync({
    path: { id: sessionID },
    body: {
      agent: input.agent,
      parts: [{ type: "text", text: input.prompt }],
      tools: {
        "wopal_task": false,  // Disable nested task launching
      },
    },
  })

  if (!isPromiseLike(promptResult)) {
    const error = "Background task launch failed: session.promptAsync did not return a promise"
    debugLog(`[launch] failed: promptAsync did not return a promise`)
    await abortSession(task.sessionID)
    failTask(task, error)
    return { ok: false, taskId, status: 'error', error }
  }

  task.status = 'running'
  task.startedAt = new Date()
  task.progress = { toolCalls: 0, lastUpdate: new Date() }

  void Promise.resolve(promptResult).catch(async (err: unknown) => {
    const error = `Background task execution failed: ${toErrorMessage(err)}`
    debugLog(`[launch] promptAsync error for ${taskId}: idleNotified=${task.idleNotified} status=${task.status}`)

    // If task was already idle (interrupted by user), don't override state
    if (task.idleNotified) {
      debugLog(`[launch] skipping failTask: task ${taskId} was idle, promptAsync rejection is expected after abort`)
      return
    }

    if (failTask(task, error)) {
      await abortSession(task.sessionID)
    }
  })

  debugLog(`[launch] success: taskId=${taskId} sessionID=${task.sessionID}`)

  return { ok: true, taskId, status: 'running' }
}