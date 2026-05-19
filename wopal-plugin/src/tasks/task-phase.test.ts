import { describe, expect, it } from "vitest"
import {
  isIdleTask,
  isResumableTask,
  getDisplayStatus,
  canDeleteTask,
  isTaskActive,
} from "./task-phase.js"
import type { WopalTask } from "../types.js"

function createTask(overrides?: Partial<WopalTask>): WopalTask {
  return {
    id: "test-task",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "Do something",
    parentSessionID: "parent-123",
    createdAt: new Date(),
    ...overrides,
  }
}

describe("task-phase", () => {
  describe("isIdleTask", () => {
    it("returns true for running + idleNotified task", () => {
      const task = createTask({ status: "running", idleNotified: true })
      expect(isIdleTask(task)).toBe(true)
    })

    it("returns false for running without idleNotified", () => {
      const task = createTask({ status: "running" })
      expect(isIdleTask(task)).toBe(false)
    })

    it("returns false for running with idleNotified=false", () => {
      const task = createTask({ status: "running", idleNotified: false })
      expect(isIdleTask(task)).toBe(false)
    })

    it("returns false for waiting task", () => {
      const task = createTask({ status: "waiting", idleNotified: true })
      expect(isIdleTask(task)).toBe(false)
    })

    it("returns false for error task", () => {
      const task = createTask({ status: "error", idleNotified: true })
      expect(isIdleTask(task)).toBe(false)
    })
  })

  describe("isResumableTask", () => {
    it("returns true for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for error task", () => {
      const task = createTask({ status: "error" })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for idle task (running + idleNotified)", () => {
      const task = createTask({ status: "running", idleNotified: true })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns false for actively running task", () => {
      const task = createTask({ status: "running" })
      expect(isResumableTask(task)).toBe(false)
    })
  })

  describe("getDisplayStatus", () => {
    it("shows 'idle (awaiting judgment)' for idle task", () => {
      const task = createTask({ status: "running", idleNotified: true })
      expect(getDisplayStatus(task)).toBe("idle (awaiting judgment)")
    })

    it("shows 'running' for actively running task", () => {
      const task = createTask({ status: "running" })
      expect(getDisplayStatus(task)).toBe("running")
    })

    it("shows 'waiting' for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(getDisplayStatus(task)).toBe("waiting")
    })

    it("shows 'error' for error task", () => {
      const task = createTask({ status: "error" })
      expect(getDisplayStatus(task)).toBe("error")
    })
  })

  describe("canDeleteTask", () => {
    it("returns true for idle task", () => {
      const task = createTask({ status: "running", idleNotified: true })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for error task", () => {
      const task = createTask({ status: "error" })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns false for actively running task", () => {
      const task = createTask({ status: "running" })
      expect(canDeleteTask(task)).toBe(false)
    })

    it("returns false for running task with idleNotified=false", () => {
      const task = createTask({ status: "running", idleNotified: false })
      expect(canDeleteTask(task)).toBe(false)
    })
  })

  describe("isTaskActive", () => {
    it("returns true for actively running task", () => {
      const task = createTask({ status: "running" })
      expect(isTaskActive(task)).toBe(true)
    })

    it("returns false for idle task", () => {
      const task = createTask({ status: "running", idleNotified: true })
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for error task", () => {
      const task = createTask({ status: "error" })
      expect(isTaskActive(task)).toBe(false)
    })
  })
})