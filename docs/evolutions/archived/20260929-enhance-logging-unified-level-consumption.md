# enhance-logging-unified-level-consumption

## Metadata

- **Type**: enhance
- **Project Path**: .wopal
- **Created**: 2026-09-25
- **Stage**: archived
- **Mode**: quick
- **Worktree**: (none)
- **Branch**: (none)
- **Base Commit**: (none)
- **Final Commit**: (integrate 时记录：集成到空间分支后的提交)

## Scope Assessment

- **Complexity**: Low
- **Confidence**: High

## Goal

让 wopal-plugin 消费全产品统一日志级别：级别解析链增加 `ELLAMAKA_LOG_LEVEL` 兜底（位于显式 env 与插件配置之下、硬编码默认之上），使引擎解析出的生效级别能覆盖插件默认 `info`，同时保留 `WOPAL_PLUGIN_LOG_LEVEL` / `pluginConfig` 的既有显式接口。

## Technical Context

### Architecture Context

插件当前级别解析链为「`WOPAL_PLUGIN_LOG_LEVEL` env > `wopal.pluginConfig["wopal-plugin"].logLevel`（或旧顶层 `logLevel`）> `info`」（`.wopal/plugins/wopal-plugin/src/logger.ts:31-41`，env allowlist 见 `src/runtime-environment.ts:9-25`）。宿主注入通道有两处：

- `WOPAL_PLUGIN_LOG_LEVEL` / `_MODULES` / `_FILE`：wopal-cli `startEngine` 在 debug 场景注入（`projects/wopal-cli/src/lib/engine-process.ts:254-264`）、dev.sh 在 `--debug` 时注入。
- 无统一级别注入：引擎的生效级别（`--log-level` / 环境变量 / `wopal.logging.level` 解析结果）目前不传递给插件。

产品侧设计已定（`docs/products/wopal-space/DESIGN-config-settings.md` Logging Level 节）：统一级别由进程入口解析一次、写回 `ELLAMAKA_LOG_LEVEL`、子进程继承；插件作为同进程消费者应把它作为兜底层读取。引擎与 CLI 侧改造由 `ellamaka/enhance-logging-log-routing` 与 `wopal-cli/enhance-config-logging-level` 两个 dev-flow Plan 承担；本提案只做插件侧读取。

设计真相源：`.wopal/docs/DESIGN-wopal-plugin.md`（Logging System 与 Configuration Source Precedence 节）、`docs/products/wopal-space/DESIGN-config-settings.md`（Logging Level 节）。

### Key Decisions

- D-01: 解析链扩为四层：`WOPAL_PLUGIN_LOG_LEVEL`（显式 env）> 插件配置（`pluginConfig["wopal-plugin"].logLevel` 或旧 `logLevel`）> `ELLAMAKA_LOG_LEVEL`（宿主统一级别兜底）> `info`。
- D-02: 插件只读 `ELLAMAKA_LOG_LEVEL`，不解析配置文件；`wopal.logging.level` 的读取归宿主进程入口，插件不重复读文件。
- D-03: 级别值域维持插件既有小写词表（trace/debug/info/warn/error/fatal）；宿主值为大写词表（DEBUG/INFO/WARN/ERROR），读取时归一化。`fatal` 无宿主等价物，仅插件侧可显式使用。
- D-04: env allowlist 增加 `ELLAMAKA_LOG_LEVEL`（保持"只从真实进程环境读取明文覆盖"的既有边界，不从 `.env` 文件读取该键）。
- D-05: `WOPAL_PLUGIN_LOG_MODULES` 与 `logFile` 逻辑不变。

### Key Interfaces

插件级别解析（内部契约，测试锁定）：

```ts
// logger.ts
function resolveLevel(environment: RuntimeEnvironment, config?: ResolvedLogConfig): string
// 输入优先级：
//   environment.WOPAL_PLUGIN_LOG_LEVEL（小写词表精确匹配）
//   > config.level（pluginConfig 或旧顶层字段）
//   > environment.ELLAMAKA_LOG_LEVEL（归一化小写后匹配）
//   > "info"

// runtime-environment.ts ENV_ALLOWLIST 增加：
//   "ELLAMAKA_LOG_LEVEL"
```

## In Scope

- `resolveLevel` 增加 `ELLAMAKA_LOG_LEVEL` 兜底层与归一化
- `ENV_ALLOWLIST` 增加 `ELLAMAKA_LOG_LEVEL`
- 单测：四层优先级、归一化、非法值回退、allowlist 读取
- 文档同步：`DESIGN-wopal-plugin.md` 四层链 + `plugins/wopal-plugin/AGENTS.md` Debug Switches 表新行
- 质量门禁：lint + typecheck 纳入 Task 验证命令

