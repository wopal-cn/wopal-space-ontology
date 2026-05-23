import type { SessionMessage } from "../types.js"
import { hasToolState, isMessagesResult } from "../types.js"

function isSessionMessage(value: unknown): value is SessionMessage {
  return typeof value === "object" && value !== null
}

export function getErrorMessage(value: unknown): string | null {
  if (!isMessagesResult(value)) return null
  if (value.error === undefined || value.error === null) return null
  if (typeof value.error === "string" && value.error.length > 0) return value.error
  return String(value.error)
}

export function extractMessages(value: unknown): SessionMessage[] {
  if (!isMessagesResult(value)) return []
  if (Array.isArray(value)) return value.filter(isSessionMessage)
  if (Array.isArray(value.data)) return value.data.filter(isSessionMessage)
  return []
}

export function extractAssistantContent(messages: SessionMessage[]): string {
  const extractedContent: string[] = []

  const relevantMessages = messages.filter(
    (m) => m.info?.role === "assistant" || m.info?.role === "tool"
  )

  for (const message of relevantMessages) {
    for (const part of message.parts ?? []) {
      if ((part.type === "text" || part.type === "reasoning") && part.text) {
        extractedContent.push(part.text)
        continue
      }

      if (part.type === "tool_result") {
        if (typeof part.content === "string" && part.content) {
          extractedContent.push(part.content)
        } else if (Array.isArray(part.content)) {
          for (const block of part.content) {
            if ((block.type === "text" || block.type === "reasoning") && block.text) {
              extractedContent.push(block.text)
            }
          }
        }
      }
    }
  }

  return extractedContent.filter((text) => text.length > 0).join("\n\n")
}

/**
 * Get timestamp from a message's time field.
 * Returns milliseconds since epoch, or 0 if unavailable.
 */
export function getMessageTime(message: SessionMessage): number {
  const time = message.info?.time
  if (!time) return 0

  if (typeof time === "string") {
    const parsed = Date.parse(time)
    return isNaN(parsed) ? 0 : parsed
  }

  return time.created ?? 0
}

/**
 * Get the last assistant message from a list of messages.
 */
export function getLastAssistantMessage(
  messages: SessionMessage[]
): SessionMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "assistant") {
      return messages[i]
    }
  }
  return undefined
}

/**
 * Get finish reason from a message or message array.
 * Single message: returns its finish field directly.
 * Array: finds the last assistant message and returns its finish field.
 */
export function getFinishReason(
  input: SessionMessage[]
): string | undefined
export function getFinishReason(
  input: SessionMessage
): string | undefined
export function getFinishReason(
  input: SessionMessage | SessionMessage[]
): string | undefined {
  if (Array.isArray(input)) {
    for (let i = input.length - 1; i >= 0; i--) {
      if (input[i].info?.role === "assistant") {
        return input[i].info?.finish
      }
    }
    return undefined
  }
  return input.info?.finish
}

/**
 * Extract tool call names from assistant messages in order.
 * OpenCode uses part.type === "tool" with part.tool containing the tool name.
 */
export function extractToolCallSequence(messages: SessionMessage[]): string[] {
  const sequence: string[] = []

  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if (part.type === "tool") {
        sequence.push(part.tool ?? "unknown")
      }
    }
  }

  return sequence
}

/**
 * Check if messages contain any assistant text content.
 */
export function hasAssistantTextContent(messages: SessionMessage[]): boolean {
  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if ((part.type === "text" || part.type === "reasoning") && part.text?.trim()) {
        return true
      }
    }
  }
  return false
}

export function hasAssistantExecutionPart(messages: SessionMessage[]): boolean {
  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if (!part.synthetic) return true
    }
  }
  return false
}

/**
 * Extract text content from an assistant message.
 * Excludes reasoning parts and synthetic text parts.
 */
export function extractAssistantText(message: SessionMessage): string {
  const texts: string[] = []

  for (const part of message.parts ?? []) {
    if (part.type === "text" && part.text && !part.synthetic) {
      texts.push(part.text)
    }
  }

  return texts.join(" ").trim()
}

export type OutputSection = "tools" | "reasoning" | "text" | "todos"

