# 161-feature-space-master-rewrite-ontology-collaboration-for-clone-based-model

## Metadata

- **Issue**: #161
- **Type**: feature
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree

- **Created**: 2026-06-12
- **Status**: done
- **Verification Commit**: 33083b678543651e89ae18531018f043ec7b7c05
- **Worktree**:
  - branch: issue-161-master-rewrite-ontology-collaboration-for-clone-based-model
  - path: /Users/sam/coding/wopal/wopal-workspace/.worktrees/ontology-issue-161-master-rewrite-ontology-collaboration-for-clone-based-model

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

重写 space-master 技能的 ontology 协作文档，使其反映 clone 模式、新分支命名约定和 `wopal ontology` CLI 命令族。使 agent 能读取 ontology 状态、与用户讨论、构建精确的 CLI 命令。

## Technical Context

### Architecture Context

space-master 技能当前在两份参考文档中引用了 fork 模式工作流：`upstream-sync.md` 和 `capability-layers.md`。这些文档描述的是基于 fork 的双远程拓扑、自由格式的分支命名和直接 git 操作——与 DESIGN.md §6.8 中定义的 ontology 协作模型不一致。

新模型定义了结构化分支命名（main、type/*、type/<user>/*、space/<user>/*、contribute/<target>/*、feature/*）、clone 模式为默认（fork 为可选替代）、以及通过 `wopal ontology` CLI 访问的六种同步操作。

技能需要文档化此模型，并描述 agent 工作流：从 CLI 读取结构化状态 → 与用户讨论 → 构建精确 CLI 命令。CLI 是 agent 接口；技能是 agent 用于解读状态和做出决策的知识库。

### Research Findings

当前 fork 模式文档描述了三层（runtime → fork → upstream）双远程配置。新 ontology 协作模型（DESIGN.md §6.8）定义了：六种结构化前缀的分支命名约定、clone 模式为默认（fork 为可选替代）、通过 `wopal ontology` CLI 的六种同步操作、以及 agent 驱动的工作流模式。

**参考资料**：
- `.wopal/docs/DESIGN.md` §6.8 — Ontology Branch Model and Collaboration（分支命名规范、拓扑、同步操作设计）
- `.wopal/docs/DESIGN.md` §6.6 — Distribution Summary（clone/fork 分发模型）
- `.wopal/docs/DESIGN.md` §6.7 — Base Capabilities and Space Overlay（双栈能力模型）

### Key Decisions

- D-01：完全重写而非修补。模型已根本性变化（非结构化 → 基于约定的分支、直接 git → CLI 中介操作）。
- D-02：Agent 优先文档。主要受众是使用 `wopal ontology` CLI 的 agent，而非直接运行 git 命令的人类。每个工作流应展示：状态揭示了什么 → agent 应与用户讨论什么 → 构建什么命令。
- D-03：保留 `capability-layers.md` 的概念（用户级 vs space 级）但映射到新分支模型（main、type/*、space/<user>/*）。核心洞察——"能力在 space/* 中孵化，成熟后提升到 type/* 或 main"——仍然有效。
- D-04：Clone 是默认模式，fork 是可选替代。文档须描述两种模式，但默认提供基于 clone 的指令。

## In Scope

- 重写 `space-master/references/upstream-sync.md`，覆盖 clone 默认拓扑、新分支命名和 agent 驱动工作流
- 重写 `space-master/references/capability-layers.md`，覆盖 main / type/* / space/<user>/* 层级模型
- 更新 space-master SKILL.md 的 ontology 协作章节，引用新 CLI 命令和 DESIGN.md §6.8
- 更新 SKILL.md 快捷命令章节
- 为每个操作编写 agent 工作流模式文档（status → discuss → command）

## Out of Scope

- wopal-cli 命令实现（独立项目）
- Gitee 特定工作流
- fork 模式向后兼容文档（仅需注明 fork 为可选替代）
- Dev-flow 项目命名变更（用户将另行决定）

## Business Rules Impact

无——无业务规则变更。

## Affected Files

| 组件 | 文件 | 操作 | 角色 |
|-----------|-------|-----------|------|
| skill 根目录 | `.wopal/skills/space-master/SKILL.md` | 修改 | 更新 ontology 章节、快捷命令和生命周期表 |
| references | `.wopal/skills/space-master/references/upstream-sync.md` | 重写 | clone 模式拓扑、新分支命名、agent 工作流 |
| references | `.wopal/skills/space-master/references/capability-layers.md` | 重写 | 新层级模型（main/type/user-type/space）、同步契约 |

## Acceptance Criteria

### Agent Verification

1. [x] `rg -c 'fork' .wopal/skills/space-master/references/upstream-sync.md` 返回 0，或所有匹配项均在"fork-mode migration"上下文中（无 fork 作为默认模式的表述）
2. [x] `rg -c 'space/<user>/<name>' .wopal/skills/space-master/references/upstream-sync.md` ≥ 1（新分支约定已文档化）
3. [x] `rg -c 'wopal ontology' .wopal/skills/space-master/SKILL.md` ≥ 3（CLI 命令已引用）
4. [x] `rg -c 'type/<name>' .wopal/skills/space-master/references/capability-layers.md` ≥ 1（type 分支已文档化）
5. [x] `rg -c 'space save' .wopal/skills/space-master/SKILL.md` = 0（旧命令未被引用）

### User Validation

#### 场景 1：Agent 引导用户完成 ontology 同步

- 目标：Agent 使用更新后的技能文档正确引导用户将 type 分支更新同步到其 space
- 前置条件：Agent 已加载 space-master 技能，用户询问"如何获取最新的 ontology 更新"
- 用户操作：
  1. 向 agent 询问更新 ontology
  2. Agent 解释当前状态并建议运行 `wopal ontology update`
  3. 用户确认，agent 构建并解释命令
- 预期结果：Agent 引用正确的 clone 模式工作流、使用新 CLI 命令、不提及 fork 模式操作

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 重写 upstream-sync.md

**Verification Intent**: AC#1, AC#2

**Behavior**: 完全重写上游同步参考文档。覆盖 clone 模式拓扑、新分支命名约定和基于 `wopal ontology` CLI 命令的 agent 驱动工作流。

**Files**: `.wopal/skills/space-master/references/upstream-sync.md`

**Pre-read**: 当前 `upstream-sync.md`、`.wopal/docs/DESIGN.md` §6.8、§6.6、§6.7

**Design**:
新文档结构：
1. 仓库拓扑（clone 模式）：本地仓库带 origin → upstream，auto-fork 用于 PR
2. 分支命名约定表（main、type/*、type/<user>/*、space/<user>/*、contribute/<target>/*、feature/*）
3. 每种操作的 agent 工作流：
   - 检查状态：`wopal ontology status` → 为用户解读 Markdown 输出
   - 更新：`wopal ontology update` → 解释将发生什么变更
   - 同步：`wopal ontology sync --from A --to B` → 安全检查讨论
   - 贡献：`wopal ontology contribute` → commit 选择讨论
4. 冲突处理指南
5. 常见场景 FAQ

移除所有 fork 模式双远程指令。替换为 clone 默认 / fork 可选的等效内容。

**TDD**: false — 文档任务，非代码

**Changes**:
1. 用 clone 模式拓扑重写整个文件
2. 文档化分支命名约定及示例
3. 为每个 `wopal ontology` 子命令添加 agent 工作流模式
4. 移除 fork 模式指令（双远程、push to fork 等）

**Verify**: `rg -c 'fork' .wopal/skills/space-master/references/upstream-sync.md` 返回 0 或所有匹配项均在迁移上下文中

**Done**:
任务产出：Rewritten upstream-sync.md for clone-based model
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: 重写 capability-layers.md

**Verification Intent**: AC#4

**Behavior**: 为新分支模型重写能力层级文档。Main 承载通用能力，type/* 承载类型特定能力，space/<user>/* 承载 space 实例定制。描述层级间的同步契约。

**Files**: `.wopal/skills/space-master/references/capability-layers.md`

**Pre-read**: 当前 `capability-layers.md`

**Design**:
新结构：
1. 层级模型：main → type/* → space/<user>/*
2. 能力分类：universal（main）、type-specific（type/*）、space-specific（space/<user>/*）、incubating（始于 space，提升到 type 或 main）
3. 层级间同步契约：
   - main → type/*：合并通用更新
   - type/* → space/<user>/*：合并 type 更新（update 命令）
   - space/<user>/* → type/* 或 main：contribute（cherry-pick + PR）
4. 删除安全：某层删除文件时会发生什么
5. ellamaka 双扫描模型（不变，但提供层级重要性的上下文）

**TDD**: false — 文档任务

**Changes**:
1. 用新层级模型重写整个文件
2. 将每个层级映射到分支命名约定
3. 文档化同步契约和安全检查
4. 移除 fork 特定的合并指令

**Verify**: `rg -c 'type/<name>' .wopal/skills/space-master/references/capability-layers.md` ≥ 1

**Done**:
任务产出：Rewritten capability-layers.md for new branch model
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: 更新 SKILL.md

**Verification Intent**: AC#3, AC#5

**Behavior**: 更新 space-master SKILL.md 以引用 `wopal ontology` CLI 命令，移除 `space save` 引用，更新快捷命令和生命周期表。

**Files**: `.wopal/skills/space-master/SKILL.md`

**Pre-read**: 当前 `SKILL.md`

**Design**:
需要更新的内容：
1. Ontology 日常开发章节：用 `wopal ontology save` 替换 `wopal space save`
2. 快捷命令：用 `wopal ontology` 命令族替换 `wopal space save`
3. 生命周期表：更新"保存空间变更"以引用 `wopal ontology save`
4. 添加对新 upstream-sync.md 和 capability-layers.md 内容的引用
5. 移除所有 fork 模式特定指令

**TDD**: false — 文档任务

**Changes**:
1. 在快捷命令中用 `wopal ontology save -m "message"` 替换 `wopal space save -m "message"`
2. 在快捷命令中添加 `wopal ontology status/update/sync/contribute`
3. 更新生命周期表中"保存空间变更"条目
4. 添加关于 agent 驱动工作流的说明（读取状态 → 讨论 → 命令）
5. 移除所有 `space save` 引用

**Verify**: `rg -c 'wopal ontology' .wopal/skills/space-master/SKILL.md` ≥ 3 && `rg -c 'space save' .wopal/skills/space-master/SKILL.md` = 0

**Done**:
任务产出：Updated SKILL.md with new CLI references
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | Agent | Dependencies | Reason |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 独立的文档重写 |
| 1 | Task 2 | fae | 无 | 独立的文档重写，与 Task 1 无文件交集 |
| 2 | Task 3 | fae | Task 1, Task 2 | SKILL.md 引用重写后的文档 |

委派 prompt 必含项：
- 每次委派末尾附加：`完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），Plan 文件路径：/Users/sam/coding/wopal/wopal-workspace/.wopal/docs/plans/161-feature-space-master-rewrite-ontology-collaboration-for-clone-based-model.md`
- Task 1 和 Task 2 可并行委派（文件无交集）
