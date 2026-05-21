import type {
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import type { ConcurrencyManager } from "./concurrency-manager.js"
import { toErrorMessage, isPromiseLike } from "./utils.js"
import { sessionIDToTaskID } from "../session-ref.js"

export const DEFAULT_CONCURRENCY_LIMIT = 5

export { sessionIDToTaskID } from "../session-ref.js"

export interface TaskLauncherDeps {
  tasks: Map<string, WopalTask>
  client: {
    session?: {
      create?: (args: { body: { parentID: string; title: string } }) => Promise<{
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
      abort?: (args: { path: { id: string } }) => Promise<unknown>
    }
  }
  debugLog: LoggerInstance
  concurrency: ConcurrencyManager
  concurrencyKey: string
  taskManager: {
    registerTaskSession: (sessionID: string) => void
  }
  failTask: (task: WopalTask, error: string) => boolean
  abortSession: (sessionID: string | undefined) => Promise<void>
}

export { toErrorMessage, isPromiseLike }

export async function launchTask(
  deps: TaskLauncherDeps,
  input: LaunchInput,
): Promise<LaunchOutput> {
  const { tasks, client, debugLog, concurrency, concurrencyKey, taskManager, failTask, abortSession } = deps

  const releaseAndReturnError = (error: string): LaunchOutput => {
    concurrency.release(concurrencyKey)
    return { ok: false, status: 'error', error }
  }

  debugLog.debug(`[launch] starting: description="${input.description}" agent="${input.agent}" parentSessionID=${input.parentSessionID}`)

  if (!concurrency.tryAcquire(concurrencyKey, DEFAULT_CONCURRENCY_LIMIT)) {
    debugLog.debug(`[launch] concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT})`)
    return { ok: false, status: 'error', error: `Concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT}). Wait for running tasks to finish.` }
  }

  if (!input.parentSessionID) {
    debugLog.debug(`[launch] failed: parent session ID is required`)
    return releaseAndReturnError("Background task launch failed: parent session ID is required")
  }

  if (typeof client.session?.create !== "function") {
    debugLog.debug(`[launch] failed: session.create is unavailable`)
    return releaseAndReturnError("Background task launch failed: session.create is unavailable")
  }

  let sessionID: string | undefined
  try {
    const session = await client.session.create({
      body: {
        parentID: input.parentSessionID,
        title: input.description,
        agent: input.agent,
      } as { parentID: string; title: string; agent?: string },
    })

    debugLog.debug(`[launch] session.create returned: ${JSON.stringify(session)}`)
    const extractedSessionID = session?.data?.id ?? session?.id ?? session?.info?.id
    if (extractedSessionID) {
      sessionID = extractedSessionID
    } else {
      const error = "Background task launch failed: child session did not provide an ID"
      debugLog.debug(`[launch] failed: child session did not provide an ID`)
      return releaseAndReturnError(error)
    }
  } catch (err) {
    debugLog.debug(`[launch] session.create error: ${err}`)
    const error = `Background task launch failed: ${toErrorMessage(err)}`
    return releaseAndReturnError(error)
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
  taskManager.registerTaskSession(sessionID)

  if (typeof client.session?.promptAsync !== "function") {
    const error = "Background task launch failed: session.promptAsync is unavailable"
    debugLog.debug(`[launch] failed: session.promptAsync is unavailable`)
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
    debugLog.debug(`[launch] failed: promptAsync did not return a promise`)
    await abortSession(task.sessionID)
    failTask(task, error)
    return { ok: false, taskId, status: 'error', error }
  }

  task.status = 'running'
  task.startedAt = new Date()
  task.progress = { toolCalls: 0, lastUpdate: new Date() }

  void Promise.resolve(promptResult).catch(async (err: unknown) => {
    const error = `Background task execution failed: ${toErrorMessage(err)}`
    debugLog.debug(`[launch] promptAsync error for ${taskId}: idleNotified=${task.idleNotified} status=${task.status}`)

    // If task was already idle (interrupted by user), don't override state
    if (task.idleNotified) {
      debugLog.debug(`[launch] skipping failTask: task ${taskId} was idle, promptAsync rejection is expected after abort`)
      return
    }

    if (failTask(task, error)) {
      await abortSession(task.sessionID)
    }
  })

  debugLog.debug(`[launch] success: taskId=${taskId} session=${formatSessionID(task.sessionID, true)}`)

  return { ok: true, taskId, status: 'running' }
}
