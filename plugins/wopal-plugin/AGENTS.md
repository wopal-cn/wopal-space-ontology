# wopal-plugin — 项目规范

> **定位**：Wopal 专用的 EllaMaka 插件（规则注入 + 非阻塞任务委派 + 会话上下文管理 + 记忆系统）

---

## 架构约束

插件由 1 个 Global 层 + 4 个功能模块组成，入口 `src/index.ts` 组装。

| 模块 | 禁用开关 | 启动时行为 | 入口 |
|------|---------|-----------|------|
| **Global (Plugin)** | 无 | 加载 .env、检查开关、报告禁用状态、注册 Hooks/Tools | `index.ts` |
| **Rules** | `WOPAL_RULES_INJECTION_ENABLED` | 禁用时跳过 `discoverRuleFiles()`，`ruleFiles = []` | `rules/index.ts` |
| **Memory** | `WOPAL_MEMORY_ENABLED` | 禁用时跳过 `ensureMemorySystem()`，`memory = null` | `memory/index.ts` |
| **Task** | 无（始终启用） | `SimpleTaskManager` 初始化 + cleanup handlers | `tasks/simple-task-manager.ts` |
| **Context** | 无（始终启用） | 无启动逻辑 | `hooks/conversation-context.ts` |

**依赖方向**：`tools → tasks / memory`，`hooks → rules / memory`。禁止反向依赖。

**禁用开关**：

| 变量 | 默认 | 控制范围 |
|------|------|---------|
| `WOPAL_RULES_INJECTION_ENABLED` | `true` | Rules 模块整体（发现 + 注入） |
| `WOPAL_MEMORY_ENABLED` | `true` | Memory 模块整体（初始化 + 注入 + 工具） |
| `WOPAL_MEMORY_INJECTION_ENABLED` | `true` | 仅 Memory 注入（不影响工具和 distill） |

Memory 双开关：`WOPAL_MEMORY_ENABLED=false` 时 `WOPAL_MEMORY_INJECTION_ENABLED` 被忽略（模块不初始化）。

**HookContext 传递开关**：`rulesInjectionEnabled` 和 `memoryInjectionEnabled` 从 index.ts → createHookContext → 各 hook，hook 不直接读环境变量。

### 日志规范

日志模块位于 `src/logger.ts`，基于 GESP backend logger 设计（零依赖、阈值过滤、结构化字段）。

#### 日志级别（严格按语义使用）

| 级别 | 数值 | 用途 | 示例 |
|------|------|------|------|
| `trace` | 10 | 极细粒度跟踪，仅深度调试时启用 | 进入函数、中间状态快照、streaming 事件 |
| `debug` | 20 | 调试信息，开发/排查时启用 | SSE 事件类型、SQL 查询详情、注入内容 |
| `info` | 30 | 关键业务事件（主要生产级别） | 任务启动/完成、记忆注入、规则匹配结果 |
| `warn` | 40 | 可恢复异常，需关注但不中断 | 降级处理、频率接近阈值、API 超时重试 |
| `error` | 50 | 操作失败，需人工介入 | LanceDB 连接失败、Embedding API 错误 |
| `fatal` | 60 | 系统不可用 | 插件初始化崩溃 |

默认阈值 `info`：生产环境输出 info + warn + error。

#### 模块 Logger

| Logger 导出 | 覆盖范围 | 典型场景 |
|-------------|---------|---------|
| `coreLogger` | 全局引导、生命周期、Hook/Tool 注册、模块启停 | 插件加载完成、环境变量读取、禁用状态报告 |
| `rulesLogger` | 规则发现/匹配/注入 | 规则文件扫描、条件匹配、注入完成 |
| `taskLogger` | 任务委派/监控/通信/并发 | 任务启动、状态轮询、SSE 事件、子会话通信 |
| `memoryLogger` | LanceDB/Embedding/检索/注入/蒸馏 | 记忆检索、注入内容、蒸馏 preview/confirm |
| `contextLogger` | 会话状态/snapshot/压缩/恢复 | 上下文 dump、compaction、恢复指令 |

#### 调用 API

```typescript
import { taskLogger } from "../logger";

// 纯文本消息
taskLogger.info("Task started");

// 结构化字段 + 消息（推荐）
taskLogger.info({ task_id: taskId, session_id: sid }, "Task started");

// 错误日志必须携带 Error 对象
taskLogger.error({ err: error, task_id: taskId }, "Task failed");

// 多字段自动格式化为 key=val
memoryLogger.debug({ enriched_query: query, token_count: 42 }, "Memory retrieval completed");
```

