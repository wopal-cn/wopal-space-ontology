/**
 * Import MEMORY.md contents into LanceDB via LLM distillation.
 *
 * Splits MEMORY.md into topic blocks, runs extraction prompt per block,
 * embeds results, and stores in LanceDB.
 *
 * Usage: npx tsx scripts/import-memory.ts [--dry-run]
 */

import type { MemoryCategory } from "../src/memory/store.js";
import { readFileSync } from "fs";
import { join } from "path";

// --- Config ---
const LLM_MODEL = process.env.WOPAL_LLM_MODEL ?? "gpt-4o-mini";
const DRY_RUN = process.argv.includes("--dry-run");

const IMPORTANCE: Record<MemoryCategory, number> = {
  requirement: 0.95,
  profile: 0.9,
  gotcha: 0.85,
  experience: 0.85,
  preference: 0.8,
  fact: 0.75,
  knowledge: 0.7,
};

// --- Extraction Prompt (copied from distill.ts) ---
function buildExtractionPrompt(conversation: string): string {
  return `分析以下文档内容，提取**所有**值得长期保存的记忆。

**重要指令：**
- 必须逐条分析文档中的每个知识点、规则、经验、教训
- **不要合并相似内容** — 每条独立信息都要单独提取
- **不要省略** — 只要符合标准就必须提取
- 目标：完整覆盖文档中的所有有价值信息

## 待分析文档
${conversation}

# 记忆提取标准

## 什么是值得记住的？（符合任意一条就必须提取）
- 个性化信息：特定于该用户的信息，非通用领域知识
- 工作流程：操作步骤、最佳实践、推荐做法
- 技术规范：路径、配置、API 细节、枚举值
- 约束规则："必须"、"禁止"、"只能"等强制性要求
- 经验教训：踩过的坑、错误案例、预防措施
- 架构决策：项目结构、组织方式、设计选择
- 长期有效：未来会话中仍有用的信息
- 具体明确：有具体细节，非模糊概括

## 什么不值得记住？
- 通用知识：任何人都知道的信息
- 系统平台元数据：消息 ID、发送者 ID、时间戳、频道信息、JSON 信封
- 临时信息：一次性问题或对话
- 模糊信息："用户对某个功能有疑问"（无具体细节）
- 工具输出、错误日志、样板代码
- 回忆查询/元问题："你还记得 X 吗？"、"你知道我喜欢什么吗"——这是检索请求，不是新信息
- 退化或不完整的引用：用户模糊提到某事时，不要编造细节
- **瞬时状态快照**："Issue #N 处于 X 阶段"、"当前状态是 Y"——状态会很快过时
- **短期待办/下一步**："下一步验证 X"、"接下来要做 Y"——这是任务管理，不是知识
- **进度流水**："已完成 X，正在做 Y"——除非包含可复用的经验或决策
- **调试中间状态**：临时修复、调试日志配置、临时环境变量设置

# 记忆分类（7 类，可扩展）

| 中文标签 | 英文 category | 定义 | 判断问题 |
|---------|--------------|------|---------|
| 画像 | profile | 用户身份、静态属性 | "用户是谁？" |
| 偏好 | preference | 用户习惯、倾向、风格 | "用户偏好什么？" |
| 知识 | knowledge | 调研结果、技术事实、参考资料 | "这是什么/怎么工作？" |
| 事实 | fact | 调研结论、客观发现、项目决策结果 | "发现了什么/决定了什么？" |
| 避坑方法 | gotcha | 历史错误、陷阱、预防措施 | "怎么避免踩坑？" |
| 经验 | experience | 可复用流程、工作模式、方法论 | "什么流程可以复用？" |
| 用户要求 | requirement | 用户反复强调的约束、明确规则 | "用户要求必须怎么做？" |

## 分类判断树（优先级从上到下）

判断一条信息属于哪个类别，按顺序检查：

1. **用户要求？**
   - 用户明确说"必须/不要/以后都..." → 用户要求
   - 例："必须用绝对路径"、"禁止自动 push" → 用户要求（技术规则约束）

2. **历史踩坑？**
   - 用户提到过去遇到的问题 + 解决方案 → 避坑方法
   - 例："之前踩过坑，用 {...} 展开就好了" → 避坑方法
   - ⚠️ 注意：只有"规则"没有"踩坑经历" → 用户要求（不是 gotcha）

3. **可复用流程/模式？**
   - 能跨场景复用的操作步骤、工作策略 → 经验
   - 例："fc-local 优先，firecrawl 备选" → 经验
   - 例："apply_patch 失败就改用 write" → 经验

4. **技术事实/工作原理/参考资料？**
   - 技术原理、API 枚举值、配置说明、参考资料路径 → 知识
   - 例："Part type 是 tool 不是 tool_call" → 知识
   - 例："LanceDB FTS 默认英文分词" → 知识
   - ⚠️ 注意：调研中"发现了什么" ≠ "调研结论"。技术发现 → 知识；结论性判断 → fact

5. **调研结论/项目决策？**
   - 用户得出"X 方案最优" → 事实
   - 项目选型决策、架构决策 → 事实
   - 例："决定用 docs/ 集中管理文档" → 事实

6. **用户偏好/习惯？**
   - 风格、倾向、习惯（不是强制规则） → 偏好
   - 例："不加 emoji"、"不用 class 组件" → 偏好

7. **用户身份/静态属性？**
   - 职业、技术栈、背景 → 画像

## 常见混淆
- "用户偏好 X" → 偏好（不是 画像）
- "调研发现 X 工作方式" → 知识（不是 事实）
- "调研结论 X 方案最优" → 事实
- "遇到问题 A，用方案 B" → 避坑方法（有历史经历）
- "处理某类问题的一般流程" → 经验（不是 避坑方法）
- "用户明确说不要 X" → 用户要求（不是 偏好）
- "技术规则约束（无踩坑经历）" → 用户要求（gotcha 必须有踩坑经历）

# Body 格式

每条记忆 = 一个 self-contained 的结构化 Markdown body。**标题必须以分类标签开头**，格式为 \`## [中文标签]: <描述>\`：

| 分类 | 标题格式 | Body 模板 |
|------|---------|----------|
| 画像 | \`## [画像]: <身份描述>\` | \`- 属性1: ...\\n- 属性2: ...\` |
| 偏好 | \`## [偏好]: <主题>\` | \`- 偏好: ...\\n- 适用范围: ...\` |
| 知识 | \`## [知识]: <主题>\` | \`- 关键信息: ...\\n- 参考: ...\` |
| 事实 | \`## [事实]: <发现/结论>\` | \`- 背景: ...\\n- 结论: ...\` |
| 避坑方法 | \`## [避坑方法]: <问题描述>\` | \`### 问题\\n...\\n### 方案\\n...\\n### 适用范围\\n...\` |
| 经验 | \`## [经验]: <流程/模式>\` | \`- 流程: ...\\n- 适用范围: ...\` |
| 用户要求 | \`## [用户要求]: <规则描述>\` | \`- 背景: ...\\n- 要求: ...\` |

# Few-shot 示例

## profile
{
  "category": "profile",
  "body": "## [画像]: AI 开发工程师\\n- 职业: AI 开发工程师\\n- 经验: 3 年 LLM 应用开发\\n- 技术栈: Python, LangChain, TypeScript",
  "tags": ["背景"]
}

## preference
{
  "category": "preference",
  "body": "## [偏好]: Python 代码风格\\n- 偏好: 不加类型标注，函数注释简洁，直接实现\\n- 适用范围: Python 项目开发",
  "tags": ["偏好"]
}

## knowledge
{
  "category": "knowledge",
  "body": "## [知识]: OpenCode Part type 枚举值\\n- 枚举值: \\"tool\\"（不是 \\"tool_call\\"）、\\"text\\"、\\"reasoning\\"、\\"step-start\\"、\\"step-finish\\"\\n- 参考: labs/ref-repos/opencode/packages/opencode/src/session/message-v2.ts",
  "tags": ["reference"]
}

## fact
{
  "category": "fact",
  "body": "## [事实]: 技能 scope 与 agentScope 是独立维度\\n- 结论: --global 和 --agent 互斥，agentScope 隐含 space scope\\n- 细节: install 无 --agent → 空间共享；加 --agent → Agent 专属",
  "tags": ["how-it-works"]
}

## gotcha
{
  "category": "gotcha",
  "body": "## [避坑方法]: LanceDB BigInt 错误\\n### 问题\\nLanceDB 0.26+ 返回 BigInt 类型的数值列，直接算术运算会抛类型错误\\n### 方案\\n算术运算前用 Number(...) 强制转换\\n### 适用范围\\n- LanceDB 0.26+ 版本",
  "tags": ["gotcha", "problem-solution"]
}

## experience
{
  "category": "experience",
  "body": "## [经验]: 工具优先级策略\\n- 策略: 网页搜索和抓取优先使用 fc-local 技能（本地免费），firecrawl 消耗 credit 仅作为备选\\n- 原因: 持续打磨自研技能是空间核心策略",
  "tags": ["pattern"]
}

## requirement
{
  "category": "requirement",
  "body": "## [用户要求]: Git push 由用户自己决定\\n- 要求: AI Agent 永远不需要问用户是否 push\\n- 背景: 用户习惯自己决定 push 时机",
  "tags": ["user-rule"]
}

# 输出格式

返回 JSON:
{
  "memories": [
    {
      "category": "profile|preference|knowledge|fact|gotcha|experience|requirement",
      "body": "结构化 Markdown body（50-300字），标题以 ## [中文标签]: 开头",
      "tags": ["可选概念标签"]
    }
  ]
}

注意:
- 输出语言应与对话中主要语言匹配
- **系统性提取**：遍历文档每个章节，逐条判断是否符合标准
- **独立性原则**：即使内容相似，只要是不同知识点就要分别提取
- **完整性检查**：提取完成后对照原文，确认没有遗漏重要信息
- 如果没有值得记录的内容，返回 {"memories": []}
- **不限制数量**，确保完整覆盖输入内容
- body 标题**必须**以 \`## [中文标签]: \` 开头，标签必须与 category 一致
- 偏好类应按主题聚合`;
}

