import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { MemoryStore, MemoryCategory } from "../../memory/store.js";
import type { EmbeddingClient } from "../../memory/embedder.js";
import type { SessionStore } from "../../session-store.js";
import type { DistillEngine } from "../../memory/distill.js";
import { clearPendingConfirmation } from "../../memory/distill.js";
import { ECHO_REMINDER } from "./formatters.js";
import { formatList, formatStats, formatSearch, deleteMemories, addMemory, updateMemory, formatInjected } from "./crud.js";
import { handleDistill, handleConfirm } from "./distill.js";

export function createMemoryManageTool(
  store: MemoryStore,
  embedder?: EmbeddingClient,
  sessionStore?: SessionStore,
  distillEngine?: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): ToolDefinition {
  return tool({
    description:
      "管理 LanceDB 中的长期记忆。子命令: list（列出全部）, stats（统计）, search（搜索）, delete（删除）, add（添加单条）, update（更新单条）, injected（查看当前上下文注入的记忆）。 " +
      "Distill current session: distill（预览候选）, confirm（写入数据库）, cancel（丢弃候选）。\n\n" +
      "展示义务区分：\n" +
      "- list/add/update/delete：需展示给用户（用户 CRUD 操作，必须逐字完整展示，严禁省略）\n" +
      "- search/stats/injected：仅供内部参考（Agent 自主调用时无需展示；用户通过 /memory 命令发起时由命令层控制展示）\n\n" +
      "参数用法：search 用 query（关键词）；delete 用 id（记忆 ID，逗号分隔多个）；update 用 id + 要修改的字段。id 从 list/search 结果的方括号中获取（如 [53cc9388] → id=\"53cc9388\"）。禁止将正文内容作为 id 传入。",
    args: {
      command: tool.schema
        .enum(["list", "stats", "search", "delete", "add", "update", "injected", "distill", "confirm", "cancel"])
        .describe("子命令"),
      query: tool.schema
        .string()
        .optional()
        .describe("search 时为搜索关键词（FTS + LIKE 混合检索）"),
      category: tool.schema
        .string()
        .optional()
        .describe("分类（profile/preference/knowledge/fact/gotcha/experience/requirement）。add 必填，update 可选"),
      limit: tool.schema
        .number()
        .optional()
        .describe("list 最大显示条数"),
      text: tool.schema
        .string()
        .optional()
        .describe("add/update 的记忆正文（add 至少 20 字符）"),
      importance: tool.schema
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("重要性（0-1，add 默认 0.5）"),
      project: tool.schema
        .string()
        .optional()
        .describe("所属项目（add 默认 wopal-space）"),
      tags: tool.schema
        .string()
        .optional()
        .describe("逗号分隔的关键词，用于精确检索"),
      id: tool.schema
        .string()
        .optional()
        .describe("记忆 ID（从 list/search 结果方括号获取，如 53cc9388）。delete 支持逗号分隔多个 ID"),
      force: tool.schema
        .boolean()
        .optional()
        .describe("强制重新蒸馏（仅 distill 命令）"),
      selectedIndices: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe("指定写入的候选索引（仅 confirm 命令，0-based）"),
    },
    execute: async (args, context: ToolContext) => {
      const { command, query, category, limit, text, importance, project, tags, force, selectedIndices, id } = args;

      switch (command) {
        case "list":
          return (await formatList(store, category, limit)) + ECHO_REMINDER;
        case "stats":
          return await formatStats(store);
        case "search":
          return await formatSearch(store, query ?? "", tags);
        case "delete":
          return (await deleteMemories(store, id ?? "")) + ECHO_REMINDER;
        case "add":
          return (await addMemory(store, embedder, text ?? "", category as MemoryCategory | undefined, {
            sessionId: context.sessionID ?? "unknown",
            importance: importance ?? 0.5,
            project: project ?? "wopal-space",
            tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : [],
          })) + ECHO_REMINDER;
        case "update": {
          const updateOpts: { text?: string; category?: MemoryCategory; importance?: number; project?: string; tags?: string[] } = {};
          if (text !== undefined) updateOpts.text = text;
          if (category !== undefined) updateOpts.category = category as MemoryCategory;
          if (importance !== undefined) updateOpts.importance = importance;
          if (project !== undefined) updateOpts.project = project;
          if (tags !== undefined) updateOpts.tags = tags.split(",").map(s => s.trim()).filter(Boolean);
          return (await updateMemory(store, embedder, id ?? "", updateOpts)) + ECHO_REMINDER;
        }
        case "injected":
          return await formatInjected(sessionStore, context.sessionID);
        case "distill": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          if (!distillEngine) return "Memory system unavailable. Distillation requires the memory system to be initialized.";
          return await handleDistill(sessionID, distillEngine, client, force);
        }
        case "confirm": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          if (!distillEngine) return "Memory system unavailable. Distillation requires the memory system to be initialized.";
          return await handleConfirm(sessionID, distillEngine, selectedIndices);
        }
        case "cancel": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          clearPendingConfirmation(sessionID);
          return "❌ Distillation cancelled. Candidates discarded.";
        }
        default:
          return `未知命令: ${command}`;
      }
    },
  });
}