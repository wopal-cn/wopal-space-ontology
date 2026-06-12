# 159-enhance-wopal-plugin-add-runtime-context-detection-and-layered-config

## Metadata

- **Issue**: #159
- **Type**: enhance
- **Target Project**: wopal-space-ontology

- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-06-11
- **Status**: done

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

为 wopal-plugin 注入 RuntimeContext 运行时感知能力，实现双层环境变量加载和四层资源文件级联，使插件在 wopal-space 内外均能以正确配置运行。

## Technical Context

### Architecture Context

wopal-plugin 当前缺乏三个基础认知：
1. **不知道 WOPAL_HOME** — 无法读取用户级配置（跨空间共享的 LLM 密钥等）
2. **不知道是否在 wopal-space 内** — 无法区分空间级/非空间的资源配置和日志输出路径
3. **不知道自己的安装目录** — `_pluginDir` 被错误设为 workspace root，prompt fallback 永远失效

Ontology 采用双栈独立扫描架构：`~/.wopal/`（fork main，用户级）和 `<workspace>/.wopal/`（space/main，空间级）。插件当前只用 `PluginInput.directory`（workspace root）做所有路径决策，未体现分层设计。

### Research Findings

能力分层模型定义在 `.wopal/skills/space-master/references/capability-layers.md`：
- 用户级能力位于 fork main，跨空间共享
- 空间级能力位于 space/main，按空间定制
- 新能力默认从空间级孵化，成熟后下放到用户级

Prompt 模板已从插件内部 `prompts/` 目录剥离到 ontology worktree 的 `.wopal/prompts/` 下，由用户级和空间级分支分别管理。

插件内部 `prompts/` 目录已删除，最后一层回退到代码内联硬编码模板。

**参考资料**：
- `.wopal/skills/space-master/references/capability-layers.md` — 能力分层模型与同步契约

### Key Decisions

- D-01: `WOPAL_HOME` 优先取 `process.env.WOPAL_HOME`，无则 fallback `~/.wopal`。后续 `loadWopalEnv` 不覆盖已存在的 WOPAL_HOME（避免鸡与蛋问题）。
- D-02: 环境变量三层优先级：process.env 已有值 > 空间级 `.wopal/.env` > 用户级 `WOPAL_HOME/.env`。同层不覆盖已存在变量。
- D-03: 资源文件（prompt 模板）四层级联：env var 指定路径 > 空间级 `.wopal/prompts/` > 用户级 `WOPAL_HOME/prompts/` > 内联 fallback。
- D-04: 日志/输出路由：wopal-space 内 → `<workspace>/.wopal-space/logs/`；wopal-space 外 → `WOPAL_HOME/logs/`。
- D-05: `_pluginDir` / `setPluginDirectory()` 删除。插件不再需要"自己的安装目录"这一概念（prompts 已外置到 ontology）。
- D-06: `.env` 文件只加载 `WOPAL_` 前缀变量，保持现有规则不变。
- D-07: RuntimeContext 在插件初始化时构建一次（`initRuntimeContext(workspaceRoot)`），后续模块通过 export 的单例读取。
- D-08: 非 wopal-space 环境下：仅加载用户级 `.env`；prompt 走用户级 → 内联 fallback；日志写入 `WOPAL_HOME/logs/`。

### Key Interfaces

```typescript
// src/runtime-context.ts
interface RuntimeContext {
  wopalHome: string          // process.env.WOPAL_HOME ?? ~/.wopal
  workspaceRoot: string      // 来自 pluginInput.directory
  isWopalSpace: boolean      // workspaceRoot/.wopal/ 目录存在
  logDir: string             // 空间内: .wopal-space/logs/ ; 否则: WOPAL_HOME/logs/
}

export function initRuntimeContext(workspaceRoot: string): RuntimeContext
export function getRuntimeContext(): RuntimeContext
```

```typescript
// src/memory/prompts.ts — 替代 setPluginDirectory
export function resolvePromptFile(filename: string): string | null
```

## In Scope

- 新建 `runtime-context.ts` 模块，检测 WOPAL_HOME、wopal-space 状态、日志输出路径
- 改造 `loadWopalEnv` 支持双层加载（用户级 + 空间级）
- 改造 prompt 加载为四层级联（env → 空间 → 用户 → 内联）
- 日志路径适配空间内外
- 删除 `_pluginDir` / `setPluginDirectory()` 及相关引用
- 编写单元测试覆盖 RuntimeContext 检测逻辑和双层 env 加载

## Out of Scope

- 实际创建用户级 `WOPAL_HOME/.env` 文件 — 用户自行配置
- 实际迁移现有 `.wopal/.env` 中的用户级变量 — 用户自行判断
- `context-manage.ts` 的 dump 路径改造 — 暂不涉及磁盘写入路径变更（当前 dump 输出到 stdout 或会话上下文，不写磁盘）

## Business Rules Impact

