# DESIGN — wopal-plugin Overall Design

> **Status**: Active
> **Updated**: 2026-10-10
> **Parent**: `./DESIGN.md`（ontology overall design: Plugin System and Configuration sections）
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`

---

## Project Role

wopal-plugin 是 WopalSpace 在 ellamaka 运行时上的专用插件，以 TypeScript 编写、Bun 执行。插件在 Agent 会话生命周期内提供四项核心能力：规则注入、任务委派、记忆系统、上下文管理。

插件以声明式配置驱动自身行为。配置承载于空间配置体系，随空间分发与覆盖。插件不修改 ellamaka 核心行为，所有能力以 Hook 与 Tool 的形式注入运行时。

每个 ellamaka instance 加载独立插件实例。`PluginInput.wopalSpaceRoot` 是唯一空间根来源，字段缺失表示非 WopalSpace instance。插件为每次 `server(input)` 调用构造独立的运行时上下文、配置、日志器与资源客户端。

## Capability Scope

| 能力域 | 拥有的目标能力 | 边界 |
|--------|----------------|------|
| 规则注入 | 规则文件发现、条件匹配、用户消息注入 | 不定义规则内容 |
| 任务委派 | 非阻塞子会话启动、状态监控、双向通信、并发控制、进程清理 | 不管理任务业务逻辑 |
| 记忆系统 | LanceDB 持久化、语义检索、自动注入、CRUD | 不持有记忆数据 |
| 上下文管理 | 会话摘要、上下文压缩与恢复、标题生成、会话转储、蒸馏（preview → confirm） | 不改变模型行为 |
| Skill 动态装配 | 从 Ellamaka Skill Pool 校验任务 Skill；维护 Session Skill Overlay；创建时和运行时只做增量 grant；request-tail 发布轻量 catalog；通过 runtime permission overlay 使原生 `skill(name)` 可加载 | 不扫描/复制 Skill Registry，不直接注入 Skill body/path，不隐式授予脚本或其他工具权限；Tool/Rule 动态能力本阶段不做 |

插件目标态向 Agent 暴露 8 个工具：`wopal_task`、`wopal_task_output`、`wopal_task_reply`、`wopal_task_abort`、`wopal_task_finish`、`wopal_skill_grant`、`memory_manage`、`context_manage`。`wopal_skill_grant` 只管理 Skill Overlay，不承担 Tool/Rule 动态配置。

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| 声明式配置优于环境变量开关 | 配置面需要类型、分组、默认值声明与注释；环境变量仅承载密钥与运行时诊断覆盖 |
| 配置承载于 settings 体系顶层 `wopal` 节点 | 复用既有三层配置与 git 传播模型；settings.jsonc 顶层是自由容器（`tui` 先例） |
| 资源层与模块分离 | `LLMClient`、`EmbeddingClient` 是共享资源，各模块按自身需求声明依赖 |
| 蒸馏归属 context 模块 | 蒸馏的输入是会话上下文，与标题生成同族，统一 LLM 资源依赖 |
| compaction 不纳入开关 | 会话安全阀，永远启用 |
| Prompt 模板按约定路径解析，不设配置项 | 空间级与用户级路径已覆盖自定义需求，配置项会为边缘场景增加心智负担 |
| 插件能实现尽量不改造 engine | 所有能力以 Hook/Tool 注入，不改 ellamaka 核心 |
| 能力边界与上下文激活分层 | 本轮仅细化 Skill：Ellamaka discovery 是 Skill Pool，Agent permission 是默认能力，wopal-plugin 的 Session Skill Overlay 只做增量激活；Tool/Rule 动态能力另案设计 |
| Skill Overlay 采用 baseline + incremental | 创建会话时与运行时都只追加 Skill，不提供 exact-set/subtract/revoke；动态 Skill 不改写 Agent 配置或 system prompt |
| Skill catalog 与 Skill body 分离 | request-tail 只发布新增激活 Skill 的 name + description；正文、base directory、scripts/references/assets 继续由 Ellamaka 原生 `skill(name)` progressive disclosure 加载 |
| 动态 Skill 可见性与加载授权共源 | request-tail catalog 与 `experimental.permission.rules` 都读取同一 Session Skill Overlay；后者只为 `permission=skill` 贡献临时 allow，不持久化、不改 `session.permission` |
| Plugin instance 隔离 | 每个 instance 独立运行时上下文、配置、日志与资源 |

## Plugin SDK Contract

wopal-plugin 消费 ellamaka fork 的插件契约层扩展，这些扩展经 npm 包 `@wopal/ellamaka-plugin` 分发。插件的运行时契约与依赖声明在此定义。

### 运行时契约：插件依赖的 fork 扩展

插件依赖少量通用 fork 扩展；这些扩展由引擎提供，且不得携带 Wopal 专属领域类型：

- `PluginInput.wopalSpaceRoot`：`PluginInput` 契约本身已声明 `wopalSpaceRoot?` 字段（`@wopal/ellamaka-plugin` 导出），插件入口直接读取，无需本地交叉类型断言。字段存在表示 WopalSpace instance，缺省表示非 WopalSpace。空间根是规则发现、配置加载、记忆存储的路径基座。
- `chat.params.systemMetadata`（`SystemPromptMetadata`）：引擎在 `session/prompt.ts` 构造 `{ version: 1, sections }`，经 `chat.params` hook 传入。插件在 `system-transform.ts` 捕获该元数据，写入 `systemMetadataMap`，供 `context_manage` 的会话转储与上下文格式化消费。`SystemPromptMetadata` / `SystemPromptSection` / `SystemPromptSectionKind` 类型从 `@wopal/ellamaka-plugin` 导入，运行时值来自引擎注入。
- `experimental.chat.messages.transform`：引擎在每个正常 model step 的 retained history 确定后调用既有消息 transform。wopal-plugin 只在数组尾部追加当前请求需要的 transient synthetic context，不回写历史、不修改 system prompt；动态 Skill catalog 使用这条现有链路。
- `experimental.permission.rules`：可选的通用 runtime permission overlay hook。引擎在一次 `ctx.ask()` 求值前传入 `{ sessionID, agent, permission, patterns }`，插件可向 `output.rules` 追加临时 permission rules；引擎按 `agent.permission → session.permission → plugin runtime rules` 的顺序合并后交给现有 Permission evaluator。该 hook 不写 `session.permission`、不进入 project-wide approved pool、不会改变 Permission Service 的持久状态。wopal-plugin 本轮仅在 `permission === "skill"` 时使用它，使 Session Skill Overlay 中已激活的 Skill 可以通过原生 `skill(name)` 加载。

### 依赖声明

插件声明 `@wopal/ellamaka-plugin` 与 `@wopal/ellamaka-sdk` 为直接依赖，版本跟随产品主版本（纯 `x.y.z`，如 `2.0.5`）。声明后：

- 契约层类型（`SystemPromptMetadata` / `SystemPromptSection` / `SystemPromptSectionKind` 等）与 `tool` 等辅助 API 全部从 `@wopal/ellamaka-plugin` 导入，仓库内零手抄 fork 类型
- SDK 消费点（`createOpencodeClient` 的 `/v2` client、`Model` 类型等）从 `@wopal/ellamaka-sdk` 导入，与上游 `@opencode-ai/sdk` 彻底脱钩
- 运行时引擎以 `InstallationVersion` 剥离 rc/beta 后的纯主版本兜底 pin（见 `projects/ellamaka/docs/DESIGN-distribution.md` 的 npm 包发布机制），保证插件拿到的契约层类型与引擎一致

依赖随插件 package.json 分发。空间级依赖安装在 `.wopal/` 的运行时 node_modules，由引擎的插件依赖收集机制统一安装。

### 与 fork 扩展的关系边界

插件的依赖面与 fork 契约层严格一致：声明什么扩展，就只消费哪些字段。未使用的扩展不进入插件的编译面与运行面。当前 wopal-plugin 的消费面是 `wopalSpaceRoot`、`systemMetadata`、既有 `experimental.chat.messages.transform` 与新增 `experimental.permission.rules`；`tool.provider` 与 `ToolContext.extra` 归属 Ellamaka 内部 dsh-adapter（见 `../../projects/ellamaka/docs/DESIGN-ellamaka-tools.md#internal-adapter`）。`experimental.permission.rules` 是 additive optional hook：旧插件运行在新引擎上无行为变化；依赖该 hook 的新版 wopal-plugin 需要与提供该契约的 Ellamaka 主版本配套分发。

