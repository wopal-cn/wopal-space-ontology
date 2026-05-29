# Ontology — 空间灵魂、规约与能力基因工具包设计

> **Status**: Active
> **Updated**: 2026-05-29
> **Parent Architecture**: `docs/products/wopal-space/DESIGN-wopalspace.md`
> **Parent Product**: `docs/products/wopal-space/PRD-wopalspace.md`

## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| 2026-05-29 | Updated | 新增 Design Document Layering（§6.4）与 Memory Runtime Files（§7.1），承接产品 DESIGN 迁移的项目级细节。 |
| 2026-05-29 | Updated | 明确 STRUCTURE compact schema 与 `/init` 消费 `wopal space scan` JSON 的维护边界。 |
| 2026-05-28 | Updated | 同步 P1 实施真相：空间初始化模板已补齐，schema 已对齐 runtime/space 结构，`/init` 已收敛为 runtime 维护入口。 |
| 2026-05-24 | Updated | 补齐 Agent 体系（Rook + WSF 子代理）、技能规模更新、命令体系扩展、Ontology 目标结构新增 templates 与 config |

---

## 1. Project Role

ontology 是 WopalSpace 的 Space Ontology 层，也是空间灵魂、规约与能力基因工具包的承载面。Agent 身份、规则、技能、命令、插件、模板与辅助脚本在这里沉淀和分发；ellamaka 负责解释执行，wopal-cli 负责确定性操作编排，space runtime 负责当前空间运行态。

核心职责：空间灵魂可复用、空间规约可分发、空间能力可编排、空间经验可延续。Fork 一个 ontology = 复制一套可持续演化的空间起点。

物理分发以 Git source + worktree 模型：P1 默认 clone ontology source，显式 `--fork` 时使用 user fork；二者最终都落到 `space/<space-name>` 分支与 `<space>/.wopal/` worktree。多数加载链路相关变更在用户重启 ellamaka 后完成验证。

---

## 2. Capability Scope

ontology 拥有的目标态能力组：

| 能力域 | 拥有的目标能力 | 明确边界 |
|---|---|---|
| Agent 定义 | 3 级核心 Agent（Wopal/Fae/Rook）+ 24 个 WSF 子代理 + Translator，灵魂文件仅定义角色与决策原则 | 不持有 Agent runtime 实现 |
| 技能生态 | 80+ 技能三层体系（空间根 / 工作流 / 专用），按触发条件自动注入 | 不判断技能产品价值，不负责 skill 内容设计 |
| 命令体系 | 17+ 命令覆盖空间维护、记忆进化、项目管理、开发支持、上下文管理，可覆盖内置命令 | 不实现命令执行引擎 |
| 规则体系 | 项目级 + 空间级 + Agent 专属规则，wopal-plugin 按条件匹配注入 | 不修改 ellamaka 核心行为 |
| 运行时插件 | wopal-plugin 提供规则注入、任务委派、记忆系统、上下文管理四大能力，7 个 plugin tools | 仅限插件内部，不侵入技能/规则/命令 |
| 模板体系 | 空间初始化模板（结构、守则、用户档案）+ 文档模板（PRD/DESIGN/phase/AGENTS） | 不持有空间运行态实例 |
| 辅助脚本 | ontology 维护、git hooks 与辅助自动化脚本 | 仅承担辅助维护动作 |

---

## 3. Design Principles

1. **声明式优于命令式** — 本体声明"空间应该有什么"，引擎负责解释执行。Markdown + YAML 是一等公民。
2. **灵魂、规约与能力协同演进** — Agent 灵魂、规则、技能、命令、模板与脚本共同构成空间本体，演进时保持角色、规约与执行面的协同。
3. **灵魂与操作分离** — Agent 灵魂文件只定义角色与决策原则（"我是谁"），操作知识由技能承载（"我怎么做"）。
4. **插件适配原则** — wopal-plugin 是运行时插件，集中提供规则注入、任务委派、记忆系统和上下文管理，插件能实现尽量不改造 engine。
5. **Git source + worktree 分发** — P1 默认 clone，显式 `--fork` 才进入 fork 模式；Git 分支承载 space-specific 演化，通用能力成熟后回流 upstream。

---

## 4. Module Architecture

### 4.1 Agent 体系

