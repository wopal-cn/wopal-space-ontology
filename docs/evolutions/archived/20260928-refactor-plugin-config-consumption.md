# refactor-plugin-config-consumption

## Metadata

- **Type**: refactor
- **Project Path**: .wopal
- **Created**: 2026-09-27
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-refactor-plugin-config-consumption
- **Branch**: ontology-refactor-plugin-config-consumption
- **Base Commit**: b014c58d99f62948609975a17e738a6e70970095
- **Final Commit**: ed0a0040c65b1dae0c6143adb2b782410223fe29

## Scope Assessment

- **Complexity**: High
- **Confidence**: High — 契约已在引擎侧交付并发布（`@wopal/ellamaka-plugin` / `@wopal/ellamaka-sdk` 2.0.7，发布物已核实含 `pluginConfig` 类型）；目标态与消费面定稿。

## Goal

三个本体插件全部改由引擎交付的 `pluginConfig` 整表消费配置，不再自己读三层 settings；`wopal-plugin` 运行时 id 修正为 `wopal-plugin`。关闭 ONT-G5，装配单格式不参与改动。实施自依赖 pin 对齐起步，一次交付、一次验证后归档。

## Technical Context

### Architecture Context

- **引擎交付契约**：引擎在配置加载期把三层 `wopal.pluginConfig`（全局 → 空间公共 → 空间私有）深合并为整表，经 `PluginInput.pluginConfig`（server 插件）与 `TuiPluginApi.pluginConfig`（TUI 插件）交付；缺层 / 缺 `wopal` 段按空对象，缺该插件条目为 `undefined`。见 `projects/ellamaka/docs/DESIGN-config-engine.md`（Plugin Configuration Assembly）、SDK 类型 `projects/ellamaka/packages/plugin/src/index.ts:90-95` 与 `packages/plugin/src/tui.ts:606-611`、交付实现 `packages/opencode/src/plugin/index.ts:178-196`。
- **当前各自读文件**：
  - dsh-adapter：`plugins/dsh-adapter/index.ts` 的 `settingsLayerPaths`（:212）/ `readPluginConfigLayer`（:227）/ `deepMerge`（:257）/ `loadPluginConfig`（:272）；消费点 `resolveDshAdapterConfig`（:296），入口 `dshAdapter`（:953）；内联 `rawOptions` 为回退。
  - wopal-plugin：`plugins/wopal-plugin/src/config/loader.ts` 的 `loadWopalConfig`（:154-195，自片段叠加 :177-179）、`merge.ts`（三层合并 + 逐叶 `sources`）、`schema.ts`；日志输出逐叶 `sources`（`src/index.ts:142-145`）；导出 id 为 `wopal-wopal-plugin`（`src/index.ts:359`）。
  - tui-ellamaka：`plugins/tui-ellamaka/config.ts` 的 `resolveTuiConfig`（:120-143，空间根定位 + 三层 merge + 内联回退）；消费点 `index.tsx:51`。
- **设计真相源**（目标态已先行写入，本提案实现对齐）：
  - `.wopal/docs/DESIGN-wopal-plugin.md`（Configuration 节：承载体、Schema、Plugin Config Node、优先级）
  - `.wopal/docs/DESIGN-dsh-adapter.md`（行为配置消费 节：优先 / 回退 / 缺省三级链）
  - `.wopal/docs/DESIGN-capabilities.md`（TUI Brand Plugin 节：交付链与内联回退）
  - `projects/ellamaka/docs/DESIGN-config-engine.md`（Plugin Configuration Assembly）
  - `.wopal/docs/GAPS.md`（ONT-G5，本提案关闭对象）