## Module Architecture

| 模块 | 职责 | 可配置 |
|------|------|--------|
| Runtime（`runtime-*`） | 空间根解析、配置加载、日志器构建、环境合并 | — |
| Resources | LLM / Embedding 客户端共享资源，按模块依赖初始化 | — |
| Rules（`rules/`） | 规则发现 → 条件匹配 → 格式化注入 | `enabled`（默认关闭，opt-in） |
| Memory（`memory/`） | LanceDB 存储、语义检索、自动注入、CRUD | `enabled`、`injection` |
| Context（`hooks/`, `context/`） | 会话摘要、压缩恢复、标题生成、蒸馏 | `enabled` |
| Task（`tasks/`） | 子会话启动、状态监控、双向通信、并发控制 | 始终启用 |
| Skill Assembly（skill overlay + hooks/tools） | Session Skill Overlay、Skill Pool 校验、request-tail catalog、runtime skill permission allow、运行时 grant 控制面 | 始终启用 |
| Monitor（`monitor/`） | 周期性调度引擎，统一管理监控策略 | 始终启用 |
| Lifecycle（`lifecycle/`） | 进程退出清理注册表 | — |
| Tools（`tools/`） | 插件工具定义与注册 | 按模块开关 |

| 目录 | 职责 |
|------|------|
| `src/hooks/` | Hook 注册与注入逻辑；`system-transform.ts` 是系统提示词修改的唯一入口 |
| `src/tasks/` | 任务管理；`SimpleTaskManager` 是唯一公开入口 |
| `src/memory/` | 记忆持久化；`MemoryStore` 是唯一持久化访问入口 |
| `src/monitor/` | `MonitorEngine` 是唯一周期调度引擎 |
| `src/tools/` | 工具定义；任务工具统一 `wopal_task_*` 前缀 |

