# Ontology — Space Soul, Regulations and Capability Genome Toolkit

> **Status**: Active
> **Updated**: 2026-09-27
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`
> **Sub-DESIGNs**:
> - `./DESIGN-assembly.md` — Assembly model: manifest, schema, template and configuration layers
> - `./DESIGN-capabilities.md` — Capability system: Agent, skill, command, rule, plugin and script
> - `./DESIGN-distribution.md` — Distribution contract: source input, materialization and runtime loading
> - `./DESIGN-dsh-adapter.md` — DSH adapter plugin design
> - `./DESIGN-evolution.md` — Evolution loop: collaboration model, self-evolution and design knowledge layering
> - `./DESIGN-wopal-plugin.md` — wopal-plugin overall design

---

## Project Role

ontology 是 WopalSpace 的 Space Ontology 层，也是空间灵魂、规约与能力基因工具包的承载面。Agent 身份、规则、技能、命令、插件、模板与辅助脚本在这里沉淀和分发；ellamaka 负责解释执行，wopal-cli 负责确定性操作编排，space runtime 负责当前空间运行态。

核心职责：空间灵魂可复用、空间规约可分发、空间能力可编排、空间经验可延续。Fork 一个 ontology = 复制一套可持续演化的空间起点。

物理分发以「中央仓库 + 空间装配 worktree」模型：local main 是能力唯一真相源，每个空间是 `space/<name>` 装配 worktree（详见 `./DESIGN-evolution.md`）。加载链路相关变更在用户重启 ellamaka 后完成验证。

---

## Capability Scope

ontology 拥有的目标态能力组：

| 能力域 | 拥有的目标能力 | 明确边界 |
|---|---|---|
| Agent 体系 | 4 维核心角色（Wopal/Fae/Rook + Maka）跨类型常驻；类型差异由 skills / rules 能力装配承载，不靠新增代理切分 | 不持有 Agent runtime 实现；不硬编码微型工种 |
| 技能生态 | 空间根 / 工作流 / 专用技能池，通过空间装配清单（BOM）按需物化与 JIT 动态注入 | 不判断技能产品价值，不负责 skill 内容设计 |
| 命令体系 | 覆盖空间维护、自进化、项目管理、开发支持、上下文管理，可覆盖内置命令 | 不实现命令执行引擎 |
| 规则体系 | 项目级 + 空间级 + 领域专属规则，wopal-plugin 条件匹配注入 | 不修改 ellamaka 核心行为 |
| 运行时插件 | wopal-plugin 提供规则注入、任务委派、记忆系统、上下文管理四大能力，8 个 plugin tools | 仅限插件内部，不侵入技能/规则/命令 |
| 模板与装配 | 空间骨架与模板 + 类型装配单（`assembly/archetypes/*.yaml`，声明 agents / skills / rules / commands / plugins 五类能力与 `paths` 通用路径） | 不持有空间运行态实例 |
| 辅助脚本 | ontology 维护、git hooks 与辅助自动化脚本 | 仅承担辅助维护动作 |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| 声明式优于命令式 | 本体声明"空间应该有什么"，引擎负责解释执行。Markdown + YAML 是一等公民。 |
| 灵魂与操作分离 | Agent 灵魂文件只定义角色边界与决策原则（"我是谁"），操作知识由技能承载（"我怎么做"）。 |
| 提示词目标化（Outcome-Oriented）优于过程干涉（Hand-Holding） | 面向 2026 前沿模型原生推理与测试时计算（TTC），提示词只给目标与验证门禁，不承载操作说教，不干涉过程。 |
| 中央能力池集中维护 + 空间装配 worktree（BOM 装配模型） | 本体资产在单一 `main` 分支集中维护，通过 `assembly/archetypes/*.yaml` 声明装配单，空间端以装配 worktree（sparse-checkout）按需物化。一处优化全域受益，进化经 `space sync` 汇入 local main。 |
| 提案与落地分离 | Maka 负责分析会话错误、用户纠偏与记忆经验并撰写提案，Wopal 也可以撰写；落地由 Wopal 主控、Fae 在空间 worktree 内规范提交、Rook 审查守门。 |
| 本体进化与代码开发分流 | 本体能力进化的执行流程由 `ontology-evolution` 技能拥有，代码项目开发流程由 `dev-flow` 拥有。两条流程的对象不同，状态词汇互不重合。本体能力是全空间类型的常驻关注点，代码开发工作流属于 coding 类型，分流后每个空间只装配其实际需要的流程。 |
| 插件适配原则 | wopal-plugin 是运行时插件，集中提供规则注入、任务委派、记忆系统和上下文管理，插件能实现尽量不改造 engine。 |
| 运行时装配经会话级权限落地 | 能力装配以会话级权限为注入通道，会话创建时授予、生命周期内稳定。装配参数只接受能力名称，权限规则由插件构造，Agent 不接触权限细节。 |
| Plugin instance 隔离 | Ellamaka 通过 `PluginInput.wopalSpaceRoot` 传递可选空间根。wopal-plugin 为每次 `server(input)` 调用构造独立 RuntimeContext、effective env、logger 与 memory client。 |

---

## Module Architecture

ontology 由装配定义与六类能力资产构成。模块细节分见各子设计。

| 模块 | 职责 | 载体 | 详细设计 |
|------|------|------|---------|
| 装配定义 | 类型装配单、空间骨架与模板，是空间初始化的唯一依据 | `assembly/` | `./DESIGN-assembly.md` |
| Agent 体系 | 四维核心角色的灵魂定义与权限基线 | `agents/*.md` | `./DESIGN-capabilities.md` |
| 技能体系 | 三级技能池，按触发条件注入 | `skills/*/SKILL.md` | `./DESIGN-capabilities.md` |
| 命令体系 | 空间维护、进化、文档、开发支持与上下文管理命令 | `commands/` | `./DESIGN-capabilities.md` |
| 规则体系 | 项目级、空间级与 Agent 专属规则 | `rules/` | `./DESIGN-capabilities.md` |
| 插件体系 | wopal-plugin 与 TUI 品牌插件 | `plugins/<name>/` | `./DESIGN-wopal-plugin.md` |
| 辅助脚本 | ontology 维护与开发辅助 | `scripts/` | `./DESIGN-capabilities.md` |
| 进化闭环 | 能力演化、同步与防污染审查 | 跨模块 | `./DESIGN-evolution.md` |

装配定义与能力资产是两个层级的语义：装配定义回答「空间该长什么样、该装什么能力」，能力资产是「可被装配的武器本身」。装配定义本身不作为能力资产被装配单声明；其内容作为始终装配清单成员无条件物化进空间（清单与机制见 `./DESIGN-assembly.md` 的 Sparse Materialization Mechanics）。

---

## Technical Stack Choices

| Domain | Choice | Rationale | Boundary |
|--------|--------|-----------|----------|
| 声明式格式 | Markdown + YAML | ellamaka 原生支持的声明式格式 | 不承载运行时状态 |
| 插件运行时 | TypeScript | OpenCode Plugin SDK 原生语言，Bun 执行 | 仅限插件内部，不侵入技能/规则/命令 |
| 辅助脚本 | Shell / Python | 适合 hooks 安装、开发辅助和轻量自动化 | 仅承担辅助维护动作，不替代插件运行时能力 |
| 记忆存储 | LanceDB | 嵌入式向量数据库，零运维，向量 + FTS + LIKE 混合检索 | 仅记忆模块使用，不作为空间主存储 |
| 版本控制与分发 | Git | clone / fork + 装配 worktree 模型；中央仓库承载能力演化，空间 worktree 按装配单物化 | 不替代空间运行态结构 |

---

## Interfaces and Contracts

### ellamaka Loading Interface

ellamaka 在 wopal-space mode 下从 ontology 加载：

1. `agents/*.md` — Agent 灵魂定义与 frontmatter 权限配置
2. `skills/*/SKILL.md` — 技能元数据与指令（按触发条件注入）
3. `commands/*.md` 与 `commands/wopal/*.md` — 命令定义（可覆盖内置命令）
4. `plugins/<name>/` — 插件目录；在 `config/settings.jsonc` 中以相对路径 `../plugins/<name>` 声明
5. `config/settings.jsonc` + `config/settings.local.jsonc` — 空间级配置（公共 + 私有覆盖）

多数加载链路相关改动以 ellamaka 重启后的加载结果作为验证标准。base capabilities 与 space overlay 的加载优先级见 `./DESIGN-evolution.md`。

### wopal-plugin Tool Interface

| 工具 | 职责 |
|------|------|
| `wopal_task` | 非阻塞子会话启动，可携带能力装配参数 |
| `wopal_task_output` | 任务状态与输出查询 |
| `wopal_task_reply` | 双向通信与恢复 |
| `wopal_task_abort` | 任务终止 |
| `wopal_task_finish` | 任务完成清理 |
| `memory_manage` | LanceDB 记忆 CRUD 与语义检索（list/stats/search/add/update/delete/injected） |
| `context_manage` | 会话上下文管理（status/dump/compact）+ 蒸馏（distill/confirm/cancel） |

`wopal_task` 的装配参数只接受能力名称数组。武器库查询由 wopal-cli 的 `wopal space capability list` 命令承载，真相源为 ellamaka 引擎发现层。清单字段、清单契约与派发契约的完整定义see the Capability Assembly Module in `./DESIGN-wopal-plugin.md`.

### CLI Command Surface

| 命令 | 职责 |
|------|------|
| `wopal space init` | 创建或初始化空间，按装配单物化 |
| `wopal space status` | 只读空间状态与装配状态 |
| `wopal space sync` | 与 local main 双向对齐 |
| `wopal space capability add/remove` | 增删空间装配能力 |
| `wopal space capability list` | 查询空间武器库有效能力集（四类武器，全局+空间） |
| `wopal ontology install/update/contribute` | 本体安装、下行整合与上行贡献 |

命令语义与边界see the Maintenance and Distribution Command Surface in `./DESIGN-evolution.md`.

### Initialization and Maintenance Targets

Ontology 提供初始化协议，wopal-cli 负责确定性 materialize，`/init` 负责智能校准。CLI 实现建立在 ontology 装配定义与 `/init` 维护机制逐步验证成熟的基础上。

`wopal space init` 是创建/初始化入口。新建、已有目录补齐、合法 space 注册与 active space 设置均由 `space init` 承载。

空间类型选择：

```bash
wopal space init my-space --type coding
wopal space init my-space --type content
```

- `--type` 为必填，`coding` 与 `content` 是当前支持的类型。类型语义由装配单承载，本地中央仓库 `main` 是能力合集，不对应任何空间类型。
- 用户可在初始化后通过 `wopal space capability add/remove` 调整空间装配清单。

clone 模式为默认，`--fork` 进入 fork 模式（详见 `./DESIGN-evolution.md`）。`STRUCTURE.md` 模板中的 ontology source 使用 `${ONTOLOGY_REPO}` 占位符。

User 解析：fork 模式优先从 `origin` remote 解析 GitHub owner；clone 模式尝试 `gh api user`；fallback OS 用户名 slug 化。

空间装配记录：空间根仓库跟踪 `.wopal-space/space-meta.json` 中的类型、骨架、ontology 来源与本空间能力/通用路径的选择；CLI 只提交其管理的状态变更。同步进度由本体 Git refs 计算，装配详情见 `./DESIGN-assembly.md`。

配置写入 `$WOPAL_HOME/config/settings.jsonc` 的 `ontologies.<name>` 节点（含 `path`、`origin`、`upstream`、`fork`）和 `spaces.<name>` 节点（含 `ontology`、`branch`、`user`、`type`）。

CLI 负责：

1. 解析 space name/path 与 ontology source。
2. 读取 `assembly/archetypes/<type>.yaml`，得到装配决策与 `schema` 指向。
3. 读取 `assembly/schemas/<schema>.yaml` 与 `assembly/templates/` 素材。
4. 准备 `<space>/.wopal/` 装配 worktree（sparse-checkout 按装配单物化）。
5. 按骨架创建运行态目录与空间级目录。
6. 首次渲染骨架声明的全部文件到空间根与 `.wopal-space/`。
7. 按装配单生成空间特有插件配置到 `settings.local.jsonc`。
8. 写入并在空间根仓库提交 `.wopal-space/space-meta.json` 的空间身份与初始装配选择。
9. rerun 时创建缺失项并保留已有文件内容。
10. 在完整成功后注册 space 并设置 active space。
11. 提供 `wopal space scan` 只读扫描入口，输出 repo / module JSON 事实。
12. 输出下一步：进入 space、启动 ellamaka、运行 `/init` 做首次智能校准。

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

### Template Contract

各模板的 schema、字段、生成规则与消费规则see the Template Contract in `./DESIGN-assembly.md`.

---

## Data and State Model

ontology 本身是无状态的声明式能力包，不持有运行时状态：

| State | Location | Owner | Rules |
|-------|----------|-------|-------|
| Agent 灵魂定义 | `agents/*.md` | ontology | 定义者，ellamaka 加载执行 |
| 技能定义 | `skills/*/SKILL.md` | ontology | 定义者，按触发条件注入 |
| 规则定义 | `rules/*.md` | ontology + wopal-plugin | ontology 定义，wopal-plugin 执行注入 |
| 命令定义 | `commands/*.md` | ontology + ellamaka | ontology 定义，ellamaka 执行 |
| 辅助脚本 | `scripts/**` | ontology | 维护与辅助自动化载体 |
| 装配定义 | `assembly/**` | ontology | 物化源头，CLI 读取后物化 |
| 插件运行时状态 | wopal-plugin 进程内 | wopal-plugin | 运行载体，ontology 不持有 |
| 记忆数据 | `$WOPAL_HOME/storage/memory` 下的 LanceDB | memory_manage | ontology 提供工具，不持有数据 |
| 会话状态 | ellamaka session | ellamaka | ontology 不持有 |
| 空间结构 | `.wopal-space/STRUCTURE.md` | `/init` | ontology 提供模板，不持有实例 |
| 空间身份与装配状态 | `.wopal-space/space-meta.json` | `wopal space` CLI | 空间根仓库跟踪身份与能力/通用路径级选择；仅由 CLI 限定路径提交 |
| 空间守则 | `.wopal-space/REGULATIONS.md` | 用户 + `/wopal:evolve` | ontology 提供初始化模板，不持有实例 |

Runtime 维护由 ontology commands 驱动：`/init`（结构校准）、`/wopal:memo`（日记暂存）、`/wopal:evolve`（经验沉淀）、`/wopal:distill`（记忆蒸馏）、`/cupdate-agent-rules`（项目规范更新）。

### Memory Runtime Files

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

## Plan Workflow Contract

开发流程由 dev-flow 拥有：planning → reviewing → approved → executing → verifying → done。approve 保存语义版本绑定的用户授权并停留 approved；显式 begin 在实际环境准备后进入 executing。计划批准、图构建和排期均不创建 worktree。通用 Provider 提供规范化 Plan 描述、审批与幂等 prepare/begin，时间与服务归 Wopal CLI。

本体能力进化流程由 `ontology-evolution` 拥有：draft → accepted → implementing → validating → archived。提案默认不带 Issue 载体，用户明确要求时才引入评审。进化流程的推进状态记在提案的 `Stage` 字段，代码开发的 Plan 记在 `Status` 字段，两套字段名与词表都不重叠，使同一空间内的两类工作在流程上不会被混淆。进化提案文档位于本体仓库 `docs/evolutions/`，与它所改变的能力资产同行一条分发链路；实施、隔离与交付纪律见 `./DESIGN-evolution.md`。

Plan 支持 outcome-driven 与 detailed 格式。前者固定目标、范围、依赖、公开契约和可验证完成条件，内部文件与实施步骤由 Agent 根据最新代码确定；所有校验/审查/完成入口遵循相同 profile 语义。上游成果变化时细化实现，目标/权限/依赖契约变化时重新评审。

跨项目边界遵循 [Plan Orchestration](../../docs/products/wopal-space/DESIGN-plan-orchestration.md)。ontology 装配发布 Provider 能力与版本，CLI 不复制工作流状态机，技能不依赖调度器才能独立使用。

## Reference Documents

| 文档 | 说明 |
|------|------|
| `projects/wopal-cli/docs/DESIGN.md` | wopal-cli 子系统设计 — 统一操作入口 |
| `.wopal/docs/GAPS.md` | 设计优化落地追踪 |
| `.wopal/docs/BUSINESS_RULES.md` | 本体业务规则 |
