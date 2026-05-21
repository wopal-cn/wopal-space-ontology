/**
 * Test: Distill extraction prompt raw output
 *
 * 观察 LLM 原始返回，不做校验。
 */

import OpenAI from "openai";

const BASE_URL = process.env.WOPAL_LLM_BASE_URL!;
const API_KEY = process.env.WOPAL_LLM_API_KEY!;
const MODEL = process.env.WOPAL_LLM_MODEL ?? "gpt-4o-mini";

const client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });

function buildExtractionPrompt(conversation: string): string {
  return `分析以下会话内容，提取值得长期保存的记忆。

目标输出语言: auto（自动检测）

## 最近对话
${conversation}

# 记忆提取标准

## 什么是值得记住的？
- 个性化信息：特定于该用户的信息，非通用领域知识
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
- 只提取真正有价值的个性化信息
- 如果没有值得记录的内容，返回 {"memories": []}
- 每次提取最多 5 条记忆
- body 标题**必须**以 \`## [中文标签]: \` 开头，标签必须与 category 一致
- 偏好类应按主题聚合`;
}

const TEST_CASES = [
  {
    name: "TC1: 画像 + 偏好 + 用户要求",
    conversation: `User: 我叫张三，是一名全栈开发工程师，主要用 TypeScript 和 React，已经做了 5 年了。最近在学 Rust，打算以后做系统级开发。

Assistant: 了解了，张三。5 年 TS/React 经验，正在学 Rust。

User: 对了，我有个习惯，代码里我不喜欢用 any 类型，宁可多写几行类型标注。还有我不喜欢用 class 组件，函数组件 + hooks 是我的首选。

Assistant: 记下了，你偏好强类型（不用 any）和函数组件。

User: 还有一点，以后每次你写完代码要自动跑测试，不用问我。我不喜欢每次手动说"跑一下测试"。

Assistant: 明白，以后写完代码自动跑测试，不需要你提醒。

User: 另外，提交代码的时候不要自动 push，我都是自己手动 push 的。这个我已经说过好几次了。

Assistant: 抱歉，记住了。绝对不自动 push，由你自己决定 push 时机。`,
  },
  {
    name: "TC2: 知识 + 事实 + 避坑方法 + 经验",
    conversation: `User: 帮我查一下 LanceDB 的 FTS（全文搜索）支持中文吗？

Assistant: 查了一下，LanceDB 的 FTS 基于 tantivy，默认使用英文分词器。对中文支持有限，中文搜索可能匹配不到。建议配合 LIKE 查询作为 fallback。

User: 那我们现在的项目里怎么处理的？

Assistant: 我看了代码，retriever.ts 里已经实现了 hybrid search：vector search + FTS + LIKE 三路并行，然后去重。这个方案不错。

User: 之前有个问题，LanceDB 返回的 Arrow StructRow 对象不能直接展开，会触发 ToBigInt 报错。后来怎么解决的？

Assistant: 用 { ...row } 展开为普通 JS 对象后再操作，脱离 Arrow 的 Setter 机制就行了。

User: 我觉得我们处理技能安装的流程可以标准化一下。每次改完技能源码后，先 wopal skills install 覆盖安装，然后 wopal skills merge 验证 symlink。这套流程应该在文档里固化。

Assistant: 好的，我来整理一下。流程是：修改源码 → install 覆盖 → merge 验证 → 完成。

User: 顺便提醒一下，wopal skills install 必须用绝对路径，相对路径会失败。这个之前踩过坑。`,
  },
  {
    name: "TC3: 混合场景 — 分类边界测试",
    conversation: `User: 我决定了，以后我们的空间文档都放在 docs/ 目录下，项目级的仓库（projects/ 里面）不放文档。这样文档集中管理更清晰。

Assistant: 明白，所有文档统一放空间级 docs/ 目录。

User: 还有个事，OpenCode 的 Part type 枚举值是 "tool" 不是 "tool_call"，这个跟直觉不一样。你记一下，以后写代码别搞错了。

Assistant: 记住了，Part type 用 "tool" 不是 "tool_call"。参考文件是 packages/opencode/src/session/message-v2.ts。

User: 前几天我让你调试的时候，你一直用 apply_patch，结果因为上下文变化反复失败。以后遇到这种情况，直接用 write 工具整段重写，别再尝试补丁了。

Assistant: 了解了。apply_patch 上下文失配时不再重试，改用 write 整段重写。

User: 最后说一下，我不喜欢你在回复里加 emoji，保持专业简洁就好。

Assistant: 好的，以后不加 emoji，保持简洁专业。`,
  },
];