| 模块 | 职责 | 载体 |
|------|------|------|
| 核心三级 | Wopal（主控）/ Fae（执行）/ Rook（审查），职责分离协作 | `agents/wopal.md`、`agents/fae.md`、`agents/rook.md` |
| WSF 子代理 | 24 个专职 Agent（mapper、researcher、planner、executor、reviewer、auditor、verifier 等），覆盖产品调研到验收全生命周期 | `agents/wsf-*.md` |
| Translator | 内容翻译，保留技术术语 | `agents/translator.md` |

协作闭环：Wopal 规划并委派 Fae 实施，委派 Rook 审查 Fae 产出。修订循环上限 3 轮。权限隔离通过 ellamaka agent frontmatter 的 `permission.skill` 字段实现。

### 4.2 技能体系

| 层次 | 职责 | 规模 | 代表 |
|------|------|------|------|
| 空间根技能 | 流程导航、场景路由、委派基础原则 | 1 | `space-master` |
| 工作流技能 | 开发状态机、Plan 规范、委派 API、WSF 产品流水线 | ~66 | `dev-flow`、`agents-collab`、WSF 技能族 |
| 专用技能 | 独立领域能力 | ~13 | `fc-local`、`youtube-master`、`ellamaka-config`、`automating-mail`、`mac-reminder`、`git-worktrees`、`skill-creator` 等 |

每个技能遵循三级加载：元数据（name + description）→ 主体（SKILL.md body）→ 资源（scripts / references / assets）。

### 4.3 命令体系

| 类别 | 命令 | 载体 |
|------|------|------|
| 空间维护 | `/init` | `commands/init.md` |
| 记忆与进化 | `/wopal:memo`、`/wopal:evolve`、`/wopal:distill`、`/wopal:memory` | `commands/wopal/` |
| 唤醒与感知 | `/wopal:summon` | `commands/wopal/summon.md` |
| 文档管理 | `/cupdate-prd`、`/cupdate-design`、`/cupdate-roadmap`、`/cupdate-agent-rules`、`/cupdate-readme` | `commands/cupdate-*.md` |
| 开发支持 | `/commit`、`/review` | `commands/commit.md`、`commands/review.md` |
| 上下文管理 | `/context-continue`、`/context-handoff`、`/context-recover` | `commands/context-*.md` |
| 其他 | `/evaluate-skill`、`/extract-br` | `commands/evaluate-skill.md`、`commands/extract-br.md` |

ontology 命令可覆盖 ellamaka 内置命令。

### 4.4 规则体系

| 类别 | 职责 | 载体 |
|------|------|------|
| 项目级规则 | 语言与框架约束 | `rules/typescript.md`、`rules/python.md` |
| 空间级规则 | 通用行为规范 | `rules/business-rules.md` |
| Agent 专属规则 | Wopal 记忆规则、Fae Astro 规则等定向约束 | `rules/wopal/mem-rule.md`、`rules/fae/astro.md` |

规则通过 wopal-plugin 在 Agent 启动时注入，按条件匹配生效。

### 4.5 插件体系

wopal-plugin 由 TypeScript 编写，Bun 执行，基于 EllaMaka Plugin SDK。

| 模块 | 职责 | 禁用开关 |
|------|------|---------|
| Global（入口） | 加载 .env、检查开关、注册 Hooks/Tools | 无 |
| Rules | 规则发现 → 条件匹配 → 注入系统提示词 | `WOPAL_RULES_INJECTION_ENABLED` |
| Memory | LanceDB 存储、语义检索、蒸馏注入 | `WOPAL_MEMORY_ENABLED`（总控） |
| Task | 非阻塞子会话启动、状态监控、双向通信、并发控制 | 无（始终启用） |
| Monitor | 周期性调度引擎，统一管理监控策略 | 无（始终启用） |
| Context | 会话摘要、上下文压缩与恢复 | 无（始终启用） |

### 4.6 模板体系