/**
 * MCP status fallback: detect error from content when state.status is missing or unreliable.
 * OpenCode Issue #16969: MCP tools with isError=true may have status="completed" incorrectly.
 */
const ERROR_KEYWORDS = ["error", "Error", "validation error", "isError", "failed", "exception"]

function detectErrorFromContent(content: string | undefined): boolean {
  if (!content) return false
  return ERROR_KEYWORDS.some(keyword => content.includes(keyword))
}

function formatToolStatus(status: string | undefined, exitCode?: number, hasContentError?: boolean): string {
  // MCP fallback: if status is missing or "completed" but content contains error keywords
  if (!status || (status === "completed" && hasContentError)) {
    return "(error, detected-from-content)"
  }

  if (status === "error") {
    return exitCode !== undefined ? `(error, exit:${exitCode})` : "(error)"
  }

  return `(${status})`
}

/**
 * Extract messages filtered by section type.
 * tools section: outputs tool name + status (completed/error), no full content.
 * text/reasoning section: default last message, multiple messages truncated to maxLength=4000.
 */
export function extractBySection(
  messages: SessionMessage[],
  section: OutputSection,
  options?: { lastN?: number; maxLength?: number }
): string {
  if (!messages || messages.length === 0) return ""

  // text/reasoning section: 默认返回最后一条 assistant 消息
  if (section === "text" || section === "reasoning") {
    const lastN = options?.lastN ?? 1
    
    // 单条消息：直接获取最后一条 assistant 消息内容（无截断）
    if (lastN === 1) {
      const lastMsg = getLastAssistantMessage(messages)
      if (!lastMsg || !lastMsg.parts) return ""
      
      const texts: string[] = []
      for (const part of lastMsg.parts) {
        if (section === "text" && part.type === "text" && part.text) {
          texts.push(part.text)
        } else if (section === "reasoning" && part.type === "reasoning" && part.text) {
          texts.push(part.text)
        }
      }
      return texts.filter(t => t.length > 0).join("\n\n")
    }
    
    // 多条消息：聚合并截断至 maxLength=4000
    const maxLength = options?.maxLength ?? 4000
    const relevantMessages = messages.slice(-lastN)
    const extracted: string[] = []
    
    for (const msg of relevantMessages) {
      if (msg.info?.role !== "assistant") continue
      if (!msg.parts) continue
      
      for (const part of msg.parts) {
        if (section === "text" && part.type === "text" && part.text) {
          extracted.push(part.text)
        } else if (section === "reasoning" && part.type === "reasoning" && part.text) {
          extracted.push(part.text)
        }
      }
    }
    
    let result = extracted.filter(t => t.length > 0).join("\n\n")
    if (result.length > maxLength) {
      result = result.slice(-maxLength) + "\n[...earlier content truncated]"
    }
    return result
  }

  // tools section: 输出工具名+状态（Task 2 已重构）
  const extracted: string[] = []

  for (const msg of messages) {
    if (msg.info?.role !== "assistant" && msg.info?.role !== "tool") continue
    if (!msg.parts) continue

    for (const part of msg.parts) {
      if (part.type === "tool" && part.tool) {
        // Extract tool state for status detection
        const state = hasToolState(part) ? part.state : undefined
        const status = state?.status
        const exitCode = state?.metadata?.exit
        const formattedStatus = formatToolStatus(status, exitCode)
        extracted.push(`[tool: ${part.tool}] ${formattedStatus}`)
      } else if (part.type === "tool_result") {
        // Extract tool_result state for status detection
        const state = hasToolState(part) ? part.state : undefined
        const status = state?.status
        const exitCode = state?.metadata?.exit
        
        // MCP fallback: check content for error keywords
        const contentStr = typeof part.content === "string"
          ? part.content
          : part.content?.map(c => c.text).filter(Boolean).join("\n") ?? ""
        const hasContentError = detectErrorFromContent(contentStr)
        
        const formattedStatus = formatToolStatus(status, exitCode, hasContentError)
        extracted.push(`[result]: ${formattedStatus}`)
      }
    }
  }

  return extracted.filter(t => t.length > 0).join("\n\n")
}
