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

**hooks（即将重构）**：注入方式将从 system prompt 调整到 messages，优化 prompt cache、降低 token 成本。

### 日志归属规范

| 日志内容 | 归属模块 | Prefix | Module |
|---------|---------|--------|--------|
| Plugin loaded/initialized | Global | `[plugin]` | `plugin` |
| 规则发现/匹配/注入 | Rules | `[rules]` | `rules` |
| LanceDB/Embedding/LLM 初始化, 记忆检索/注入 | Memory | `[memory]` | `memory` |
| 任务委派/监控/通信 | Task | `[task]` | `task` |
| 会话状态/snapshot/compaction/context 管理/上下文压缩 | Context | `[context]` | `context` |

**日志格式规则**：

1. **SessionID 统一格式**：所有日志中的 sessionID 必须使用 `formatSessionID(sessionID, isTask)`，格式为 `ses_<16chars>(main)` 或 `ses_<16chars>(task)`
2. **日志紧凑**：单条日志无空行分隔，多行内容用 `\n` 拼接后缩进展示
3. **有价值信息**：日志内容必须包含实际值（如 enrichedQuery 内容、token 具体数值），避免"found"、"completed"等空洞描述
4. **模块归属正确**：日志 prefix 和 module 参数必须与功能归属对应，禁止跨模块混用

禁用状态在 Global 层（`[plugin]`）报告**一次**，禁用时模块代码**完全不执行**。

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
| DebugLog | 模块级实例，不跨模块传递日志函数 | `createDebugLog("[task]", "task")` |
| 环境变量 | `WOPAL_` 前缀 + `UPPER_SNAKE_CASE` | `WOPAL_MEMORY_ENABLED` |
| CSS/DOM 类名 | `wopal-` 前缀（如有 UI） | `wopal-task-card` |

---

## 开发红线

### 禁止

- `console.log` — 用 `createDebugLog(prefix, module)` 或 `createWarnLog(prefix)`
- 日志截断 — 禁止 `.slice(0, N)`，排错时看不到完整内容等于白打
- 混用日志模块 — `module` 参数决定环境变量过滤，必须对应功能模块
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
- 用模块对应级别的日志记录错误（禁止吞异常）
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

---

## 开发命令

```bash
bun install               # 安装依赖
bun run test:run          # 运行所有测试
bun run test              # watch 模式
bun run build             # tsc 编译到 dist/
bun run lint              # ESLint
bun run format:check      # Prettier 检查
```

### 调试开关

```bash
WOPAL_PLUGIN_DEBUG=1                          # 启用所有模块（1 / * / all）
WOPAL_PLUGIN_DEBUG=plugin                     # 仅 Global
WOPAL_PLUGIN_DEBUG=task                       # 仅 Task
WOPAL_PLUGIN_DEBUG=memory                     # 仅 Memory
WOPAL_PLUGIN_DEBUG=rules                      # 仅 Rules
WOPAL_PLUGIN_DEBUG=context                    # 仅 Context
WOPAL_PLUGIN_DEBUG=task,context               # 多模块（逗号分隔）
WOPAL_RULES_INJECTION_ENABLED=false           # 禁用 Rules 模块
WOPAL_MEMORY_ENABLED=false                    # 禁用 Memory 模块
WOPAL_MEMORY_INJECTION_ENABLED=false          # 仅禁用 Memory 注入
```

日志位置：`<space-root>/logs/wopal-plugins-debug.log`

### 代码风格

TypeScript ESM，`.js` 后缀导入。测试文件与源文件同目录（`foo.ts` + `foo.test.ts`），Vitest 框架。

---

## 部署

插件通过 `.wopal/plugins/` 的 symlink 自动发现加载，无需手动配置。

```
.wopal/plugins/wopal-plugin.ts → symlink → .wopal/wopal-plugin/src/index.ts
```