| Template | 渲染目标 | 职责 |
|----------|---------|------|
| `wopalspace-schema.yaml` | 空间目录结构 | 声明 space runtime 与 workspace 根目录结构 |
| `root-AGENTS.md` | `<space>/AGENTS.md` | 启动入口，指向 STRUCTURE / USER / REGULATIONS |
| `gitignore` | `<space>/.gitignore` | 忽略运行态噪音，防止日志、缓存、备份误提交 |
| `STRUCTURE.md` | `.wopal-space/STRUCTURE.md` | 空间结构模板 |
| `REGULATIONS.md` | `.wopal-space/REGULATIONS.md` | 空间守则模板 |
| `memory/USER.md` | `.wopal-space/memory/USER.md` | 用户档案模板 |
| `memory/MEMORY.md` | `.wopal-space/memory/MEMORY.md` | 文件型长期记忆模板 |
| `command.md` | 命令文件 | 命令模板 |
| `prd.md` | 产品 PRD | PRD 模板 |
| `design-product.md` | 产品 DESIGN | 总体设计模板 |
| `design-project.md` | 项目 DESIGN | 项目设计模板（含能力范围与演进路线） |
| `phase.md` | 阶段文档 | 产品阶段范围与验收条件模板 |
| `agents.md` | 项目 AGENTS.md | 开发规范模板 |

#### `STRUCTURE.md` schema 与生成规则

`STRUCTURE.md` 是空间实例的 compact 结构事实文件。它会进入 Agent 启动上下文，因此实例文件只保留低 token、高价值、可行动的空间索引，不承载全量扫描清单。

文件由两层组成：

1. **YAML frontmatter**：机器可解析的启动索引，用于定位空间组件、固定运行态目录和已确认的高价值 repo。
2. **Markdown table**：Agent / 人类可读的空间资产地图，用于解释已确认资产路径、类型、层级和职责。

frontmatter 生成规则：

- 保留 `version`、`space`、`space-component-type`、`ontology-worktree`、`space-runtime` 和 `repos`。
- `space-runtime` 保留目录 / 文件用途描述，因为它直接进入 Agent 启动上下文；`.wopal-space/` 不进入 Markdown table。
- `repos` 只记录 pinned / high-value repo，不记录 scan 发现的全量 repo；大量低频 repo 留在 scan 输出或用户手工说明中。
- frontmatter 不记录 `collection`、普通 module、全量 `AGENTS.md`、docs 子目录或临时扫描结果。
- 用户未知 key 必须保留；结构 key 由 `/init` 在展示 diff 并获得用户确认后更新。

Markdown table schema：

| Field | Meaning |
|---|---|
| `path` | 相对 space root 的路径 |
| `type` | 组件类型，如 `ontology-worktree`、`space-runtime`、`projects`、`contents`、`labs`、`docs` |
| `level` | 结构层级，如 `worktree`、`repo`、`clone`、`module`、`collection`、`dir` |
| `description` | Agent 可读职责说明，不写规则正文 |

Markdown table 维护规则：

- 表格分为 managed block 与 user block；managed block 可由 `/init` 在确认后重写，user block 永不修改。
- managed block 默认只放 `.wopal` 固定关键模块、frontmatter pinned repos、用户确认的重要 module / collection。
- root `AGENTS.md` 是 ellamaka 启动入口，不进入表格。
- `wopal space scan` 发现的新 repo 或 `AGENTS.md` 模块不自动进入表格；`/init` 只报告并等待用户确认。
- 用户从 managed table 删除的非固定资产，不得因再次扫描被静默补回。

描述来源规则：

- 受控 repo / module 的首选描述来源是对应 `AGENTS.md` frontmatter `description`。
- 次选来源是 `AGENTS.md` positioning / 第一段、`README.md` 第一段或 package metadata description。
- CLI scan 只提取已有描述，不生成描述；需要新描述时由 `/init` 展示方案并等待用户确认。

维护边界：

- CLI 按模板创建初始 `STRUCTURE.md`，并由 `wopal space scan` 提供 repo / module 事实扫描 JSON。
- `/init` 负责后续结构校准：消费 scan JSON、对照 compact schema 生成更新方案、保留用户描述，并在用户确认后写入。
- schema 与生成规则维护在设计文档和模板说明中；空间实例的 `STRUCTURE.md` 聚焦结构事实。

#### 最小空间模板设计

P1 初始化模板表达可启动 WopalSpace 的最小协议，聚焦通用结构而非特定 space 的组织习惯。

CLI 首次初始化必须创建：

```text
<space>/
  AGENTS.md
  .gitignore
  .wopal/
  projects/
  contents/
  docs/
  .wopal-space/
    STRUCTURE.md
    REGULATIONS.md
    memory/
      USER.md
      MEMORY.md
      diary/
    logs/
    .tmp/
    INBOX/
    backup/
```