async function runTest(name: string, conversation: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const prompt = buildExtractionPrompt(conversation);
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  }, { signal: AbortSignal.timeout(120000) });

  const raw = response.choices[0]?.message?.content ?? "";

  const stripped = raw.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "").trim();

  console.log("\n--- RAW OUTPUT ---");
  console.log(stripped);
  console.log("--- END ---\n");
}

async function main() {
  const mode = process.argv[2];
  console.log(`Model: ${MODEL}`);
  console.log(`Base URL: ${BASE_URL}`);

  if (mode === "--memory") {
    // MEMORY.md 分块蒸馏测试
    const memoryBlocks = [
      {
        name: "MEMORY: Wopal-Fae 协作",
        conversation: `User: 我来告诉你 Wopal 和 Fae 的协作关系。Wopal 和 Fae 是协作对，插件通知（[WOPAL TASK *]）发给 Wopal，不发给用户。Wopal 负责监控 Fae 状态、判断异常、决定终止或继续。Sam 是更高层的指挥者，不参与这个循环。

Assistant: 明白了，Wopal-Fae 协作链路。

User: 协作技能是 fae-collab，提供委派、检查、监控、异常处理、验证、收尾完整指南。委派策略是异步优先、分组并行、验证边界、ROI 评估，已经沉淀到该技能了。

Assistant: 记下了 fae-collab 技能的定位和策略。

User: Fae 的本质是独立 OpenCode 实例，内核与 Wopal 相同。定义文件在 projects/ontology/agents/wopal/agents/fae.md 和 fae-cn.md。专用资源位置是 projects/ontology/agents/fae/（skills/rules/commands）。成熟之前不修改核心设计，通过 skills 扩展能力。

Assistant: Fae 的身份和技术细节记下了。

User: 三种委派模式：Task Tool 同步模式，用于极简短任务（<2 分钟、明确无歧义）；wopal_task 异步模式优先，大多数任务可并行分组；沙箱 Docker 模式，需要隔离环境时使用。

Assistant: 委派模式体系清晰了。`,
      },
      {
        name: "MEMORY: 经验（工具/技能/工作流）",
        conversation: `User: 记住几个工作规则。第一，网页搜索和抓取优先使用 fc-local 技能（本地免费），firecrawl 消耗 credit 仅作为备选。持续打磨自研技能是空间核心策略。

Assistant: 好的，工具优先级：fc-local > firecrawl。

User: 第二，涉及技能查找、安装、更新、质量查询等任务，优先使用 skill-master 技能。第三，工作流程是先归档（移动计划到 done/、标记 PLAN 完成）再提交代码。

Assistant: skill-master 用于技能生命周期管理，工作流程先归档再提交。

User: 第四，技能源码修改后，必须运行 wopal skills install <path> --agent <name> --force 更新部署层和 .skill-lock.json。第五，整合 commands 能力到 skills 可实现自动触发，无需用户手动调用。

Assistant: 技能变更必须重新安装，commands 整合到 skills。

User: 还有一个，fae 当前不擅长 SVG 制图；图形任务可由 Wopal 负责结构与 SVG 源码设计，再让执行分身机械落盘。另外 .deploy-ignore 使用子串匹配，不支持 glob（如用 .test.ts 而非 *.test.ts）。

Assistant: 记下了。协作规则层级是：协议层（AGENTS.md 强制）> 技能层（skills 自动化）> 参考层（reference.md 补充）。`,
      },
      {
        name: "MEMORY: 知识（技术参考）",
        conversation: `User: 我来交代一些技术参考资料。Plan 中 Risks 必须研究明确后写入，不能是占位符或开放问题。所有文档放在空间级 docs/ 目录，项目级仓库（projects/*/）不放文档。

Assistant: Plan Risks 规范和文档位置记下了。

User: OpenCode API 参考文件在 labs/ref-repos/opencode/packages/sdk/openapi.json，不要访问 localhost 的 openapi.json。OpenCode 详细文档在 docs/research/opencode/deep-docs/，涵盖架构、核心模块、插件、SDK、UI 等 9 大章节。

Assistant: OpenCode 参考资料位置记下了。

User: OpenCode Part type 枚举值是 "tool"（不是 "tool_call"）、"text"、"reasoning"、"step-start"、"step-finish"、"file"、"snapshot" 等。参考 labs/ref-repos/opencode/packages/opencode/src/session/message-v2.ts 的 Part schema。

Assistant: Part type 枚举值记下了，"tool" 不是 "tool_call"。

User: OpenCode 插件事件方面，subscribeAll 订阅 wildcard PubSub，BusEvent 和 SyncEvent 都能收到无需区分。message.part.delta 属性：{sessionID, messageID, partID, field, delta}；message.part.updated 属性：{sessionID, part, time}，partType 在 part.type 里。

Assistant: 插件事件机制记下了。

User: Wopal 系统提示词源文件在 projects/ontology/agents/wopal/agents/wopal-cn.md（中文）+ wopal.md（英文）。OpenCode 不支持从其他目录加载 agents，必须 copy 到 .opencode/agents/（flat 结构）。.agents/ 是 wopal 专用适配层，其他 agent 有其他方式获取工具。

Assistant: 提示词源文件位置和 .agents/ 的定位记下了。

User: 脚本中 gh CLI 必须显式指定 --repo 参数，否则在脚本上下文中可能返回空结果。OrbStack docker 路径是 ~/.orbstack/bin/docker（不在默认 PATH，需在 ~/.zshenv 中添加）。

Assistant: gh CLI 和 OrbStack docker 路径记下了。

User: 技能安装必须用 skill-master 技能。wopal skills install 后必须 wopal skills merge 验证 symlink，禁止手动 ln -s。外部技能自研化：复制到 projects/ontology/skills/ → 修改源码 → wopal skills install 覆盖。

Assistant: 技能安装规范记下了。

User: 技能脚本根目录检测优先级：.wopal → .git → 当前目录（.wopal 是本空间特有标识）。执行 skill 脚本前如果需要环境变量，主动 source scripts/load-env.sh。技能源码定位：共享 → projects/ontology/skills/；Wopal 专用 → projects/ontology/agents/wopal/skills/；Fae 专用 → projects/ontology/agents/fae/skills/。.wopal/ 和 .agents/skills/ 是只读部署层，严禁反向复制。注意 glob 在深层目录可能失效，优先用 ls -la 确认结构。

Assistant: 技能脚本规范记下了。

User: 工作空间多仓库结构：space 根目录是主仓库，projects/wopal-cli 是独立子仓库，分支/worktree 完全独立。部署命令速查：代理/命令/规则/插件 → python scripts/sync-to-wopal.py -y；技能 → wopal skills install <path>。

Assistant: 多仓库结构和部署命令记下了。

User: 技能 scope 与 agentScope 是独立维度。--global 和 --agent 互斥，因为 agentScope 隐含 space scope。wopal skills install <path> → 空间共享（.wopal/skills/，无 agentScope）；加 --agent wopal → Wopal 专属（.wopal/agents/wopal/skills/，有 agentScope）；加 --global → 全局共享（~/.wopal/skills/）。

Assistant: scope 和 agentScope 独立维度记下了。

User: GitHub 仓库是 sampx/wopal-space（不是 Yufu-sg/wopal-workspace）。插件部署方面，sync-to-wopal.py 部署插件后自动检测变更并 npm install（仅 plugins mapping 有文件变更时触发）。开发阶段 opencode.jsonc 直接引用源码路径，不需要 sync-to-wopal.py 部署，只有发布时才需要。

Assistant: GitHub 仓库和部署细节记下了。`,
      },
      {
        name: "MEMORY: 教训 + 决策",
        conversation: `User: 我来总结一些教训。临时文件放 .tmp/ 目录，搜索和抓取产生的临时文件统一放这里。抓取结果优先 markdown 格式（人类可读），不要用 json。

Assistant: 临时文件规范记下了。

User: 方案文档中禁止写修改部署层（.wopal/、.agents/），必须写源码层（projects/ontology/）→ 部署命令。这是不可妥协的规则，每次都要检查。技能卸载用 wopal skills remove <name> [--agent <name>] --force 而非手动 rm -rf，否则 .skill-lock.json 不同步。

Assistant: 部署层路径红线和卸载规范记下了。

User: wopal skills install 必须用绝对路径，相对路径会失败。规则写在 SKILL.md 内部无效（不加载看不到），description（触发前可见）或 AGENTS.md（强制规则）才有效。OpenCode 非交互模式权限会被 auto-reject，使用 OPENCODE_PERMISSION 环境变量传递。

Assistant: 这些坑都记下了。

User: 计划归档时机：所有优先级都执行完成后才能归档，不能中途归档。历史文档不追溯，P2 等属于历史记录不追溯修改。wopal-cli 是独立 git 仓库，操作其分支/worktree 必须在项目目录内执行 git 命令。ontology 也是独立 git 仓库（wopal-cn/ontology），代码变更必须在 projects/ontology/ 内执行。projects/ 下各项目是独立仓库，git 操作必须 git -C projects/<name> 或 cd 进入项目目录后执行。

Assistant: 归档时机和多仓库 git 规范记下了。

User: 说几个重要决策。Space 是运行时实例（壳子），不需要 git 管理；核心资产在 projects/ 和 contents/，各项目应该是独立的 .git 目录。技能内容优化由 Wopal 自己做：涉及自身行为的技能（如 fae-collab）不适合委派给 fae，因为需要深刻的上下文理解。但通用技能（如 youtube-master）可以委派，只要 prompt 足够详细。

Assistant: 架构决策和委派策略记下了。

User: 还有一个：涉及 Issue 驱动的开发任务，必须先加载 dev-flow 技能再开始工作，不能等用户提醒。

Assistant: 开发任务先加载技能，记下了。

User: 最后说一下 dev-flow 验证结论（2026-03-23）。流程可行：Issue → Plan → review → dev → validate → archive 完整走通。待优化：Appetite 对 AI 无意义改用 Complexity + Confidence；feature 强制 PRD 要求过于僵化移除强制；人工门控简化为 review → validate；引入调查清单参考 OpenShell create-spike。参考文件在 labs/research/OpenShell/.agents/skills/create-spike/SKILL.md。

Assistant: dev-flow 验证结论记下了。

User: 还有 OpenSpace 技能进化研究。核心方向是技能质量感知（OpenCode 插件事件流）+ Wopal→Fae 动态技能注入（promptAsync 的 system 字段）。主文档在 docs/research/openspace-skill-evolution-mechanism.md，注入研究在 docs/research/sandbox/docker-volume-mount-merge.md §8。状态是研究结论已纳入 PRD §10（Stage 4-5）和 DESIGN §4.2，待 Stage 4 进入实施。

Assistant: OpenSpace 研究状态记下了。`,
      },
    ];

    for (const block of memoryBlocks) {
      await runTest(block.name, block.conversation);
    }
  } else {
    for (const tc of TEST_CASES) {
      await runTest(tc.name, tc.conversation);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  All tests completed");
  console.log(`${"=".repeat(60)}`);
}

main().catch(console.error);