部署：在 `config/settings.jsonc` 中以相对路径声明插件目录 `../plugins/wopal-plugin/src/index.ts`。

### Resources Layer

`LLMClient` 与 `EmbeddingClient` 是插件级共享资源，不属于任何功能模块。功能模块按自身需求声明对资源的依赖，资源按依赖关系初始化：

- Embedding：memory 模块（注入 / 检索 / CRUD 去重）
- LLM：context 模块（标题生成 / 蒸馏）

资源初始化按启用能力的最小集推导。能力全关时零资源初始化。资源缺失时该模块降级并记录 warn 日志，降级以模块为粒度，不连锁拖垮无关模块。

### Rules Module

Rules 模块发现全局（`~/.wopal/rules`）与空间（`<space>/.wopal/rules`）两级规则文件，按 Agent 作用域与关键词条件匹配，通过 `messages.transform` 注入用户消息。规则发现发生在插件初始化时，注入发生在每条消息周期。

模块拥有开关 `wopal.pluginConfig["wopal-plugin"].rules.enabled`，**默认 `false`（关闭）**。开关为 opt-in：关闭时规则发现整体跳过，不产生注入。理由：规则注入直接占用每轮上下文预算，且规则体系依赖项目与语言约束，适合由使用方显式开启而非全局默认生效。

### Memory Module

Memory 模块管理 LanceDB 记忆存储与检索。`MemoryStore` 是唯一持久化访问入口，记录使用 `tags` 字段。模块拥有两个配置开关：

