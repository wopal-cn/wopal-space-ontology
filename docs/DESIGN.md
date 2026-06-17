# Ontology — 空间灵魂、规约与能力基因工具包设计

> **Status**: Active
> **Updated**: 2026-06-12
> **Parent Architecture**: `docs/products/wopal-space/DESIGN-wopalspace.md`
> **Parent Product**: `docs/products/wopal-space/PRD-wopalspace.md`

## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| 2026-06-13 | Updated | §6.9 Agent Ontology Maintenance Workflow — 状态解读、更新决策、能力提升、多级 fork 维护和 safe-apply/contribute 工作流。补充 `/ontology-maintain` 命令。 |
| 2026-06-13 | Updated | §6.8 — 重构 `ontology status`/`space status` 输出规范 |
| 2026-05-31 | Updated | 收敛 base capabilities + space overlay：setup 从 ontology main 物化 base，space overlay 同名覆盖。 |
| 2026-05-30 | Updated | 将 Git source / worktree 分发细节下沉到 `docs/DISTRIBUTION.md`。 |
| 2026-05-29 | Updated | 明确 STRUCTURE compact schema、Design Document Layering 与 `/init` 消费 `wopal space scan` JSON 的维护边界。 |

---

## 1. Project Role

ontology 是 WopalSpace 的 Space Ontology 层，也是空间灵魂、规约与能力基因工具包的承载面。Agent 身份、规则、技能、命令、插件、模板与辅助脚本在这里沉淀和分发；ellamaka 负责解释执行，wopal-cli 负责确定性操作编排，space runtime 负责当前空间运行态。

核心职责：空间灵魂可复用、空间规约可分发、空间能力可编排、空间经验可延续。Fork 一个 ontology = 复制一套可持续演化的空间起点。

物理分发以 Git source + worktree 模型，支持 clone 和 fork 两种模式（详见 §6.8）。加载链路相关变更在用户重启 ellamaka 后完成验证。

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

## 3. Key Decisions

| Decision | Rationale |
|----------|-----------|
| 声明式优于命令式 | 本体声明"空间应该有什么"，引擎负责解释执行。Markdown + YAML 是一等公民。 |
| 灵魂、规约与能力协同演进 | Agent 灵魂、规则、技能、命令、模板与脚本共同构成空间本体，演进时保持角色、规约与执行面的协同。 |
| 灵魂与操作分离 | Agent 灵魂文件只定义角色与决策原则（"我是谁"），操作知识由技能承载（"我怎么做"）。 |
| 插件适配原则 | wopal-plugin 是运行时插件，集中提供规则注入、任务委派、记忆系统和上下文管理，插件能实现尽量不改造 engine。 |
| Git source + worktree 分发 | clone 降低门槛，fork 支持贡献；分支承载空间演化，通用能力回流上游（详见 §6.8）。 |

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

`space-master` 是 ontology 的根技能，但其当前实现仍偏粗糙；后续应单独重构为概念模型入口、流程选择器、核心技能路由器、ontology/worktree 协作指南与多 Space 运维入口。

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
| `agent-rules.md` | 项目 AGENTS.md | 开发规范模板 |

模板的 schema 字段定义、生成规则、消费规则与各模板设计详见 §6.4。

### 4.7 辅助脚本体系

| 目录 | 职责 |
|------|------|
| `scripts/git-hooks/` | ontology 开发与提交阶段使用的 hooks 脚本 |
| `scripts/emt` / `scripts/oct` | 辅助维护入口脚本 |
| `scripts/oc-auto-approve.py` | 本地辅助自动化脚本 |
| `scripts/setup-git-hooks.sh` | hooks 安装脚本 |

### 4.8 配置体系

三层配置，各司其职：

