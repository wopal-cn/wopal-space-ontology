/**
 * Dump Formatter - Context dump assembly and export
 *
 * Aggregates utilities from dump-format-utils, message-formatter,
 * and system-prompt-formatter into the main writeContextDump entry point.
 */

import type { SystemPromptMetadata } from "../types.js";
import type { MessageWithInfo } from "../hooks/message-context.js";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { localTimestamp, localDateTimeStr, findInMap } from "./dump-format-utils.js";
import type { DumpMessage } from "./message-formatter.js";
import { formatMessagesForDump, filterPreCompaction } from "./message-formatter.js";
import { parseRawBlocks, formatSystemPromptSections } from "./system-prompt-formatter.js";

// Re-export for backward compatibility with consumers
export { localTimestamp, localDateTimeStr, findActualKey } from "./dump-format-utils.js";
export { formatMessagesForDump, filterPreCompaction } from "./message-formatter.js";
export type { DumpMessage } from "./message-formatter.js";
export { parseRawBlocks, formatSystemPromptSections } from "./system-prompt-formatter.js";

export interface ContextDumpOptions {
  sessionID: string;
  baseDir: string;
  filenamePrefix: string;
  systemSnapshots: Map<string, string[]>;
  systemMetadataMap: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]> | undefined;
  transformedMessagesMap?: Map<string, MessageWithInfo[]>;
  client: unknown;
  detail: boolean;
  title?: string | null;
}

export interface ContextDumpResult {
  filepath: string;
  hasMetadata: boolean;
  parsedFromRaw: boolean;
  blockCount: number;
  messageCount: number;
}

const MAX_AUTO_DUMPS = 10;

function cleanupOldAutoDumps(logsDir: string): void {
  try {
    const files = readdirSync(logsDir)
      .filter(f => f.includes("AUTO-CTXDUMP"))
      .sort();

    // Group by session shortID (last segment before .md)
    const groups = new Map<string, string[]>();
    for (const f of files) {
      const base = f.replace(/\.md$/, "");
      const shortID = base.split("-").pop() ?? "";
      if (!groups.has(shortID)) groups.set(shortID, []);
      groups.get(shortID)!.push(f);
    }

    for (const [, groupFiles] of groups) {
      if (groupFiles.length <= MAX_AUTO_DUMPS) continue;
      const toDelete = groupFiles.slice(0, groupFiles.length - MAX_AUTO_DUMPS);
      for (const f of toDelete) {
        unlinkSync(join(logsDir, f));
      }
    }
  } catch {
    // Graceful: cleanup failure must not break dump writing
  }
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

  const metadata = findInMap(systemMetadataMap, sessionID);
  const snapshot = findInMap(systemSnapshots, sessionID);
  const injections = systemInjectionsMap ? findInMap(systemInjectionsMap, sessionID) : undefined;

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

    // Plugin Injections — only show when actual injections exist
    if (injections && injections.length > 0) {
      lines.push("---", "");
      lines.push("## Plugin Injections");
      lines.push("");
      for (let i = 0; i < injections.length; i++) {
        lines.push(`### Injection ${i + 1}`);
        lines.push("");
        lines.push(injections[i]);
        lines.push("");
      }
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

  let messages: DumpMessage[] = [];

  // Priority: use transformedMessagesMap (contains synthetic parts)
  const transformed = transformedMessagesMap ? findInMap(transformedMessagesMap, sessionID) : undefined;
  if (transformed && transformed.length > 0) {
    messages = transformed;
  } else {
    // Fallback: load from DB
    try {
      const c = client as { session?: { messages?: (args: { path: { id: string } }) => Promise<{ data?: unknown[] }> } };
      if (c && typeof c?.session?.messages === "function") {
        const result = await c.session.messages({ path: { id: sessionID } });
        messages = (result?.data ?? []) as DumpMessage[];
      }
    } catch {
      // Graceful degradation
    }
  }

  if (messages.length > 0) {
    // Only apply pre-compaction filter to DB messages (chronological order).
    // Hook-sourced messages (transformedMessagesMap) are already post-compaction
    // active context — filtering would break on the compaction-at-start ordering.
    const isFromDB = !transformed || transformed.length === 0;
    let omittedCount = 0;
    if (isFromDB) {
      const beforeFilter = messages.length;
      messages = filterPreCompaction(messages as Parameters<typeof filterPreCompaction>[0]) as DumpMessage[];
      omittedCount = beforeFilter - messages.length;
    }
    lines.push(`_(${messages.length} messages)_`);
    if (omittedCount > 0) {
      lines.push(`_(${omittedCount} messages before last compaction omitted)_`);
    }
    lines.push("");
    lines.push(formatMessagesForDump(messages, detail));
  } else {
    lines.push("(No messages)");
    lines.push("");
  }

  writeFileSync(filepath, lines.join("\n"), "utf-8");

  // Cleanup old auto dumps: keep only the 10 most recent
  cleanupOldAutoDumps(logsDir);

  return {
    filepath,
    hasMetadata: !!effectiveMetadata,
    parsedFromRaw: !metadata && !!effectiveMetadata,
    blockCount: snapshot?.length ?? 0,
    messageCount: messages.length,
  };
}
