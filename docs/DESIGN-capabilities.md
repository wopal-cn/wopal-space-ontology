# DESIGN — Capability System

> **Status**: Active
> **Updated**: 2026-09-27
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

能力装配分四层，各层职责与作用时机不同：

| 层级 | 决定什么 | 载体 | 作用时机 |
|------|---------|------|---------|
| **能力池** | 中央仓库拥有的全部能力 | central `main` | 跨空间持续 |
| **空间武器库** | 本空间物化了哪些能力 | `assembly/archetypes/<type>.yaml` 装配单 → sparse-checkout | 空间创建 / `space capability` |
| **角色基线** | 每个角色默认能用哪些能力 | `agents/<name>.md` 的 `permission:` | 会话创建瞬间 |
| **会话装配** | 本次任务实际授予哪些能力 | `wopal_task` 的 `capabilities` 参数 | 每次派发时 |

上三层是静态声明，第四层是运行时装配。Wopal 在派发任务时，按任务性质从空间武器库中挑选能力，装配给子会话——这是「武器多态」的运行时落点。

#### Space Arsenal and Role Baseline

物化进空间的武器库**不等于**全量授予任何角色。武器库是空间拥有的能力储备，角色基线是默认授予的子集。

未进入任何角色基线的武器对相应角色不可见。这种默认不可见是刻意的：它让 Wopal 的上下文只承载当前角色真正需要的武器清单，避免无关能力占用推理预算。

Wopal 的挑选权**不受角色基线限制**。装配给会话的能力经权限合成后覆盖基线——不配置就看不见，配置了就可用。

#### Arsenal Scope and Truth Source

武器库的范围是**全局层与空间层的有效能力集**——全局装的能力也算武器，空间层同名优先。四类武器：

| 类别 | 内容 | 发现来源 |
|------|------|---------|
| 技能 | SKILL.md 定义的技能 | ellamaka `Skill` 引擎（多层目录扫描、空间优先去重） |
| 规则 | 规则文件定义的约束 | ellamaka `Rule` 引擎（多层目录扫描、空间覆盖全局） |
| 外部工具 | MCP 服务工具 + 文件注册的自定义工具 + 插件注册的工具 | ellamaka `ToolRegistry`（custom 部分）+ `MCP` 引擎 |
| 内部工具 | 引擎内置工具（bash、read、edit、glob、grep、webfetch 等） | ellamaka `ToolRegistry`（builtin 部分） |

四类武器全部从 ellamaka 引擎统一获取，通过 `@wopal/ellamaka-sdk` 向外暴露。引擎内部严格区分两个层次：

- **发现层**——"引擎加载了什么"，返回完整列表，不过滤权限。武器库扫描只调这一层。
- **运行时过滤层**——"这个 agent 这次能用什么"，按 agent 权限与 model 过滤。系统提示词生成、工具清单构建、执行授权全部走这一层。

武器库扫描端点只调发现层方法，完全不触碰运行时过滤层。两条路径读不同的方法，互不干扰——武器库拿到完整能力列表，ellamaka 运行时的权限过滤逻辑不受影响。

武器库查询由 wopal-cli 的 `wopal space capability list` 命令承载。该命令通过 SDK 连接 ellamaka 引擎获取四类武器清单：引擎在运行时直连现有实例；引擎未运行时由 SDK 启动临时子进程。wopal-cli 裁剪输出为武器元数据（名称、描述、来源标注、路径），不传递工具的执行方法。命令契约见 `projects/wopal-cli/docs/DESIGN.md` 的 Space Capability。

#### Session Assembly Injection Channel

会话装配通过**会话级权限**实现。能力在会话创建时授予，会话生命周期内保持稳定，中途不改变装配。授予依据是 ellamaka 的权限合并规则：后者覆盖前者，因此会话级规则能够超越角色基线。

内置工具不进会话装配。角色基线已经完整控制工具的可见性与执行授权，重复装配只会引入歧义。

装配对 skills / rules / mcp 三类能力分别生效，合成规则、注入方式与压缩后的行为细节see the Capability Assembly Module in `./DESIGN-wopal-plugin.md`.

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

本体资产的全部维护面由 `ontology-evolution` 技能单点拥有：能力进化的完整流程（提案、状态机、隔离实施、交付终端），以及本体维护操作（`ontology update` / `space sync` / `ontology contribute` / 能力装配增删）的执行协议。`space-master` 只保留路由职责——把本体相关请求导向 `ontology-evolution`，不重复维护规范；`wopal/ontology-maintain` 命令是薄触发入口，加载该技能后按其协议执行，自身不承载规范。

`space-master` 是 ontology 的根技能，定位为概念模型入口、流程选择器与核心技能路由器。本体维护规范收编至 `ontology-evolution` 后，其职责边界收窄为「选哪个技能」，不再持有任何执行协议的完整副本。

## Command System

| 类别 | 命令 | 载体 |
|------|------|------|
| 空间维护 | `/init`、`wopal space status`、`wopal space sync`、`wopal space capability add/remove` | `commands/init.md`、CLI 命令 |
| 记忆与进化 | `/wopal:memo`、`/wopal:evolve`、`/wopal:distill`、`/wopal:memory`、`wopal/ontology-maintain` | `commands/wopal/` |
| 唤醒与感知 | `/wopal:summon` | `commands/wopal/summon.md` |
| 文档管理 | `/cupdate-prd`、`/cupdate-design`、`/cupdate-roadmap`、`/cupdate-readme`、`/cupdate-br`、`/cupdate-agent-rules` | `commands/cupdate-*.md` |
| 开发支持 | `/commit`、`/review` | `commands/commit.md`、`commands/review.md` |
| 上下文管理 | `/context-continue`、`/context-handoff`、`/context-recover` | `commands/context-*.md` |
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