**签名**：`logger.info(data?, message)` 或 `logger.info(message)`
- `data` 是 `Record<string, unknown>`，自动格式化为 `key=val` 对
- `message` 是人类可读的简明描述，过去时态动词开头
- Error 对象写 `err` 字段：`{ err: error }`，自动提取 message

#### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WOPAL_PLUGIN_LOG_LEVEL` | **`info`** | 日志阈值：trace/debug/info/warn/error/fatal |
| `WOPAL_PLUGIN_LOG_FILE` | `<cwd>/.wopal-space/logs/wopal-plugin.log` | 日志文件路径 |
| `WOPAL_PLUGIN_LOG_MODULES` | (空) | 模块过滤（逗号分隔），空=全部。可选：core/rules/task/memory/context |

#### 日志编写规则

1. **模块归属正确**：使用对应模块的 logger，禁止跨模块混用（如 task 模块代码用 `memoryLogger`）
2. **结构化字段**：上下文通过 `data` 对象传递，禁止拼接到 message 里
3. **字段命名 snake_case**：`task_id`、`session_id`、`duration_ms`、`token_count`
4. **sessionID 统一格式**：必须使用 `formatSessionID(sessionID, isTask)`，输出 `ses_<16chars>(main/task)`
5. **敏感信息脱敏**：`token`、`password`、`api_key`、`secret`、`credential`、`authorization` 等字段自动替换为 `[REDACTED]`
6. **禁止日志截断**：不使用 `.slice(0, N)`，排错时看不到完整内容等于白打
7. **禁止空洞描述**：避免 "found"、"completed" 等无实际值的 message，必须携带关键数据
8. **批量操作记录摘要**：不逐条记录，记录 `batch_size`、`succeeded`、`failed` 等汇总信息
9. **错误日志必须携带 Error 对象**：`logger.error({ err: error }, "描述")`，禁止 `logger.error(error.message)`

#### 输出格式

```
2026-05-21 14:30:00 [INFO] [task] task_id=wopal-task-abc123 session_id=ses_1da5cd41(main) Task started
2026-05-21 14:30:01 [WARN] [memory] err=Connection refused Memory retrieval failed, skipping injection
2026-05-21 14:30:02 [DEBUG] [context] enriched_query="how to debug" token_count=15 Memory retrieval completed
```

禁用状态在 `coreLogger` 报告**一次**，禁用时模块代码**完全不执行**。

---

## 模块边界

### hooks (即将重构)

`system-transform.ts` 是唯一的系统提示词修改入口。规则注入和记忆注入已拆分为独立模块：
- `rule-injector.ts` — 规则注入逻辑
- `memory-injector.ts` — 记忆注入逻辑（含子会话检测）
- `conversation-context.ts` — `buildEnrichedQuery()` 提供记忆检索的语义 query

新增注入逻辑必须放在对应 injector 中，**禁止直接在 `system-transform.ts` 中拼接**。

**event-router.ts**：`session.compacted` 事件处理，压缩后自动恢复：
- 主会话：自动发送恢复指令（重载技能、读取关键文件、搜索记忆）
- 子会话：发送 `[WOPAL TASK COMPACTED]` 通知到主 Agent，主 Agent 通过 `wopal_task_reply` 发送精准恢复指令
- 通过 `compactingTrigger === "plugin"` 区分 Plugin 触发 vs EllaMaka 自动压缩

### tasks

`SimpleTaskManager` 是唯一的公共入口。内部模块各司其职：
- 生命周期：`task-lifecycle.ts`（failTask, abortSession, cleanup）
- 启动：`task-launcher.ts`
- 监控：`task-monitor.ts` + `progress.ts`
- 诊断：`idle-diagnostic.ts` + `loop-detector.ts` + `error-classifier.ts`
- 并发：`concurrency-manager.ts`

### memory

`MemoryStore`（`store.ts`）是唯一的持久层访问入口。记忆记录使用 `tags` 字段（逗号分隔关键词），不是 `concepts`。

蒸馏流程必须走 `preview → confirm` 两步，禁止跳过用户审查直接写入。