## Out of Scope

- 宿主侧级别解析（`ellamaka/enhance-logging-log-routing`、`wopal-cli/enhance-config-logging-level`）
- `WOPAL_PLUGIN_LOG_LEVEL` 的写入端调整（dev.sh / CLI 保持现状）
- 日志文件位置与轮转（插件沿用宿主给定路径）
- dsh-adapter 的日志（无独立级别读取，跟随容器 exporter）

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Plugin logger | `.wopal/plugins/wopal-plugin/src/logger.ts` | 修改 | 增加兜底层与归一化 |
| Plugin runtime env | `.wopal/plugins/wopal-plugin/src/runtime-environment.ts` | 修改 | allowlist 增加变量 |
| Plugin tests | `.wopal/plugins/wopal-plugin/src/logger.test.ts`, `src/runtime-environment.test.ts` | 修改 | 契约锁定 |
| Plugin design | `.wopal/docs/DESIGN-wopal-plugin.md` | 修改 | Logging System / Precedence 节 + Environment Variable Roles 表同步 |
| Plugin AGENTS | `.wopal/plugins/wopal-plugin/AGENTS.md` | 修改 | Debug Switches 表新增 `ELLAMAKA_LOG_LEVEL` 行（debug-switch 契约） |

## Acceptance Criteria

### Agent Verification

1. [x] 四层优先级：`WOPAL_PLUGIN_LOG_LEVEL=warn` + 配置 `debug` + `ELLAMAKA_LOG_LEVEL=ERROR` → 生效 `warn`；无显式 env 时配置 `debug` 胜 `ERROR`；两者皆缺时 `ELLAMAKA_LOG_LEVEL=ERROR` → 生效 `error`；全缺 → `info`。
2. [x] 归一化与回退：`ELLAMAKA_LOG_LEVEL=DEBUG` → 生效 `debug`；非法宿主值（如 `TRACE` 或空串）不破坏解析，回落至下一层或 `info`。
3. [x] allowlist：`ELLAMAKA_LOG_LEVEL` 从真实进程环境被读取；`.env` 文件中的同名键不生效（既有边界保持）。
4. [x] 回归与门禁：插件 logger 与 runtime-environment 既有测试全绿；改动文件通过 `bun run lint` 与 `bun run typecheck`。
5. [x] 文档：`DESIGN-wopal-plugin.md` Logging System / Precedence 节呈现四层链，且 Environment Variable Roles 表（`DESIGN-wopal-plugin.md:299-308` 附近）纳入 `ELLAMAKA_LOG_LEVEL` 行（角色：宿主统一级别兜底；来源：仅真实进程环境，不从 `.env` 读取）；`plugins/wopal-plugin/AGENTS.md` Debug Switches 表含 `ELLAMAKA_LOG_LEVEL` 行（新 env 进 debug-switch 表的 AGENTS 契约）。

（2026-09-29 主控实证：焦点 55/55、全量 69 文件 / 1014 用例全绿；typecheck 0；改动文件 eslint 0；整仓 `bun run lint` 存量债失败——宿主基线同因，非本次引入；rook 实施评审 PASS（0 findings）；用户运行验证通过（2026-09-29）；格式化按用户决定保留既有风格。）

### User Validation

#### Scenario 1: 统一级别覆盖插件默认
- Goal: 确认引擎设置的统一级别能提高插件日志详细度，且显式插件变量仍可覆盖。
- 验证环境: `.wopal/plugins/wopal-plugin/AGENTS.md` 开发环境；宿主使用 dev.sh TUI（接口由配套 Plan 提供）。
- Precondition: 插件已构建（`bun run build`，按插件 AGENTS.md 的开发流程）；记录当前插件日志文件位置。
- 启动命令: `ELLAMAKA_LOG_LEVEL=DEBUG /Volumes/U500G/coding/wopal-workspace/projects/ellamaka/scripts/dev.sh tui`
- User Actions:
  1. 在 TUI 中触发一次会写插件 debug 记录的操作（如一条普通对话）；
  2. 查看 `wopal-plugin.log`（空间 `.wopal-space/logs/` 或 `$WOPAL_HOME/logs/`）是否出现 DEBUG 记录；
  3. 退出后改用 `WOPAL_PLUGIN_LOG_LEVEL=warn` 重复，观察 WARN 以下记录消失。
- 通过判据: 步骤 2 出现插件 DEBUG 记录（证明统一级别兜底生效）；步骤 3 只保留 WARN 及以上（证明显式插件变量仍最高）。
- 失败反馈: 提供两次运行的日志文件路径与 `grep -c "DEBUG"` / `grep -c "WARN"` 计数、`git diff -w` 输出。

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 插件级别兜底层

**Verification Intent**: AC#1, AC#2, AC#3, AC#4, AC#5