- `enabled`：记忆系统本体——store、embedder、`memory_manage` 工具。关闭时以上全部不初始化
- `injection`：自动注入——将检索到的记忆注入用户消息。独立于 `enabled`，关闭不影响记忆检索

注入是上下文成本敏感能力。`injection` 独立可关让用户在不放弃检索的前提下消除注入开销。注入门控前置：`needsMemoryInjection` 标志仅在注入能力启用时置位，避免功能关闭时每条消息产生无效 store 写。

记忆蒸馏的 `preview → confirm` 两步流程由 context 模块拥有（见 4.4），memory 模块不承担蒸馏引擎。

### Context Module

Context 模块管理会话生命周期中的上下文质量。模块拥有总开关 `enabled`，统管三项增强能力：

- 标题生成：压缩完成后为会话生成标题
- 自动恢复：压缩后自动发送恢复指令，保持会话连续性
- 蒸馏：从会话上下文提炼记忆候选，经 preview → confirm 两步确认后写入记忆库

`compaction`（上下文压缩）不纳入开关，永远启用——它是会话安全阀，关闭会导致上下文管理失效。

蒸馏归属 context 模块的依据：蒸馏的输入是会话上下文，输出是记忆候选，其本质是用 LLM 处理会话上下文，与标题生成、压缩同族。输出落点不决定归属，输入决定归属。蒸馏关闭时相关操作返回清晰的降级提示，不影响记忆检索与 CRUD。

### Task Module

Task 模块提供非阻塞子会话委派。`SimpleTaskManager` 是唯一公开入口，负责：

- 任务启动：`wopal_task` 启动子会话，受并发限制约束
- 状态监控：通过 Monitor 策略周期检查任务状态，分类 `idle` / `stuck` / `error`
- 双向通信：`wopal_task_reply` 注入消息续会话，`wopal_task_output` 查询输出
- 生命周期：任务可中止、可完成清理，子会话异常分类处理
- 通知：进度通知、会话 ID 解析、任务引用解析

任务工具永远注册，不依赖任何开关。`SimpleTaskManager` 的周期监控通过 `MonitorStrategy` 注册进 `MonitorEngine`。

### Skill Dynamic Assembly

本阶段只实现 Skill 动态装配。外部 Tool、内部 Tool 与 Rule 的动态配置不属于本阶段；它们保留现状，另行设计。Skill Pool 由 Ellamaka discovery (`GET /skill` / SDK `app.skills`) 提供，wopal-plugin 不扫描 `.wopal/skills`、不复制 Skill Registry，也不重新解析 SKILL.md。

#### Baseline and Session Skill Overlay

Agent frontmatter 的 `permission.skill` 是默认能力配置。Wopal 选择的任务 Skill 叠加为 **Session Skill Overlay**，只增加、不撤销：

- 创建子会话时：`wopal_task.capabilities.skills` 写入 `initial` grants；
- 会话运行时：主 Agent 通过插件的 skill-only grant 控制面向当前主会话或目标子会话追加 `runtime` grants；
- effective overlay = `initial ∪ runtime`，去重并确定性排序；本阶段不提供 exact-set、subtract、deny 或 revoke；
- overlay 只表达“额外激活的 Skill”，不复制 Agent baseline。Agent baseline 继续由 Ellamaka 原生 system catalog / permission 机制表达。

所有 grant 在状态变更前使用 Ellamaka discovery 的 Skill name 校验；未知或未物化 Skill 必须原子失败。同一 Session 的 grant 通过插件内 per-session 队列串行化 read-modify-write，避免并发 tool call 互相覆盖。discovery 的 name/description 可做短 TTL 派生缓存；空 overlay 不触发 discovery，grant 在缓存中找不到 Skill 时必须强制刷新一次后再判 unknown。持久事实存入 Session metadata，SessionStore 只做可清空缓存。插件重启、resume 或 compaction 后必须能从 metadata 重建同一 overlay。

#### Request-Tail Catalog

