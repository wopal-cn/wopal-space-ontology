/**
 * Task Phase Helpers
 *
 * Unified state determination for task lifecycle phases.
 * Eliminates scattered idleNotified / resumable / delete eligibility judgments.
 */

import type { WopalTask } from "../types.js"

/**
 * Check if task is in idle phase (running + idleNotified).
 * Idle tasks await Wopal judgment before proceeding.
 */
export function isIdleTask(task: WopalTask): boolean {
  return task.status === "running" && task.idleNotified === true
}

/**
 * Check if task can be resumed via wopal_task_reply.
 * Resumable: waiting, error, or running + idleNotified.
 */
export function isResumableTask(task: WopalTask): boolean {
  if (task.status === "waiting") return true
  if (task.status === "error") return true
  return isIdleTask(task)
}

/**
 * Get display-friendly status string.
 * - idleNotified running tasks show "idle (awaiting judgment)"
 * - Other status values shown directly
 */
export function getDisplayStatus(task: WopalTask): string {
  if (isIdleTask(task)) {
    return "idle (awaiting judgment)"
  }
  return task.status
}

/**
 * Check if task can be deleted by parent session.
 * Deletable: pending, idle, error, or waiting (not actively running).
 */
export function canDeleteTask(task: WopalTask): boolean {
  // Only actively running tasks (running without idleNotified) cannot be deleted
  if (task.status === "running" && !task.idleNotified) {
    return false
  }
  // All other states (pending, idle, error, waiting) are deletable
  return true
}

/**
 * Check if task is actively executing (not waiting for external input).
 * Active: running without idleNotified.
 */
export function isTaskActive(task: WopalTask): boolean {
  return task.status === "running" && !task.idleNotified
}