| 层级 | 文件 | 作用域 | Git 跟踪 | 职责 |
|------|------|--------|----------|------|
| 全局 | `~/.wopal/config/settings.jsonc` | 所有空间 | 否 | 跨空间共享的 provider、model、功能开关 |
| 空间级（公共）| `.wopal/config/settings.jsonc` | 当前空间 | 是 | 空间共享的 ellamaka 配置，随分支传播 |
| 空间级（私有）| `.wopal/config/settings.local.jsonc` | 当前空间 | 否（git 忽略）| 覆盖公共默认值的本地配置 |

空间级公共配置与全局配置合并生效，空间级私有配置覆盖前两者。详见 §6.8 配置隔离约定。

---

## 5. Technical Stack Choices

| Domain | Choice | Rationale | Boundary |
|--------|--------|-----------|----------|
| 声明式格式 | Markdown + YAML | ellamaka 原生支持的声明式格式 | 不承载运行时状态 |
| 插件运行时 | TypeScript | OpenCode Plugin SDK 原生语言，Bun 执行 | 仅限插件内部，不侵入技能/规则/命令 |
| 辅助脚本 | Shell / Python | 适合 hooks 安装、开发辅助和轻量自动化 | 仅承担辅助维护动作，不替代插件运行时能力 |
| 记忆存储 | LanceDB | 嵌入式向量数据库，零运维，向量 + FTS + LIKE 混合检索 | 仅记忆模块使用，不作为空间主存储 |
| 版本控制与分发 | Git | clone / fork + worktree 模型支持分支化演化和上游回流 | 不替代空间运行态结构 |

---

## 6. Interfaces and Contracts

### 6.1 ellamaka 加载接口

ellamaka 在 wopal-space mode 下从 ontology 加载：

1. `agents/*.md` — Agent 灵魂定义与 frontmatter 权限配置
2. `skills/*/SKILL.md` — 技能元数据与指令（按触发条件注入）
3. `commands/*.md` 与 `commands/wopal/*.md` — 命令定义（可覆盖内置命令）
4. `plugins/wopal-plugin.ts` — 插件入口（symlink → src/index.ts）
5. `config/settings.jsonc` + `config/settings.local.jsonc` — 空间级配置（公共 + 私有覆盖）

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

clone 模式为默认，`--fork` 进入 fork 模式（详见 §6.8）。`STRUCTURE.md` 模板中的 ontology source 使用 `${ONTOLOGY_REPO}` 占位符。

空间类型选择：

```bash
wopal space init my-space --type coding
wopal space init my-space --type sampx/content
```

- 不传 `--type` 时默认 `common`，映射到 Git ref `main`。
- `--type coding` 映射到 `type/coding`。
- `--type sampx/content` 映射到 `type/sampx/content`。
- `--type` 取值范围为 `main`（或简写 `common`）、`type/*` 格式。
- 选中的 base ref 必须存在于 ontology repo 中。

User 解析：fork 模式优先从 `origin` remote 解析 GitHub owner；clone 模式尝试 `gh api user`；fallback OS 用户名 slug 化。

Space branch 命名：`space/<space-name>`，写入 `spaces.<name>.branch`。

配置写入 `$WOPAL_HOME/config/settings.jsonc` 的 `ontologies.<name>` 节点（含 `path`、`origin`、`upstream`、`fork`）和 `spaces.<name>` 节点（含 `ontology`、`branch`、`user`、`type`）。

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

- `wopal space scan` 聚焦 repo / module 事实发现和已有描述提取。`STRUCTURE.md` 读写由 `/init` 负责。
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

### 6.4 模板合约

本节定义各模板的 schema、字段、生成规则与消费规则。

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

#### `wopalspace-schema.yaml` 设计

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

### 6.5 Design Document Layering

WopalSpace 的设计知识按三层分工，避免细节错位和维护混乱：

| 文档 | 定位 | 内容 |
|---|---|---|
| 产品 DESIGN | 跨项目的稳定架构契约 | 系统分层、子系统职责边界、"谁负责什么"。详细契约和 schema 以项目 DESIGN 为准 |
| 项目 DESIGN | 单个项目的稳定设计真相 | 命令契约、JSON schema、模块架构、数据模型、关键决策。阶段范围和验收以 Phase 文档为准 |
| Phase 文档 | 某阶段的范围与验收条件 | Phase scope、involved projects、exit criteria、风险。架构细节以项目 DESIGN 为准 |