- **前置与前身**：旧提案 `enhance-plugin-config-delivery` 已于 2026-09-27 删除，其插件侧消费部分由本提案承接（仅 ONT-G5）；装配单分段与物化已由 CLI 交付（`assembly/archetypes/coding.yaml` 已是 `ellamaka` / `tui` 分段映射），不在本提案变更。插件侧通道从「文件内 `wopal.pluginConfig`」（ONT-G4）升级为「引擎交付表」。
- **启动前提（依赖）**：契约包 2.0.7 已发布（发布物含 `pluginConfig` 类型，已核）；实施第一步把 `.wopal` 根与三个插件的 `@wopal/ellamaka-plugin` / `@wopal/ellamaka-sdk` pin 对齐为 2.0.7（严格一致）并安装，否则消费代码无法通过 `typecheck`。

### Key Decisions

- D-01: 消费面统一为引擎整表切片：`input.pluginConfig["dsh-adapter" | "wopal-plugin"]`、`api.pluginConfig["tui-ellamaka"]`；优先级 = 内置默认 < 装配条目内联 options < `pluginConfig[插件名]`；`$VAR` 解析与 zod / 形状校验保留在插件侧（dsh-adapter 无 `$VAR` 场景；wopal-plugin 保持 process.env 优先、`.env` 兜底；tui-ellamaka 最小形状校验）。
- D-02: `sources` 语义收敛：引擎只交付表、不交付层级来源；插件侧删除逐叶 `sources` 记录与日志字段（日志保留生效配置快照）。
- D-03: 旧顶层字段（`wopal.llm` / `wopal.rules` 等）随文件读取链一并退场；本空间 settings 已全部位于 `wopal.pluginConfig` 下（`.wopal/config/settings.local.jsonc` 已核，空间公共层无 `wopal` 节点）；其他空间的迁移不属本提案。
- D-04: `wopal-plugin` 导出 id 固定为 `wopal-plugin`，与装配名、配置键一致；全仓无 `wopal-wopal-plugin` 残留。
- D-05: 次序与窗口：契约包已发布 → pin 对齐（Task 0）→ 三插件消费改造（并行）→ 一次验证、一次归档；不依赖未来引擎 CD。

### Key Interfaces

- dsh-adapter / wopal-plugin（server）：`input.pluginConfig["dsh-adapter" | "wopal-plugin"]`；无条目走内联 / 默认。
- tui-ellamaka（TUI）：`api.pluginConfig["tui-ellamaka"]`（`enabled` / `label` 等）；无条目走内联 / 默认。
- `wopal-plugin` 导出 id = `wopal-plugin`。
- 依赖 pin：`@wopal/ellamaka-plugin` / `@wopal/ellamaka-sdk` = 2.0.7；三插件与 `.wopal` 根严格一致。
- 无新增 CLI / HTTP；引擎契约不在此改变。

## In Scope

- 三插件消费改造：切片消费 + 校验 + 内联回退；settings 文件读取链与空间根定位删除（dsh 的 `wopalSpaceRoot` 消费点清理；wopal loader 收缩；tui `config.ts` 读取链删除）。
- `sources` 收敛与旧顶层字段退场（D-02 / D-03）。
- `wopal-plugin` 导出 id 对齐。
- 依赖 pin 对齐 2.0.7（`.wopal` 根 + 三插件）与安装校验。
- 三插件测试更新；wopal-plugin lint / typecheck / 格式检查；`plugins/wopal-plugin/AGENTS.md`、`AGENTS.zh-CN.md` 配置节同步。

## Out of Scope

- 引擎侧整表交付实现：已交付 `ellamaka` `feature-plugin-config`（f91f4592cc）。
- 装配单与物化、私有保盘、提案模板：`enhance-assembly-carriers`。
- 武器库、派发与会话规则装配：`enhance-session-assembly`（讨论稿）。
- settings 写入端（CLI `config` 命令族）；`space sync` 与 `ontology contribute`（用户拍板）。
- 其他空间的 settings 迁移与实机回归。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| dsh-adapter | `plugins/dsh-adapter/index.ts`, `index.test.ts`, `package.json`, `bun.lock` | 修改 | 消费切片、删自读链、pin |
| wopal-plugin | `plugins/wopal-plugin/src/config/loader.ts`, `src/config/merge.ts`, `src/config/schema.ts`, `src/index.ts`, `src/config/*.test.ts`, `src/index.test.ts`, `AGENTS.md`, `AGENTS.zh-CN.md`, `package.json`, `bun.lock` | 修改 | 消费切片、sources 收敛、id、pin |
| tui-ellamaka | `plugins/tui-ellamaka/index.tsx`, `config.ts`, `config.test.ts`, `package.json`, `bun.lock` | 修改/删除 | 消费 api 切片、删读取链、pin |
| 依赖对齐 | `.wopal/package.json` | 修改 | pin 2.0.7 |

