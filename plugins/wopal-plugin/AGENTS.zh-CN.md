# wopal-plugin — Agent 开发规则

## 1. 项目定位

Wopal 专用 ellamaka 运行时插件 — 规则注入、任务委派、记忆系统、上下文管理四大能力。

规范文档引用：

- PRD：`.wopal/docs/PRD.md`
- DESIGN：`.wopal/docs/DESIGN.md`
- 父级规则：`.wopal/AGENTS.md`

## 2. 架构与目录

| 模块 | 职责 | 禁用开关 |
|------|------|---------|
| Global (`index.ts`) | 加载 .env、消费引擎交付配置、注册 Hooks/Tools | 无 |
| Rules (`rules/`) | 规则发现 → 条件匹配 → 注入用户消息 | `pluginConfig["wopal-plugin"].rules.enabled` — opt-in，默认 `false` |
| Memory (`memory/`) | LanceDB 存储、语义检索、记忆注入 | `pluginConfig["wopal-plugin"].memory.enabled`（总控）、`.memory.injection`（仅注入） |
| Task (`tasks/`) | 非阻塞子会话、状态监控、双向通信、并发控制 | 无 |
| Monitor (`monitor/`) | 周期性调度引擎，统一管理监控策略 | 无 |
| Context (`hooks/`, `context/`) | 会话压缩与恢复、标题生成、蒸馏 | `pluginConfig["wopal-plugin"].context.enabled` — 门控标题/恢复/蒸馏，压缩恒启用 |

| 目录 | 职责 |
|------|------|
| `src/hooks/` | Hook 注册与注入逻辑；`system-transform.ts` 是唯一系统提示词修改入口 |
| `src/tasks/` | 任务管理；`SimpleTaskManager` 是唯一公共入口 |
| `src/memory/` | 记忆持久层；`MemoryStore`（`store.ts`）是唯一持久层访问入口 |
| `src/monitor/` | `MonitorEngine` 是唯一的周期性调度引擎 |
| `src/tools/` | 插件工具定义；任务工具统一 `wopal-task-*` 前缀 |
| `src/lifecycle/` | 通用进程清理 registry |
| `src/rules/` | 规则发现、匹配、格式化 |
| `scripts/` | CLI 工具、迁移、验证辅助脚本 |

部署：在 `config/settings.jsonc` 中以相对路径 `../plugins/wopal-plugin/src/index.ts` 声明。

## 3. 开发命令

| 场景 | 命令 |
|------|------|
| 安装依赖 | `bun install` |
| 类型检查 | `bun run typecheck` |
| 自动修复类型 | `bun run typecheck:fix` |
| 运行测试 | `bun run test:run` |
| watch 测试 | `bun run test` |
| 构建 | `bun run build` |
| lint | `bun run lint` |
| 格式化 | `bun run format` / `bun run format:fix` |
| 格式检查 | `bun run format:check`（当前非硬门禁） |

### 变更后验证顺序

`bun run typecheck:fix` → `bun run typecheck` → `bun run test:run`。

`typecheck:fix` 无法处理的类型问题必须人工修复，禁止跳过直接提交。`build` 仅用于产物验证/发布，不作为日常校验。

### 验证机制

单元测试无法覆盖的运行时行为（插件引导、真实文件配置加载、资源构建、工具注册）通过 headless 启动 ellamaka 针对真实空间验证：

```bash
# 从空间根目录执行；插件日志输出到 stderr 并追加到日志文件。
ellamaka run "reply with exactly: OK" --print-logs --log-level DEBUG
```

输出落至 `<space>/.wopal-space/logs/wopal-plugin.log`。关键引导标记：

| 标记 | 含义 |
|------|------|
| `Runtime context initialized` | 空间根与 `wopalHome` 已解析 |
| `Effective wopal config loaded` | 引擎交付的插件配置已消费；生效快照落日志，密钥已脱敏 |
| `Resources resolved` | store / embedder / llm 中哪些已构建 |
| `Plugin initialized` | 最终工具清单与 `memory` 标志 |

