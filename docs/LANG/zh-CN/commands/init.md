---
description: 首次引导或校准空间结构
---

# Init — 引导或校准空间

两种模式，取决于空间是否已完成引导：

- **引导模式**：空间根存在 `BOOTSTRAP.md` → 首次设置
- **维护模式**：`BOOTSTRAP.md` 不存在 → 校准 `STRUCTURE.md`

**输入参数**: `$ARGUMENTS`

**参数说明**: 维护模式下可选关注范围；引导模式下忽略。

---

## 核心原则

- `/init` 是已有空间的维护入口，不是 `wopal space init` 的替代；初始化走 CLI。
- 引导模式是一次性流程：收集用户画像 → 写入 `USER.md` → 空间概要 → 删除 `BOOTSTRAP.md`
- 维护模式消费 `wopal space scan` 获取 repo / module 事实清单，对照 `STRUCTURE.md` 生成更新方案，在用户确认后写入
- 所有写入操作必须先展示结构化报告并获得用户明确确认

## Step 0: 检测引导状态

检查空间根是否存在 `BOOTSTRAP.md`。

- **存在** → 进入引导模式（Step 1a → 2a → 3a → 4a）
- **不存在** → 进入维护模式（Step 1b → 2b → 3b → 4b）

---

## 引导模式

### Step 1a: 收集用户画像

逐项询问用户，一次一个问题，自然推进。

1. **称呼偏好** — 我怎么称呼你？
2. **沟通语言** — 你希望我用什么语言？
3. **沟通风格** — 简洁、详细、主动、还是克制？
4. **工作背景**（可选）— 主要用这个空间做什么？

### Step 2a: 写入 USER.md

**执行**：将收集的信息写入 `.wopal-space/memory/USER.md`。

- 保留模板字段结构，填充占位符
- 不留空占位符
- 只写稳定的用户事实，不写引导过程日志

### Step 3a: 空间概要

简要告诉用户：
- 日常工作在 `projects/`、`contents/`、`docs/`
- 守则在 `.wopal-space/REGULATIONS.md`
- 结构索引在 `.wopal-space/STRUCTURE.md`
- **不会用就执行 `/help`**

### Step 4a: 完成

**执行**：删除空间根目录下的 `BOOTSTRAP.md`。

**告诉用户**：首次引导完成，可以开始工作了。

---

## 维护模式

### Step 1b: 收集上下文

读取以下来源构建空间状态快照：

1. `.wopal-space/STRUCTURE.md` — 提取 frontmatter、managed table、user table
2. `wopal space scan` 输出（文本或 JSON）。**读取全部内容**，按 Repositories 和 Module-level agent rules 两部分分类。超过 200 行时分页读取，禁止用 `head -N` 截断
3. `.wopal-space/` — 校验固定目录与文件存在性，不深扫
4. 空间根目录 — 检查 `AGENTS.md` 和 `.gitignore` 是否存在
5. `.wopal/templates/` — 参考模板用于差异比对
6. `.wopal/templates/wopalspace-schema.yaml` — 规范布局参考

若 `STRUCTURE.md` 不存在，报告并提示先运行 `wopal space init`，终止。

**Output**: 结构声明快照、scan 事实清单、runtime 存在性校验结果、模板差异候选。

### Step 2b: 生成校准方案

1. **分类 scan 发现的 Module-level agent rules**，对照声明范围表（见下方）：
   - 顶层模块已在 managed table → 检查描述漂移
   - `projects/<X>/<sub-path>` 有 AGENTS.md → 必须加入 managed table
   - `labs/<*>/<sub-path>` 内部 → 不加入
   - 按优先级生成描述

2. **Frontmatter / managed-table 差异**，逐项标注：
   - **缺失** — scan 发现但未在 managed table 声明（默认加入）
   - **漂移** — 已声明但描述/类型/层级不匹配（默认更新）
   - **陈旧** — 已声明但 scan 不再发现（需用户确认删除）

3. **运行时模板差异**：展示用户内容 vs 模板基线，不覆盖用户内容

4. **根文件（`AGENTS.md`、`.gitignore`）模板差异**：对比模板，仅推荐增补

**Output**: 结构化 diff 报告，逐项标注类型与处理建议。

### Step 3b: 报告并确认

1. 按 frontmatter → managed table → runtime → 根文件 分层展示完整报告
2. 仅在以下情况提问：
   - **陈旧**条目 — 确认是否删除
   - 未声明的新 `labs/ref-repos/<X>` — 确认是否加入
   - 描述无法自动生成 — 请用户提供
   - frontmatter `repos` 字段与 managed table 不一致 — 询问以哪个为准
3. 等待用户明确确认后写入

**Output**: 待用户确认的变更方案。

### Step 4b: 确认后写入

仅执行用户批准的变更：

1. 创建缺失的目录/文件
2. 更新 `STRUCTURE.md` 的 managed frontmatter 和 managed table
3. 保留所有用户内容，不覆盖 user block

**Output**: 已更新的文件路径与变更摘要。

---

## 声明范围 — Managed Table 准入规则

| 资产类型 | 入 managed table？ | 原因 |
|---------|-------------------|------|
| `.wopal/*` 模块（skills、agents、rules、commands、plugins） | 是 | 本体 worktree — 空间核心 |
| `projects/<name>/` 仓库根 | 是 | 顶层受管项目 |
| `projects/<name>/<sub-path>/` 有独立 AGENTS.md | **是** | 子模块有自己的规则，必须索引 |
| `contents/<name>/` | 是 | 顶层内容模块 |
| `scripts/` | 是 | 空间级工具脚本 |
| `labs/ref-repos/<name>/` 仓库根 | 问用户 | 由用户决定 |
| `labs/ref-repos/<name>/<sub-path>/` 内部 | **否** | 参考代码内部结构 |
| `labs/research/*`、`labs/fork/*`、`labs/tests/*` | 否 | 实验性/临时代码 |
| `.wopal-space/backup/`、`.wopal-space/INBOX/` | 否 | 暂存区 |

**新条目描述生成优先级**：

1. `AGENTS.md` frontmatter `description` 字段（首选）
2. `package.json` `description`（无 AGENTS.md 的 npm 包）
3. AGENTS.md body 首个非空段落（无 frontmatter 时）
4. 目录名 + 最近父级描述作为回退

## 完成后响应

用用户语言回复：

1. 更新的文件路径
2. 变更摘要（引导或维护模式）
3. 需人工处理的模板差异（仅维护模式）
4. 未声明的 scan 发现项建议（仅维护模式）