N/A — 纯技术重构，无业务规则变更。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| RuntimeContext | `src/runtime-context.ts` | 新建 | 运行时上下文检测与路径决策 |
| Plugin init | `src/index.ts` | 修改 | 调用 `initRuntimeContext`、双层 `loadWopalEnv`、删除 `setPluginDirectory` |
| Prompt loading | `src/memory/prompts.ts` | 修改 | 删除 `_pluginDir`/`setPluginDirectory`，改用 4 层级联 `resolvePromptFile` |
| Logger | `src/logger.ts` | 修改 | `getLogFile()` 改用 `RuntimeContext.logDir` |
| Tests | `src/index.test.ts` | 修改 | 适配新的 env 加载逻辑 |
| Tests | `src/runtime-context.test.ts` | 新建 | RuntimeContext 单元测试 |

## Acceptance Criteria

### Agent Verification

1. [x] `cd .wopal/plugins/wopal-plugin && bun run typecheck` — exit 0，无类型错误
2. [x] `cd .wopal/plugins/wopal-plugin && bun run test:run` — 全部 pass，0 failure
3. [x] `cd .wopal/plugins/wopal-plugin && bun run lint` — exit 0
4. [x] `rg 'setPluginDirectory' .wopal/plugins/wopal-plugin/src/` — 0 matches（已删除）
5. [x] `rg '_pluginDir' .wopal/plugins/wopal-plugin/src/` — 0 matches（已删除）
6. [x] `rg 'initRuntimeContext|RuntimeContext' .wopal/plugins/wopal-plugin/src/index.ts` ≥ 1（已集成到插件初始化流程）
7. [x] `rg 'resolvePromptFile' .wopal/plugins/wopal-plugin/src/memory/prompts.ts` ≥ 1（新 prompt 加载函数存在）
8. [x] `rg 'WOPAL_HOME.*\.env|user.*env|userEnv' .wopal/plugins/wopal-plugin/src/index.ts` ≥ 1（双层 env 加载逻辑存在）
9. [x] `rg 'RuntimeContext.*import|from.*runtime-context' .wopal/plugins/wopal-plugin/src/logger.ts` ≥ 1（logger 使用 RuntimeContext.logDir）

### User Validation

#### Scenario 1: 非 wopal-space 环境插件正常启动
- Goal: 确认插件在无 `.wopal/` 目录的普通项目中仍能正常工作
- Precondition: 用户级 `WOPAL_HOME/.env` 已配置 LLM/Embedding 变量
- User Actions:
  1. 在无 `.wopal/` 目录的项目中启动 ellamaka
  2. 观察插件日志
- Expected Result: 插件正常初始化，从 `WOPAL_HOME/.env` 读取配置，memory 系统正常启动

#### Scenario 2: 空间内 `.wopal/.env` 覆盖用户级配置
- Goal: 确认空间级 `.env` 变量能覆盖用户级同名变量
- Precondition: 用户级 `.env` 设 `WOPAL_LLM_MODEL=qwen-3-next`，空间级 `.env` 设 `WOPAL_LLM_MODEL=deepseek-chat`
- User Actions:
  1. 在当前 wopal-space 中重启 ellamaka
  2. 检查日志中的 LLM client 初始化信息
- Expected Result: 插件使用 `deepseek-chat`（空间级覆盖用户级）

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 创建 RuntimeContext 模块

**Verification Intent**: AC#6, AC#8

**Behavior**: 插件初始化时调用 `initRuntimeContext(workspaceRoot)` 构建 RuntimeContext 单例。该模块负责检测 WOPAL_HOME、wopal-space 状态、日志输出路径。检测逻辑以 `.wopal/` 目录存在为 wopal-space 标志。

**Files**: `src/runtime-context.ts`

**Pre-read**: `src/index.ts`（现有初始化流程）, `src/logger.ts`（现有日志路径逻辑）

**Design**:
- `RuntimeContext` 接口定义 wopalHome、workspaceRoot、isWopalSpace、logDir 四个字段
- `WOPAL_HOME` 解析顺序: `process.env.WOPAL_HOME` → `join(homedir(), ".wopal")`
- `isWopalSpace`: `existsSync(join(workspaceRoot, ".wopal"))`
- `logDir`: isWopalSpace 时 `join(workspaceRoot, ".wopal-space", "logs")`，否则 `join(wopalHome, "logs")`
- 模块级单例 `_context`，通过 `getRuntimeContext()` 导出

**TDD**: true

**Changes**:
1. RED — 创建 `runtime-context.test.ts`，覆盖以下场景：
   - workspaceRoot 下存在 `.wopal/` 目录 → `isWopalSpace === true`
   - workspaceRoot 下不存在 `.wopal/` 目录 → `isWopalSpace === false`
   - `process.env.WOPAL_HOME` 已设置 → `wopalHome` 使用该值
   - `process.env.WOPAL_HOME` 未设置 → `wopalHome` 为 `~/.wopal`
   - wopal-space 内 → `logDir` 为 `.wopal-space/logs/`
   - wopal-space 外 → `logDir` 为 `WOPAL_HOME/logs/`
   - 调用 `initRuntimeContext` 前 `getRuntimeContext()` 抛出异常
