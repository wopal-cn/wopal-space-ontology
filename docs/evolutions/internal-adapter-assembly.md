# 新版 ontology 停止装配外部 DSH adapter

## Metadata


- **Type**: refactor
- **Project Path**: .wopal
- **Created**: 2026-10-10
- **Stage**: validating
- **Mode**: quick
- **Worktree**: (none)
- **Branch**: (none)
- **Base Commit**: (none)
- **Final Commit**: (none)

## Scope Assessment

- **Complexity**: Low
- **Confidence**: High

## Goal

在 Ellamaka 内部 adapter 可用后，新版 ontology 不再装配外部副本；保留旧源码和现有用户参数。

## Technical Context

### Architecture Context

coding 默认装配目前仍声明 dsh-adapter，外部包使用独立 Plugin SDK。Ellamaka unified-sdk Task 4 先完成内置实现与旧条目的提前接管；本提案随后调整声明并准备其联合验收视图，无需等待正式 SDK 发布。runtime-consumer 的 SDK 模板消费在正式发布后再做，避免循环依赖。

### Key Decisions

- D-01: 删除的是新版默认装配引用；plugins/dsh-adapter 源码与依赖暂留，不更新、不安装、不执行。
- D-02: settings.jsonc 的 wopal.pluginConfig.dsh-adapter、sandbox/escalation、三层覆盖保持。不删除整张 plugin 数组或其他插件。
- D-03: 不新增适配器版本协商；旧产品配合保留的旧装配声明/兼容 ontology 版本验证。仅回退 Home 不会恢复新版已移除的外部声明。

### Key Interfaces

新版类型默认装配不含外部 dsh-adapter。内部实现由产品提供，参数键和默认值保持。当前开发空间因新版 Ellamaka SDK / CLI 尚未完成接线，手工同步本地装配结果；其他已有空间待新版 CLI 可用后通过正式 CLI 装配操作迁移。

## In Scope

- 新版默认 coding 装配清单不再引用外部 adapter。
- 当前 wopal-workspace 手工删除本地 `ellamaka.plugin` 中的外部 adapter 引用。
- 保留 `wopal.pluginConfig.dsh-adapter` 用户参数与旧 `plugins/dsh-adapter` 源码/依赖。
- 其他已有空间本次不迁移，待新版 CLI 接线后通过正式 CLI 装配操作处理。

## Out of Scope

- 不迁移 SDK 消费，不删除旧 adapter 源码，不增加新行为或修改其依赖。
- 不实施 Config Engine、Plan Scheduler、Session Assembly，不清空用户 Home。

## Affected Files

| Component | Files | Operation | Role |
| --- | --- | --- | --- |
| 装配声明 | assembly/archetypes、必要配置默认值 | 修改 | 新版移除外部引用 |
| 兼容源码 | plugins/dsh-adapter | 保留 | 旧声明的兼容资产 |
| 验证视图 | 由演进流程准备 | 重新物化 | 联合验收 |

## Assembly Intent

| Ref | Scope | 理由 |
| --- | --- | --- |

## Acceptance Criteria

### Agent Verification

1. [x] `assembly/archetypes/coding.yaml` 的 Ellamaka 默认插件列表不再包含 `dsh-adapter`。
2. [x] 当前空间 `.wopal/config/settings.local.jsonc` 的 `ellamaka.plugin` 不再包含 `../plugins/dsh-adapter`，其他插件保持。
3. [x] `wopal.pluginConfig.dsh-adapter` 参数和旧 `plugins/dsh-adapter` 源码/依赖保持不变；其他已有空间本次不迁移。
4. [x] 复用 Ellamaka unified-sdk Task 4 已通过的内部 adapter 回归证据，本提案不重复改造 SDK / CLI / materializer。

### User Validation

