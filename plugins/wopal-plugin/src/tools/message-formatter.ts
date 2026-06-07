import type { SessionMessage } from "../types.js";
import type { MessageWithInfo } from "../hooks/message-context.js";
import { formatPartForDump } from "./dump-part-formatter.js";

// Compatible message type for dump formatter
export type DumpMessage = SessionMessage | MessageWithInfo;

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

export function filterPreCompaction(messages: SessionMessage[]): SessionMessage[] {
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
  const lines: string[] = [];
  let lastRole = "";
  for (const msg of messages) {
    // Skip empty assistant messages — OpenCode creates these as response
    // containers before LLM generates content. They don't represent actual
    // context sent to the model and would misleadingly appear in the dump.
    if (msg.info?.role === "assistant" && (!msg.parts || msg.parts.length === 0)) {
      continue;
    }

    const role = getDumpMessageRole(msg);
    // Annotate consecutive same-role messages (OpenCode splits multi-part turns)
    if (role === lastRole && role !== "unknown") {
      lines.push(`> _[continuation of previous ${role} turn]_`);
      lines.push("");
    }
    lastRole = role;
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

    const model = (msg.info as SessionMessage['info'])?.model;
    if (model) {
      const variant = model.variant ? ` (${model.variant})` : "";
      lines.push(`_Model: ${model.providerID}/${model.modelID}${variant}_`);
    }

    const tokens = (msg.info as SessionMessage['info'])?.tokens;
    if (tokens) {
      const tp: string[] = [];
      if (tokens.input) tp.push(`in=${tokens.input}`);
      if (tokens.cache?.read) tp.push(`cache=${tokens.cache.read}`);
      if (tp.length) lines.push(`_Tokens: ${tp.join(", ")}_`);
    }

    if ((msg.info as SessionMessage['info'])?.agent) lines.push(`_Agent: ${(msg.info as SessionMessage['info'])!.agent}_`);

    lines.push("");

    if (msg.parts) {
      let hasCompaction = false;
      for (const part of msg.parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatPartForDump(part as Record<string, any>, lines, detail, role);
        if (part.type === "compaction") hasCompaction = true;
      }
      if (hasCompaction) {
        lines.push("> _Messages below this point may be a retained tail from before compaction. Timestamps may appear non-sequential._");
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}
