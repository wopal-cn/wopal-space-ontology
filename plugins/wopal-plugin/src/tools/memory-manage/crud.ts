import type { MemoryStore, MemoryCategory } from "../../memory/store.js";
import type { EmbeddingClient } from "../../memory/embedder.js";
import type { SessionStore } from "../../session-store.js";
import { getCategoryLabel, formatTime, ECHO_REMINDER } from "./formatters.js";
import {
  loadAllMemories,
  resolveMemoryByShortId,
  mergeSearchResults,
  sortByCreatedAt,
  filterByCategory,
  sliceWithPagination,
} from "./query-helpers.js";

const VALID_CATEGORIES: MemoryCategory[] = [
  "profile", "preference", "knowledge", "fact", "gotcha", "experience", "requirement",
];

interface AddOptions {
  sessionId: string;
  importance: number;
  project: string;
  tags: string[];
}

interface UpdateOptions {
  text?: string;
  category?: MemoryCategory;
  importance?: number;
  project?: string;
  tags?: string[];
}

export async function formatList(
  store: MemoryStore,
  category?: string,
  limit?: number
): Promise<string> {
  const all = await loadAllMemories(store);
  const sorted = sortByCreatedAt(all);
  const filtered = filterByCategory(sorted, category);
  const { displayed, total, remaining } = sliceWithPagination(filtered, limit);

  const lines: string[] = [
    `共 ${total} 条记忆${category ? ` (${getCategoryLabel(category)})` : ""}\n`,
  ];

  for (let i = 0; i < displayed.length; i++) {
    const r = displayed[i];
    const tags = r.tags || "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${formatTime(r.created_at)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${tags}]`);
    lines.push(r.text);
    lines.push("");
  }

  if (remaining > 0) {
    lines.push(`... 还有 ${remaining} 条未显示`);
  }

  return lines.join("\n");
}

export async function formatStats(store: MemoryStore): Promise<string> {
  const all = await loadAllMemories(store);
  const categories: Record<string, number> = {};
  let totalImportance = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const r of all) {
    categories[r.category] = (categories[r.category] ?? 0) + 1;
    totalImportance += r.importance;
    if (r.created_at < oldest) oldest = r.created_at;
    if (r.created_at > newest) newest = r.created_at;
  }

  const lines: string[] = [
    `记忆总数: ${all.length}`,
    `时间跨度: ${oldest < Infinity ? formatTime(oldest) : "N/A"} ~ ${newest > 0 ? formatTime(newest) : "N/A"}`,
    `平均重要性: ${all.length > 0 ? (totalImportance / all.length).toFixed(2) : "N/A"}`,
    "",
    "分类分布:",
  ];

  for (const [cat, count] of Object.entries(categories).sort(
    (a, b) => b[1] - a[1]
  )) {
    const bar = "█".repeat(Math.round((count / all.length) * 20));
    lines.push(`  ${getCategoryLabel(cat)} (${cat}): ${count} ${bar}`);
  }

  return lines.join("\n");
}

export async function formatSearch(
  store: MemoryStore,
  query: string,
  tags?: string
): Promise<string> {
  if (!query && !tags) return "用法: search 需要 query 或 tags 参数";

  const fullQuery = tags
    ? `${query} ${tags.replace(/,/g, " ")}`.trim()
    : query;

  const results = await store.searchByQuery(fullQuery, 20, "fts");
  const likeResults = await store.searchByQuery(query || "", 20, "like");
  const merged = mergeSearchResults(results, likeResults);

  if (merged.length === 0) {
    return `搜索 "${fullQuery}" — 无结果`;
  }

  const lines = [`搜索 "${fullQuery}" — 找到 ${merged.length} 条结果\n`];

  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    const tagsDisplay = r.tags || "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${tagsDisplay}]`);
    lines.push(r.text);
    lines.push("");
  }

  return lines.join("\n");
}

export async function deleteMemories(
  store: MemoryStore,
  ids: string
): Promise<string> {
  const rawIds = ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawIds.length === 0) {
    return "用法: delete 需要 id 参数（记忆 ID，逗号分隔多个）。ID 从 list/search 结果方括号中获取";
  }

  // Load all memories once for short ID resolution
  const allMemories = await loadAllMemories(store);

  const toDelete: { fullId: string; shortId: string; text: string }[] = [];
  const notFound: string[] = [];

  for (const rawId of rawIds) {
    const memory = await resolveMemoryByShortId(store, rawId, allMemories);
    if (memory) {
      toDelete.push({ fullId: memory.id, shortId: memory.id.slice(0, 8), text: memory.text.slice(0, 80) });
    } else {
      notFound.push(rawId);
    }
  }

  if (toDelete.length === 0) {
    return `未找到 ID 为 ${rawIds.join(", ")} 的记忆`;
  }

  const lines: string[] = ["即将删除以下记忆：\n"];
  for (const item of toDelete) {
    lines.push(`  [${item.shortId}] ${item.text}`);
  }
  if (notFound.length > 0) {
    lines.push("");
    for (const id of notFound) {
      lines.push(`  [${id}] — 未找到`);
    }
  }
  lines.push("");

  for (const item of toDelete) {
    await store.delete(item.fullId);
  }

  lines.push(
    `已删除 ${toDelete.length} 条记忆${notFound.length > 0 ? `，${notFound.length} 条未找到` : ""}`
  );

  return lines.join("\n");
}

