import type { SystemPromptMetadata, SystemPromptSection, SystemPromptSectionKind } from "../types.js";

/**
 * Parse raw system blocks into structured metadata (for native OpenCode)
 * Scans line-by-line and splits by known markers:
 * 1. "You are powered by the model" → environment
 * 2. "Instructions from:" → instruction (each occurrence = new section)
 * 3. "Skills provide specialized" → skill
 * 4. Everything before first marker → agent-prompt
 * 5. Anything unmatched → raw-block
 */
export function parseRawBlocks(blocks: string[]): SystemPromptMetadata {
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
      const section: SystemPromptSection = { kind: currentKind as SystemPromptSectionKind, content };
      if (currentSource) section.source = currentSource;
      sections.push(section);
    }
    currentLines = [];
    currentSource = undefined;
  }

  for (const line of lines) {
    if (line.startsWith("Instructions from:")) {
      flush(); currentKind = "instruction";
      currentSource = line.replace("Instructions from:", "").trim();
      currentLines.push(line); continue;
    }
    if (line.startsWith("You are powered by the model") && currentKind !== "environment") {
      flush(); currentKind = "environment"; currentLines.push(line); continue;
    }
    if (line.startsWith("Skills provide specialized") && currentKind !== "skill") {
      flush(); currentKind = "skill"; currentLines.push(line); continue;
    }
    if (!currentKind) currentKind = "agent-prompt";
    currentLines.push(line);
  }
  flush();
  return { version: 1, sections };
}

export function formatSystemPromptSections(metadata: SystemPromptMetadata, detail = false): string {
  if (detail) return formatDetail(metadata);
  return formatSimplified(metadata);
}

function formatDetail(metadata: SystemPromptMetadata): string {
  const lines: string[] = [];
  for (let i = 0; i < metadata.sections.length; i++) {
    const section = metadata.sections[i];
    lines.push(`### ${i + 1}. ${section.kind}`, "");
    if (section.source) lines.push(`Source: ${section.source}`, "");
    lines.push(section.content, "");
  }
  return lines.join("\n");
}

function formatSimplified(metadata: SystemPromptMetadata): string {
  const lines: string[] = [];
  let idx = 0;
  const byKind = groupSectionsByKind(metadata);
  idx = renderAgentPrompt(lines, idx, byKind);
  idx = renderEnvironment(lines, idx, byKind);
  idx = renderInstructions(lines, idx, byKind);
  idx = renderSkills(lines, idx, byKind);
  idx = renderUserSystem(lines, idx, byKind);
  renderOtherKinds(lines, idx, metadata);
  return lines.join("\n");
}

function groupSectionsByKind(metadata: SystemPromptMetadata): Map<string, SystemPromptSection[]> {
  const byKind = new Map<string, SystemPromptSection[]>();
  for (const s of metadata.sections) {
    const arr = byKind.get(s.kind);
    if (arr) arr.push(s); else byKind.set(s.kind, [s]);
  }
  return byKind;
}

function renderTruncatedContent(lines: string[], content: string): void {
  const contentLines = content.split("\n");
  if (contentLines.length <= 20) {
    lines.push("", "```markdown", content, "```");
  } else {
    lines.push(`_(truncated: showing first 10 + last 10 of ${contentLines.length} lines)_`, "");
    lines.push("```markdown", ...contentLines.slice(0, 10));
    lines.push(`... (${contentLines.length - 20} lines omitted)`);
    lines.push(...contentLines.slice(-10), "```");
  }
  lines.push("");
}

function renderAgentPrompt(lines: string[], idx: number, byKind: Map<string, SystemPromptSection[]>): number {
  const sections = byKind.get("agent-prompt");
  if (!sections) return idx;
  idx++;
  lines.push(`### ${idx}. agent-prompt`, "");
  for (const s of sections) { renderTruncatedContent(lines, s.content); }
  return idx;
}

function renderEnvironment(lines: string[], idx: number, byKind: Map<string, SystemPromptSection[]>): number {
  const sections = byKind.get("environment");
  if (!sections) return idx;
  for (const s of sections) { idx++; lines.push(`### ${idx}. environment`, "", s.content, ""); }
  return idx;
}

function renderInstructions(lines: string[], idx: number, byKind: Map<string, SystemPromptSection[]>): number {
  const sections = byKind.get("instruction");
  if (!sections || sections.length === 0) return idx;
  idx++;
  lines.push(`### ${idx}. instructions`, "", "Sources:");
  for (const s of sections) lines.push(`- ${s.source ?? "(unknown)"}`);
  lines.push("");
  return idx;
}

function renderSkills(lines: string[], idx: number, byKind: Map<string, SystemPromptSection[]>): number {
  const sections = byKind.get("skill");
  if (!sections) return idx;
  idx++;
  lines.push(`### ${idx}. skill`, "");
  for (const s of sections) {
    const names = extractSkillNames(s.content);
    lines.push(names.length > 0 ? `${names.length} skills: ${names.join(", ")}` : s.content);
  }
  lines.push("");
  return idx;
}

function renderUserSystem(lines: string[], idx: number, byKind: Map<string, SystemPromptSection[]>): number {
  idx++;
  lines.push(`### ${idx}. user-system`, "");
  const sections = byKind.get("user-system");
  if (sections && sections.length > 0) {
    const merged = sections.map((s) => s.content ?? "").join("\n\n").trim();
    lines.push(merged || "_empty_", "");
  } else { lines.push("_empty_", ""); }
  return idx;
}

function renderOtherKinds(lines: string[], idx: number, metadata: SystemPromptMetadata): void {
  const handled = new Set(["agent-prompt", "environment", "instruction", "skill", "user-system"]);
  for (const s of metadata.sections) {
    if (handled.has(s.kind)) continue;
    idx++;
    lines.push(`### ${idx}. ${s.kind}`, "");
    if (s.source) lines.push(`Source: ${s.source}`, "");
    renderTruncatedContent(lines, s.content);
  }
}

function extractSkillNames(content: string): string[] {
  const names: string[] = [];
  for (const m of content.matchAll(/<name>([^<]+)<\/name>/g)) names.push(m[1]);
  return names;
}
