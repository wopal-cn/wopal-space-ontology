import type {
  LaunchInput,
  LaunchOutput,
  WopalTask,
  OpenCodeClient,
} from "../types.js"
import type { LoggerInstance } from "../logger.js"
import { formatSessionID } from "../logger.js"
import type { ConcurrencyManager } from "./concurrency-manager.js"
import { toErrorMessage, isPromiseLike } from "./utils.js"
import { sessionIDToTaskID } from "../session-ref.js"
import { classifyTaskStop } from "./task-stop-classifier.js"

export const DEFAULT_CONCURRENCY_LIMIT = 5

export { sessionIDToTaskID } from "../session-ref.js"

export interface TaskLauncherDeps {
  tasks: Map<string, WopalTask>
  client: OpenCodeClient & {
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
  abortSession: (sessionID: string | undefined) => Promise<void>
}

export { toErrorMessage, isPromiseLike }

export async function launchTask(
  deps: TaskLauncherDeps,
  input: LaunchInput,
): Promise<LaunchOutput> {
  const { tasks, client, debugLog, concurrency, concurrencyKey, taskManager, abortSession } = deps

  const releaseAndReturnError = (error: string): LaunchOutput => {
    concurrency.release(concurrencyKey)
    return { ok: false, status: 'failed', error }
  }

  debugLog.trace(`[launch] starting: description="${input.description}" agent="${input.agent}" parent_id=${formatSessionID(input.parentSessionID, false)}`)

  if (!concurrency.tryAcquire(concurrencyKey, DEFAULT_CONCURRENCY_LIMIT)) {
    debugLog.debug(`[launch] concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT})`)
    return { ok: false, status: 'failed', error: `Concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT}). Wait for running tasks to finish.` }
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

    const extractedSessionID = session?.data?.id ?? session?.id ?? session?.info?.id
    debugLog.trace(`[launch] task created: ${formatSessionID(extractedSessionID, true)}`)
    if (extractedSessionID) {
      sessionID = extractedSessionID
    } else {
      const error = "Background task launch failed: child session did not provide an ID"
      debugLog.debug(`[launch] failed: child session did not provide an ID`)
      return releaseAndReturnError(error)
    }
  } catch (err) {
    debugLog.debug({ err }, "[launch] session.create failed")
    const error = `Background task launch failed: ${toErrorMessage(err)}`
    return releaseAndReturnError(error)
  }

  const taskId = sessionIDToTaskID(sessionID)

  if (typeof client.session?.promptAsync !== "function") {
    const error = "Background task launch failed: session.promptAsync is unavailable"
    debugLog.debug(`[launch] failed: session.promptAsync is unavailable`)
    await abortSession(sessionID)
    // launch failed, no task retained
    return { ok: false, status: 'failed', error }
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
    await abortSession(sessionID)
    // launch failed, no task retained
    return { ok: false, status: 'failed', error }
  }

  // Success: create running task
  const task: WopalTask = {
    id: taskId,
    sessionID,
    status: 'running',
    description: input.description,
    agent: input.agent,
    prompt: input.prompt,
    parentSessionID: input.parentSessionID,
    createdAt: new Date(),
    startedAt: new Date(),
    progress: { toolCalls: 0, lastUpdate: new Date() },
    concurrencyKey,
  }
  tasks.set(taskId, task)
  taskManager.registerTaskSession(sessionID)

  debugLog.info(
    {
      description: input.description,
      agent: input.agent,
    },
    "Task launched",
  )

  void Promise.resolve(promptResult).catch(async (_err: unknown) => {
    debugLog.debug(`[launch] promptAsync error for ${formatSessionID(task.sessionID, true)}: status=${task.status}`)

    // Only classify if task is still running or waiting
    if (task.status !== 'running' && task.status !== 'waiting') {
      debugLog.debug(`[launch] skipping cleanup: ${formatSessionID(task.sessionID, true)} status changed to ${task.status}`)
      return
    }

    // Release concurrency slot
    concurrency.release(concurrencyKey)
    task.concurrencyKey = undefined

    await classifyTaskStop({
      task,
      client: client,
      debugLog,
      errorText: toErrorMessage(_err),
    })

    // Abort the session
    await abortSession(task.sessionID)

    debugLog.debug(`[launch] promptAsync error classified: ${formatSessionID(task.sessionID, true)} status=${task.status}`)
  })

  return { ok: true, taskId, status: 'running' }
}