关系：

- 产品 DESIGN 回答"系统如何组成"；项目 DESIGN 回答"单个项目如何实现"；Phase 文档回答"这一阶段要交付什么"。
- 稳定契约只进项目 DESIGN，不进 Phase 文档——Phase 最终归档后不应成为查找架构细节的入口。
- 产品 DESIGN 引用但不复制项目 DESIGN 细节；Phase 文档引用但不复制 DESIGN 契约。
- Phase 讨论中形成的设计决策，在讨论完毕后沉淀到对应项目 DESIGN；Phase 文档只保留范围和验收。

### 6.6 Distribution Summary

ontology 的分发走 Git source + worktree 模型。wopal-cli 通过 `wopal space init` / `wopal setup` 封装 clone/fork/worktree 过程，将其与 space runtime 初始化串联。

稳定边界：

1. 默认使用 clone-based canonical source flow。
2. `--fork` 是显式选择的替代模式。
3. `space/<space-name>` 分支承载 space-specific 演化。
4. `<space>/.wopal/` 是 ontology worktree，由 CLI materialize，由 ellamaka 运行时加载。

详细 source 输入、materialization、template handoff 和 runtime loading handoff 见 `docs/DISTRIBUTION.md`。

### 6.7 Base Capabilities and Space Overlay

Ontology 通过两层模型为 WopalSpace 提供可覆盖的能力分发：

**User-level base capabilities**：`~/.wopal/skills`、`~/.wopal/agents`、`~/.wopal/commands`、`~/.wopal/rules`、`~/.wopal/plugins` 是面向所有 space 的基础能力入口。setup 从 `~/.wopal/ontologies/wopal-space-ontology/{agents,skills,commands,rules,plugins}` 物化它们：macOS / Linux 使用 symlink，Windows 使用 managed copy。

**Space overlay**：`<space>/.wopal/skills`、`<space>/.wopal/agents`、`<space>/.wopal/commands`、`<space>/.wopal/rules`、`<space>/.wopal/plugins` 承载当前 space 的定制能力。同名能力由 space overlay 覆盖 base，ellamaka 按优先级顺序加载：

```text
~/.agents/skills
-> ~/.wopal/skills           # base
-> <space>/.wopal/skills     # overlay，优先级最高
```

覆盖机制：ellamaka 先并发解析所有 `SKILL.md`，再按目录优先级顺序串行合并；后出现的同名 skill 稳定覆盖前者。Agents / commands / rules / plugins 的加载机制同理。

本模型将 ontology main repo 的基础能力与各 space 的定制能力解耦：通用能力由 ontology main 统一维护，setup 只负责物化 base capabilities；space 内自由定制增量覆盖。

### 6.8 Ontology 协作模型

Ontology 以 Git 分支承载能力演化，形成自上而下的能力层级。每一层相对其父层，角色等同于特性分支——在本层做变更，通过 PR 贡献到父层。`wopal ontology` 命令族在两种模式下提供检查、更新和贡献操作。

#### 分支层级

三层分支，自上而下叠加能力：