配置驱动行为使用 `.wopal-space/.tmp/` 下的隔离 fixture 验证（禁止修改用户真实 `settings.local.jsonc`）；`loadWopalConfig` 支持注入 `pluginConfig` 切片 / `inlineOptions` / `fallbackEnvironment` 用于此目的。

`WOPAL_HOME` 覆盖用户级配置与存储根，使沙箱化运行成为可能。

## 4. 实现规则

### 日志

使用模块级 logger（`src/logger.ts`），禁止 `console.log`。

| Logger | 覆盖 |
|--------|------|
| `coreLogger` | 全局引导、生命周期 |
| `rulesLogger` | 规则发现/匹配/注入 |
| `taskLogger` | 任务委派/监控/通信 |
| `memoryLogger` | LanceDB/检索/注入/蒸馏 |
| `contextLogger` | 会话状态/压缩/恢复 |

- 日志级别：trace(10) / debug(20) / info(30) / warn(40) / error(50) / fatal(60)；默认 `info`
- **日志级别使用规则**：
  - `info`：核心事件完成 — 每个关键事件只允许一条 info（如蒸馏完成、确认完成、取消）。不得追加
  - `debug`：重要数据展现 — 输出关键指标/数据点供运维观察（如消息数量、提取后的对话长度）
  - `trace`：详细调试流程 — 逐步排查信息用于故障定位（如"已提取过"、"太短跳过"、"无记忆提取"）
  - `warn`：结构化错误输出 — 必须携带 `{ err: error }`，禁止拼接 error.message
- 结构化字段用 `data` 对象传递，字段命名 snake_case；禁止拼接到 message
- 错误日志必须携带 `{ err: error }`，禁止只记 `error.message`
- sessionID 格式：`formatSessionID(sessionID, isTask)` → `<last10chars>(main|task)`
- 模块级 logger 是进程级单例，但一个进程可承载多个 runtime（每空间一个）；其写入目标**不得在 import 时冻结**，必须跟随当前 runtime
  - `createPluginRuntime` 组装 runtime 时必须调用 `bindLoggerRuntime(context, env, config)` 绑定目标；未绑定时才回退到进程环境
  - 绑定后单例调用点写入该 runtime 的 `logDir`；未绑定会落到全局 `<WOPAL_HOME>/logs`，使空间实例的日志写错位置
  - `src/logger-runtime-binding.test.ts` 是回归守卫，断言绑定/回退/最后写入生效三种路由

### 路径解析

- `WOPAL_HOME` 一律经 `resolveWopalHome()`（`src/paths.ts`）归一化后才能转成路径，禁止直接喂给 `path.join`
  - 环境中的值可能是未展开的字面量 `~/.wopal`；`join("~/.wopal", "logs")` 得到**相对**路径，会按进程 cwd 解析，在插件目录内长出垃圾 `~/` 目录
  - 归一化负责：展开前导 `~` → 绝对化 → 空值兜底 `<home>/.wopal`
- 测试全局由 `src/test-setup.ts` 把 `WOPAL_HOME` 钉到临时目录（绝对路径）；测试若自行改写必须恢复到该隔离值
- `src/test-isolation.test.ts` 是回归守卫，断言写入路径既不在插件 cwd 内、也不在真实 `~/.wopal` 内

### 模块边界

- **tasks**：`SimpleTaskManager` 周期性监控必须通过 `MonitorStrategy` 注册到 `MonitorEngine`
- **monitor**：新增监控策略只需实现 `MonitorStrategy` 接口并注册到 engine，禁止在其他模块新建独立调度链
- **memory**：`MemoryStore` 是唯一持久层入口；记录使用 `tags` 字段（非 `concepts`）
- **context**：蒸馏走 `preview → confirm` 两步，禁止跳过用户审查直接写入

### Agent 工具