## Acceptance Criteria

### Agent Verification

1. [x] 依赖与契约：`.wopal` 根与三插件的 `@wopal/ellamaka-plugin` pin 统一为 2.0.7，`@wopal/ellamaka-sdk` 凡声明处（`.wopal` 根、wopal-plugin）同步为 2.0.7；安装后各处版本一致且 `pluginConfig` 类型可解析。验证：各处已安装 `node_modules/@wopal/ellamaka-plugin/package.json` 版本均为 2.0.7；`.wopal/node_modules/@wopal/ellamaka-plugin/dist/index.d.ts` 含 `pluginConfig`；`cd .wopal/plugins/wopal-plugin && bun run typecheck` 通过。
2. [x] dsh-adapter：注入 `pluginConfig["dsh-adapter"]` 切片 → 生效配置正确；无条目 → 内联 / 默认；非法值 fail loud（信息含插件名与字段路径）；源码不再出现 settings 文件读取（`settingsLayerPaths` / `loadPluginConfig` 删除）。验证：`cd .wopal/plugins/dsh-adapter && bun test`。
3. [x] wopal-plugin：注入切片 → 生效（deep merge、`$VAR`、zod、缺失默认）；源码不再读 settings 文件；旧顶层字段不再消费；`sources` 不再记录层级来源；导出 id = `wopal-plugin`，无 `wopal-wopal-plugin` 残留。验证：`cd .wopal/plugins/wopal-plugin && bun run test:run && bun run lint && bun run typecheck`。
4. [x] tui-ellamaka：`api.pluginConfig["tui-ellamaka"]` 的 `enabled` / `label` 生效；非法形状 fail loud；内联回退保留；`config.ts` 文件读取链（空间根定位、三层 merge）删除。验证：`cd .wopal/plugins/tui-ellamaka && bun test`。
5. [x] 回归与质量（cross-Task）：三插件测试全绿（`bun test` / `bun run test:run`）、wopal-plugin lint / typecheck、改动文件格式检查通过。

（2026-09-27 主控实证：dsh 80 / wopal 1003 / tui 17 全绿；wopal-plugin typecheck 0；改动文件 eslint 0、prettier 全过；整仓 `bun run lint` 存量债失败——宿主基线同因，非本次引入；两轮评审修正后复验同结果。）

### User Validation

#### Scenario 1: 重启后三插件消费回归
- Goal: 确认三插件切换到引擎交付表后，实机行为与改造前一致。
- 验证环境: 本空间 dev 构建；验证入口与日志排查见 `projects/ellamaka/AGENTS.md`（Manual Verification Entry Points）。
- Precondition: 本提案已集成到空间分支；Agent Verification 全绿。
- 启动命令: `cd projects/ellamaka && ./scripts/dev.sh tui`
- User Actions:
  1. 启动 TUI，确认品牌元素与提示行 label 显示为 `WOPALSPACE`；
  2. 开启一个会话触发一次记忆检索（`memory_manage` 搜索），确认插件装载无配置类报错。
- 通过判据: TUI 正常启动且 label 正确；会话与工具调用无插件配置类 error；`.wopal-space/logs/dev/` 下对应 TUI 日志无 config 级报错。
- 失败反馈: 提供日志片段与 `.wopal/config/settings.local.jsonc`。

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 0: 契约包 pin 对齐（2.0.7）

**Verification Intent**: AC#1