Session Skill Overlay 不直接注入 SKILL.md body，也不把 Skill 路径暴露给模型。`experimental.chat.messages.transform` 在每个正常 model step 的 retained history 之后追加一份 transient synthetic snapshot，只列 overlay 中 Skill 的 `name + description`，并明确提示模型用原生 `skill(name)` 加载后再执行。

该 snapshot 每个正常模型请求都从当前 overlay 重新生成；因为 transform 内容不落 DB，不能以跨请求 digest 相同为由省略发送。digest 只能用于解析/格式化缓存。注入必须 append-only：不改较早 user message、不改 system prompt、不改 tool schema，因此新增 Skill 只影响已有可缓存前缀之后的请求尾部。Skill descriptor lookup 失败时 catalog injector 记录诊断并 fail-open，不追加本次 snapshot，也不让插件故障中断整个 model step。Ellamaka 在生成 compaction summary 前会先触发 `experimental.session.compacting`，随后也会调用 `messages.transform`；wopal-plugin 在该 compacting 窗口必须跳过动态 Skill catalog，避免 transient task catalog 被摘要模型写回持久 compaction history。

#### Native Skill Loading and Permission Overlay

Skill 正文与资源仍完全归 Ellamaka 原生 `skill(name)`：它负责读取 SKILL.md、返回 base directory 和资源文件清单，并维持既有 progressive disclosure / recovery 行为。Skill grant 只授予“加载这项 Skill”的权限，不隐式授予 Skill 指令中涉及的 bash/read/edit/外部工具权限；这些执行权限属于其他能力设计。

为使受限 Agent（例如 `skill: "*": deny`）可以加载 overlay 中的新 Skill，wopal-plugin 在 `experimental.permission.rules` 中读取同一 Session Skill Overlay：只有当当前 ask 的 `permission === "skill"` 且请求 pattern 命中 overlay 时，才向 `output.rules` 追加精确 `allow`。overlay hydration/读取失败时记录诊断并贡献零规则，让原有 agent/session baseline 继续求值（fail-deny），不能把插件缓存/metadata 故障升级为整个 permission ask 失败。该 runtime rule 排在 agent/session baseline 之后参与本次求值，因此可覆盖角色默认 deny，但它不写 `session.permission`、不进入 project-wide approved pool，也不改变 Permission Service 持久状态。

由此保持单一事实源：

```text
Session Skill Overlay
        ├── messages.transform → 模型看到额外 Skill 的 name + description
        └── permission.rules   → skill(name) 对同一 Skill 实际可加载
```

两个消费端不得各自维护 grant 列表，否则会出现“看得到但加载不了”或“能加载但模型不知道”的漂移。

#### Runtime Mutation Boundary

运行时 Skill grant 在两个 model step 之间发生即可；Ellamaka run loop 不需要刷新或重建 Session 对象。下一次请求的 `messages.transform` 会读取最新 overlay，后续 `skill(name)` 的 permission ask 会再次读取同一 overlay。插件不得通过运行期频繁改写 `session.permission` 来实现 Skill 动态注入。

控制面只负责追加 Skill grants。目标契约为 `wopal_skill_grant`：接收 `skills: string[]`，并可选定位一个已知子 Session；未指定目标时作用于当前 Session。调用前必须用 Ellamaka Skill discovery 验证全部名称，任一名称无效则整次 grant 原子失败。该工具本身属于 Skill 装配控制面，不扩展本阶段到 Tool/Rule 动态能力；Fae/Rook/Maka 等非主控角色默认禁止调用，由 Wopal 主 Agent 持有运行时装配权。对子任务的 `promptAsync` 工具覆盖还必须显式把 `wopal_skill_grant` 设为 false，避免未定义专用 frontmatter 的子 Agent 落入引擎 ask fallback。

#### Recovery and Ownership

