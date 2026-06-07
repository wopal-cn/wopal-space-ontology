import { contextLogger } from "../logger.js";

export { contextLogger as debugLog };

const TRUNCATE_THRESHOLD_LINES = 10;
const TRUNCATE_KEEP_LINES = 5;
const MAX_SINGLE_LINE_CHARS = 500;

/**
 * Truncate long content:
 * - < 10 lines: full output
 * - >= 10 lines: first 5 + "... (N lines omitted)" + last 5
 * - Single line >= 500 chars: truncate to 500 + "... (N chars omitted)"
 */
export function truncateLines(lines: string[]): string[] {
  // Truncate long lines first
  const truncated: string[] = [];
  for (const line of lines) {
    if (line.length > MAX_SINGLE_LINE_CHARS) {
      const omittedChars = line.length - MAX_SINGLE_LINE_CHARS;
      truncated.push(line.slice(0, MAX_SINGLE_LINE_CHARS) + `... (${omittedChars} chars omitted)`);
    } else {
      truncated.push(line);
    }
  }

  // Truncate by line count
  if (truncated.length < TRUNCATE_THRESHOLD_LINES) {
    return truncated;
  }

  const omitted = truncated.length - 2 * TRUNCATE_KEEP_LINES;
  const first = truncated.slice(0, TRUNCATE_KEEP_LINES);
  const last = truncated.slice(-TRUNCATE_KEEP_LINES);
  return [...first, `... (${omitted} lines omitted)`, ...last];
}

export function formatContent(content: unknown, lines: string[]): void {
  if (typeof content === "string") {
    lines.push(...content.split("\n"));
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "object" && item !== null && "text" in item) {
        const text = (item as { text?: string }).text;
        if (text) lines.push(...text.split("\n"));
      } else {
        lines.push(...String(item).split("\n"));
      }
    }
  } else if (content != null) {
    lines.push(...JSON.stringify(content, null, 2).split("\n"));
  }
}

export function localTimestamp(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function localDateTimeStr(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

/**
 * Find value in a Map using prefix matching.
 * OpenCode internally appends suffixes to sessionIDs (e.g. "ses_abc" → "ses_abcXYZ123"),
 * so map keys may have extra characters. This function first tries exact match,
 * then falls back to finding a key that starts with the given prefix.
 */
export function findInMap<T>(map: Map<string, T>, key: string): T | undefined {
  const exact = map.get(key);
  if (exact !== undefined) return exact;

  for (const [k, v] of map) {
    if (k.startsWith(key)) return v;
  }
  return undefined;
}

/**
 * Get the actual key from a Map using prefix matching (for diagnostic logging).
 */
export function findActualKey(map: Map<string, unknown>, prefix: string): string | undefined {
  if (map.has(prefix)) return prefix;
  for (const k of map.keys()) {
    if (k.startsWith(prefix)) return k;
  }
  return undefined;
}