2. GREEN — 创建 `src/runtime-context.ts` 实现上述行为
3. REFACTOR — 检查代码风格、错误处理、边界条件

**Verify**: `cd .wopal/plugins/wopal-plugin && bun run test:run -- --reporter verbose src/runtime-context.test.ts` — 全部 test pass

**Done**:
任务产出：`src/runtime-context.ts` 模块及其完整单元测试
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: 改造 env 加载和 prompt 级联

**Verification Intent**: AC#1, AC#2, AC#3, AC#4, AC#5, AC#6, AC#7, AC#8

**Behavior**: 
- **Env 加载**：`loadWopalEnv` 改为双层加载。先尝试 `WOPAL_HOME/.env`，再尝试 `<workspace>/.wopal/.env`。两层使用同一 `loadEnvFile()` 解析器（仅加载 WOPAL_ 前缀，不覆盖已有 process.env）。非 wopal-space 跳过空间层。
- **Prompt 加载**：删除 `_pluginDir` / `setPluginDirectory()`。创建 `resolvePromptFile(filename)` 函数，按 env var → 空间级 → 用户级 → 内联 fallback 四层查找。
- **日志路径**：`logger.ts` 的 `getLogFile()` 改用 `RuntimeContext.logDir`。

**Files**: `src/index.ts`, `src/memory/prompts.ts`, `src/logger.ts`, `src/index.test.ts`

**Pre-read**: `src/memory/prompts.ts`（现有 prompt 加载逻辑）, `src/index.ts:27-48`（现有 `loadWopalEnv`）

**Design**:

**index.ts 变更**:
1. 导入 `initRuntimeContext`、`getRuntimeContext`
2. `openCodeRulesPlugin` 开头调用 `initRuntimeContext(directory)`
3. `loadWopalEnv` 改为：
   - 先 `loadEnvFile(join(runtimeCtx.wopalHome, ".env"))`
   - 若 `runtimeCtx.isWopalSpace`，再 `loadEnvFile(join(directory, ".wopal", ".env"))`
4. 删除 `setPluginDirectory(directory)` 调用和 import

**prompts.ts 变更**:
1. 删除 `_pluginDir` 变量和 `setPluginDirectory()` 函数
2. 导入 `getRuntimeContext`
3. 创建 `resolvePromptFile(filename)`:
   ```
   // Layer 1: env var 覆盖（保留现有机制）
   const envPath = resolveEnvFilePath(envVar)
   if (envPath && existsSync(envPath)) return envPath
   // Layer 2: 空间级模板
   const ctx = getRuntimeContext()
   if (ctx.isWopalSpace) {
     const p = join(ctx.workspaceRoot, ".wopal", "prompts", filename)
     if (existsSync(p)) return p
   }
   // Layer 3: 用户级模板
   const p = join(ctx.wopalHome, "prompts", filename)
   if (existsSync(p)) return p
   // Layer 4: 内置 fallback → 调用方在 resolvePromptFile 返回 null 时使用内联模板
   return null
   ```
4. `loadPromptFile` / `loadTitlePrompt` / `buildExtractionPrompt` 等函数适配新接口

**logger.ts 变更**:
1. `getLogFile()` 改用 `getRuntimeContext().logDir` 替代硬编码路径
2. 测试环境（VITEST）保持现有压制逻辑不变

**TDD**: true

**Changes**:
1. RED — 更新/新增测试：
   - `index.test.ts`：测试双层 env 加载（用户级 + 空间级覆盖顺序）
   - `index.test.ts`：测试非 wopal-space 只加载用户级 env
   - `index.test.ts`：确认 `setPluginDirectory` 调用已删除
   - `logger.test.ts`：新增测试 logDir 在空间内外取不同值
2. GREEN — 实施代码变更：
   - `index.ts`：`initRuntimeContext` 调用、双层 `loadWopalEnv`、删除 `setPluginDirectory`
   - `prompts.ts`：删除 `_pluginDir`/`setPluginDirectory`、创建 `resolvePromptFile`、适配调用方
   - `logger.ts`：`getLogFile` 改用 `RuntimeContext.logDir`
   - 清理 `index.ts` 中 `setPluginDirectory` 的 import

**Verify**: `cd .wopal/plugins/wopal-plugin && bun run typecheck && bun run test:run && bun run lint` — 全部 exit 0

**Done**:
任务产出：双层 env 加载、四层 prompt 级联、日志路径路由、清理废弃代码，所有原有测试通过
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

两个 Task 存在文件依赖：Task 2 依赖 Task 1 的 RuntimeContext 模块。不拆分委派——整组委派给单个 fae 顺序执行。

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 + Task 2 | fae | 无 | Task 2 依赖 Task 1 的 RuntimeContext 接口，整组委派避免接口不一致；总步骤数 < 30 |