**Behavior**:
- `.wopal/package.json` 与三插件的 `@wopal/ellamaka-plugin` pin 全部为 2.0.7；`@wopal/ellamaka-sdk` 凡声明处同步为 2.0.7；
- 安装后各处版本一致，`pluginConfig` 类型可解析。

**Pre-read**: `.wopal/package.json`；三插件 `package.json`；`.wopal/docs/DESIGN-dsh-adapter.md`（依赖声明节）

**Design**: 只改依赖声明与锁文件，不改代码；执行前确认 npm 上 2.0.7 可达（已核）。安装在工作区根与三插件目录分别执行；pin 保持三插件严格一致。

**TDD**: false（依赖声明，无逻辑变更）

**Changes**:
1. 更新四处 `package.json` 的 pin 至 2.0.7（含 `@wopal/ellamaka-sdk` 凡声明处）。
2. 分别安装并核对版本一致性。
3. 运行 `typecheck` 确认契约类型可解析。

**Verify**: 各处已安装 `@wopal/ellamaka-plugin` 版本核对 = 2.0.7；`.wopal/node_modules/@wopal/ellamaka-plugin/dist/index.d.ts` 含 `pluginConfig`；`cd .wopal/plugins/wopal-plugin && bun run typecheck` 通过。

**Done**:
任务产出：三插件 `@wopal/ellamaka-plugin` / `@wopal/ellamaka-sdk` pin 对齐 2.0.7 并安装（隔离提交 `a2243c4`）；契约类型 `pluginConfig` 可解析、wopal-plugin typecheck 通过；`.wopal` 根 pin 与安装随验证阶段刷新。
实际触碰文件：`plugins/dsh-adapter/package.json`、`plugins/dsh-adapter/bun.lock`、`plugins/wopal-plugin/package.json`、`plugins/wopal-plugin/bun.lock`、`plugins/tui-ellamaka/package.json`、`plugins/tui-ellamaka/bun.lock`
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 1: dsh-adapter 消费引擎交付表

**Verification Intent**: AC#2

**Behavior**:
- 注入 `pluginConfig["dsh-adapter"]` = `{ sandbox: { enabled: true, mode: "read-only" } }` → 生效配置同上；
- 无条目（表缺失或键缺失）→ 回落内联 `rawOptions`；两者皆缺 → 内置默认（沙箱关闭、适配器闲置）；
- 条目非法（`sandbox.enabled` 非布尔、`mode` 非法等）→ 抛错，信息含 `dsh-adapter` 与字段路径；内联 options 非法仍 fail loud；
- `settingsLayerPaths` / `readPluginConfigLayer` / `loadPluginConfig` 及 settings 读取调用删除；`wopalSpaceRoot` 不再消费；`jsonc-parser` 依赖若不再使用则移除。

**Pre-read**: `plugins/dsh-adapter/index.ts:212-306`（配置链与消费点）、`:953`（入口）；`plugins/dsh-adapter/index.test.ts:1862-2090`（现有注入矩阵，需改造）；`projects/ellamaka/docs/DESIGN-config-engine.md`

**Design**: `resolveDshAdapterConfig` 的优先通道从「三层文件读取」换成 `input.pluginConfig?.["dsh-adapter"]` 切片；校验复用 `dshAdapterConfigSchema`；三层合并归引擎。内联 `rawOptions` 保持低优先回退（兼容未迁移部署）。删除文件读取链与依赖真实 settings 的测试 fixture，新增注入矩阵测试。

**TDD**: true

**Changes**:
1. RED：切片消费矩阵（有 / 无条目、非法、回退顺序）落成失败测试。
2. GREEN：实现切片消费与读取链删除，至 `bun test` 全绿。
3. REFACTOR：清理不再使用的 import / 依赖 / 注释（ONT-G4 措辞更新为引擎交付）。

**Verify**: `cd .wopal/plugins/dsh-adapter && bun test`

