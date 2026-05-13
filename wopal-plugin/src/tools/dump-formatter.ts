import type { SessionMessage, SystemPromptMetadata, SystemPromptSection, SystemPromptSectionKind } from "../types.js";
import type { MessageWithInfo } from "../hooks/message-context.js";
import { createDebugLog } from "../debug.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const debugLog = createDebugLog("[wopal-context]", "context");

// Compatible message type for dump formatter
type DumpMessage = SessionMessage | MessageWithInfo;

function getDumpMessageRole(msg: DumpMessage): string {
  const directRole = "role" in msg ? msg.role : undefined;
  return msg.info?.role ?? directRole ?? "unknown";
}

function getDumpMessageTime(
  msg: DumpMessage,
): string | { created?: number } | undefined {
  const info = msg.info;
  if (!info) return undefined;
  if ("time" in info) return info.time;
  return undefined;
}

export function localTimestamp(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function localDateTimeStr(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

const TRUNCATE_THRESHOLD_LINES = 10;
const TRUNCATE_KEEP_LINES = 5;
const MAX_SINGLE_LINE_CHARS = 500;

/**
 * Truncate long content:
 * - < 10 lines: full output
 * - >= 10 lines: first 5 + "... (N lines omitted)" + last 5
 * - Single line >= 500 chars: truncate to 500 + "... (N chars omitted)"
 */
function truncateLines(lines: string[]): string[] {
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

function formatContent(content: unknown, lines: string[]): void {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPartForDump(part: Record<string, any>, lines: string[], detail: boolean, role?: string): void {
  const t = part.type;

  if (t === "text") {
    if (!part.text) return;
    lines.push(`#### PART: [Text]`);
    if (part.synthetic || part.ignored) {
      lines.push(`> _[${part.synthetic ? "synthetic" : "ignored"}]_`);
    }
    const textLines = part.text.split("\n");
    if (role === "assistant" && !part.synthetic && !part.ignored) {
      lines.push("```markdown");
      lines.push(...(detail ? textLines : truncateLines(textLines)));
      lines.push("```");
    } else {
      lines.push(...(detail ? textLines : truncateLines(textLines)));
    }
    lines.push("");
    return;
  }

  if (t === "tool") {
    lines.push(`#### PART: [Tool: ${part.tool ?? "unknown"}]`);
    if (part.callID) lines.push(`_CallID: ${part.callID}_`);
    const state = part.state as Record<string, unknown> | undefined;
    if (state) {
      const status = state.status as string | undefined;
      if (status) lines.push(`_Status: ${status}_`);
      const input = state.input as Record<string, unknown> | string | undefined;
      if (input != null) {
        lines.push("_Arguments:_");
        lines.push("```json");
        const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
        lines.push(...(detail ? inputStr.split("\n") : truncateLines(inputStr.split("\n"))));
        lines.push("```");
      }
      if (status === "completed" && state.output != null) {
        lines.push("_Result:_");
        lines.push("```");
        const resultLines: string[] = [];
        formatContent(state.output, resultLines);
        lines.push(...(detail ? resultLines : truncateLines(resultLines)));
        lines.push("```");
      }
      if (status === "error" && state.error != null) {
        lines.push("_Error:_");
        lines.push(String(state.error));
      }
    }
    lines.push("");
    return;
  }

  if (t === "reasoning") {
    lines.push(`#### PART: [Reasoning]`);
    if (part.text) {
      const reasoningLines = part.text.split("\n");
      lines.push(...(detail ? reasoningLines : truncateLines(reasoningLines)));
    }
    lines.push("");
    return;
  }

  if (t === "file") {
    if (detail) {
      lines.push(`#### PART: [File: ${part.filename ?? "unknown"}]`);
      lines.push(`_Mime: ${part.mime ?? "unknown"}_`);
      if (part.url) lines.push(`URL: ${part.url}`);
      if (part.content != null) {
        const fileLines: string[] = [];
        formatContent(part.content, fileLines);
        lines.push(...fileLines);
      }
    } else {
      const size = part.content
        ? (typeof part.content === "string" ? part.content.length : JSON.stringify(part.content).length)
        : 0;
      lines.push(`#### PART: [File: ${part.filename ?? "unknown"}]`);
      lines.push(`_Mime: ${part.mime ?? "unknown"}_ _${size} chars_`);
    }
    lines.push("");
    return;
  }

  if (t === "snapshot" || t === "patch") {
    if (detail) {
      lines.push(`#### PART: [${t === "snapshot" ? "Snapshot" : "Patch"}]`);
      if (part.content != null) {
        const contentLines: string[] = [];
        formatContent(part.content, contentLines);
        lines.push(...contentLines);
      }
      if (part.text) lines.push(part.text);
    } else {
      const content = part.content ?? part.text ?? "";
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      const addMatch = contentStr.match(/^\+./gm);
      const delMatch = contentStr.match(/^-./gm);
      const additions = addMatch ? addMatch.length : 0;
      const deletions = delMatch ? delMatch.length : 0;
      const pathMatch = contentStr.match(/^--- a\/(.+)$/m) || contentStr.match(/^\+\+\+ b\/(.+)$/m);
      const filePath = pathMatch ? pathMatch[1] : "unknown";
      lines.push(`#### PART: [${t === "snapshot" ? "Snapshot" : "Patch"}: ${filePath}]`);
      lines.push(`_+${additions}/-${deletions}_`);
    }
    lines.push("");
    return;
  }

  if (t === "compaction") {
    lines.push(`#### PART: [Compaction]`);
    lines.push(`_Auto: ${part.auto ?? false}_`);
    if (part.overflow !== undefined) lines.push(`_Overflow: ${part.overflow}_`);
    if (part.tail_start_id) lines.push(`_Tail Start ID: ${part.tail_start_id}_`);
    lines.push("");
    return;
  }

  if (t === "agent") {
    lines.push(`#### PART: [Agent: ${part.name ?? "unknown"}]`);
    lines.push("");
    return;
  }

  if (t === "subtask") {
    lines.push(`#### PART: [Subtask]`);
    lines.push(`_Description: ${part.description ?? "N/A"}_`);
    lines.push(`_Agent: ${part.agent ?? "?"}_`);
    lines.push("");
    return;
  }

  if (t === "retry") {
    lines.push(`#### PART: [Retry]`);
    lines.push("");
    return;
  }

  // step-start, step-finish — skip lifecycle markers
  if (t === "step-start" || t === "step-finish") return;

  // Unknown type — dump as JSON
  if (t) {
    lines.push(`#### PART: [Unknown: ${t}]`);
    lines.push("```json");
    lines.push(JSON.stringify(part, null, 2));
    lines.push("```");
    lines.push("");
  }
}

function filterPreCompaction(messages: SessionMessage[]): SessionMessage[] {
  let lastCompactionIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.info?.role === "user" && msg.parts?.some((p) => p.type === "compaction")) {
      lastCompactionIdx = i;
      break;
    }
  }
  if (lastCompactionIdx <= 0) return messages;
  return messages.slice(lastCompactionIdx);
}

export function formatMessagesForDump(messages: DumpMessage[], detail = false): string {
  const filtered = filterPreCompaction(messages as SessionMessage[]);
  const lines: string[] = [];
  if (filtered.length < messages.length) {
    const dropped = messages.length - filtered.length;
    lines.push(`_(${dropped} messages before last compaction omitted)_`);
    lines.push("");
  }
  for (const msg of filtered) {
    // Skip empty assistant messages — OpenCode creates these as response
    // containers before LLM generates content. They don't represent actual
    // context sent to the model and would misleadingly appear in the dump.
    if (msg.info?.role === "assistant" && (!msg.parts || msg.parts.length === 0)) {
      continue;
    }

    const role = getDumpMessageRole(msg);
    lines.push(`### ROLE: [${role.toUpperCase()}]`);

    const time = getDumpMessageTime(msg);
    if (time) {
      const timeStr =
        typeof time === "string"
          ? time
          : time.created
            ? new Date(time.created).toISOString()
            : undefined;
      if (timeStr) lines.push(`_Time: ${timeStr}_`);
    }

    const model = msg.info?.model;
    if (model) {
      const variant = model.variant ? ` (${model.variant})` : "";
      lines.push(`_Model: ${model.providerID}/${model.modelID}${variant}_`);
    }

    const tokens = msg.info?.tokens;
    if (tokens) {
      const tp: string[] = [];
      if (tokens.input) tp.push(`in=${tokens.input}`);
      if (tokens.cache?.read) tp.push(`cache=${tokens.cache.read}`);
      if (tp.length) lines.push(`_Tokens: ${tp.join(", ")}_`);
    }

    if (msg.info?.agent) lines.push(`_Agent: ${msg.info.agent}_`);

    lines.push("");

    if (msg.parts) {
      for (const part of msg.parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatPartForDump(part as Record<string, any>, lines, detail, role);
      }
    }

    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Parse raw system blocks into structured metadata (for native OpenCode)
 *
 * Native OpenCode merges all system content into one string, so we scan
 * line-by-line and split by known markers:
 *
 * 1. "You are powered by the model" → environment
 * 2. "Instructions from:" → instruction (each occurrence = new section)
 * 3. "Skills provide specialized" → skill
 * 4. Everything before first marker → agent-prompt
 * 5. Anything unmatched → raw-block
 */
function parseRawBlocks(blocks: string[]): SystemPromptMetadata {
  const text = blocks.join("\n\n");
  if (!text.trim()) return { version: 1, sections: [] };

  const sections: SystemPromptSection[] = [];
  const lines = text.split("\n");

  let currentKind: string | null = null;
  let currentLines: string[] = [];
  let currentSource: string | undefined;

  function flush(): void {
    const content = currentLines.join("\n").trim();
    if (content && currentKind) {
      const section: SystemPromptSection = {
        kind: currentKind as SystemPromptSectionKind,
        content,
      };
      if (currentSource) section.source = currentSource;
      sections.push(section);
    }
    currentLines = [];
    currentSource = undefined;
  }

  for (const line of lines) {
    // Instruction marker — each "Instructions from:" starts a new section
    if (line.startsWith("Instructions from:")) {
      flush();
      currentKind = "instruction";
      currentSource = line.replace("Instructions from:", "").trim();
      currentLines.push(line);
      continue;
    }

    // Environment marker
    if (line.startsWith("You are powered by the model") && currentKind !== "environment") {
      flush();
      currentKind = "environment";
      currentLines.push(line);
      continue;
    }

    // Skill marker
    if (line.startsWith("Skills provide specialized") && currentKind !== "skill") {
      flush();
      currentKind = "skill";
      currentLines.push(line);
      continue;
    }

    // Default: agent-prompt for content before any marker
    if (!currentKind) {
      currentKind = "agent-prompt";
    }

    currentLines.push(line);
  }
  flush();

  return { version: 1, sections };
}

export function formatSystemPromptSections(
  metadata: SystemPromptMetadata,
  detail = false,
): string {
  const lines: string[] = [];

  if (detail) {
    for (let i = 0; i < metadata.sections.length; i++) {
      const section = metadata.sections[i];
      lines.push(`### ${i + 1}. ${section.kind}`);
      lines.push("");
      if (section.source) lines.push(`Source: ${section.source}`, "");
      lines.push(section.content, "");
    }
    return lines.join("\n");
  }

  // Simplified mode
  let idx = 0;

  const byKind = new Map<string, SystemPromptMetadata["sections"]>();
  for (const s of metadata.sections) {
    const arr = byKind.get(s.kind);
    if (arr) arr.push(s); else byKind.set(s.kind, [s]);
  }

  // Agent prompt — truncate to first 10 + last 10 lines
  const agentSections = byKind.get("agent-prompt");
  if (agentSections) {
    idx++;
    lines.push(`### ${idx}. agent-prompt`, "");
    for (const s of agentSections) {
      const contentLines = s.content.split("\n");
      if (contentLines.length <= 20) {
        lines.push("");
        lines.push("```markdown");
        lines.push(s.content);
        lines.push("```");
      } else {
        lines.push(`_(truncated: showing first 10 + last 10 of ${contentLines.length} lines)_`);
        lines.push("");
        lines.push("```markdown");
        lines.push(...contentLines.slice(0, 10));
        lines.push(`... (${contentLines.length - 20} lines omitted)`);
        lines.push(...contentLines.slice(-10));
        lines.push("```");
      }
      lines.push("");
    }
  }

  // Environment — full output
  const envSections = byKind.get("environment");
  if (envSections) {
    for (const s of envSections) {
      idx++;
      lines.push(`### ${idx}. environment`, "");
      lines.push(s.content, "");
    }
  }

  // Instructions — merge into one section, list sources only
  const instructionSections = byKind.get("instruction");
  if (instructionSections && instructionSections.length > 0) {
    idx++;
    lines.push(`### ${idx}. instructions`, "");
    lines.push("Sources:");
    for (const s of instructionSections) {
      lines.push(`- ${s.source ?? "(unknown)"}`);
    }
    lines.push("");
  }

  // Skills — count + name list
  const skillSections = byKind.get("skill");
  if (skillSections) {
    idx++;
    lines.push(`### ${idx}. skill`, "");
    for (const s of skillSections) {
      const names = extractSkillNames(s.content);
      if (names.length > 0) {
        lines.push(`${names.length} skills: ${names.join(", ")}`);
      } else {
        lines.push(s.content);
      }
    }
    lines.push("");
  }

  // User-system — always show, display _empty_ if no content
  idx++;
  lines.push(`### ${idx}. user-system`, "");
  const userSystemSections = byKind.get("user-system");
  if (userSystemSections && userSystemSections.length > 0) {
    const mergedContent = userSystemSections
      .map((s) => s.content ?? "")
      .join("\n\n")
      .trim();
    lines.push(mergedContent || "_empty_", "");
  } else {
    lines.push("_empty_", "");
  }

  // All other kinds — truncate if > 20 lines (provider-prompt, structured-output, custom, etc.)
  const handledKinds = new Set(["agent-prompt", "environment", "instruction", "skill", "user-system"]);
  for (const s of metadata.sections) {
    if (handledKinds.has(s.kind)) continue;
    idx++;
    lines.push(`### ${idx}. ${s.kind}`, "");
    if (s.source) lines.push(`Source: ${s.source}`, "");
    const contentLines = s.content.split("\n");
    if (contentLines.length <= 20) {
      lines.push("");
      lines.push("```markdown");
      lines.push(s.content);
      lines.push("```");
    } else {
      lines.push(`_(truncated: showing first 10 + last 10 of ${contentLines.length} lines)_`);
      lines.push("");
      lines.push("```markdown");
      lines.push(...contentLines.slice(0, 10));
      lines.push(`... (${contentLines.length - 20} lines omitted)`);
      lines.push(...contentLines.slice(-10));
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function extractSkillNames(content: string): string[] {
  const matches = content.matchAll(/<name>([^<]+)<\/name>/g);
  const names: string[] = [];
  for (const m of matches) {
    names.push(m[1]);
  }
  return names;
}

export interface ContextDumpOptions {
  sessionID: string;
  baseDir: string;
  filenamePrefix: string;
  systemSnapshots: Map<string, string[]>;
  systemMetadataMap: Map<string, SystemPromptMetadata>;
systemInjectionsMap?: Map<string, string[]> | undefined;
  transformedMessagesMap?: Map<string, MessageWithInfo[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  detail: boolean;
  title?: string | null;
}

export interface ContextDumpResult {
  filepath: string;
  hasMetadata: boolean;
  parsedFromRaw: boolean;
  blockCount: number;
  injectionCount: number;
  messageCount: number;
}

export async function writeContextDump(options: ContextDumpOptions): Promise<ContextDumpResult> {
  const {
    sessionID,
    baseDir,
    filenamePrefix,
    systemSnapshots,
    systemMetadataMap,
    systemInjectionsMap,
    transformedMessagesMap,
    client,
    detail,
    title,
  } = options;

  const logsDir = join(baseDir, "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const ts = localTimestamp();
  const shortID = sessionID.replace(/^ses_/, "").slice(0, 12);
  const filename = `${ts}-${filenamePrefix}-${shortID}.md`;
  const filepath = join(logsDir, filename);

  const lines: string[] = [
    filenamePrefix.includes("AUTO") ? "# Auto Context Dump" : "# Context Dump",
    "",
    `- **Session ID:** ${sessionID}`,
    `- **Time:** ${localDateTimeStr()}`,
  ];

  if (title) {
    lines.push(`- **Title:** ${title}`);
  }
  lines.push("", "---", "");

  const metadata = systemMetadataMap.get(sessionID);
  const snapshot = systemSnapshots.get(sessionID);
  const injections = systemInjectionsMap?.get(sessionID);

  // Exclude plugin injections from raw blocks before parsing
  const rawBlocks = snapshot && injections && injections.length > 0
    ? snapshot.slice(0, snapshot.length - injections.length)
    : snapshot;

  // Determine effective metadata: use provided metadata, or parse raw blocks
  const effectiveMetadata = metadata ?? (rawBlocks && rawBlocks.length > 0 ? parseRawBlocks(rawBlocks) : undefined);

  if (effectiveMetadata) {
    const isParsed = !metadata && snapshot && snapshot.length > 0;
    lines.push(isParsed ? `## System Prompt _(parsed from raw: ${snapshot.length} blocks)_` : "## System Prompt _(structured)_");
    lines.push("");
    lines.push(formatSystemPromptSections(effectiveMetadata, detail));

    // Plugin Injections — always show block, display _empty_ if none
    lines.push("---", "");
    lines.push("## Plugin Injections");
    lines.push("");
    if (injections && injections.length > 0) {
      for (let i = 0; i < injections.length; i++) {
        lines.push(`### Injection ${i + 1}`);
        lines.push("");
        lines.push(injections[i]);
        lines.push("");
      }
    } else {
      lines.push("_empty_", "");
    }
  } else if (snapshot && snapshot.length > 0) {
    // Fallback: raw dump when parsing failed (should not happen normally)
    lines.push(`## System Prompt _(raw blocks: ${snapshot.length})_`);
    lines.push("");
    for (let i = 0; i < snapshot.length; i++) {
      lines.push(`### Block ${i + 1}`);
      lines.push("");
      lines.push(snapshot[i]);
      lines.push("");
    }
  } else {
    lines.push("## System Prompt");
    lines.push("");
    lines.push("(No snapshot available — system prompt was not captured for this session)");
    lines.push("");
  }

  lines.push("---", "");
  lines.push("## Messages");
  lines.push("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: DumpMessage[] = [];

  // Priority: use transformedMessagesMap (contains synthetic parts)
  const transformed = transformedMessagesMap?.get(sessionID);
  if (transformed && transformed.length > 0) {
    messages = transformed;
  } else {
    // Fallback: load from DB
    try {
      if (client && typeof client?.session?.messages === "function") {
        const result = await client.session.messages({ path: { id: sessionID } });
        messages = result?.data ?? [];
      }
    } catch {
      // Graceful degradation
    }
  }

  if (messages.length > 0) {
    lines.push(`_(${messages.length} messages)_`);
    lines.push("");
    lines.push(formatMessagesForDump(messages, detail));
  } else {
    lines.push("(No messages)");
    lines.push("");
  }

  writeFileSync(filepath, lines.join("\n"), "utf-8");

  debugLog(`dump written: ${filename} (${messages.length} msgs, ${effectiveMetadata ? "structured" : "raw"})`);

  return {
    filepath,
    hasMetadata: !!effectiveMetadata,
    parsedFromRaw: !metadata && !!effectiveMetadata,
    blockCount: snapshot?.length ?? 0,
    injectionCount: injections?.length ?? 0,
    messageCount: messages.length,
  };
}