export async function addMemory(
  store: MemoryStore,
  embedder: EmbeddingClient | undefined,
  text: string,
  category: MemoryCategory | undefined,
  options: AddOptions,
): Promise<string> {
  if (!text || text.trim().length < 20) {
    return `添加失败：记忆正文至少需要 20 字符（当前 ${text.trim().length} 字符）`;
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return `添加失败：必须指定有效分类（${VALID_CATEGORIES.join("/")})`;
  }

  if (!embedder) {
    return "添加失败：Embedding 服务不可用";
  }

  try {
    const embedding = await embedder.embedSingle(text.trim());
    const vector = embedder.toFloat32Array(embedding);

    const memory = await store.add({
      text: text.trim(),
      vector,
      category,
      project: options.project,
      session_id: options.sessionId,
      importance: options.importance,
      tags: options.tags,
    });

    return [
      "添加成功！",
      `  ID: ${memory.id}`,
      `  分类: ${getCategoryLabel(category)}`,
      `  项目: ${options.project}`,
      `  重要性: ${options.importance}`,
      `  标签: ${options.tags.join(", ") || "(无)"}`,
      `  正文: ${memory.text.slice(0, 100)}${memory.text.length > 100 ? "..." : ""}`,
    ].join("\n") + ECHO_REMINDER;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `添加失败：${message}`;
  }
}

export async function updateMemory(
  store: MemoryStore,
  embedder: EmbeddingClient | undefined,
  rawId: string,
  options: UpdateOptions,
): Promise<string> {
  if (!rawId) {
    return "更新失败：必须指定 id 参数（记忆 ID，从 list/search 结果方括号中获取）";
  }

  // Load all memories once for short ID resolution
  const allMemories = await loadAllMemories(store);
  const memory = await resolveMemoryByShortId(store, rawId, allMemories);

  if (!memory) {
    return `更新失败：未找到 ID 为 ${rawId} 的记忆`;
  }

  const hasChanges = options.text !== undefined || options.category !== undefined ||
    options.importance !== undefined || options.project !== undefined || options.tags !== undefined;

  if (!hasChanges) {
    return "更新失败：未提供任何需要修改的字段";
  }

  try {
    const updates: Record<string, unknown> = {};

    if (options.text !== undefined) {
      const trimmed = options.text.trim();
      if (trimmed.length < 20) {
        return `更新失败：记忆正文至少需要 20 字符（当前 ${trimmed.length} 字符）`;
      }
      updates.text = trimmed;

      if (embedder) {
        const embedding = await embedder.embedSingle(trimmed);
        updates.vector = embedder.toFloat32Array(embedding);
      }
    }

    if (options.category !== undefined) {
      if (!VALID_CATEGORIES.includes(options.category)) {
        return `更新失败：无效分类（${VALID_CATEGORIES.join("/")})`;
      }
      updates.category = options.category;
    }

    if (options.importance !== undefined) {
      updates.importance = options.importance;
    }

    if (options.project !== undefined) {
      updates.project = options.project;
    }

    if (options.tags !== undefined) {
      updates.tags = options.tags.join(",");
    }

    await store.update(memory.id, updates);

    return [
      "更新成功！",
      `  ID: ${memory.id}`,
      options.text !== undefined ? `  正文: ${options.text.trim().slice(0, 100)}${options.text.trim().length > 100 ? "..." : ""}` : null,
      options.category !== undefined ? `  分类: ${getCategoryLabel(options.category)}` : null,
      options.importance !== undefined ? `  重要性: ${options.importance}` : null,
      options.project !== undefined ? `  项目: ${options.project}` : null,
      options.tags !== undefined ? `  标签: ${options.tags.join(", ") || "(无)"}` : null,
    ].filter(Boolean).join("\n") + ECHO_REMINDER;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `更新失败：${message}`;
  }
}

export async function formatInjected(
  sessionStore: SessionStore | undefined,
  sessionID: string | undefined,
): Promise<string> {
  if (!sessionStore || !sessionID) {
    return "无法获取注入记忆：缺少会话信息";
  }

  const state = sessionStore.snapshot(sessionID);
  const rawText = state?.injectedRawText;

  if (!rawText) {
    return "当前会话未注入任何记忆";
  }

  return rawText;
}