- `memory_manage`：纯记忆操作 — list/stats/search/add/update/delete/injected；记忆 store 可用时注册
- `context_manage`：会话上下文 — status/dump/compact，以及蒸馏动作 distill/confirm/cancel；蒸馏要求 context 能力（`context.enabled`）

### `promptAsync` 会话模型纪律

- 任何 `promptAsync` 向某个 session 发送消息时，必须显式使用**目标 session 当前可信模型**作为 `body.model`，禁止依赖默认模型
- 向主会话发送 → 使用主会话当前模型；向子会话发送 → 使用该子会话当前模型
- 若目标 session 当前模型未知，必须先从 session state 或 runtime API 获取；仍获取不到时才允许安全降级，并记录 debug/warn 日志说明原因
- 禁止把发送方 session、当前执行 agent、默认 provider/model 的模型配置用于目标 session

### 新增功能

- **新增 hook**：在 `hooks/` 下新建文件，在 `hooks/index.ts` 的 `createAllHooks()` 中注册
- **新增工具**：在 `tools/` 下新建文件，在 `tools/index.ts` 的 `createWopalTools()` 中注册；任务工具统一 `wopal_task_*` 前缀
- **新增记忆分类**：在 `memory/categories.ts` 添加，标识符用英文，重要性 0-1
- **新增监控策略**：实现 `MonitorStrategy` 接口，注册到 `MonitorEngine`
- **新增环境变量**：`WOPAL_` 前缀 + `UPPER_SNAKE_CASE`；必须在调试开关表中同步补齐。功能开关归属配置，不进 env
- **新增配置节点**：在 `src/config/schema.ts` 中添加并声明默认值（经 `pluginConfig["wopal-plugin"]` 交付）；在第 8 节文档化
- **新增 HookContext 字段**：必须可选（`?: boolean`），保持向后兼容。保持既有行为的能力门控默认 `true`；opt-in 开关（如 `rulesInjectionEnabled`）默认必须为 `false`

### 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 源文件 | `kebab-case.ts` | `idle-diagnostic.ts` |
| 测试文件 | 与源文件同目录，`*.test.ts` | `task-launcher.test.ts` |
| 工具定义 | `wopal-task-*.ts` | `wopal-task-output.ts` |
| Hook 函数 | `create*` 工厂模式 | `createAllHooks()` |
| Logger | 模块级单例，从 `logger.ts` 导入 | `taskLogger`、`memoryLogger` |
| 环境变量 | `WOPAL_` + `UPPER_SNAKE_CASE` | `WOPAL_PLUGIN_LOG_LEVEL` |

### 错误处理

- 所有异步操作必须 try/catch；catch 中用模块 logger `error` 级别记录 `{ err: error }`，返回安全降级值
- 子会话异常走 `task-stop-classifier.ts` 分类：`idle` / `stuck` / `error`
- LanceDB 连接失败 → 降级为空 Store；Embedding API 失败 → 跳过注入 + 警告日志

### 类型安全

- 禁止裸 `as any`；用类型守卫、`unknown` 收窄、或最小接口定义
- SDK 类型缺失时在 `types.ts` 补充局部声明，不要 `as any` 逃逸
- `typecheck:fix` 只处理可机械化修复的类型问题，复杂的必须人工修复
- 日常校验统一走 `bun run typecheck`，不要直接调用 `tsc`

### 文件大小

代码文件 ≤500 行, 超限建议拆分。拆分信号：超 500 行 / 函数超 50 行 / 职责超 2 个 / 导入超 15 模块。

## 5. 测试

- 遵循 TDD：先写失败测试，再实现使其通过
- 新增模块必须有 `*.test.ts`，覆盖主路径和边界条件
- 代码风格：TypeScript ESM，`.js` 后缀导入；Vitest 框架，测试与源文件同目录

## 6. 禁止