Session metadata 是 Skill Overlay 的持久真相源；SessionStore 和格式化 digest 都是派生缓存。插件重启或 Session resume 时，overlay 在首次读取时从 metadata hydration；compaction 完成时必须主动丢弃 SessionStore 中的 overlay cache，使下一次 catalog/permission 读取同样从 metadata 重建。现有 `loadedSkills` 只在原生 `skill(name)` 成功执行后的 `tool.execute.after` 记录，表示“正文确实加载过”的恢复事实；权限被拒或 loader 失败的尝试不得写入，且 `loadedSkills` 不能反向授予 Skill。动态 catalog 在每个正常请求重新发布，所以 compaction 后无需把 overlay body 重新注入；若已加载 Skill body 被压缩掉，继续复用现有 Skill reload/recovery 机制。

### Monitor Module

`MonitorEngine` 是插件内唯一的周期调度引擎。以固定间隔执行已注册的 `MonitorStrategy`，统一管理会话状态视图。现有策略：任务监控策略（Task 模块注册）、主会话监控策略（会话状态与压缩触发）。其他模块不得创建独立调度链，新策略实现 `MonitorStrategy` 接口并注册进引擎。

### Lifecycle Module

进程退出清理注册表。监控引擎与任务管理器在进程退出时统一清理，避免孤儿定时器与未关闭资源。

## Configuration

### Configuration Carrier

插件配置承载于既有三层 settings 体系，顶层 `wopal` 节点：

| 层级 | 文件 | Git | 职责 |
|------|------|-----|------|
| 全局 | `~/.wopal/config/settings.jsonc` | 否 | 所有空间共享的默认值 |
| 空间公共 | `<space>/.wopal/config/settings.jsonc` | 是 | 空间能力基线，随分支分发 |
| 空间私有 | `<space>/.wopal/config/settings.local.jsonc` | 否 | 本地调参，覆盖公共默认 |

合并规则：deep merge，后者覆盖前者的叶子值。文件缺失则跳过该层。优先级：代码默认 < 全局 < 空间公共 < 空间私有。

引擎在配置加载期完成三层合并并记录来源层级；插件经 `PluginInput.pluginConfig` 取得生效表，按自身配置键自取条目。

### Configuration Schema

```jsonc
"wopal": {
  "pluginConfig": {
    "wopal-plugin": {
      "llm":       { "baseUrl": "...", "model": "...", "apiKey": "$WOPAL_LLM_API_KEY" },
      "embedding": { "baseUrl": "...", "model": "...", "apiKey": "$WOPAL_EMBEDDING_API_KEY" },
      "rules":     { "enabled": false },
      "memory":    { "enabled": true, "injection": true },
      "context":   { "enabled": true },
      "logLevel":  "info"
    }
  }
}
```

Schema 由 zod 定义，每个字段声明类型与默认值。非法配置在启动时报错，不静默降级。未配置的字段使用默认值。

`apiKey` 支持 `$VAR` 环境变量引用：以 `$` 开头从 `process.env` 解析，未设置时启动报错；不以 `$` 开头按字面值处理。配置文件即使进 git 也不承载明文密钥。

### Plugin Config Node (`wopal.pluginConfig`)

`wopal` 节点支持可选的 `pluginConfig` 子节点，作为本体生态插件行为配置的统一载体：

```jsonc
"wopal": {
  "pluginConfig": {
    "dsh-adapter": { "sandbox": { "enabled": true, "mode": "workspace-write" } }
  }
}
```

- Schema：`z.record(z.string(), z.record(z.string(), z.unknown())).optional()` — 外层 key 为插件名，内层为该插件的自由配置对象，由各插件自行定义与校验
- 定位：**所有 ellamaka 插件统一的插件行为配置格式**。wopal-plugin 消费 `wopal.pluginConfig["wopal-plugin"]`，dsh-adapter 等生态插件消费 `wopal.pluginConfig.<插件名>`。判定规则：插件条目（settings `plugin` 数组）保持零内联 options；插件只读不写
- 继承：随三层 settings 走 deep merge（代码默认 < 全局 < 空间公共 < 空间私有），生态插件配置天然获得继承与覆盖能力
- 写入端：由 wopal-cli `config` 命令族（见 `projects/wopal-cli/docs/DESIGN-config-cli.md`）承载；在此之前该节点的值由用户手工维护

