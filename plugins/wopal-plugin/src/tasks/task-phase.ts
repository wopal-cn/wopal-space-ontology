/**
 * Task Phase Helpers
 *
 * State model: running | idle | waiting | stuck | error
 * - running: the only active state (task is executing)
 * - idle/waiting/stuck: inactive states, resumable and deletable
 * - error: inactive state, deletable but not resumable
 */

import type { WopalTask } from "../types.js"

/**
 * Check if task is in idle state.
 * Idle: task stopped with new assistant text, awaiting Wopal judgment.
 */
export function isIdleTask(task: WopalTask): boolean {
  return task.status === "idle"
}

/**
 * Check if task is actively executing.
 * Active: only running.
 */
export function isTaskActive(task: WopalTask): boolean {
  return task.status === "running"
}

/**
 * Check if task can be resumed via wopal_task_reply.
 * Resumable: idle, waiting, stuck.
 */
export function isResumableTask(task: WopalTask): boolean {
  return task.status === "idle" || task.status === "waiting" || task.status === "stuck"
}

/**
 * Get display-friendly status string.
 * Returns task.status directly — no hidden phases.
 */
export function getDisplayStatus(task: WopalTask): string {
  return task.status
}

/**
 * Check if task can be deleted by parent session.
 * Deletable: idle, waiting, stuck, error.
 */
export function canDeleteTask(task: WopalTask): boolean {
  return task.status === "idle" || task.status === "waiting" || task.status === "stuck" || task.status === "error"
}