`projects/`、`contents/`、`docs/` 是 WopalSpace 的核心工作容器，必须初始化并写入 `STRUCTURE.md`。`labs/`、`external/`、`scripts/` 属于特定 space 的组织扩展，不进入最小模板；若用户后续创建这些目录，由 `/init` 扫描后再写入实例 `STRUCTURE.md`。

`wopalspace-schema.yaml` 声明确确定性创建结构与模板映射。必需模板缺失时，CLI 以 fail fast 方式报告缺失模板、ontology source/path 和修复建议，并保持 space registry 与 active space 状态不变。

`.gitignore` 由 CLI 首次渲染；重复初始化时若已存在 `.gitignore`，CLI 保留现有内容，并报告缺失的 WopalSpace 建议忽略项。

#### `wopalspace-schema.yaml` 设计草案

`wopalspace-schema.yaml` 是 CLI 确定性初始化的输入。P1 目标结构使用 `runtime` / `space` 概念命名，分别描述 `.wopal-space/` 运行态目录与 space root 目录。

目标 schema 语义：

```yaml
version: 1

runtime:
  path: .wopal-space
  files:
    - template: STRUCTURE.md
      target: STRUCTURE.md
    - template: REGULATIONS.md
      target: REGULATIONS.md
    - template: memory/USER.md
      target: memory/USER.md
    - template: memory/MEMORY.md
      target: memory/MEMORY.md
  dirs:
    - path: memory/diary
      keep: [.gitkeep]
    - path: logs
      keep: [.gitkeep]
    - path: .tmp
    - path: INBOX
    - path: backup
      keep: [.gitkeep]

space:
  files:
    - template: root-AGENTS.md
      target: AGENTS.md
    - template: gitignore
      target: .gitignore
  dirs:
    - path: projects
      keep: [.gitkeep]
    - path: contents
      keep: [.gitkeep]
    - path: docs
      keep: [.gitkeep]
```

CLI 消费规则：

- `runtime.path` 指向 `.wopal-space/`，其中 `files.target` 是相对 runtime path 的路径。
- `space.files.target` 是相对 space root 的路径。
- `template` 均从 `<space>/.wopal/templates/` 读取。
- `keep` 表示创建目录后可写入 `.gitkeep` 保留空目录。
- schema 声明最小空间结构：`projects/`、`contents/`、`docs/`；`labs/`、`external/`、`scripts/` 等扩展目录由用户创建后再由 `/init` 扫描进实例结构。

#### `root-AGENTS.md` 模板设计

`root-AGENTS.md` 作为模板存在，实例化目标是 space root 的 `AGENTS.md`。它定位为空间启动提示与用户个性化规则入口。

模板职责：

1. 提醒 Agent 在上下文压缩或信息缺失时可重新读取 `.wopal-space/STRUCTURE.md`、`.wopal-space/REGULATIONS.md`、`.wopal-space/memory/USER.md` 与 `.wopal-space/memory/MEMORY.md`。
2. 提供用户空间个性化规则的写入位置。

空间事实由 `STRUCTURE.md` 承载，工作规则由 `REGULATIONS.md` 承载，详细技能路由由 `space-master` 承载。

#### `REGULATIONS.md` 模板设计

P1 的 `REGULATIONS.md` 初始化时写入通用空间守则，之后作为用户可持续维护的运行态文件。ontology 守则升级通过 diff/建议呈现，由用户确认后吸收。

模板应包含以下通用规则族：

- 安全红线：误删防护、工作边界、目录保护、敏感信息保护。
- Git 基本法：实施前检查、提交前检查、提交格式、历史不可变原则。
- 子代理委托：任何委派前加载 `agents-collab`，并遵守路径与目标项目上下文检查。
- 记忆与进化：长期记忆写入需去重、展示、等待用户确认。
- 核心技能入口：介绍 `space-master`、`agents-collab`、`dev-flow` 三个空间核心技能。

核心技能概要：

| 技能 | 空间职责 | 触发场景 |
|---|---|---|
| `space-master` | 空间技能根与流程路由总入口 | 任务意图不清、空间运维、ontology 协作、技能体系、流程选择、多 Space 管理 |
| `agents-collab` | 子代理协作协议 | 任何 fae、rook 或 general 子代理委派前 |
| `dev-flow` | Issue/Plan 驱动开发状态机 | Issue、Plan、审批、执行、验证、归档 |