### Prompt Template Resolution

提示词模板按约定路径解析，不设配置项。解析顺序：

| 层级 | 路径 | 说明 |
|------|------|------|
| 插件级 | `<pluginRoot>/prompts/<filename>` | 随插件分发，是提示词的正式所在 |
| 用户级 | `$WOPAL_HOME/prompts/<filename>` | 本机跨空间覆盖，位于装配 worktree 之外 |
| 内联默认 | 插件源码 `default-prompts.ts` | 前两层均未命中时使用 |

四个模板文件的约定名：

| 文件 | 消费方 | 用途 |
|------|--------|------|
| `distill.md` | context | 会话蒸馏的提取提示词 |
| `dedup.md` | context | 蒸馏候选与既有记忆的去重决策提示词 |
| `title.md` | context | 会话标题生成提示词 |
| `commit-msg-gen.md` | 提交信息生成 | 依据 git diff 生成 Conventional Commits 提交信息 |

模板加载发生在消费方首次调用时（惰性），加载结果按文件路径缓存。模板内容使用 `{{placeholder}}` 占位符，由消费方填充。

设计取舍：不提供「任意路径覆盖」配置项。约定路径已覆盖插件与用户两级需求，而新增 `prompts: { distill: "/abs/path" }` 之类的配置面为边缘场景增加了用户心智负担与 schema 复杂度。

不设空间级（`<space>/.wopal/prompts/`）：`.wopal/` 是 sparse-checkout 物化出的装配 worktree，其中的文件变更会被 `space sync` 作为空间进化上行、汇入中央能力池。提示词是随插件分发的能力资产，不是空间私有定制，因此不设空间级覆盖；本机范围的调整走用户级。

### Environment Variable Roles

环境变量收敛为三个角色，功能开关不使用环境变量：

| 角色 | 变量 | 说明 |
|------|------|------|
| 密钥 | `WOPAL_LLM_API_KEY`、`WOPAL_EMBEDDING_API_KEY` | 由配置 `apiKey` 字段以 `$` 引用 |
| 日志诊断覆盖 | `WOPAL_PLUGIN_LOG_LEVEL` / `_FILE` / `_MODULES` | 运行时覆盖，供启动脚本动态传入，优先级高于配置文件 |
| 宿主统一级别兜底 | `ELLAMAKA_LOG_LEVEL` | 宿主解析出的统一日志级别（大写 DEBUG/INFO/WARN/ERROR，读取时归一化）。仅当显式插件接口（`WOPAL_PLUGIN_LOG_LEVEL`、配置 `logLevel`）均无有效级别时消费；仅真实进程环境，不从 `.env` 读取 |

日志诊断保留 env 通道：启动脚本按进程场景动态传入日志级别与位置，静态配置文件无法表达这种运行时变化。配置文件 `logLevel` 是声明式默认值，诊断 env 是运行时覆盖，二者定位不同，不重叠。

### Configuration Source Precedence

一般配置：代码默认 < 全局 < 空间公共 < 空间私有。日志诊断：上述链条之上叠加 `WOPAL_PLUGIN_LOG_*` env 覆盖。

日志级别解析链（命中即止）：`WOPAL_PLUGIN_LOG_LEVEL` > 配置 `logLevel`（`pluginConfig["wopal-plugin"]`，含旧顶层字段）> `ELLAMAKA_LOG_LEVEL`（宿主统一级别兜底；小写归一后匹配宿主词表 DEBUG/INFO/WARN/ERROR，TRACE/FATAL/非法值不命中）> `info`。`WOPAL_PLUGIN_LOG_FILE` / `_MODULES` 维持 env 覆盖配置。

## Interfaces and Contracts

### Hook Interface

