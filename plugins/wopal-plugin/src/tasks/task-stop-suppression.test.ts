import { describe, expect, it } from "vitest"
import type { WopalTask } from "../types.js"
import {
  STOP_NOTIFICATION_SUPPRESSION_TTL_MS,
  armStopNotificationSuppression,
  clearStopNotificationSuppression,
  consumeStopNotificationSuppression,
} from "./task-stop-suppression.js"

function createTask(id: string): WopalTask {
  return {
    id,
    sessionID: `ses_${id}`,
    status: "idle",
    description: "Test task",
    agent: "general",
    prompt: "test",
    parentSessionID: "parent-session",
    createdAt: new Date(),
  }
}

describe("task-stop-suppression", () => {
  it("consumes a suppression once", () => {
    const task = createTask("task-1")
    const suppression = armStopNotificationSuppression(task, "abort", 1_000)

    expect(consumeStopNotificationSuppression(task, 1_001)).toEqual(suppression)
    expect(consumeStopNotificationSuppression(task, 1_002)).toBeUndefined()
    expect(task.stopNotificationSuppressions).toBeUndefined()
  })

  it("expires suppressions after TTL", () => {
    const task = createTask("task-1")
    armStopNotificationSuppression(task, "abort", 1_000)

    const expiredAt = 1_000 + STOP_NOTIFICATION_SUPPRESSION_TTL_MS + 1

    expect(consumeStopNotificationSuppression(task, expiredAt)).toBeUndefined()
    expect(task.stopNotificationSuppressions).toBeUndefined()
  })

  it("consumes multiple suppressions in FIFO order", () => {
    const task = createTask("task-1")
    const first = armStopNotificationSuppression(task, "abort", 1_000)
    const second = armStopNotificationSuppression(task, "interrupt", 1_001)

    expect(consumeStopNotificationSuppression(task, 1_002)).toEqual(first)
    expect(consumeStopNotificationSuppression(task, 1_003)).toEqual(second)
    expect(consumeStopNotificationSuppression(task, 1_004)).toBeUndefined()
  })

  it("clears only the matching suppression id", () => {
    const task = createTask("task-1")
    const first = armStopNotificationSuppression(task, "abort", 1_000)
    const second = armStopNotificationSuppression(task, "interrupt", 1_001)

    clearStopNotificationSuppression(task, first.id)

    expect(consumeStopNotificationSuppression(task, 1_002)).toEqual(second)
    expect(consumeStopNotificationSuppression(task, 1_003)).toBeUndefined()
  })

  it("keeps suppressions isolated per task", () => {
    const firstTask = createTask("task-1")
    const secondTask = createTask("task-2")
    const firstSuppression = armStopNotificationSuppression(firstTask, "abort", 1_000)
    const secondSuppression = armStopNotificationSuppression(secondTask, "interrupt", 1_000)

    expect(consumeStopNotificationSuppression(firstTask, 1_001)).toEqual(firstSuppression)
    expect(consumeStopNotificationSuppression(secondTask, 1_001)).toEqual(secondSuppression)
  })
})
