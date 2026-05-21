import type { SessionMessage } from "../types.js"

interface CursorState {
  lastKey?: string
  lastCount: number
}

const sessionCursors = new Map<string, CursorState>()

function buildMessageKey(message: SessionMessage, index: number): string {
  if (message.id) return `id:${message.id}`
  const time = message.info?.time
  if (typeof time === "number" || typeof time === "string") {
    return `t:${time}:${index}`
  }
  return `i:${index}`
}

export function consumeNewMessages(
  sessionID: string | undefined,
  messages: SessionMessage[]
): SessionMessage[] {
  if (!sessionID) return messages

  const keys = messages.map((m, i) => buildMessageKey(m, i))
  const cursor = sessionCursors.get(sessionID)
  let startIndex = 0

  if (cursor?.lastKey) {
    const lastIndex = keys.lastIndexOf(cursor.lastKey)
    if (lastIndex >= 0) startIndex = lastIndex + 1
  }

  if (messages.length > 0) {
    sessionCursors.set(sessionID, {
      lastKey: keys[keys.length - 1],
      lastCount: messages.length,
    })
  }

  return messages.slice(startIndex)
}

export function clearCursor(sessionID: string): void {
  sessionCursors.delete(sessionID)
}

export function getCursorCount(): number {
  return sessionCursors.size
}
