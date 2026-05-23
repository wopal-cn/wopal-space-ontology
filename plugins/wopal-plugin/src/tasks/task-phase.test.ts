import { describe, expect, it } from "vitest"
import {
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
  describe("isTaskActive", () => {
    it("returns true for running task (the only active state)", () => {
      const task = createTask({ status: "running" })
      expect(isTaskActive(task)).toBe(true)
    })

    it("returns false for idle task", () => {
      const task = createTask({ status: "idle" })
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for stuck task", () => {
      const task = createTask({ status: "stuck" })
      expect(isTaskActive(task)).toBe(false)
    })

    it("returns false for error task", () => {
      const task = createTask({ status: "error" })
      expect(isTaskActive(task)).toBe(false)
    })
  })

  describe("isResumableTask", () => {
    it("returns false for running task (active, not resumable)", () => {
      const task = createTask({ status: "running" })
      expect(isResumableTask(task)).toBe(false)
    })

    it("returns true for idle task", () => {
      const task = createTask({ status: "idle" })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns true for stuck task", () => {
      const task = createTask({ status: "stuck" })
      expect(isResumableTask(task)).toBe(true)
    })

    it("returns false for error task", () => {
      const task = createTask({ status: "error" })
      expect(isResumableTask(task)).toBe(false)
    })
  })

  describe("canDeleteTask", () => {
    it("returns false for running task (active, cannot delete)", () => {
      const task = createTask({ status: "running" })
      expect(canDeleteTask(task)).toBe(false)
    })

    it("returns true for idle task", () => {
      const task = createTask({ status: "idle" })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for stuck task", () => {
      const task = createTask({ status: "stuck" })
      expect(canDeleteTask(task)).toBe(true)
    })

    it("returns true for error task", () => {
      const task = createTask({ status: "error" })
      expect(canDeleteTask(task)).toBe(true)
    })
  })

  describe("getDisplayStatus", () => {
    it("returns status directly for running task", () => {
      const task = createTask({ status: "running" })
      expect(getDisplayStatus(task)).toBe("running")
    })

    it("returns status directly for idle task", () => {
      const task = createTask({ status: "idle" })
      expect(getDisplayStatus(task)).toBe("idle")
    })

    it("returns status directly for waiting task", () => {
      const task = createTask({ status: "waiting" })
      expect(getDisplayStatus(task)).toBe("waiting")
    })

    it("returns status directly for stuck task", () => {
      const task = createTask({ status: "stuck" })
      expect(getDisplayStatus(task)).toBe("stuck")
    })

    it("returns status directly for error task", () => {
      const task = createTask({ status: "error" })
      expect(getDisplayStatus(task)).toBe("error")
    })
  })
})