`space-master` 是 ontology 的根技能，但其当前实现仍偏粗糙；后续应单独重构为概念模型入口、流程选择器、核心技能路由器、ontology/worktree 协作指南与多 Space 运维入口。

### 4.7 辅助脚本体系

| 目录 | 职责 |
|------|------|
| `scripts/git-hooks/` | ontology 开发与提交阶段使用的 hooks 脚本 |
| `scripts/emt` / `scripts/oct` | 辅助维护入口脚本 |
| `scripts/oc-auto-approve.py` | 本地辅助自动化脚本 |
| `scripts/setup-git-hooks.sh` | hooks 安装脚本 |

### 4.8 配置体系

`.wopal/config/settings.jsonc` 提供空间级 ellamaka 配置层：provider、model、agent 权限和功能开关。与全局配置 `~/.wopal/config/settings.jsonc` 合并生效。

---

## 5. Technical Stack Choices

| 技术 | 用途 | 选择理由 | 边界 |
|------|------|---------|------|
| Markdown + YAML | Agent 定义、技能、规则、命令、模板 | ellamaka 原生支持的声明式格式 | 不承载运行时状态 |
| TypeScript | wopal-plugin 运行时 | OpenCode Plugin SDK 原生语言，Bun 执行 | 仅限插件内部，不侵入技能/规则/命令 |
| Shell / Python | ontology 维护与辅助脚本 | 适合 hooks 安装、开发辅助和轻量自动化 | 仅承担辅助维护动作，不替代插件运行时能力 |
| LanceDB | 记忆存储 | 嵌入式向量数据库，零运维，向量 + FTS + LIKE 混合检索 | 仅记忆模块使用，不作为空间主存储 |
| Git | 版本控制与分发载体 | clone / fork + worktree 模型支持分支化演化和上游回流 | 不替代空间运行态结构 |

---

## 6. Interfaces and Contracts

### 6.1 ellamaka 加载接口

ellamaka 在 wopal-space mode 下从 ontology 加载：

1. `agents/*.md` — Agent 灵魂定义与 frontmatter 权限配置
2. `skills/*/SKILL.md` — 技能元数据与指令（按触发条件注入）
3. `commands/*.md` 与 `commands/wopal/*.md` — 命令定义（可覆盖内置命令）
4. `plugins/wopal-plugin.ts` — 插件入口（symlink → src/index.ts）
5. `config/settings.jsonc` — 空间级配置合并

多数加载链路相关改动以 ellamaka 重启后的加载结果作为验证标准。

### 6.2 wopal-plugin 工具接口

| 工具 | 职责 |
|------|------|
| `wopal_task` | 非阻塞子会话启动 |
| `wopal_task_output` | 任务状态与输出查询 |
| `wopal_task_reply` | 双向通信与恢复 |
| `wopal_task_abort` | 任务终止 |
| `wopal_task_finish` | 任务完成清理 |
| `memory_manage` | LanceDB 记忆 CRUD + 蒸馏 |
| `context_manage` | 会话摘要 + 上下文压缩 |

### 6.3 初始化与维护目标

Ontology 提供初始化协议，wopal-cli 负责确定性 materialize，`/init` 负责智能校准。CLI 实现建立在 ontology 模板、schema 与 `/init` 维护机制逐步验证成熟的基础上。

`wopal space init` 是创建/初始化入口。新建、已有目录补齐、合法 space 注册与 active space 设置均由 `space init` 承载。

P1 默认使用 clone 模式 materialize ontology source，降低新用户初始化成本；用户显式传入 `--fork` 时进入 fork 模式。`STRUCTURE.md` 模板中的 ontology source 使用 `${ONTOLOGY_REPO}` 占位符，表达实际使用的 ontology source。

CLI 负责：

1. 解析 space name/path 与 ontology source。
2. 准备 `<space>/.wopal/` ontology worktree。
3. 读取 `wopalspace-schema.yaml` 与必需模板。
4. 创建 core runtime、`projects/`、`contents/`、`docs/`。
5. 首次渲染 `AGENTS.md`、`.gitignore`、`STRUCTURE.md`、`REGULATIONS.md`、`memory/USER.md`、`memory/MEMORY.md`。
6. rerun 时创建缺失项并保留已有文件内容。
7. 在完整成功后注册 space 并设置 active space。
8. 提供 `wopal space scan` 只读扫描入口，输出 repo / module JSON 事实。
9. 输出下一步：进入 space、启动 ellamaka、运行 `/init` 做首次智能校准。