**Done**:
任务产出：dsh-adapter 改为消费 `input.pluginConfig["dsh-adapter"]` 整条目切片（TDD：RED 11 fail → GREEN 80 pass）；settings 读取链（`settingsLayerPaths` / `readPluginConfigLayer` / `loadPluginConfig` / `deepMerge`）与 `wopalSpaceRoot` 消费删除；死依赖 `jsonc-parser` 移除；source 守门测试新增（隔离提交 `aaffdeb`）。
实际触碰文件：`plugins/dsh-adapter/index.ts`、`plugins/dsh-adapter/index.test.ts`、`plugins/dsh-adapter/package.json`、`plugins/dsh-adapter/bun.lock`
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 2: wopal-plugin 消费引擎交付表与 id 对齐

**Verification Intent**: AC#3

**Behavior**:
- 注入 `pluginConfig["wopal-plugin"]` 切片 → 生效配置正确（deep merge 默认、`$VAR` 解析、zod fail loud、缺失走默认）；
- `$VAR` 保持 process.env 优先、`.env` 兜底（由 runtime 提供，不读 settings）；
- loader 不再读任何 settings 文件；旧顶层字段不再作为回退；`sources` 不再记录层级来源；
- 导出 id = `wopal-plugin`；`AGENTS.md` / `AGENTS.zh-CN.md` 配置节与实现同步。

**Pre-read**: `plugins/wopal-plugin/src/config/loader.ts`、`merge.ts`、`schema.ts`、`src/index.ts:60-145` 与 `:340-361`、`src/config/loader.test.ts`、`.wopal/docs/DESIGN-wopal-plugin.md`（Configuration）

**Design**: `loadWopalConfig` 输入改为「引擎切片 + fallbackEnvironment」；默认配置与切片深合并后做 `$VAR` 解析与 zod 校验；`ConfigError` 定位改为插件名 / 字段路径。`merge.ts` 移除 `sources` 记录（保留默认 + 切片合并）。入口从 `input.pluginConfig?.["wopal-plugin"]` 取切片；id 字符串修正；日志行同步。

**TDD**: true

**Changes**:
1. RED：切片消费矩阵（有 / 无、非法、`$VAR`、默认叠加）落成失败测试。
2. GREEN：实现切片消费、sources 收敛、id 修正，至测试全绿。
3. REFACTOR：收敛 loader 签名；同步 AGENTS 配置节；跑 lint / typecheck / 格式检查。

**Verify**: `cd .wopal/plugins/wopal-plugin && bun run test:run && bun run lint && bun run typecheck`

**Done**:
任务产出：wopal-plugin 改为消费 `input.pluginConfig["wopal-plugin"]` 切片（TDD 全程：RED → GREEN，69 文件 / 998 用例全绿；typecheck 0；改动文件 eslint 0 且 prettier 通过）；settings 读取链与旧顶层字段回退删除、逐叶 `sources` 记录移除、日志改为生效快照；导出 id = `wopal-plugin`；AGENTS 双语配置节同步。整仓 `bun run lint` 存量债失败（宿主基线同因，非本次引入）。
实际触碰文件：`plugins/wopal-plugin/AGENTS.md`、`plugins/wopal-plugin/AGENTS.zh-CN.md`、`plugins/wopal-plugin/src/config/index.ts`、`plugins/wopal-plugin/src/config/loader.ts`、`plugins/wopal-plugin/src/config/loader.test.ts`、`plugins/wopal-plugin/src/config/merge.ts`、`plugins/wopal-plugin/src/config/merge.test.ts`、`plugins/wopal-plugin/src/config/schema.ts`、`plugins/wopal-plugin/src/config/schema.test.ts`、`plugins/wopal-plugin/src/index.ts`、`plugins/wopal-plugin/src/index.test.ts`、`plugins/wopal-plugin/src/hooks/integration.test.ts`、`plugins/wopal-plugin/src/test-helpers.ts`
评审修正（rook 两轮，均已自验）：补齐内联 options 链路（默认 < 内联 < 切片）、防原型污染加固、入口级 inline 传递直测；修正提交 `52985a7`、`eae4575`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 3: tui-ellamaka 消费 TuiPluginApi 交付表

