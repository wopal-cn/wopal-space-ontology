/**
 * Prompt Building and Template Loading
 *
 * Constructs prompts for memory extraction and deduplication.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import type { MemoryCategory } from "./types.js";
import { memoryLogger } from "../logger.js";

/**
 * Resolve prompt file path from environment variable
 *
 * Supports:
 * - Absolute path: /path/to/file.md
 * - Home directory: ~/path/to/file.md
 * - Relative path: .wopal/path/to/file.md (relative to cwd)
 */
export function resolvePromptFilePath(envVar: string): string | null {
  const envPath = process.env[envVar];
  if (!envPath) return null;

  // Absolute path: use directly
  if (envPath.startsWith("/")) {
    return envPath;
  }

  // Home directory: resolve ~/
  if (envPath.startsWith("~/")) {
    return join(homedir(), envPath.slice(2));
  }

  // Relative path: resolve from cwd (workspace root)
  return join(process.cwd(), envPath);
}

// Prompt file path from environment
const DISTILL_PROMPT_FILE = resolvePromptFilePath("WOPAL_DISTILL_PROMPT_FILE");
const DEDUP_PROMPT_FILE = resolvePromptFilePath("WOPAL_DEDUP_PROMPT_FILE");

/**
 * Extracted memory from LLM (single-layer body)
 */
export interface ExtractResult {
  memories: Array<{
    category: MemoryCategory;
    body: string; // self-contained structured Markdown
    tags: string[];
  }>;
  title?: string;
}

/**
 * Load extraction prompt from file or return default
 */
export function loadPromptTemplate(): string {
  // Try file path from environment
  if (DISTILL_PROMPT_FILE && existsSync(DISTILL_PROMPT_FILE)) {
    try {
      const content = readFileSync(DISTILL_PROMPT_FILE, "utf-8");
      memoryLogger.debug(`Loaded distill prompt from: ${DISTILL_PROMPT_FILE}`);
      return content;
    } catch (error) {
      memoryLogger.warn(`Failed to load distill prompt from ${DISTILL_PROMPT_FILE}: ${error}`);
    }
  }

  // Fallback: try default path
  const defaultPath = join(homedir(), ".wopal", "agents", "wopal", "prompts", "distill.md");
  if (existsSync(defaultPath)) {
    try {
      const content = readFileSync(defaultPath, "utf-8");
      memoryLogger.debug(`Loaded distill prompt from default path: ${defaultPath}`);
      return content;
    } catch (error) {
      memoryLogger.warn(`Failed to load distill prompt from default path: ${error}`);
    }
  }

  // Return embedded default prompt (simplified version for fallback)
  memoryLogger.debug("Using embedded default distill prompt");
  return `# 记忆提取 Prompt（默认版本）

分析以下会话内容，提取值得长期保存的记忆。

## 最近对话
{{conversation}}

---

# 分类体系（7 类）

| 中文标签 | 英文 category | 定义 |
|---------|--------------|------|
| 用户画像 | profile | 用户身份、静态属性 |
| 用户偏好 | preference | 用户习惯、倾向、风格（非强制） |
| 技术知识 | knowledge | 本空间/项目特有的技术理解、内部机制 |
| 项目事实 | fact | 本空间/项目特有的客观事实、路径约定 |
| 避坑方法 | gotcha | 历史错误、预防措施（必须有踩坑经历） |
| 实践经验 | experience | 可复用流程、方法论 |
| 用户要求 | requirement | 用户明确要求必须遵守的规则/行为 |

# 输出格式

返回 JSON 对象。示例：
{"memories": [{"category": "knowledge", "body": "## [技术知识]: 主题\\n**背景**: ...\\n**内容**: ...", "tags": ["tag"]}]}

如果无记忆可提取，返回 {"memories": []}`;
}

/**
 * Build extraction prompt for LLM (always reads from file for hot-reload)
 */
export function buildExtractionPrompt(conversation: string): string {
  return loadPromptTemplate().replace("{{conversation}}", conversation);
}

/**
 * Build deduplication prompt — single LLM call for decision + merge content
 */
export function buildBatchDedupPrompt(
  candidates: Array<{ index: number; category: string; body: string }>,
  existingByCandidate: Map<number, Array<{ index: number; body: string; id: string }>>
): string {
  const candidatesWithExisting = candidates.filter(
    (c) => existingByCandidate.has(c.index) && existingByCandidate.get(c.index)!.length > 0
  );

  const input = candidatesWithExisting.map((c) => {
    const existing = existingByCandidate.get(c.index)!;
    return {
      candidate: { index: c.index, category: c.category, body: c.body },
      similar_existing: existing.map((e) => ({ index: e.index, body: e.body })),
    };
  });

  // Try loading from file
  if (DEDUP_PROMPT_FILE && existsSync(DEDUP_PROMPT_FILE)) {
    try {
      const template = readFileSync(DEDUP_PROMPT_FILE, "utf-8");
      memoryLogger.debug(`Loaded dedup prompt from: ${DEDUP_PROMPT_FILE}`);
      return template.replace("{{input}}", JSON.stringify(input, null, 2));
    } catch (error) {
      memoryLogger.warn(`Failed to load dedup prompt from ${DEDUP_PROMPT_FILE}: ${error}`);
    }
  }

  // Fallback: inline prompt
  return `你是记忆去重器。对每条候选，与已有相似记忆对比后做出决策。

输入：
${JSON.stringify(input, null, 2)}

操作：create（不相关，应新建）/ skip（重复）/ merge（补充新细节）/ replace（事实已变化）

关键约束：
- 同关键词 ≠ 重复：两条都提到"确认"不代表是同一条要求
- requirement 类型：两条不同的用户要求应并存（create），不要合并
- create：候选与已有记忆说的是不同的事情，应该同时存在
- skip：候选的所有关键信息都已在已有记忆中
- merge：候选补充了已有记忆没有的新细节，输出 merged_body 和 tags
- replace：候选与已有记忆冲突（旧的对新的错），用候选替换

输出 JSON：
{"decisions": [{"index": 1, "action": "create"}, {"index": 2, "action": "skip"}, {"index": 3, "action": "merge", "merge_into": 1, "merged_body": "合并后完整内容", "tags": ["tag1"]}]}`;
}