| Hook | 用途 |
|------|------|
| `messages.transform` | 规则注入、记忆注入、技能重载，以及 Session Skill Overlay 的 request-tail catalog；动态 Skill 只追加 transient synthetic context，不改 system prompt |
| `experimental.permission.rules` | 为当前 permission ask 追加临时 runtime rules；wopal-plugin 本阶段只处理 `permission=skill`，并从 Session Skill Overlay 生成精确 allow |
| `event` | 事件路由：消息增量、会话 idle/compacted/error 分发到专用处理器 |
| `tool` | 工具注册表，见 6.2 |
| `system.transform` | 会话系统提示词快照与上下文转储基础设施 |

事件路由将事件分发到专用处理器：`message-token-handler`（消息增量）、`idle-compact-handler`（idle/compacted 恢复与标题生成）、`error-handler`（会话错误）。

### Tool Interface

| 工具 | 注册条件 | 职责 |
|------|----------|------|
| `wopal_task` | 始终 | 非阻塞子会话启动，可携带能力装配参数 |
| `wopal_task_output` | 始终 | 任务状态与输出查询 |
| `wopal_task_reply` | 始终 | 双向通信与恢复 |
| `wopal_task_abort` | 始终 | 任务终止 |
| `wopal_task_finish` | 始终 | 任务完成清理 |
| `wopal_skill_grant` | 始终；仅主控角色允许 | 向当前 Session 或已知子 Session 的 Skill Overlay 原子追加已发现 Skill；只增不减，不加载 body，不授予其他执行权限 |
| `memory_manage` | `memory.enabled` | 记忆 list/stats/search/add/update/delete/injected |
| `context_manage` | 始终 | 会话 status/dump/compact + 蒸馏（distill/confirm/cancel） |

`memory_manage` 条件注册，禁用时输出 info 日志说明原因。蒸馏动作属于 context 模块，承载于 `context_manage` 工具。

### Logging System

| Logger | Scope |
|--------|-------|
| `coreLogger` | Bootstrap、生命周期 |
| `rulesLogger` | 规则发现/匹配/注入 |
| `taskLogger` | 任务委派/监控/通信 |
| `memoryLogger` | LanceDB/检索/注入 |
| `contextLogger` | 会话状态/压缩/恢复/蒸馏 |

日志级别 trace/debug/info/warn/error/fatal，默认 info；生效级别由 Configuration Source Precedence 的四层链解析（含宿主统一级别兜底 `ELLAMAKA_LOG_LEVEL`）。核心事件完成记录一条 info；关键数据点用 debug；详细流程用 trace。结构化字段通过 data 对象携带，字段名 snake_case。错误日志必须携带 `{ err: error }`。

## Data and State Model

| State | Location | Owner | Rules |
|-------|----------|-------|-------|
| 会话状态 | `sessionStore` 内存 Map | hooks | 会话级瞬态，含注入标志、压缩状态、技能加载集 |
| 会话上下文 | `$WOPAL_HOME/storage/session_context` | context | 蒸馏提取状态、会话摘要、标题 |
| 记忆数据 | `$WOPAL_HOME/storage/memory` LanceDB | memory | 检索式记忆，tags 字段，蒸馏经 preview→confirm 写入 |
| 系统提示词快照 | 插件进程内 Map | hooks | 规则/记忆注入的会话级快照 |
| 任务状态 | `SimpleTaskManager` 内存 | tasks | 任务生命周期与并发控制 |
| 插件运行时状态 | 插件进程内 | runtime | 每个 instance 独立 |

会话上下文（`session-context.ts`）采用模块化块结构：`distill` 块（提取状态）、`summary` 块（会话摘要），未来扩展不修改现有结构。

## Reference Documents

- `.wopal/docs/DESIGN.md` — ontology overall design (Plugin System, Configuration, Tool Interface sections)
- `.wopal/plugins/wopal-plugin/AGENTS.md` — 插件开发规范
- `.wopal/plugins/wopal-plugin/docs/rules.md` — 规则体系使用说明
- Issue #225 — 配置体系重构的问题清单与来源