# DESIGN — Capability System

> **Status**: Active
> **Updated**: 2026-10-25
> **Parent**: `./DESIGN.md`（ontology overall design: Module Architecture section）
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`

---

## Agent System

面向 2026 年具备自适应深度推理与长程规划能力的前沿模型，Agent 体系确立**“灵魂守恒、武器多态、动态装配、四维闭环”**原则。

### Four Core Roles

| 角色 | 核心职责 | 物理权限沙箱 | 核心判据 / 行为 |
|------|---------|-------------|----------------|
| **Wopal**（主控 / 统筹脑） | 意图解析、人机对齐、宏观规划、跨空间记忆承载、任务派发 | 全量感知与派发权 (`wopal_*`, `task`, `memory_manage`)，`question: allow` | 双模确认原则（自由对话须确认，工作流按 Plan 执行）；结论先行 |
| **Fae**（执行手 / 全栈工兵） | 一切实施类工作：编码、重构、构建、测试、写作、编辑、数据处理 | `edit: allow`, `bash: allow`, `task: deny`（防套娃） | 必须产出客观证据；能通过真实验证的成果是唯一指标 |
| **Rook**（审查眼 / 正交哨兵） | 一切产出质量的独立审计：方案、实施成果、文稿与数据 | 严格只读沙箱 (`read: allow`, `edit: deny`, `bash: allow` 仅限只读命令) | 严格遵守“无证据即无效”（Evidence-or-Downgrade），只认 `file:line` 事实 |
| **Maka**（进化心） | 分析会话错误、用户纠偏与记忆中的经验教训，形成自进化提案 | 独立会话沙箱 (`read: allow`；`edit` 仅放开 `docs/evolutions/`) | **只出提案、不动刀**；执行严格的防污染归属判定（空间私有 / 类型级 / 公共池） |

### Role Boundaries Defined by Responsibility

专职子代理按**角色**切分，不按文件类型或任务切片切分。职能重叠、上下文盲区与交接成本都源于按切片拆分角色，因此 Agent 体系的角色数量保持最小，能力差异由装配承载。

每个角色拥有明确的职责范围与物理权限沙箱：

- **规划与统筹**归 Wopal，规划流程由 `dev-flow` 承载；
- **全栈实施**归 Fae，编码、重构、构建、测试在单一上下文内原子共变；
- **独立审查**归 Rook，代码缺陷与安全风险的正交审计统一归口；
- **提案撰写**由 Maka 主责：会话错误、用户纠偏与记忆经验的分析与提炼统一归口（Wopal 也可以撰写）。

### Dynamic Assembly

Agent soul 是角色级的，与空间类型无关。四个核心角色在所有空间常驻，类型差异由 `assembly/archetypes/<type>.yaml` 装配单声明的 skills / rules 承载：

- **Coding 空间**：四核心 + 工程类 skills / rules；
- **Content 空间**：四核心 + 内容类 skills / rules。

Fae 拿不同的「武器」执行，而不是换一个执行者；Rook 加载不同的审校技能，而不是换一个审查者。类型身份属于能力装配，不属于代理切分。专职子代理仅在出现真正不同的**角色**时才新增，且需专门设计确认，默认不增。

Ellamaka 启动时扫描 `.wopal/agents/`，看到的始终是这四个角色。

#### Four Assembly Layers

能力装配分四层。前三层是静态事实，第四层是 Wopal 派发时对角色基线的**增量授予**：

| 层级 | 决定什么 | 载体 | 生命周期 |
|------|---------|------|---------|
| 能力池 | 中央仓库拥有的全部能力 | central `main` | 跨空间持续 |
| 空间武器库 | 本空间物化了哪些能力 | archetype + sparse-checkout | 空间级 |
| 角色基线 | 角色默认拥有的能力与限制 | `agents/<name>.md` 的 `permission:` | 角色级静态 |
| Session Dynamic Overlay | 本次会话在角色基线之上额外激活哪些能力 | P2 首个切片：Skill Overlay（创建时 + 运行时增量 grant） | Session 生命周期 |

动态装配不是角色能力的替代表。当前已定型并进入实施的只有 Skill：省略 `capabilities.skills` 表示只使用角色基线；显式 Skill 在基线上增量激活，运行时还可继续追加。本切片不提供 exact-set / subtract / deny / revoke。Tool 与 Rule 的动态配置另行设计，不由本次 Skill 方案预设。

#### Space Arsenal and Role Baseline

物化进空间的武器库**不等于**全量授予任何角色。武器库是空间拥有的能力储备，角色基线是默认授予的子集。Wopal 可以从武器库中为具体任务追加角色基线之外的能力，但不能借 `capabilities` 绕过空间武器库、撤销角色限制或重写静态配置。

#### Arsenal Scope and Truth Source

武器库是全局层与空间层的有效能力集，空间层同名优先。发现层回答“引擎加载了什么”，运行时过滤层回答“当前 agent/session 能用什么”；两者不得混用。Skills、Rules、外部工具与内部工具的发现继续由 ellamaka 现有引擎提供，`wopal space capability list` 只消费发现层，不改变运行时权限。

#### Session Skill Overlay and Runtime Activation

P2 先只落 Skill 动态装配。设计目标是让主 Agent 把 Ellamaka 已发现的 Skill Pool 当作可用武器库，在创建会话时和会话运行过程中，把任务真正需要的 Skill 叠加到默认 Agent 能力之上，同时不破坏 system/tool 前缀缓存。

- **Skill Pool**：以 Ellamaka discovery 为唯一发现来源；Wopal 只消费 name/description 等元数据，不重新扫描或复制 Skill Registry。插件可对 discovery 结果做短 TTL 的派生缓存以避免每个 model step 重拉完整 Skill body；空 overlay 不触发 discovery，grant 若在缓存中找不到名称必须强制刷新一次后再判 unknown。
- **Agent baseline**：继续由 `agents/<name>.md` 的 `permission.skill` 表达默认能力；不因动态装配而改写 Agent 配置。
- **Session Skill Overlay**：只保存额外激活的 Skill。创建子会话时由 `wopal_task.capabilities.skills` 写入 initial grants；运行时由主 Agent 的 skill-only grant 控制面继续追加 runtime grants。两者取并集，只增不减；同一 Session 的 grant 必须串行化 read-modify-write，避免并发 tool call 静默覆盖彼此授权。
- **模型可见性**：wopal-plugin 在既有 `experimental.chat.messages.transform` 中，把 overlay 的 `name + description` 作为 transient synthetic snapshot 追加到 retained history 尾部；不注入 SKILL.md body/path，不修改 system prompt、较早消息或 tool schema。
- **正文与资源加载**：模型看到 overlay 后仍调用 Ellamaka 原生 `skill(name)`。原生 loader 负责 SKILL.md、base directory、scripts/references/assets 的 progressive disclosure；Skill grant 本身不隐式授予脚本执行所需的其他权限。
- **加载授权**：新增通用 `experimental.permission.rules` 插件 hook。在 `ctx.ask()` 求值前，把 plugin runtime rules 合并在 agent/session rules 之后。wopal-plugin 只为 `permission=skill` 且 pattern 命中 Session Skill Overlay 的项贡献精确 allow；该 allow 仅参与本次求值，不写 `session.permission`，因此无需修改 Ellamaka run loop 或刷新 Session 对象。overlay 读取失败时插件贡献零规则，保留 Agent/Session baseline 的安全默认，而不是让整个 permission ask 因插件缓存/metadata 故障失败。
- **单一事实源**：request-tail catalog 与 runtime skill allow 必须读取同一个 Session Skill Overlay。Session metadata 是持久真相源，插件内 SessionStore/digest 仅是派生缓存。
- **缓存与恢复语义**：动态 Skill snapshot 每个正常模型请求都从当前 overlay 重新生成并追加在尾部；由于 transform 内容不落 DB，digest 只能缓存格式化结果，不能做跨请求发送抑制。Skill descriptor discovery 可独立短 TTL 缓存，但不改变 overlay 每请求重读语义；catalog lookup 失败时该次注入 fail-open（不追加 snapshot），不能中断整个 model step。Ellamaka 生成 compaction summary 时同样会触发 `messages.transform`，因此 compacting 期间必须抑制这份 transient catalog，避免其被摘要回持久历史；compaction 完成后丢弃 SessionStore 中的 overlay 派生缓存，下一次 catalog/permission 读取从 Session metadata 重建。新增 Skill 因而只影响已有 retained prefix 之后的尾部。

Tool 与 Rule 的动态能力不属于本切片；现有 Tool/Rule 行为保持不变，后续单独设计。没有 Skill Overlay 时，ellamaka 的现有 config、agent frontmatter、permission、plugin 和 SDK 行为保持不变。

### Outcome-Oriented Prompts

每份 Agent 提示词保持精简，只承载角色定位、职责边界、能力武器纪律与交互风格。流程分支、操作说教与编程八股由技能与项目规范承载，不进入灵魂层。这使提示词面向前沿模型的原生推理能力，给目标与验证门禁而不干涉过程。

## Skill System

| 层次 | 职责 | 规模 | 代表 |
|------|------|------|------|
| 空间根技能 | 流程路由与概念模型入口：场景分流、核心技能导航、协作边界 | 1 | `space-master` |
| 工作流技能 | 开发状态机、本体进化与维护执行协议、委派 API、WSF 产品流水线 | ~66 | `dev-flow`、`ontology-evolution`、`agents-collab`、WSF 技能族 |
| 专用技能 | 独立领域能力 | ~13 | `fc-local`、`youtube-master`、`ellamaka-config`、`automating-mail`、`mac-reminder`、`git-worktrees`、`skill-creator` 等 |

每个技能遵循三级加载：元数据（name + description）→ 主体（SKILL.md body）→ 资源（scripts / references / assets）。

两个工作流技能按对象分工：`dev-flow` 面向 `projects/` 下的代码仓库，`ontology-evolution` 面向空间自身的本体能力资产。四个核心角色在所有空间类型常驻，本体能力进化因此对每个空间可用，不依赖空间是否装配代码开发工作流。两条流程的状态词汇互不重合，实施与交付纪律见 `./DESIGN-evolution.md`。

本体资产的全部维护面由 `ontology-evolution` 技能单点拥有：能力进化的完整流程（提案、状态机、隔离实施、交付终端），以及本体维护操作（`ontology sync` / `space sync` / 原生 Git/GitHub PR / 能力装配增删）的执行协议。`space-master` 只保留路由职责——把本体相关请求导向 `ontology-evolution`，不重复维护规范；`wopal/ontology-maintain` 命令是薄触发入口，加载该技能后按其协议执行，自身不承载规范。

`space-master` 是 ontology 的根技能，定位为概念模型入口、流程选择器与核心技能路由器。本体维护规范收编至 `ontology-evolution` 后，其职责边界收窄为「选哪个技能」，不再持有任何执行协议的完整副本。

## Command System

| 类别 | 命令 | 载体 |
|------|------|------|
| 空间维护 | `/init`、`wopal space status`、`wopal space sync`、`wopal space capability add/remove` | `commands/init.md`、CLI 命令 |
| 记忆与进化 | `/wopal:memo`、`/wopal:evolve`、`/wopal:distill`、`/wopal:memory`、`wopal/ontology-maintain` | `commands/wopal/` |
| 唤醒与感知 | `/wopal:summon` | `commands/wopal/summon.md` |
| 文档管理 | `/cupdate-prd`、`/cupdate-design`、`/cupdate-roadmap`、`/cupdate-readme`、`/cupdate-br`、`/cupdate-agent-rules` | `commands/cupdate-*.md` |
| 开发支持 | `/commit`、`/review` | `commands/commit.md`、`commands/review.md` |
| 上下文管理 | `/context-continue`、`/context-handoff`、`/context-recover` | 薄命令入口 `commands/context-*.md` → `skills/context-manage` |
| 其他 | `/evaluate-skill` | `commands/evaluate-skill.md` |

ontology 命令可覆盖 ellamaka 内置命令。

## Rule System

| 类别 | 职责 | 载体 |
|------|------|------|
| 项目级规则 | 语言与框架约束 | `rules/typescript.md`、`rules/python.md` |
| Agent 专属规则 | Wopal 记忆规则、Fae Astro 规则等定向约束 | `rules/wopal/mem-rule.md`、`rules/fae/astro.md` |

规则发现由 ellamaka 引擎负责，扫描全局 `$WOPAL_HOME/rules/` 与空间 `<spaceRoot>/.wopal/rules/` 两层目录的 `**/*.{md,mdc}` 文件。空间层按相对路径覆盖全局同名；直接子目录名作为 agent 作用域（如 `rules/fae/astro.md` → scope=fae）。每项规则的身份是相对路径（含扩展名）。

规则注入仍由 wopal-plugin 按 agent 与用户提示匹配执行。注入为 opt-in，受 `wopal.pluginConfig["wopal-plugin"].rules.enabled` 控制，默认关闭。

引擎的规则发现端点返回完整列表，不按 agent 权限过滤——与技能、工具的发现层原则一致。注入时的条件匹配是运行时行为，与发现层分离。

## Plugin System

wopal-plugin 由 TypeScript 编写，Bun 执行，基于 EllaMaka Plugin SDK。

| 模块 | 职责 | 可配置 |
|------|------|--------|
| Global（入口） | 构造 instance runtime、消费引擎交付的配置表切片与内联回退、检查开关、注册 Hooks/Tools | 无 |
| Rules | 条件匹配 → 注入用户消息 | `wopal.pluginConfig["wopal-plugin"].rules.enabled`（默认关闭，opt-in） |
| Memory | LanceDB 存储、语义检索、记忆注入 | `wopal.pluginConfig["wopal-plugin"].memory.enabled`（总控）、`.memory.injection`（仅注入） |
| Task | 非阻塞子会话启动、状态监控、双向通信、并发控制 | 恒启用 |
| Monitor | 周期性调度引擎，统一管理监控策略 | 恒启用 |
| Context | 上下文压缩与恢复、标题生成、蒸馏 | `wopal.pluginConfig["wopal-plugin"].context.enabled`（门控标题/恢复/蒸馏，压缩恒启用） |

每次 plugin invocation 以 `PluginInput.wopalSpaceRoot` 作为唯一空间根来源。字段缺失表示非 WopalSpace instance。effective env 由进程启动环境、`$WOPAL_HOME/.env` 与 `<wopalSpaceRoot>/.wopal/.env` 合并生成，并保持只读，不写回 `process.env`。

| 资源 | 非 WopalSpace | WopalSpace |
|------|---------------|------------|
| Rules | `$WOPAL_HOME/rules` | `$WOPAL_HOME/rules` + `<wopalSpaceRoot>/.wopal/rules` |
| Plugin log | `$WOPAL_HOME/logs/wopal-plugin.log` | `<wopalSpaceRoot>/.wopal-space/logs/wopal-plugin.log` |
| Memory prompts | `$WOPAL_HOME/prompts` | `<pluginRoot>/prompts` + `$WOPAL_HOME/prompts` |
| Memory database | `$WOPAL_HOME/storage/memory` | `$WOPAL_HOME/storage/memory` |
| Session context | `$WOPAL_HOME/storage/session_context` | `$WOPAL_HOME/storage/session_context` |

### TUI Brand Plugin

`tui-ellamaka` 插件为 WopalSpace 模式注入 TUI 品牌元素：首页 logo 块字符画与阴影、提示行紧凑 logo、会话提示行 logo 与会话 ID，以及 Nord 系 `ellamaka-theme.json` 主题。该插件随 `.wopal/` ontology 分发，不属于 ellamaka 引擎仓库。

插件静态资源（主题文件、音频）随插件目录放置，由插件按相对路径解析。

插件的装配与配置消费与其他插件同一条契约：装配单的 `tui` 键物化为 settings 的 `tui.plugin` 条目（只含路径引用，见 `./DESIGN-assembly.md`）；行为配置放 `wopal.pluginConfig["tui-ellamaka"]`（`enabled` / `label` 等），由 TUI 配置链在三层 settings 中合并后经 `TuiPluginApi.pluginConfig` 整表交付，插件按自身配置键自取条目并做形状校验（条目为对象、已知字段类型正确），不读配置文件。装配条目的内联 options 保持为兼容 fallback（同样做已知字段校验），`pluginConfig` 的同名配置优先。

## Template System

空间骨架模板素材位于 `assembly/templates/`，由骨架声明决定渲染去向。

| Template | 渲染目标 | 职责 |
|----------|---------|------|
| `root-AGENTS.md` | `<space>/AGENTS.md` | 启动入口，指向 STRUCTURE / USER / REGULATIONS |
| `gitignore` | `<space>/.gitignore` | 忽略运行态噪音，防止日志、缓存、备份误提交 |
| `STRUCTURE.md` | `.wopal-space/STRUCTURE.md` | 空间结构模板 |
| `REGULATIONS.md` | `.wopal-space/REGULATIONS.md` | 空间守则模板 |
| `memory/USER.md` | `.wopal-space/memory/USER.md` | 用户档案模板 |
| `memory/MEMORY.md` | `.wopal-space/memory/MEMORY.md` | 文件型长期记忆模板 |
| `BOOTSTRAP.md` | `<space>/BOOTSTRAP.md` | 首次启动引导，`/init` 完成后删除 |
| `command.md` | 命令文件 | 命令模板 |

模板的 schema 字段定义、生成规则、消费规则与各模板设计see the Template Contract in `./DESIGN-assembly.md`.

> 文档撰写模板（PRD / DESIGN / Phase / AGENTS.md）是技能资产，随 `dev-doc-master` 与 `space-master` 技能分发，由 `/cupdate-*` 命令消费，不进入空间装配。

## Script System

| 目录 | 职责 |
|------|------|
| `scripts/git-hooks/` | ontology 开发与提交阶段使用的 hooks 脚本 |
| `scripts/emt` / `scripts/oct` | 辅助维护入口脚本 |
| `scripts/oc-auto-approve.py` | 本地辅助自动化脚本 |
| `scripts/setup-git-hooks.sh` | hooks 安装脚本 |
