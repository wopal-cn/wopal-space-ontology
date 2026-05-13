import type { SessionMessage } from "../types.js"
import { createDebugLog } from "../debug.js"
import { getMessageTime, extractToolCallSequence } from "./session-messages.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export interface LoopWarning {
  type: "tool_loop" | "rapid_cycle"
  message: string
  severity: "warning" | "critical"
}

/**
 * Check for tool loop: same tool called consecutively 3+ times.
 */
function detectToolLoop(toolSequence: string[]): LoopWarning | null {
  if (toolSequence.length < 3) return null

  // Check last 3+ consecutive same tool calls
  const lastTool = toolSequence[toolSequence.length - 1]
  let consecutiveCount = 1

  // Count consecutive calls from the end
  for (let i = toolSequence.length - 2; i >= 0; i--) {
    if (toolSequence[i] === lastTool) {
      consecutiveCount++
    } else {
      break
    }
  }

  // Only warn if 3+ consecutive calls
  if (consecutiveCount >= 3) {
    debugLog(`[loop] detected: tool_loop for ${lastTool}`)
    return {
      type: "tool_loop",
      message: `Tool "${lastTool}" called ${consecutiveCount} times consecutively`,
      severity: consecutiveCount >= 5 ? "critical" : "warning",
    }
  }

  return null
}

/**
 * Get timestamps of recent assistant messages.
 * Returns array of timestamps in chronological order.
 */
function getAssistantTimestamps(messages: SessionMessage[]): number[] {
  const timestamps: number[] = []

  for (const message of messages) {
    if (message.info?.role !== "assistant") continue
    const time = getMessageTime(message)
    if (time > 0) {
      timestamps.push(time)
    }
  }

  return timestamps
}

/**
 * Check for rapid cycle: recent assistant messages with < 1 second intervals.
 */
function detectRapidCycle(timestamps: number[]): LoopWarning | null {
  if (timestamps.length < 3) return null

  // Get last 3 timestamps
  const recent = timestamps.slice(-3)

  // Check intervals between consecutive messages
  const intervals = []
  for (let i = 1; i < recent.length; i++) {
    intervals.push(recent[i] - recent[i - 1])
  }

  // All intervals < 1000ms indicates rapid cycling
  const allRapid = intervals.every((interval) => interval > 0 && interval < 1000)

  if (allRapid) {
    debugLog(`[loop] detected: rapid_cycle (${intervals.join(", ")}ms intervals)`)
    return {
      type: "rapid_cycle",
      message: `Last ${recent.length} assistant messages generated within <1s intervals`,
      severity: "warning",
    }
  }

  return null
}

/**
 * Detect potential loop patterns in session messages.
 * 
 * Checks for:
 * 1. tool_loop: Same tool called 3+ times consecutively
 * 2. rapid_cycle: Last 3 assistant messages with <1s intervals
 * 
 * Note: reasoning_repeat is not implemented (high complexity, unclear value)
 * 
 * @param messages - Session messages to analyze
 * @returns LoopWarning if a loop pattern is detected, null otherwise
 */
export function detectLoop(messages: SessionMessage[]): LoopWarning | null {
  if (messages.length === 0) return null

  // Check tool loop
  const toolSequence = extractToolCallSequence(messages)
  const toolLoopWarning = detectToolLoop(toolSequence)
  if (toolLoopWarning) return toolLoopWarning

  // Check rapid cycle
  const timestamps = getAssistantTimestamps(messages)
  const rapidCycleWarning = detectRapidCycle(timestamps)
  if (rapidCycleWarning) return rapidCycleWarning

  return null
}
