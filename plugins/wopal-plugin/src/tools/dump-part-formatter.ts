import { truncateLines, formatContent } from "./dump-format-utils.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatPartForDump(part: Record<string, any>, lines: string[], detail: boolean, role?: string): void {
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

  if (t === "snapshot") {
    if (detail) {
      lines.push(`#### PART: [Snapshot]`);
      if (part.snapshot) {
        const contentLines = part.snapshot.split("\n");
        lines.push(...contentLines);
      }
    } else {
      const snapshotStr = typeof part.snapshot === "string" ? part.snapshot : "";
      const contentLines = snapshotStr.split("\n");
      const addMatch = contentLines.filter((l) => l.startsWith("+")).length;
      const delMatch = contentLines.filter((l) => l.startsWith("-")).length;
      lines.push(`#### PART: [Snapshot${addMatch || delMatch ? `: +${addMatch}/-${delMatch}` : ""}]`);
    }
    lines.push("");
    return;
  }

  if (t === "patch") {
    if (detail) {
      lines.push(`#### PART: [Patch]`);
      if (part.hash) lines.push(`_Hash: ${part.hash}_`);
      if (part.files && part.files.length > 0) {
        lines.push("_Files:_");
        for (const f of part.files) {
          lines.push(`  - ${f}`);
        }
      }
    } else {
      const fileCount = part.files?.length ?? 0;
      const fileList = fileCount > 0
        ? part.files.slice(0, 3).join(", ") + (fileCount > 3 ? ` +${fileCount - 3} more` : "")
        : "none";
      lines.push(`#### PART: [Patch: ${fileCount} file(s)]`);
      lines.push(`_${fileList}_`);
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