CLI 边界：

- `wopal space scan` 只做 repo / module 事实发现和已有描述提取，不读写 `STRUCTURE.md`。
- `/init` 承担 scan JSON 消费、结构更新方案生成和用户确认后的写入。
- 用户与 `/wopal:evolve` 承担运行态文件内容维护。
- 用户确认流程承接 `REGULATIONS.md` 差异吸收。
- 记忆命令承接用户偏好与长期记忆沉淀。
- 项目规则命令承接项目业务规则维护。

`/init` 负责：

1. 读取 `.wopal-space/STRUCTURE.md`。
2. 调用或消费 `wopal space scan` 输出的 repo / module JSON 事实。
3. 按 compact schema 与 managed/user block 规则生成 frontmatter/table diff。
4. 校验 `.wopal-space/` runtime 固定结构，不深扫 runtime 内容，不把 runtime 写入 table。
5. 提示模板与实例文件之间需要用户人工处理的差异。
6. 先输出 plan/diff，等待用户确认后写入。

`/init` 聚焦 CLI 初始化后的结构维护：消费 scan 事实、维护 compact `STRUCTURE.md`、runtime 检查、模板差异提示与用户确认后的写入。

### 6.4 Design Document Layering

WopalSpace 的设计知识按三层分工，避免细节错位和维护混乱：

| 文档 | 定位 | 内容 |
|---|---|---|---|
| 产品 DESIGN | 跨项目的稳定架构契约 | 系统分层、子系统职责边界、"谁负责什么"。详细契约和 schema 以项目 DESIGN 为准 |
| 项目 DESIGN | 单个项目的稳定设计真相 | 命令契约、JSON schema、模块架构、数据模型、关键决策。阶段范围和验收以 Phase 文档为准 |
| Phase 文档 | 某阶段的范围与验收条件 | Phase scope、involved projects、exit criteria、风险。架构细节以项目 DESIGN 为准 |

关系：

- 产品 DESIGN 回答"系统如何组成"；项目 DESIGN 回答"单个项目如何实现"；Phase 文档回答"这一阶段要交付什么"。
- 稳定契约只进项目 DESIGN，不进 Phase 文档——Phase 最终归档后不应成为查找架构细节的入口。
- 产品 DESIGN 引用但不复制项目 DESIGN 细节；Phase 文档引用但不复制 DESIGN 契约。
- Phase 讨论中形成的设计决策，在讨论完毕后沉淀到对应项目 DESIGN；Phase 文档只保留范围和验收。

### 6.5 分发模型

```
ontology source → clone by default / fork with --fork → space/<name> branch → <space>/.wopal/ worktree
```

`.wopal/` 是当前 space 的 worktree。P1 默认从 ontology source clone，降低新用户初始化门槛；需要长期回流、多设备同步或 upstream 协作时再使用 `--fork` 模式。变更先进入当前 space 的 ontology 分支，再通过 ellamaka 加载链路进入运行时验证；通用能力成熟后回流 fork / upstream。

---

## 7. Data and State Model

ontology 本身是无状态的声明式能力包，不持有运行时状态：

| 数据 | 持有者 | ontology 的角色 |
|------|--------|----------------|
| Agent 灵魂定义 | ontology（`agents/*.md`） | 定义者 |
| 技能定义 | ontology（`skills/*/SKILL.md`） | 定义者 |
| 规则定义 | ontology（`rules/*.md`） | 定义者，wopal-plugin 执行注入 |
| 命令定义 | ontology（`commands/*.md`） | 定义者，ellamaka 执行 |
| 辅助脚本 | ontology（`scripts/**`） | 维护与辅助自动化载体 |
| 插件运行时状态 | wopal-plugin 进程内 | 运行载体 |
| 记忆数据 | LanceDB（space runtime 内） | ontology 提供工具，不持有数据 |
| 会话状态 | ellamaka session | ontology 不持有 |
| 空间结构 | `.wopal-space/STRUCTURE.md` | ontology 提供模板，不持有实例 |
| 空间守则 | `.wopal-space/REGULATIONS.md` | ontology 提供初始化模板，不持有实例 |