`memory_manage` 管 CRUD + 蒸馏，`context_manage` 管会话摘要 + title，**禁止混淆职责**。

---

## 新增功能指南

### 新增 hook

在 `hooks/` 下新建文件，在 `hooks/index.ts` 的 `createAllHooks()` 中注册。

### 新增工具

在 `tools/` 下新建文件，在 `tools/index.ts` 的 `createWopalTools()` 中注册。任务相关工具统一 `wopal_task_*` 前缀。

**context_manage 工具**：`compact` action 触发上下文压缩：
- `action="compact"`：压缩当前会话或指定子会话（`session_id="wopal-task-xxx"`）
- 压缩决策权归主 Agent（通过 space-master skill 策略），工具不做阈值判断
- 压缩后自动恢复机制见 event-router.ts

### 新增记忆分类

在 `memory/categories.ts` 添加。分类标识符用英文，重要性 0-1。

---

## 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 源文件 | `kebab-case.ts` | `idle-diagnostic.ts`, `task-launcher.ts` |
| 测试文件 | 与源文件同目录，`*.test.ts` | `task-launcher.test.ts` |
| 工具定义 | `wopal-task.ts` / `wopal-task-output.ts` | 任务工具统一 `wopal-task-` 前缀 |
| Hook 函数 | `create*` 工厂模式 | `createAllHooks()`, `createHookContext()` |
| Logger | 模块级单例，从 `logger.ts` 导入对应模块 logger | `taskLogger`、`memoryLogger`、`coreLogger` |
| 环境变量 | `WOPAL_` 前缀 + `UPPER_SNAKE_CASE` | `WOPAL_MEMORY_ENABLED` |
| CSS/DOM 类名 | `wopal-` 前缀（如有 UI） | `wopal-task-card` |

---

## 开发红线

### 禁止

- `console.log` — 用模块级 logger（`taskLogger.info(...)` 等）
- 日志截断 — 禁止 `.slice(0, N)`，排错时看不到完整内容等于白打
- 混用日志模块 — 必须使用对应功能模块的 logger，禁止跨模块混用
- npm / pnpm — 只允许 Bun
- `^` 前缀引用 LanceDB — `@lancedb/lancedb` 和 `@lancedb/lancedb-darwin-x64` 必须精确版本一致（当前 `0.22.3`），ABI 不兼容会导致记忆系统崩溃
- 修改后不测试 — 核心逻辑修改后必须 `bun run test:run`
- 在 `system-transform.ts` 直接拼接注入内容

### 必须遵守

- **新增功能必须配套测试** — 新模块必须有 `*.test.ts`，覆盖主路径和边界条件，不留测试空洞
- **新增环境变量必须添加到文档** — 在调试开关章节补齐，并确保 `loadWopalEnv()` 正确读取
- **新增 HookContext 字段必须可选** — `HookContextOptions` 中新字段用 `?: boolean`（默认 `true`），保持向后兼容

### 文件大小

核心逻辑 ≤500 行，工具定义 ≤150 行，类型 ≤200 行。超过必须拆分。

拆分信号：超 500 行 / 函数超 50 行 / 职责超 2 个 / 导入超 15 模块。

### 工具开发规范

工具描述必须准确精简，子命令说明清晰，对 agent 友好，便于 AI agent 理解和调用。

---

## 错误处理

### 异步操作

所有异步操作（网络、文件 I/O、LanceDB 操作）**必须 try/catch**。catch 块中：
- 用模块 logger 的 `error` 级别记录错误（必须携带 `{ err: error }`，禁止吞异常）
- 返回安全的降级值或 `null`/`undefined`，不要让未捕获的 Promise rejection 上泡到 EllaMaka 运行时
- 错误分类走 `tasks/error-classifier.ts`，不要在调用方临时 `String(e)`

### 任务模块

- 子会话异常 → `failTask()` 标记 `error` 状态 + `errorCategory`，不要静默忽略
- 权限请求超时 → `permission-proxy.ts` 自动 `once` 授权，不要让子会话永久阻塞
- 进程清理 → `process-cleanup.ts` 注册 handler，保证僵尸进程不残留

### 记忆模块

- LanceDB 连接失败 → 降级为空 Store，工具返回错误提示，不要让插件崩溃
- Embedding API 失败 → `injector.ts` 跳过注入 + 警告日志，不要阻断其他功能

---

## 类型安全