**Verification Intent**: AC#4

**Behavior**:
- `api.pluginConfig["tui-ellamaka"]` = `{ enabled: true, label: "X" }` → label 生效、插件启用；
- `enabled: false` → 不注册（等同现状）；
- 无条目 → 默认（enabled 缺省 true）+ 内联 mount options 回退；
- 条目非对象 → fail loud（现状语义保留）；
- `config.ts` 文件读取链（`findSpaceRoot` / `readWopalNode` / 三层 merge）删除；`WOPAL_HOME` 定位不再需要。

**Pre-read**: `plugins/tui-ellamaka/index.tsx`、`config.ts`、`config.test.ts`；`.wopal/docs/DESIGN-capabilities.md`（TUI Brand Plugin）；SDK `projects/ellamaka/packages/plugin/src/tui.ts:600-611`

**Design**: `tui(api, options)` 改为从 `api.pluginConfig?.["tui-ellamaka"]` 取条目；消费与校验提取为可注入测试的纯逻辑（保留 `config.ts` 或内联均可，文件读取链必须消失）；内联 `options` 保持回退。

**TDD**: true

**Changes**:
1. RED：api 交付消费矩阵（有 / 无条目、enabled、非法、回退）落成失败测试。
2. GREEN：实现 api 消费、删除读取链，至 `bun test` 全绿。
3. REFACTOR：清理注释与 import（ONT-G4 措辞更新）。

**Verify**: `cd .wopal/plugins/tui-ellamaka && bun test`

**Done**:
任务产出：tui-ellamaka 改为消费 `api.pluginConfig["tui-ellamaka"]` 切片（TDD：RED 0/10 → GREEN 10/10）；文件读取链（`findSpaceRoot` / `readWopalNode` / 三层 merge）与 `WOPAL_HOME` 定位删除；内联回退与 fail-loud 语义保留；死依赖 `jsonc-parser` 移除（隔离提交 `d5d8761`）。
实际触碰文件：`plugins/tui-ellamaka/index.tsx`、`plugins/tui-ellamaka/config.ts`、`plugins/tui-ellamaka/config.test.ts`、`plugins/tui-ellamaka/package.json`、`plugins/tui-ellamaka/bun.lock`
评审修正（rook 两轮，均已自验）：补已知字段类型校验（含内联通道）、注册路径与防污染回归测试；修正提交 `52985a7`、`eae4575`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 0 | Task 0 依赖 pin 对齐 | fae | 2.0.7 已发布（npm 可达） | 先决于全部消费改造；共享依赖先独立落地 |
| 1 | Task 1 dsh-adapter | fae | Task 0 完成 | 独立目录、独立测试，与 Task 2 / 3 并行 |
| 1 | Task 2 wopal-plugin + id | fae | Task 0 完成 | 同上 |
| 1 | Task 3 tui-ellamaka | fae | Task 0 完成 | 同上 |

并行纪律（同一隔离工作区，isolated 模式）：
- 每任务完成即提交：`wopal space evo commit refactor-plugin-config-consumption --paths <本任务文件…> -m "<提交信息>"`；显式 `--paths` 只带本任务文件——省略 `--paths` 会收集全部跟踪改动（含并行任务在途改动），禁止。
- 提交因并发（index 占用等）被拒时重试即可；不得自行处置其他任务的文件或工作区状态；委派 prompt 末尾附工作区保护禁令块。
- 每任务完成勾选 Done 并回填实际触碰文件；全部完成后一次验证、一次归档。

## Delivery

- 实施留在空间分支；`space sync` / `ontology contribute` 由用户拍板。
- 归档闭环：移除 `.wopal/docs/GAPS.md` ONT-G5 条目；核对 `DESIGN-wopal-plugin.md` 中 `（ONT-G5）` 注解；DAG / phase 状态随归档更新。