Runtime 维护由 ontology commands 驱动：`/init`（结构校准）、`/wopal:memo`（日记暂存）、`/wopal:evolve`（经验沉淀）、`/wopal:distill`（记忆蒸馏）、`/cupdate-agent-rules`（项目规范更新）。

### 7.1 Memory Runtime Files

空间运行时记忆由多层文件/存储组成，各有明确的维护者：

| File / Store | 职责 | Maintainer |
|---|---|---|
| `memory/USER.md` | 稳定用户偏好、沟通方式、工作习惯 | `/wopal:evolve` |
| `memory/MEMORY.md` | 适合文件保存的空间级经验 | `/wopal:evolve` |
| `memory/diary/` | 会话经验和候选沉淀暂存池 | `/wopal:memo` / `/wopal:evolve` |
| LanceDB | 可检索可注入的记忆 | `memory_manage` / `/wopal:distill` / `/wopal:memory` |

规则：

1. USER.md 记录稳定用户偏好和画像。
2. MEMORY.md 记录适合文件保存的空间级经验。
3. LanceDB 记录可检索的知识、经验、避坑。
4. diary 是暂存池，不是最终知识库。
5. 可从代码直接获得的信息不污染长期记忆层。

---

## 8. Evolution Roadmap

描述 ontology 如何跟随 WopalSpace 产品阶段演进：

### Phase 0: Core Ontology Foundation

- **目标**：建立第一代空间本体：Agent 灵魂定义、技能生态、规则注入、任务委派、记忆系统、上下文管理、命令体系、fork-worktree 分发模型。
- **已落地**：28 个 Agent（3 核心 + 24 WSF + translator）、80+ 技能三层体系、17+ 命令、wopal-plugin 四大能力 + 7 个 plugin tools、fork-worktree 分发、空间初始化模板（`root-AGENTS.md`、`STRUCTURE.md`、`REGULATIONS.md`、`memory/USER.md`、`memory/MEMORY.md`、`gitignore`）与 `wopalspace-schema.yaml` 已就绪。
- **剩余缺口**：无 —— 此阶段已完成。

### Phase 1: One-click Distribution Readiness

- **目标**：先验证成熟 ontology 初始化基础，再将其交给 CLI 做一键分发：补齐最小空间模板、结构 schema、`/init` 校准与重复初始化保留已有内容的目标行为，使 ontology 从"可用"走向"可初始化、可校准、可分发"。
- **已落地**：文档模板体系已建立（prd / design-product / design-project / phase-product / phase-project / agents / command），PRD / DESIGN 模板已投入使用，Agent/技能/规则目录结构标准化。空间初始化模板已补齐（`root-AGENTS.md`、`STRUCTURE.md`、`REGULATIONS.md`、`memory/USER.md`、`memory/MEMORY.md`、`gitignore`），`wopalspace-schema.yaml` 已对齐 runtime/space 结构（移除 `.workspace.md` 依赖），`/init` 已收敛为 space runtime 维护入口（plan/diff/confirm 工作流），`.gitignore` 模板已创建，`REGULATIONS.md` 模板已包含通用空间守则与核心技能入口概要。
- **剩余缺口**：`space-master` 根技能重构设计、manifest.yaml（本体元数据）、`wopal space validate` 命令原型。

### Phase 2: Space Experience & Autonomy

- **目标**：提升本体的可观测性与自治水平：技能质量感知、进化建议生成、上游贡献闭环、本体版本追踪。
- **已落地**：设计已定，尚未实施。
- **剩余缺口**：技能调用数据采集、进化建议生成、cherry-pick + PR 回流流程、版本追踪。

---

## 9. Related Documents

| 文档 | 说明 |
|------|------|
| `docs/products/wopal-space/PRD-wopalspace.md` | 父产品 PRD — 产品意图、定位与演进路线 |
| `docs/products/wopal-space/DESIGN-wopalspace.md` | 父产品 DESIGN — 总体架构契约 |
| `projects/wopal-cli/docs/DESIGN.md` | wopal-cli 子系统设计 — 统一操作入口 |
| `.wopal/docs/BUSINESS_RULES.md` | 本体业务规则 |
| `AGENTS.md` | 本体项目开发规范 |