- **禁止裸 `as any`** — 必须用类型守卫（`typeof`、`in`）、`unknown` 收窄、或定义最小接口（`{ session?: { abort?: (...) => Promise<void> } }`）
- **EllaMaka SDK 类型缺失时** — 在 `types.ts` 补充局部类型声明，不要 `as any` 逃逸
- **可选链优先** — 访问可能为 `undefined` 的属性时用 `?.`，不要先用 `as any` 再取值
- **类型断言最小化** — 只在边界层（SDK 交互、外部数据）使用 `as`，内部逻辑用类型守卫
- **格式化命令语义固定** — `bun run format` / `bun run format:fix` 会直接改写文件；`bun run format:check` 只检查、不写回
- **每次代码变更后主动运行 `bun run typecheck:fix`** — 先让项目专用助手脚本自动修复可机械处理的类型问题，再运行 `bun run build`
- **不要神化 `typecheck:fix`** — 它只负责项目内已知、安全、可机械化的修复模式；脚本无法可靠处理的 `unknown` 收窄、业务逻辑判断、复杂结构性错误，必须人工修复
- **对齐 ellamaka 风格** — 日常类型校验统一走 `bun run typecheck`，不要直接调用 `tsc`；`build` 保留给产物生成/发布验证
- **当前不把 `format:check` 作为硬门禁** — 仓库仍有历史格式债，未做一次性全量格式化前，`format:check` 只作为人工把关命令，不纳入默认提交前阻塞链路

---

## 开发命令

```bash
bun install               # 安装依赖
bun run format            # = bun run format:fix，批量格式化 src/ 和 scripts/
bun run format:fix        # 显式批量格式化
bun run format:check      # 只检查格式，不改文件（当前非硬门禁）
bun run typecheck:fix     # 先自动修复可机械处理的 typecheck 问题
bun run typecheck         # 日常类型检查（对齐 ellamaka 风格）
bun run test:run          # 运行所有测试
bun run test              # watch 模式
bun run build             # tsc 编译到 dist/
bun run lint              # ESLint
bun run format:check      # Prettier 检查
```

### 变更后验证顺序

对 `src/`、`scripts/`、`types.ts`、任务工具、Hook、记忆系统等任何代码变更，默认按以下顺序验证：

1. `bun run typecheck:fix`
2. `bun run typecheck`
3. `bun run test:run`

若 `typecheck:fix` 报出仍需人工处理的 diagnostics，先修完再继续后续验证，禁止跳过直接提交。

`bun run format` / `bun run format:fix` 目前属于**显式格式整理动作**，运行前要预期它可能改动较多历史文件。`bun run format:check` 仅用于你主动想看当前格式债时使用，当前不作为提交前默认阻塞项。

`bun run build` 不再作为日常每次改动的默认校验命令；仅在需要验证 dist 产物、发布链路、或显式要求编译输出时运行。

### 调试开关

```bash
# 日志级别（默认 info，输出 info + warn + error）
WOPAL_PLUGIN_LOG_LEVEL=debug                    # debug + info + warn + error
WOPAL_PLUGIN_LOG_LEVEL=trace                    # 全部级别
WOPAL_PLUGIN_LOG_LEVEL=warn                     # warn + error（静默模式）

# 模块过滤（可选，空=全部模块）
WOPAL_PLUGIN_LOG_MODULES=task                   # 仅 Task 模块
WOPAL_PLUGIN_LOG_MODULES=task,memory            # Task + Memory
WOPAL_PLUGIN_LOG_MODULES=core,rules,context     # 多模块

# 日志文件路径（默认 <cwd>/.wopal-space/logs/wopal-plugin.log）

# 功能模块开关
WOPAL_RULES_INJECTION_ENABLED=false             # 禁用 Rules 模块
WOPAL_MEMORY_ENABLED=false                      # 禁用 Memory 模块
WOPAL_MEMORY_INJECTION_ENABLED=false            # 仅禁用 Memory 注入
```

### 代码风格

TypeScript ESM，`.js` 后缀导入。测试文件与源文件同目录（`foo.ts` + `foo.test.ts`），Vitest 框架。

---

## 部署

插件通过 `.wopal/plugins/` 的 symlink 自动发现加载，无需手动配置。

```
.wopal/plugins/wopal-plugin.ts → symlink → .wopal/plugins/wopal-plugin/src/index.ts
```