#### Scenario 1: 更新装配后的正常使用
- Goal: 观察已有空间的参数与助理交互；与 Ellamaka 主计划联合验收，不重复做一轮。
- 验证环境：当前 wopal-workspace 的演进验证视图，WOPAL_HOME 为 `/Users/sam/tmp/wopal-e2e/home`，不清空或重置。
- Precondition：候选 Ellamaka 内部 adapter 已通过自动验收，当前空间已手工同步本地装配结果；Agent 检查有效配置与进程占用。
- 启动命令：`WOPAL_HOME=/Users/sam/tmp/wopal-e2e/home ./.worktrees/ellamaka-feature-upgrade-dsh-v0.2/scripts/dev.sh serve --port 3018 --app-port 3019`，从空间根执行；若候选脚本在另一个工作树，Agent 交付前回填实际路径。
- User Actions：打开脚本输出的 Workbench 地址，进入当前空间，观察 sandbox 参数与一次正常助理交互。
- 通过判据：无需外部 adapter 的装配提示，现有模式可识别，工具交互和错误说明可理解。
- 失败反馈：提供步骤、截图和脱敏提示，由 Agent 检查脚本日志；先保留证据再依次用 dev.sh stop frontend、stop backend 停止本次实例。

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 停止默认装配外部 adapter，并同步当前空间

**Verification Intent**: AC#1, AC#2, AC#3, AC#4

**Behavior**:
- 从 coding 默认装配删除 `dsh-adapter`。
- 当前空间仅手工删除 `ellamaka.plugin` 中的 `../plugins/dsh-adapter`；不删除 `wopal.pluginConfig.dsh-adapter`。
- 不修改旧 adapter 源码，不迁移其他空间，不改 SDK / CLI / materializer。

**Pre-read**: assembly/archetypes/coding.yaml、当前 `.wopal/config/settings.local.jsonc`、Ellamaka unified-sdk Task 4 交付记录

**Design**:
用最小配置变更完成当前阶段迁移。默认装配负责未来新空间；当前开发空间因新版 CLI 尚未接线，手工同步本地结果；其他已有空间留待新版 CLI 正式迁移。

**TDD**: false

**Changes**:
1. 从 `assembly/archetypes/coding.yaml` 删除 `dsh-adapter`。
2. 从当前空间 `config/settings.local.jsonc` 的 `ellamaka.plugin` 删除 `../plugins/dsh-adapter`。
3. 核对 `wopal.pluginConfig.dsh-adapter` 与 `plugins/dsh-adapter` 均未变化。

**Verify**: 静态核对默认装配、本地有效插件列表、参数保留和旧源码 Git 摘要；运行 `wopal space evo check internal-adapter-assembly`。

**Done**:
- 产出：coding 默认装配已移除外部 `dsh-adapter`；当前空间本地 `ellamaka.plugin` 已手工移除 `../plugins/dsh-adapter`。
- 实际触碰：`assembly/archetypes/coding.yaml`、`config/settings.local.jsonc`（本地生成配置，不提交）、`docs/evolutions/internal-adapter-assembly.md`。
- 保留：`wopal.pluginConfig.dsh-adapter` 仍存在；`plugins/dsh-adapter` 无 Git diff。
- 验证：默认装配无 `dsh-adapter`；本地插件列表仅保留 `../plugins/wopal-plugin`；`wopal space evo check internal-adapter-assembly` → `OK`。
- 内部 adapter 行为复用 Ellamaka unified-sdk Task 4 已通过的交付 `a4b57723bc`，本提案未重复修改 SDK / CLI / materializer。
- [x] 实施 Agent 已完成上述变更和验证。

## Delegation Strategy

本提案按用户批准直接推进最小变更；不委派并行实施，不扩展到 SDK / CLI / materializer。完成后进入现有 Ellamaka 联合验证。

## Delivery

本提案位于 Ellamaka Task 4 与其联合 UV 之间；不等待新 SDK 发布。正式 SDK 发布后再实施 runtime-consumer 与 Wopal SDK 消费。同步与上游贡献由用户另行决定。