- `console.log`（用模块级 logger）
- npm / pnpm（只允许 Bun）— Bun 是唯一工具链。插件目录内禁止出现 `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`package-lock.json`，锁文件仅认 `bun.lock`；native postinstall 构建由 `package.json` 的 `trustedDependencies` 声明，禁止用 pnpm `onlyBuiltDependencies` 或 npm scripts 承载
- 从 `@opencode-ai/*` 导入契约或 SDK 类型 — fork 契约类型（`SystemPromptMetadata` 等）从 `@wopal/ellamaka-plugin` 导入，SDK 消费点（`createOpencodeClient`、`Model`）从 `@wopal/ellamaka-sdk` 导入；禁止在 `types.ts` 手抄 fork 类型（残留的本地定义与契约层同构却会静默漂移）
- `^` 前缀引用 LanceDB — `@lancedb/lancedb` 和 `@lancedb/lancedb-darwin-x64` 必须精确版本一致（当前 `0.22.3`），ABI 不兼容会导致记忆系统崩溃
- 在 `system-transform.ts` 直接拼接注入内容
- 跨模块混用 logger

## 7. 调试开关

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WOPAL_PLUGIN_LOG_LEVEL` | `info` | 日志阈值：trace/debug/info/warn/error/fatal（env 覆盖；配置 `pluginConfig["wopal-plugin"].logLevel` 为默认来源） |
| `WOPAL_PLUGIN_LOG_FILE` | `<cwd>/.wopal-space/logs/wopal-plugin.log` | 日志文件路径（env 覆盖；配置 `pluginConfig["wopal-plugin"].logFile` 为默认来源） |
| `WOPAL_PLUGIN_LOG_MODULES` | (空) | 模块过滤（逗号分隔），空=全部。可选：core/rules/task/memory/context（env 覆盖；配置 `pluginConfig["wopal-plugin"].logModules` 为默认来源） |
| `ELLAMAKA_LOG_LEVEL` | (未设置) | 宿主统一日志级别兜底（DEBUG/INFO/WARN/ERROR，读取时归一化为小写）。仅当 `WOPAL_PLUGIN_LOG_LEVEL` 与配置 `logLevel` 均无有效级别时生效；仅从真实进程环境读取，不从 `.env` 读取 |

## 8. 配置节点（`wopal.pluginConfig["wopal-plugin"]`）

功能开关与连接配置位于三层 settings 的 `wopal.pluginConfig["wopal-plugin"]` 条目（`global` → `space-public` → `space-local`，后者覆盖前者）。引擎深合并三层并经 `PluginInput.pluginConfig` 交付生效条目；插件只消费内存切片，不读任何 settings 文件。

| 节点 | 字段 | 说明 |
|------|------|------|
| `rules` | `enabled` | 默认 `false`。opt-in 开关：仅在设为 `true` 时执行规则发现与注入 |
| `memory` | `enabled`, `injection` | 默认均为 `true`；`injection=false` 停止自动注入但保留 `memory_manage` 与检索 |
| `context` | `enabled` | 默认 `true`；门控标题生成、自动恢复与蒸馏；压缩恒启用 |
| `llm` | `baseUrl`, `model`, `apiKey` | apiKey 支持 `$VAR`：process.env 优先、`.env` 兜底；禁止存放明文密钥 |
| `embedding` | `baseUrl`, `model`, `apiKey` | `$VAR` 语义与 `llm` 相同 |
| `logLevel` / `logFile` / `logModules` | — | 配置为默认来源；`WOPAL_PLUGIN_LOG_*` env 覆盖 |

优先级：内置默认 < 内联挂载 options（兼容层）< 引擎交付的 `pluginConfig["wopal-plugin"]`。插件将两者叠加并严格校验——非法条目启动即失败。层级合并与 `wopal.pluginConfig` 外层表的形状归引擎所有。

`.env` 文件仅承载经 `$VAR` 引用的密钥（如 `WOPAL_LLM_API_KEY`）与日志诊断覆盖项；功能开关一律不进 `.env`。