**Behavior**:
- `resolveLevel({ WOPAL_PLUGIN_LOG_LEVEL: "warn" }, { level: "debug" })` → `warn`（显式 env 最高）
- `resolveLevel({ ELLAMAKA_LOG_LEVEL: "ERROR" }, { level: "debug" })` → `debug`（配置胜兜底）
- `resolveLevel({ ELLAMAKA_LOG_LEVEL: "ERROR" })` → `error`（兜底生效）
- `resolveLevel({ ELLAMAKA_LOG_LEVEL: "DEBUG" })` → `debug`（大小写归一）
- `resolveLevel({ ELLAMAKA_LOG_LEVEL: "TRACE" })` → `info`（宿主 TRACE 无插件等价物，回落默认而非静默全开）
- `resolveLevel({})` → `info`
- `loadRuntimeEnvironment` 从真实 process env 读取 `ELLAMAKA_LOG_LEVEL`；`.env` 文件同名键被忽略

**Pre-read**: `.wopal/plugins/wopal-plugin/src/logger.ts`（resolveLevel 与 getMinLevel）、`src/runtime-environment.ts`（ENV_ALLOWLIST 与 loadRuntimeEnvironment）、`src/logger.test.ts`、`.wopal/plugins/wopal-plugin/AGENTS.md:140`（debug-switch 契约）与 `:185-193`（Debug Switches 表现状）

**Design**:
在 `resolveLevel` 的配置层之后、`info` 默认之前插入兜底层：读取 `environment.ELLAMAKA_LOG_LEVEL`，小写归一后匹配既有 `LEVELS` 词表；`TRACE` 不映射（宿主 TRACE 必须带类别才生效，插件侧静默回落默认，避免把未点名的高容量诊断打开）。`ENV_ALLOWLIST` 增加该键并补注释；`.env` 读取路径不改（allowlist 仅作用于 process env 的 pick 与 .env 的过滤，需确认 `.env` 分支是否应排除该键——实现时保证 `.env` 不提供该键，测试锁定）。文档同步两处：`.wopal/docs/DESIGN-wopal-plugin.md` 的 Logging System / Precedence 节补四层链；`.wopal/plugins/wopal-plugin/AGENTS.md` 第 7 节 Debug Switches 表新增 `ELLAMAKA_LOG_LEVEL` 行（新 env 必须进该表，插件 AGENTS.md:140 契约）。

**TDD**: true

**Changes**:
1. RED：四层优先级、归一化、非法值、allowlist 行为落成失败测试
2. GREEN：实现兜底层与 allowlist 变更，至测试全绿
3. REFACTOR：合并级别词表归一化辅助函数
4. DOCS：`DESIGN-wopal-plugin.md` 四层链 + Environment Variable Roles 表同步 + `AGENTS.md` Debug Switches 表新行

**Verify**: `cd .wopal/plugins/wopal-plugin && bun run test:run -- src/logger.test.ts src/runtime-environment.test.ts` 全绿；`bun run lint` 与 `bun run typecheck` 通过（AC#4 质量门禁）；`grep -n "ELLAMAKA_LOG_LEVEL" AGENTS.md` 命中 Debug Switches 表新行

**Done**:
任务产出：插件级别兜底层 + allowlist + 测试 + 双文档同步
实际触碰文件：`plugins/wopal-plugin/src/logger.ts`、`plugins/wopal-plugin/src/logger.test.ts`、`plugins/wopal-plugin/src/runtime-environment.ts`、`plugins/wopal-plugin/src/runtime-environment.test.ts`、`docs/DESIGN-wopal-plugin.md`、`plugins/wopal-plugin/AGENTS.md`、`plugins/wopal-plugin/AGENTS.zh-CN.md`
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 单点改动 + 测试；Wopal 编排、rook 审核 |

## Delivery

`space sync` 与 `ontology contribute` 由用户拍板，技能不自动上行。

## Review Disposition

2026-09-25 rook 首审 REVISE → 修订：W-01 → `plugins/wopal-plugin/AGENTS.md` Debug Switches 表纳入 Affected Files 与 Task 1（AC#5）；W-02 → Task Verify 补 `bun run lint` / `bun run typecheck`（AC#4）。
2026-09-25 rook 终局复审 REVISE（预算用尽，wopal 按报告处置）：终局 W-01 指出 `DESIGN-wopal-plugin.md` 的 Environment Variable Roles 表（:299-308）仍只列 `WOPAL_PLUGIN_LOG_*`。处置：Task 1 DOCS 步骤、Affected Files Role 列、AC#5 均已补入该表同步，并明示 `ELLAMAKA_LOG_LEVEL` 仅来自真实进程环境、不从 `.env` 读取。