- **通用类型分支（main）**：所有类型空间共享的基础能力，等同于 type/common。
- **能力类型分支（type/*）**：在通用基线之上叠加特定类型的能力。如 type/coding 叠加编码类空间的能力，type/content 叠加自媒体类空间的能力。
- **空间分支（space/*）**：在能力分支之上叠加单个空间的定制。如 space/wopal-workspace 基于 type/coding。

空间分支是能力分支的超集，能力分支是通用类型分支的超集。每一层都完整包含父层的所有内容，加上自己特有的能力。

分支命名约定：

| 分支 | 格式 | 说明 |
|------|------|------|
| 通用基线 | `main` | 所有空间共享 |
| 能力分支 | `type/<name>` | 上游维护或用户自建 |
| 空间分支 | `space/<space-name>` | 绑定到特定空间 |
| 贡献分支 | `contribute/<target>/<topic>` | 临时，PR 合并后删除 |
| 开发分支 | `feature/<name>` | dev-flow worktree 使用，临时 |

拓扑示意：

```
上游 (wopal-cn/wopal-space-ontology)
  ├── main                ← 通用基线
  ├── type/coding         ← 编码类型能力分支
  └── type/content        ← 自媒体类型能力分支

~/.wopal/ontologies/wopal-space-ontology/  (本地仓库)
  ├── main                ← 上游 main 镜像
  ├── type/coding         ← 上游 type/coding 镜像
  └── space/wopal-workspace  ← 空间分支（基于 type/coding）

<space>/.wopal/           ← 对应 space/<space-name> 分支的 worktree
```

fork 模式下，用户副本（`<user>/wopal-space-ontology`）作为 origin 插入上游和本地仓库之间，承担副本镜像角色。分支层级结构保持一致。

#### 两种模式

用户与上游 ontology 的关系分为两种模式，决定使用门槛和贡献能力：

| 模式 | 定位 | 同步链 |
|------|------|--------|
| **Clone**（默认） | 消费：获取上游更新 | `上游 → 本地能力分支 → 空间分支`（两层下行）|
| **Fork** | 消费 + 贡献 | `上游 → 用户副本 → 本地能力分支 → 空间分支`（三层下行）|

clone 模式降低使用门槛，大多数用户的选择。fork 模式适合活跃贡献者，多一层副本镜像，贡献流程更直接。两种模式下分支命名和下行同步操作一致。

上游 canonical URL：`https://github.com/wopal-cn/wopal-space-ontology`。

#### 更新流程（下行同步）

更新是把上游的新内容应用到用户的空间分支。这是最常用的操作。

**内容流动的三层关系**：上游维护各 type/* 始终包含 main 的最新内容；用户从远程拉取 main 和 type/* 到本地；再从本地 type/* 应用到空间分支。

**第一步：ontology update（HOME 级，同步本体仓库）**

从远程拉取 main 和所有 type/* 分支的最新内容到本地仓库。基于 check 的四层检测结果驱动——只同步有 downstream 信号的内容，不盲目 merge。

clone 模式：fetch origin，对有 downstream 信号的分支执行 merge（允许 merge commit）。

fork 模式：fetch upstream + origin，两层同步——先同步 fork 副本镜像，再同步到本地。完成后 push 副本镜像确保三层对齐。

完成后，本地仓库拥有最新的 main 和 type/* 镜像。这一步操作本体仓库，发生在空间之外。

**第二步：space update（Space 级，应用到空间）**

从本地能力类型分支（type/*）同步到当前空间分支。在 space worktree 中执行 merge，允许 merge commit。check 的第四层（merge-tree 冲突预测）在执行前判断冲突——clean 时自动 merge，有冲突时报告冲突文件由 agent 解决。

**两步之间的关系**：先更新本体仓库（拿到最新能力分支），再应用到空间。中间可以检查更新内容、验证兼容性。两条命令解耦，分别在不同上下文执行。

**超集不变量**：main 的变更需要手动下行到 type/*。上游维护者负责把 main 的内容合并到各 type/* 分支，确保 type/* 始终是 main 的超集。fork 用户在自己仓库上贡献 main 层变更后，同样需要手动执行这步，然后 push 到副本。check 的 D5 段检测超集是否成立——FAIL 时需要 merge main 到 type/* 修复。

**合并策略**：允许 merge commit，不限制 fast-forward。能力分支和空间分支有自定义提交是常态，fast-forward 在多数场景下不可行。

#### 检查流程（双向检查）

检查帮助用户发现需要操作的信号。判断基于**内容一致性**——比较分支的完整内容状态，而非提交数量。合并采纳方式导致提交历史天然不同，比较提交数量会产生虚假的"有更新"报告。

**向下检查（有无更新需要同步）**：

逐层检查同步链上是否有待同步的内容。四类比较覆盖完整的下行链路：

fork 模式：

| # | 比较 | 类型 | 语义 |
|---|------|------|------|
| 1 | 上游 main/type/* ↔ 副本 main/type/* | 同镜像 | 副本镜像是否落后上游 |
| 2 | 副本 main/type/* ↔ 本地 main/type/* | 同镜像 | 本地是否落后副本 |
| 3 | 本地 main → 本地 type/* | 跨层父→子 | 能力分支是否包含通用基线全部内容（超集不变量）|
| 4 | 本地 type/* → 空间分支 | 跨层父→子 | 空间分支是否落后能力类型分支 |

clone 模式去掉比较 1、2 中的副本层（直接上游↔本地），比较 3、4 不变。

**比较 3（超集不变量）的核心价值**：用户通常在 type→space 分支工作，产生的变更 PR 到 type。但 main（公共基线）的演进对 type 不可见——如果 main 变了而 type 没有及时下行传播，type 分支会长期落后 main，积压大量公共变更。超集不变量检查及时发现这种不同步，避免公共能力变更被遗漏。

**新增能力分支检测**：除了已有分支的内容更新，还检查上游是否有本地尚未安装的新能力分支（如上游新增了 type/security）。检测到新分支时报告"新能力分支可用"，建议通过 ontology update 安装。

**比较机制（四层组合，适用于所有层级）**：

判断内容差异不能依赖 commit 比对（`git cherry` / patch-ID）。squash merge 导致同一变更在不同分支上有不同 SHA，两个分支内容可以完全一致但 commit 历史不同——commit 比对会产生虚假的"有差异"报告。比较必须基于**文件内容**，分四层逐步深入：

第一层——内容指纹门控（`git rev-parse <ref>^{tree}`）：比较分支的完整内容指纹（tree hash）。指纹相同则内容完全一致，标记"一致"并跳过后续分析。指纹不同则进入第二层。

第二层——文件内容比对（`git diff <A> <B> --diff-filter`）：逐文件比较内容差异，区分三种类型：`A`（一方有、另一方没有）、`M`（两边都有但内容不同）、`D`（一方删除）。

第三层——差异方向判断（`merge-base` + `git log`）：对每个有差异的文件，判断方向和时效性。`git cat-file -e <merge-base>:<file>` 检查文件在共同祖先是否存在——存在说明是一方主动删的（上行信号），不存在说明是另一方新增的（下行信号）。`git log <merge-base>..<upstream> -- <file>` 检查上游在共同祖先之后是否更新过——未更新说明删除不会过时，更新过说明可能错过上游变更。

第四层——合并冲突预测（`git merge-tree --write-tree <child> <parent>`）：对有差异的分支对，无副作用地预测 merge 结果。这个命令不改变工作树、不创建 commit，只输出 merge 后的 tree hash 或冲突文件列表。agent 据此判断 merge 能否安全自动执行，还是需要手动解决冲突。

四层组合才能准确回答"这个差异要不要管"和"处理起来会不会冲突"。任何单一命令都无法一步到位——`git diff` 发现差异但不判断方向，`merge-base` 判断方向但不发现差异，`git log` 看历史但不比较内容，`git merge-tree` 预测冲突但不告诉你差异的含义。

`git cherry`（patch-ID）仅作为辅助工具：在需要识别"哪个 commit 产生了某文件差异"以便 cherry-pick 时使用，不作为内容差异判断的依据。

检测到差异时，按分支维度逐环节列出完整信息（文件清单、差异类型、方向判断），不输出操作建议——CLI 没有语义判断能力，无法区分"该同步的下行差异"和"本地主动变更"。
 
**向上检查（有无待贡献或待同步的变更）**：

发现两类信号：

1. **空间分支上有未贡献的变更**：空间分支相对对应能力类型分支，有哪些文件内容还没有回流？通过文件内容比对（`git diff`）识别空间分支独有的文件，再用 `merge-base` 判断方向（区分空间新增 vs 能力分支删除的）。帮助用户判断"我积累了哪些值得贡献的通用变更"。

2. **能力类型分支与副本/上游的一致性**：fork 模式下，本地能力类型分支相对副本是否有未推送的变更？副本相对上游是否有待同步的差异？帮助用户判断"我的贡献是否已经传播到位"。

**操作建议由 agent 判断**：

check 只输出完整差异信息（文件清单、差异类型、方向判断），不输出操作建议。CLI 没有语义判断能力，无法区分"该同步的下行差异"和"本地主动变更"——例如 fork 主动重构删除的文件，diff 会报告"上游有、本地没有"，但不应同步。操作建议由 agent 基于完整信息推导。

**触发方式**：手动运行 `ontology check`。

#### 贡献流程（上行贡献）

贡献是把空间分支上的通用变更回流到父层。仅面向 fork 模式用户。

**核心设计决策**：所有上行回流采用 PR merge（squash merge），不直接本地 merge。space 相当于 type/coding 的特性分支，PR merge 保证父层提交历史清晰——每个 PR 在父层产生一个干净的提交，不会混入空间的定制变更。

**上行链条**：上行是链条，内容必须逐级向上流动，顺序不能跳过：

| 段 | 方向 | 操作方式 |
|----|------|---------|
| U1 | space → type/coding | PR（squash merge），保证 type 分支历史清晰 |
| U2/U3 | local → origin | push |
| U4/U5 | origin → upstream | PR（跨仓库） |

U1 完成后才能 U2/U3（push 回流后的变更），U2/U3 完成后才能 U4/U5（从 fork 向上游发 PR）。

**贡献路径**——根据变更的适用范围决定目标层：

| 变更适用范围 | 贡献到 | 方式 |
|-------------|--------|------|
| 同类空间通用（如所有 coding 类空间）| 对应能力分支（type/coding）| 直接 PR 或精选 PR |
| 所有空间通用 | 通用基线（main）| 精选 PR（贡献分支）|
| 本空间特有 | 不贡献 | 留在空间分支 |

**直接 PR**：空间分支相对父层的差异全是通用变更时，直接从空间分支创建 PR 到父层。配置隔离约定保证了差异天然干净。PR 采用合并采纳（squash merge），每个 PR 在父层产生一个清晰的提交。

**精选 PR**：空间分支上混合了通用变更和空间私有变更时，或需要跨层贡献（如 coding 空间向 main 贡献单个修复）时，使用贡献分支精选：

1. 从目标层创建贡献分支（如 `contribute/main/<topic>`）
2. cherry-pick 想贡献的提交到贡献分支
3. PR 贡献分支到目标层

贡献分支是临时分支，PR 合并后删除。它让你精准贡献——只贡献想贡献的变更，不受源分支上其他内容的干扰。

**逐层传播**：变更进入通用类型分支（main）后，需要手动下行传播到能力类型分支。仓库维护者执行 `apply --from main --to type/coding`，把 main 的变更合并到能力分支，然后 push。其他用户通过日常更新流程（ontology update + space update）获得传播后的内容。

**提交描述规范**：PR 采用合并采纳，提交标题遵循 Conventional Commits 格式。GitHub 自动追加 PR 编号（如 `feat(dev-flow): add validation shortcuts (#123)`），提供来源追溯。父层的提交历史呈现为每个 PR 一个提交的清晰序列。

#### 配置隔离约定

空间分支相对父层的差异只包含能力变更，由配置文件的分层约定保证：

- `settings.jsonc`：公共配置，随分支传播，所有层级共享。
- `settings.local.json`：空间私有配置，被 git 忽略，保留在本地文件系统。

因此，空间分支向父层的 PR 天然干净——只包含能力层面的变更。

#### 命令总览

ontology 维护涉及以下命令。详细参数和输出格式见 wopal-cli 设计文档。

**检查与查看**：

- `ontology check`——基于内容一致性检测各层级更新状态。只读，手动触发。向下看有无更新，向上看有无未推送变更。
- `ontology status`——查看当前空间的分支身份和同步状态。
- `ontology list`——查看所有已注册的 ontology 源的全局视图。

**更新**：

- `ontology update`——从上游或副本同步能力分支到本地仓库（HOME 级）。
- `space update`——从本地能力分支同步到空间分支（Space 级）。

**贡献**：

- `contribute`——精选提交到贡献分支，提交 PR 到父层。
- `apply`——分支间通用合并工具，适用于需要手动控制方向的场景。

**约束**：贡献仅 fork 模式；所有上行回流采用 PR merge（squash merge）；下行同步允许 merge commit，不限制 fast-forward。

#### AI 辅助流程

Agent 是本体维护的决策中枢。CLI 输出四层检测的结构化事实，agent 解读后与用户讨论，再构造命令执行。详细操作规则（什么信号用什么命令、上下行执行步骤、冲突解决策略、贡献路径选择）见 space-master 技能的本体维护操作指南。

**决策框架**（基于 check 四层检测信号）：

1. worktree 有未提交变更 → 先提交
2. check 有 downstream 信号（D1-D4）+ merge-tree clean → 执行 ontology update
3. check 有 downstream 信号 + merge-tree conflicts → cherry-pick 具体变更，agent 手动解决冲突
4. D5 超集检查 FAIL → merge main 到 type/coding 修复超集违反
5. D6 显示 space 落后 type/coding → 执行 space update
6. check 有 upstream 信号（U1）→ 与用户讨论哪些空间变更有普遍价值，值得贡献
7. U1 确认贡献 → 按 U1 → U2/U3 → U4/U5 链条逐级上行

**冲突处理**：check 的第四层（merge-tree 冲突预测）在执行前判断冲突。clean 时 CLI 自动 merge；conflicts 时报告冲突文件，agent 手动编辑解决（保留双方有价值的改动），然后 `git add` + `git commit` 完成 merge。

**多级副本链**：用户的副本可被他人 fork 为上游。CLI 自动从 `upstream` remote 拉取，多级副本链对 CLI 透明。

**`/ontology-maintain` 命令**：Agent 使用此命令触发完整维护流程——check（四层检测）→ 分析建议（按决策框架排序）→ 报告确认（等待用户确认）→ 执行操作（每次操作后验证）。

---
## 7. Data and State Model

ontology 本身是无状态的声明式能力包，不持有运行时状态：

| State | Location | Owner | Rules |
|-------|----------|-------|-------|
| Agent 灵魂定义 | `agents/*.md` | ontology | 定义者，ellamaka 加载执行 |
| 技能定义 | `skills/*/SKILL.md` | ontology | 定义者，按触发条件注入 |
| 规则定义 | `rules/*.md` | ontology + wopal-plugin | ontology 定义，wopal-plugin 执行注入 |
| 命令定义 | `commands/*.md` | ontology + ellamaka | ontology 定义，ellamaka 执行 |
| 辅助脚本 | `scripts/**` | ontology | 维护与辅助自动化载体 |
| 插件运行时状态 | wopal-plugin 进程内 | wopal-plugin | 运行载体，ontology 不持有 |
| 记忆数据 | LanceDB（space runtime 内） | memory_manage | ontology 提供工具，不持有数据 |
| 会话状态 | ellamaka session | ellamaka | ontology 不持有 |
| 空间结构 | `.wopal-space/STRUCTURE.md` | `/init` | ontology 提供模板，不持有实例 |
| 空间守则 | `.wopal-space/REGULATIONS.md` | 用户 + `/wopal:evolve` | ontology 提供初始化模板，不持有实例 |

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

## 8. Related Documents

| 文档 | 说明 |
|------|------|
| `projects/wopal-cli/docs/DESIGN.md` | wopal-cli 子系统设计 — 统一操作入口 |
| `.wopal/docs/DISTRIBUTION.md` | ontology 的 Git source、worktree、template handoff 与 runtime loading 契约 |
| `.wopal/docs/BUSINESS_RULES.md` | 本体业务规则 |
