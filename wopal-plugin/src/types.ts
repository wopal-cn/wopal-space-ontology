export type WopalTaskStatus = 'pending' | 'running' | 'waiting' | 'error'

// Note: 'error' is the only terminal state now
// Task is a perpetual dialog channel - no 'completed', 'cancelled', 'interrupt' states

export type ErrorCategory = 'timeout' | 'crash' | 'network' | 'cancelled' | 'unknown'
// Note: 'cancelled' retained for backward compatibility with existing error handling code

export interface TaskProgress {
  toolCalls: number
  lastTool?: string
  lastUpdate: Date
  lastMessage?: string
  lastMessageAt?: Date
  lastMeaningfulActivity?: Date
}

export interface WopalTask {
  id: string
  sessionID?: string
  status: WopalTaskStatus
  description: string
  agent: string
  prompt: string
  parentSessionID: string
  createdAt: Date
  completedAt?: Date
  error?: string
  // Phase 3 additions
  startedAt?: Date
  progress?: TaskProgress
  errorCategory?: ErrorCategory
  concurrencyKey?: string | undefined
  // Progress notification tracking
  lastNotifyMessageCount?: number
  lastNotifyTime?: Date
  // Idle diagnostic fields
  waitingReason?: string
  lastAssistantMessage?: string
  // Question tool pending request ID (for resolving question Deferred)
  pendingQuestionID?: string
  // Stuck detection
  stuckNotified?: boolean
  stuckNotifiedAt?: Date
  // Concurrency slot key for waiting tasks
  waitingConcurrencyKey?: string
  // Idle notification (Phase 3: judgment delegated to Wopal)
  idleNotified?: boolean
  // Context usage tracking
  lastNotifyContextUsage?: number  // percentage at last notification (for growth detection)
  lastContextUsage?: number        // last successfully fetched percentage (cached for tick display)
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
  abortSignal?: AbortSignal
}

// Session message types for result extraction
export interface SessionMessage {
  id?: string
  info?: {
    id?: string
    role?: string
    time?: string | { created?: number }
    finish?: string
    agent?: string
    model?: { providerID: string; modelID: string; variant?: string }
    modelID?: string
    providerID?: string
    variant?: string
    tokens?: {
      input?: number
      cache?: { read?: number }
    }
  }
  parts?: Array<{
    type?: string
    text?: string
    tool?: string
    callID?: string
    content?: string | Array<{ type: string; text?: string }>
    synthetic?: boolean
  }>
}

export interface MessagesResult {
  data?: SessionMessage[]
  error?: unknown
}

export interface LaunchSuccess {
  ok: true
  taskId: string
  status: 'running'
}

export interface LaunchFailure {
  ok: false
  taskId?: string
  status: 'error'
  error: string
}

export type LaunchOutput = LaunchSuccess | LaunchFailure

export type InterruptResult =
  | 'interrupted'
  | 'not_found'
  | 'not_running'

// Legacy alias for backward compatibility
export type CancelResult = InterruptResult

// SNAPSHOT-TEST [2026-04-14 17:20:08]

// System prompt metadata types (pending @opencode-ai/plugin release)
// These will be provided by ellamaka's hook input at runtime
export type SystemPromptSectionKind =
  | "agent-prompt"
  | "provider-prompt"
  | "environment"
  | "instruction"
  | "skill"
  | "structured-output"
  | "user-system"
  | "custom"

export interface SystemPromptSection {
  kind: SystemPromptSectionKind
  content: string
  source?: string | undefined
}

export interface SystemPromptMetadata {
  version: 1
  sections: SystemPromptSection[]
}
