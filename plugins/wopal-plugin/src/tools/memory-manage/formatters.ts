import type { PreviewCandidate } from "../../memory/distill.js";

export const ECHO_REMINDER_DISTILL = [
  "",
  "重要：调用本工具后，你必须将以上完整蒸馏结果逐字展示给用户。用户无法看到工具内部输出，依赖你主动展示。",
  "每条候选记忆必须完整展示所有字段（正文、分类、重要性、标签），严禁省略、摘要或概括。",
  "distill 后必须等用户确认才能执行 confirm，严禁跳过展示直接 confirm。",
].join("\n");

export const ECHO_REMINDER = [
  "",
  "重要：你必须将以上完整结果逐字展示给用户。用户无法看到工具内部输出，依赖你主动展示。",
  "每条记忆必须完整展示所有字段（ID、时间、分类、重要性、标签、正文），严禁省略、摘要或概括。",
].join("\n");

const CATEGORY_LABELS: Record<string, string> = {
  profile: "画像",
  preference: "偏好",
  knowledge: "知识",
  fact: "事实",
  gotcha: "避坑方法",
  experience: "经验",
  requirement: "用户要求",
};

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function padTime(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${padTime(d.getMonth() + 1)}-${padTime(d.getDate())} ${padTime(d.getHours())}:${padTime(d.getMinutes())}:${padTime(d.getSeconds())}`;
}

export function formatPreviewReport(
  candidates: PreviewCandidate[],
  title: string | null,
  messageCount: number,
): string {
  const lines: string[] = [];

  lines.push("## 🔍 Distillation Preview");
  lines.push("");
  lines.push(`**Session Messages:** ${messageCount}`);
  lines.push(`**Candidates Found:** ${candidates.length}`);

  if (title) {
    lines.push(`**Suggested Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Candidate Memories");
  lines.push("");

  candidates.forEach((candidate, index) => {
    lines.push(`**[${index}] ${candidate.body.split("\n")[0]}**`);
    const bodyContent = candidate.body.slice(candidate.body.indexOf("\n") + 1);
    if (bodyContent) {
      const indentedBody = bodyContent
        .split("\n")
        .map((line) => (line ? `   ${line}` : "   "))
        .join("\n");
      lines.push(indentedBody);
    }
    lines.push(
      `   Category: \`${candidate.category}\` | Importance: ${candidate.importance}/10 | Tags: ${candidate.tags.join(", ") || "none"}`,
    );
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push("**Next Steps:**");
  lines.push(
    "- To write all candidates: `memory_manage command=confirm`",
  );
  lines.push(
    "- To write specific candidates: `memory_manage command=confirm selectedIndices=[0,2,5]`",
  );
  lines.push("- To cancel: `memory_manage command=cancel`");

  return lines.join("\n");
}

export function formatConfirmReportWithDedup(
  selected: PreviewCandidate[],
  title: string | null,
  result: { created: number; merged: number; skipped: number; mergeDetails?: Array<{ existingId: string; existingPreview: string; mergedPreview: string }> },
): string {
  const lines: string[] = [];

  lines.push("## ✅ Distillation Complete (with Deduplication)");
  lines.push("");
  lines.push(
    `**Selected:** ${selected.length} | **Created:** ${result.created} | **Merged:** ${result.merged} | **Skipped:** ${result.skipped}`,
  );

  if (title) {
    lines.push(`**Session Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Written Memories");
  lines.push("");

  selected.forEach((m, i) => {
    lines.push(
      `**[${i}] ${m.category} | 重要性: ${m.importance}/10 | 标签: ${m.tags.join(", ") || "none"}**`,
    );
    lines.push(m.body);
    lines.push("");
  });

  if (result.mergeDetails && result.mergeDetails.length > 0) {
    lines.push("### Merge Details");
    lines.push("");
    for (const md of result.mergeDetails) {
      lines.push(`- Merged into \`${md.existingId}\`:`);
      lines.push(`  - Before: ${md.existingPreview}`);
      lines.push(`  - After: ${md.mergedPreview}`);
    }
    lines.push("");
  }

  if (result.skipped > 0) {
    lines.push(
      `> ℹ️ ${result.skipped} candidate(s) skipped as duplicates`,
    );
  }

  return lines.join("\n");
}