// --- Load MEMORY.md content ---
const MEMORY_MD_PATH = join(process.cwd(), "..", "..", "..", "..", "..", "..", "MEMORY.md");
let memoryContent: string;
try {
  memoryContent = readFileSync(MEMORY_MD_PATH, "utf-8");
  console.log(`Loaded MEMORY.md: ${memoryContent.length} chars, ~${memoryContent.split('\n').length} lines`);
} catch (e) {
  console.error(`Failed to read MEMORY.md from ${MEMORY_MD_PATH}: ${e}`);
  process.exit(1);
}

// --- Helpers ---
const TAG_TO_CATEGORY: Record<string, MemoryCategory> = {
  "画像": "profile",
  "偏好": "preference",
  "知识": "knowledge",
  "事实": "fact",
  "避坑方法": "gotcha",
  "经验": "experience",
  "用户要求": "requirement",
};

interface ExtractedMemory {
  category: MemoryCategory;
  body: string;
  tags: string[];
}

function parseLlmResponse(raw: string): { memories: ExtractedMemory[]; raw: string } {
  // Strategy 1: Find the LAST code block with "memories"
  const codeBlockMatches = [...raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)];
  for (let i = codeBlockMatches.length - 1; i >= 0; i--) {
    const content = codeBlockMatches[i][1].trim();
    if (content.includes('"memories"')) {
      try {
        const parsed = JSON.parse(content);
        const memories = (parsed.memories ?? []).map((m: { category: string; body: string; tags?: string[] }) => {
          const match = m.body.match(/^## \[(.+?)\]/);
          const category = match && TAG_TO_CATEGORY[match[1]] ? TAG_TO_CATEGORY[match[1]] : m.category as MemoryCategory;
          return { category, body: m.body, tags: m.tags ?? [] };
        });
        return { memories, raw: "" };
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 2: Find the LAST occurrence of {"memories" with balanced braces
  const startIdx = raw.lastIndexOf('{"memories"');
  if (startIdx === -1) {
    return { memories: [], raw: raw.slice(0, 500) };
  }

  let jsonStr: string | null = null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < raw.length; i++) {
    const c = raw[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"' && !escape) { inString = !inString; continue; }
    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { jsonStr = raw.slice(startIdx, i + 1); break; } }
    }
  }

  if (!jsonStr) {
    return { memories: [], raw: raw.slice(startIdx, startIdx + 500) };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const memories = (parsed.memories ?? []).map((m: { category: string; body: string; tags?: string[] }) => {
      const match = m.body.match(/^## \[(.+?)\]/);
      const category = match && TAG_TO_CATEGORY[match[1]] ? TAG_TO_CATEGORY[match[1]] : m.category as MemoryCategory;
      return { category, body: m.body, tags: m.tags ?? [] };
    });
    return { memories, raw: "" };
  } catch (e) {
    return { memories: [], raw: jsonStr.slice(0, 500) };
  }
}

// --- Main ---
async function main() {
  if (!process.env.WOPAL_LLM_BASE_URL || !process.env.WOPAL_LLM_API_KEY) {
    console.error("Missing env vars: WOPAL_LLM_BASE_URL and/or WOPAL_LLM_API_KEY");
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = (await import("openai")).default;
  const llmClient = new OpenAI({
    baseURL: process.env.WOPAL_LLM_BASE_URL,
    apiKey: process.env.WOPAL_LLM_API_KEY,
  });

  console.log(`Model: ${LLM_MODEL}`);
  console.log(`Dry run: ${DRY_RUN}`);

  const allMemories: ExtractedMemory[] = [];
  const prompt = buildExtractionPrompt(memoryContent);
  console.log("Extracting memories from MEMORY.md...");
  const t0 = Date.now();

  const response = await llmClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [{ role: "user", content: prompt }],
  }, { signal: AbortSignal.timeout(180000) });

  const raw = response.choices[0]?.message?.content ?? "";
  const { memories, raw: failedRaw } = parseLlmResponse(raw);

  if (memories.length === 0) {
    console.error(`⚠️ No memories extracted. Raw preview: ${failedRaw.slice(0, 300)}`);
    process.exit(1);
  }

  console.log(`→ ${memories.length} memories extracted (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  for (const m of memories) {
    console.log(`  [${m.category}] ${m.body.split("\n")[0]}`);
  }

  allMemories.push(...memories);

  console.log(`\n--- Total: ${allMemories.length} memories ---`);

  // Save extracted memories to file for review
  const { writeFileSync } = await import("fs");
  const outputPath = join(process.cwd(), ".tmp", "extracted-memories.json");
  writeFileSync(outputPath, JSON.stringify(allMemories, null, 2), "utf-8");
  console.log(`Extracted memories saved to: ${outputPath}`);

  if (DRY_RUN) {
    console.log("Dry run mode — skipping database write.");
    return;
  }

  // Lazy load store + embedder (avoid importing LanceDB during dry-run)
  const { MemoryStore } = await import("../src/memory/store.js");
  const { EmbeddingClient } = await import("../src/memory/embedder.js");

  const store = new MemoryStore();
  await store.init();

  // Clear existing memories before import
  const existingCount = await store.count();
  if (existingCount > 0) {
    console.log(`Clearing ${existingCount} existing memories...`);
    // LanceDB: delete all rows
    try {
      await (store as unknown as { table: { delete: (filter: string) => Promise<void> } }).table.delete("1=1");
      console.log("Database cleared.");
    } catch (e) {
      console.log(`Note: Could not clear table (may be empty or new): ${e}`);
    }
  }

  const embedder = new EmbeddingClient();

  // Embed and store in batches of 10
  const BATCH_SIZE = 10;
  let stored = 0;

  for (let i = 0; i < allMemories.length; i += BATCH_SIZE) {
    const batch = allMemories.slice(i, i + BATCH_SIZE);
    const bodies = batch.map(m => m.body);
    const embeddings = await embedder.embed(bodies);

    for (let j = 0; j < batch.length; j++) {
      const m = batch[j];
      const vector = embedder.toFloat32Array(embeddings[j]);
      await store.add({
        text: m.body,
        vector,
        category: m.category,
        project: "wopal-space",
        session_id: `import-memory-${Date.now()}`,
        importance: IMPORTANCE[m.category] ?? 0.5,
        tags: m.tags.join(","),
      });
      stored++;
      console.log(`  [${stored}] [${m.category}] ${m.body.split("\n")[0]}`);
    }
  }

  const count = await store.count();
  console.log(`\n✅ Imported ${stored} memories into database. Total count: ${count}`);
}

main().catch(console.error);