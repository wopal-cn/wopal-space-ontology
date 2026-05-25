# WopalSpace ontology — 本体能力锻造层

> **定位**：WopalSpace 的 Agent 能力研发中心。本文档定义技能体系的设计原则、代理角色、源码结构、开发规范与验证要求。

---

## 文档导航

| 章节 | 内容 | 何时读 |
|------|------|--------|
| [1. 技能职责分层](#1-技能职责分层) | 三层体系、边界规则、灵魂层约束、场景路由 | 设计新技能前必读 |
| [2. Agent 生态](#2-agent-生态) | Wopal / fae / rook 角色与协作关系 | 理解代理分工 |
| [3. 源码结构](#3-源码结构) | 目录布局、技能权限配置 | 找文件、配权限 |
| [4. 技能开发规范](#4-技能开发规范) | 目录结构、描述编写、SKILL.md 规范、质量验证 | 创建或修改技能 |
| [5. 插件开发](#5-插件开发) | wopal-plugin 能力概览 | 插件级变更（详见子项目 AGENTS.md） |
| [6. 运行时验证](#6-运行时验证) | 新增 agent/skill 后的验证步骤 | 部署后验证 |

---

## 1. 技能职责分层

### 1.1 三层体系

技能按职责分为三层，互不越界：

```
space-master（空间根技能 — 空间导航员）
  │  职责：告知 Wopal 本空间有哪些流程、什么场景加载什么技能、委派基础原则
  │  内容：流程体系介绍、场景→技能路由表、技能/空间运维、上下文压缩策略
  │  规则：Wopal 不确定怎么做时，第一个加载它
  │
  ├─ dev-flow（开发工作流技能）
  │    职责：告知 Wopal 开发类任务怎么走状态机、怎么写 Plan、怎么委派 fae/rook
  │    内容：状态机与命令链、Plan 规范、Agent 分配规则、rook 委派时机、
  │          fae 委派模板（Plan 驱动 / 临时任务）、prompt 必含项
  │    前提：必须先加载 agents-collab（委派工具知识）
  │
  └─ agents-collab（委派机制技能 — 通用底层）
       职责：告知 Wopal 怎么用委派工具、怎么管理子 Agent 生命周期、怎么纠偏/恢复/压缩
       内容：wopal_task 工具 API、任务生命周期、通知处理、纠偏恢复、
             rook 契约格式与结果处理、子会话压缩策略、验证边界
       规则：独立于任何工作流，任何委派前必须加载
```

### 1.2 边界规则

| 层 | 可以包含 | 禁止包含 |
|------|---------|---------|
| **space-master** | 流程体系介绍、技能路由、委派原则（引用 agents-collab）、运维方法 | Agent 选择规则（属 dev-flow/agents-collab）、具体委派 API（属 agents-collab）、Plan 模板（属 dev-flow） |
| **dev-flow** | 状态机、命令链、Plan 规范、Agent 分配规则、rook 委派时机、fae 委派模板 | 委派工具 API（属 agents-collab）、任务生命周期（属 agents-collab）、通知处理（属 agents-collab）、技能路由（属 space-master） |
| **agents-collab** | 工具 API、生命周期、通知、纠偏、rook 契约格式、子会话压缩、验证边界 | Agent 选择规则（属 dev-flow/space-master）、rook 委派时机（属 dev-flow）、Plan 模板（属 dev-flow）、具体工作流 prompt（属 dev-flow） |

### 1.3 Agent 灵魂层约束

Agent 灵魂提示词（`agents/*.md`）仅定义角色与决策原则，不含操作知识：

| 允许 | 禁止 |
|------|------|
| 角色定位与性格定义 | 工作流程与规范（属 space-master / dev-flow） |
| 决策原则（如 goal-first、evidence-or-downgrade） | 委派工具 API 描述（属 agents-collab） |
| 输出风格与格式契约 | Agent 选择规则（属 dev-flow / agents-collab） |
| Permission 配置 | 技能路由表（属 space-master） |
| | 具体委派时机与 prompt 模板（属 dev-flow） |

**原则**：灵魂层回答"我是谁"，技能层回答"我怎么做"。

### 1.4 场景→技能路由

| 场景 | 加载技能 | 说明 |
|------|---------|------|
| 不确定用什么流程 | **space-master** | 第一个加载，按路由表选子技能 |
| 开发 / 修复 / 重构 Issue | dev-flow + agents-collab | dev-flow 走流程，agents-collab 负责委派机制 |
| 委派任何子 Agent | agents-collab | 任何委派前必须加载 |
| 空间运维（技能安装/同步/上游） | space-master | 不加载 dev-flow 或 agents-collab |
| 创建 / 修改技能 | skill-creator | 独立技能 |
| YouTube 视频分析 | youtube-master | 独立技能 |
| 网页抓取 / 搜索 | fc-local | 独立技能 |
| 邮件自动化 | automating-mail | 独立技能 |
| 代办事宜管理 | mac-reminder | 独立技能 |
| 配置 ellamaka | ellamaka-config | 独立技能 |

---

## 2. Agent 生态

### Wopal（主控 Agent）

**定位**：IT 女巫师，研究、方案制定与执行编排的负责人。

**文件位置**：`agents/wopal-cn.md` / `agents/wopal.md`

**职责**：
- 研究、方案设计、任务拆解
- 委派 fae 实施、委派 rook 审查
- 验证产出、推进流程、决策权衡
- 与用户沟通、管理上下文

**协作关系**：主控中枢，所有子代理的委派者。

### fae（执行 Agent）

**定位**：敏捷精灵，专注于实施执行，不负责规划与审查。

**文件位置**：`agents/fae-cn.md` / `agents/fae.md`

**职责**：
- 执行 Wopal 委派的实施类 Task
- 文件编辑、构建运行、测试执行、git 操作
- 返回可验证的执行结果（文件路径、命令输出）

**只读边界**：无。fae 可以修改文件、运行命令、提交代码。

**协作关系**：Wopal 的执行者，rook 的审查对象。

### rook（审查 Agent）

**定位**：职业质疑者，只读审查代理，Plan 与代码质量的守门员。

**文件位置**：`agents/rook-cn.md` / `agents/rook.md`

**专属技能**：
- `df-plan-review` — Plan 质量审查（目标覆盖、任务完整性、依赖正确性、验证可证伪性）
- `df-implement-review` — 代码质量审查（目标验证、技术债扫描、测试质量审计）

**职责**：审核方案是否真的能达成目标、复核代码是否让目标成为事实。返回 PASS / REVISE / BLOCK 结构化报告。

**只读边界**：
- 绝对禁止：写入文件、修改代码、运行构建/测试、提交 git、修复 bug
- 唯一输出：通过会话文本输出结构化审查报告

**协作关系**：Wopal 在关键节点委派 rook，rook 审查 fae 产出并返回判定，Wopal 据此推进或修正。修订循环上限 3 轮，超限由用户裁决。

---

## 3. 源码结构

> `.wopal/` 是 `sampx/wopal-space-ontology`（`wopal-cn/ontology` 的 fork）的 git worktree，**直接编辑即生效**。

```
.wopal/
├── skills/              # 所有技能统一存放
├── commands/            # 命令定义
│   ├── *.md             # 共享命令
│   └── wopal/           # Wopal 专属命令
├── rules/               # 规则定义
│   ├── *.md             # 共享规则
│   └── wopal/           # Wopal 专属规则
├── agents/              # Agent 灵魂定义（wopal, fae, rook）
├── plugins/             # 插件目录（wopal-plugin 等）
│   └── wopal-plugin/    # 空间唯一插件（规则注入、任务委派、记忆、上下文管理）
└── config/              # 空间本地配置（不提交到 git）
```

### 本地化编写规则

#### 语言版本流程

更新 `agents/`、`rules/`、`commands/` 中的语义内容时，必须先生成用户偏好语言版本供审核；确认通过后再翻译到对应英文正式版。

1. 英文正式版（`.wopal/agents/`、`.wopal/rules/`、`.wopal/commands/`）是运行时加载源。
2. 用户偏好语言版本是语义确认源，放在 `docs/products/wopal-space-ontology/LANG/<locale>/` 下对应子目录。
3. `<locale>` 采用 IETF BCP 47 / RFC 5646 标记，如 `zh-CN`。

#### 文件命名

| 范围 | 本地化版本位置 | 命名规则 |
|------|---------------|---------|
| Ontology 审核版 | `docs/products/wopal-space-ontology/LANG/<locale>/<type>/` | 文件名与英文版一致，locale 仅体现在路径中 |

正式英文版始终保持无后缀命名。

### 技能权限配置

Agent 通过 frontmatter 的 `permission.skill` 控制技能可见性。技能统一存放在 `skills/` 目录，通过 Permission 实现 Agent 间隔离：

```yaml
# Wopal：允许所有技能
permission:
  "*": allow

# fae：仅允许特定技能
permission:
  skill:
    "*": deny
    project-worktrees: allow

# rook：仅允许审查技能
permission:
  skill:
    "*": deny
    df-plan-review: allow
    df-implement-review: allow
```

---

## 4. 技能开发规范

技能是本项目的**首要产出**，是可复用、可分发、可版本化的 Agent 能力单元。

### 4.1 目录结构

```
skill-name/
├── SKILL.md          # 必须：YAML frontmatter + Markdown 指令
├── scripts/          # 可选：可执行脚本（确定性 / 重复任务）
├── references/       # 可选：按需加载的参考文档
└── assets/           # 可选：模板、图标等静态资源
```

### 4.2 渐进式披露（三级加载）

| 层级 | 内容 | 限制 | 说明 |
|------|------|------|------|
| 元数据 | name + description | ~100 字 | 始终可见，决定是否触发 |
| 主体 | SKILL.md body | <500 行 | 触发后加载，核心流程 |
| 资源 | scripts / references / assets | 无限制 | 按需读取或执行 |

主体超 500 行时拆分到 references/，SKILL.md 中明确指引。

### 4.3 Description 编写

description 是**主要触发机制**，需包含：

1. 技能做什么
2. 何时使用（具体场景 / 用户短语）
3. 适当"pushy"——宁可多触发也不要漏触发

**示例**：

```yaml
description: |
  Compress official documentation into concise AI references. ⚠️ MUST use when user requests:
  (1) Documentation compression or condensing, (2) Creating AI-friendly reference materials,
  (3) Reducing token usage for large documentation, (4) Extracting technical specifications.
  🔴 Trigger even when user does not explicitly mention "AI reference" if the task involves
  documentation compression or spec extraction.
```

**禁止包含**：详细执行步骤（属 body）、代码示例（属 scripts/assets）、框架特定细节（属 references）、模糊触发条件。

### 4.4 SKILL.md 编写

**结构**：标题 + 定位 → 核心流程 → 输出格式 → 注意事项

**风格**：
- 用祈使句，解释 **why** 而非堆砌约束词
- 避免强制固定步骤顺序
- 包含真实输入 / 输出示例

**必须显式声明**：依赖的其他技能、必需的环境变量、技能间协作调用顺序。

**禁止包含**：恶意代码、硬编码参数、冗余背景、元信息（设计原理、版本历史等属开发者文档）。

### 4.5 质量验证

1. 设计 2-3 个真实测试用例（用户实际会说的 prompt）
2. 迭代循环：执行 → 评估 → 改进 → 重复
3. 多测试用例出现相同脚本 → 提取到 scripts/

### 4.6 资源引用

大参考文件（>300 行）包含目录。在 SKILL.md 中清晰指引何时读取：

```markdown
## 参考
- 云平台部署参数见 `references/aws.md`（仅 AWS 场景读取）
- API 规范见 `references/api-schema.md`
```

---

## 5. 插件开发

**详细规范**：`plugins/wopal-plugin/AGENTS.md`

wopal-plugin 是 TypeScript 编写的 OpenCode 运行时扩展，提供：

| 能力 | 描述 |
|------|------|
| **规则注入** | 发现规则文件 → 匹配条件 → 注入系统提示词 |
| **任务委派** | 非阻塞子会话启动、状态监控、双向通信 |
| **记忆系统** | LanceDB 存储、语义检索、蒸馏注入 |
| **上下文管理** | 会话摘要、title 管理、上下文压缩（策略由 space-master skill 控制） |
