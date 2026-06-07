export type WopalTaskStatus = 'running' | 'idle' | 'waiting' | 'stuck' | 'error'

export type TaskStopSuppressionReason = 'abort' | 'interrupt'

export interface TaskStopSuppression {
  id: number
  reason: TaskStopSuppressionReason
  requestedAt: number
}

export type ErrorCategory = 'timeout' | 'crash' | 'network' | 'cancelled' | 'unknown'

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
  // Idle diagnostic fields
  lastAssistantMessage?: string
  // Question tool pending request ID (for resolving question Deferred)
  pendingQuestionID?: string
  // Stuck detection
  stuckNotified?: boolean
  stuckNotifiedAt?: Date
  // Progress notification: dedup fields
  lastNotifyTimeQuota?: number
  lastNotifyContextPct?: number
  // Baseline timestamp for progress time trigger (reset on reactivation via reply).
  // Separate from startedAt which tracks total task runtime.
  progressNotifyTimeBaseline?: Date
  // Concurrency slot key for waiting tasks
  waitingConcurrencyKey?: string
  // Task-level model info (mirrors SessionState fields, managed by TaskManager)
  providerID?: string
  modelID?: string
  contextLimit?: number
  stopNotificationSuppressions?: TaskStopSuppression[]
  lastTokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read?: number; write?: number }
    updatedAt: number
  }
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
    // Tool state for status detection (EllaMaka data structure)
    state?: {
      status?: "pending" | "running" | "completed" | "error"
      metadata?: { exit?: number }
      error?: string
      input?: unknown
      output?: string
    }
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
  status: 'failed'
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

// EllaMaka SDK client types (minimal interface for plugin usage)
// Return types use `unknown` because the SDK returns discriminated unions
// (data/error) that are consumed via optional chaining throughout the plugin.

export interface OpenCodeSession {
  get(args: { path: { id: string } }): Promise<unknown>
  messages(args: { path: { id: string }; query?: { limit?: number } }): Promise<unknown>
  promptAsync(args: {
    path: { id: string }
    body: {
      agent?: string
      model?: { providerID: string; modelID: string }
      parts: unknown[]
      noReply?: boolean
      tools?: Record<string, boolean>
    }
  }): Promise<unknown>
  abort(args: { path: { id: string } }): Promise<unknown>
  update(args: { path: { id: string }; body: { title: string } }): Promise<unknown>
  delete(args: { path: { id: string } }): Promise<unknown>
  children(args: { path: { id: string } }): Promise<unknown>
  status(): Promise<unknown>
  summarize?(args: {
    path: { id: string }
    body: { providerID: string; modelID: string }
    query?: { directory?: string }
  }): Promise<unknown>
}

export interface OpenCodePermission {
  reply(args: { requestID: string; reply: string }): Promise<unknown>
}

export interface OpenCodeQuestion {
  reply(args: { requestID: string; answers: string[][] }): Promise<unknown>
}

export interface OpenCodeConfig {
  providers(args: { query?: { directory?: string } }): Promise<{ data?: { providers?: Array<{
    id: string
    models?: Record<string, { limit?: { context?: number } }>
  }> } }>
}

export interface OpenCodeClient {
  session?: OpenCodeSession
  permission?: OpenCodePermission
  question?: OpenCodeQuestion
  config?: OpenCodeConfig
  // v1 SDK compatibility (deprecated)
  postSessionIdPermissionsPermissionId?(args: { path: { id: string; permissionID: string }; body: { response: string } }): Promise<unknown>
}

// Narrowing helpers for event properties

export interface EventInfo {
  agent?: string
}

export interface EventProperties {
  sessionID?: string
  info?: EventInfo
  part?: {
    type?: string
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: { read?: number; write?: number }
    }
  }
  error?: { name?: string }
  id?: string  // requestID for permission/question events
  permission?: string
  patterns?: string[]
  questions?: Array<{ header?: string; question?: string; options?: Array<{ label: string; description: string }> }>
}

export function hasEventInfo(props: unknown): props is EventProperties {
  return typeof props === "object" && props !== null
}

// Type guard for tool state detection (used in extractBySection)
export interface ToolState {
  status?: "pending" | "running" | "completed" | "error"
  metadata?: { exit?: number }
  error?: string
}

export function hasToolState(part: unknown): part is { state: ToolState } {
  return typeof part === "object" && part !== null && "state" in part
}

// Type guard for session.delete result
export interface SessionDeleteResult {
  data?: boolean
  error?: unknown
}

export function isSessionDeleteResult(result: unknown): result is SessionDeleteResult {
  return typeof result === "object" && result !== null
}

// Type guard for session.messages result
export function isMessagesResult(result: unknown): result is MessagesResult {
  return typeof result === "object" && result !== null
}
