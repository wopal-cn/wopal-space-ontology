# refactor-dev-flow-simplify-worktree-plan-lifecycle

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-06-01
- **Status**: done

## Scope Assessment

- **Complexity**: High
- **Confidence**: Medium

## Goal

简化 dev-flow worktree 生命周期语义，使 Plan 状态、代码提交、子代理 Plan 路径和归档行为遵循统一的分支归属契约。

## Technical Context

### Architecture Context

dev-flow 技能当前将 worktree 执行视为重量级的跨仓库生命周期。Plan 元数据存储了九个 worktree 字段，但所有 Plan 现在都位于其所属项目仓库内部。脚本仍保留了旧结构中的遗留行为——那时 Plan 文件可以存在于项目仓库外部。

这造成了三个架构问题。第一，`approve --confirm` 在提交 Plan 为 `executing` 之前就创建了 worktree，导致 worktree 可能继承过期的 Plan 状态。第二，`complete` 将状态转换与代码提交兜底行为混在一起，而实施代理才应该负责代码提交。第三，下游命令和子代理 prompt 没有统一的活动 Plan 路径契约，导致 agent 可能在 feature 分支上实施时读取或更新 main 分支的 Plan。

目标设计将职责分离：脚本负责 Plan 状态转换和 Plan-only 提交；实施 agent 负责代码提交；feature 分支持有工作项直到用户验证后合并；main 分支持有已接受状态和归档历史。

### Research Findings

当前仓库布局使旧的跨仓库分支逻辑不再必要。标准项目 Plan 位于项目仓库内的 `projects/<project>/docs/plans/`，ontology Plan 位于 ontology worktree 仓库内的 `.wopal/docs/plans/`。

之前的 `same_repo` 逻辑比较 Git common directory，将项目 worktree 视为与主项目 checkout 同一仓库。技术上是正确的，但这不是文件可见性的正确单元——`git status` 和 `git add -A` 操作当前 working tree，所以主 checkout 的命令无法看到独立 worktree checkout 中的未提交文件。

分支语义应该显式化：`approve --confirm` 先在集成分支上提交已批准的 Plan 基线，然后从该基线创建 worktree；`complete` 在活动 feature 分支上提交 `verifying`；`verify-switch --merge` 在用户验证后合并 feature 分支；`verify --confirm` 在工作被接受后于集成分支上提交 `done`；`archive` 在集成分支上将已接受的 Plan 移入 `done/`。

### Key Decisions

- D-01: 脚本只提交 Plan 状态变更（Plan-only commit）。代码提交由 fae 或 Wopal 在实施阶段负责。
- D-02: Worktree 元数据以显式字段 `branch` 和 `path` 存储。项目类型、仓库根、目标分支、验证模式和清理策略均从已有字段推导。
- D-03: `approve --confirm` 先提交 `executing` 状态和精简 Worktree 元数据，再创建 worktree。
- D-04: `complete` 在 feature 分支的活动 Plan 上操作，并在该分支提交 `verifying`。
- D-05: `verify --confirm` 在合并后的集成分支上操作，并在该分支提交 `done`。
- D-06: 子代理 prompt 在执行和实施审查期间使用本地活动 Plan 路径，而非 main 分支 URL。
- D-07: `archive` 永远不提交代码。它合并或确认已合并的工作，清理 worktree，将 Plan 移至 `done/`，提交归档移动。

### Key Interfaces

```text
Worktree 元数据:
- **Worktree**:
  - branch: <feature-branch-name>
  - path: <workspace-relative-worktree-path>

resolve_active_plan(main_plan, command_phase):
  无 worktree 元数据 -> main_plan
  complete/review 阶段 + worktree 存在 -> worktree 中同 repo-relative 路径的 Plan 副本
  verify 阶段且未合并 -> 阻断并提示执行 verify-switch --merge
  合并后/main 分支 -> main_plan
```

解析器返回活动 Plan 文件路径和 Plan-only commit 必须执行的 Git working tree 根路径。

## In Scope

- 在 `skills/dev-flow/SKILL.md` 中记录修订后的 dev-flow worktree 生命周期。
- 记录消费该生命周期契约的 Wopal 侧执行和委派规则。
- 用显式 `branch`/`path` 字段契约替换结构化 WorktreeContext 文档。
- 为 Wopal-to-fae 和 Wopal-to-rook 委派 prompt 新增活动 Plan 路径契约。
- 重构 worktree 元数据解析和写入，优先使用精简格式，同时保持对现有结构化 Plan 的读取兼容。
- 重排 `approve --confirm` 时序，使已批准的 Plan 基线在 worktree 创建前提交。
- 重构 `complete`，检查未提交的代码变更并只提交活动 Plan 文件。
- 重构 `verify`、`verify-switch` 和 `archive`，使已接受状态和归档提交在集成分支上发生。
- 更新或新增单元测试，覆盖元数据解析、活动 Plan 解析、生命周期时序和 Plan-only commit 行为。
- 同步生命周期变更到项目模块规范 `.wopal/AGENTS.md`，确保文档与实现一致。

## Out of Scope

- 用其他隔离机制替换 git worktree。
- 改变本 Plan 讨论范围之外的公开状态名称。
- 重做 Issue 创建、路线图分解或其他不相关的 dev-flow 命令。
- 改变 WSF 工作流。
- 从任何生命周期脚本自动提交实施代码。

## Business Rules Impact

N/A — 无业务规则变更。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| 技能规范 | `skills/dev-flow/SKILL.md`, `skills/dev-flow/references/plan-authoring.md` | 修改 | 记录权威执行契约、Wopal 编排规则和委派 Plan 路径规则 |
| Worktree 元数据 | `skills/dev-flow/scripts/lib/worktree.py`, `skills/dev-flow/scripts/plan.py` | 修改 | 精简元数据格式，保留兼容读取 |
| Plan 解析器 | `skills/dev-flow/scripts/lib/project.py` 或 `scripts/lib/` 下新建辅助模块 | 修改/创建 | 为生命周期命令解析活动 Plan 路径和提交根目录 |
| Approve 命令 | `skills/dev-flow/scripts/commands/approve.py` | 修改 | 在 worktree 创建前提交已批准基线 |
| Complete 命令 | `skills/dev-flow/scripts/commands/complete.py` | 修改 | 移除代码提交行为，只提交活动 Plan 状态 |
| Verify 流程 | `skills/dev-flow/scripts/commands/verify.py`, `skills/dev-flow/scripts/commands/verify_switch.py` | 修改 | 对齐 done 转换与合并后集成分支语义 |
| Archive 命令 | `skills/dev-flow/scripts/commands/archive.py` | 修改 | 移除代码提交兜底，在集成分支上归档已接受 Plan |
| 测试 | `skills/dev-flow/tests/python/unit/test_worktree_context.py`, `skills/dev-flow/tests/python/unit/test_git_semantics.py`, `skills/dev-flow/tests/python/unit/test_verify_switch.py`, `skills/dev-flow/tests/python/integration/test_no_issue_lifecycle.py` | 修改/创建 | 覆盖生命周期时序和精简契约 |
| 项目规范 | `AGENTS.md` | 修改 | 同步 dev-flow worktree 生命周期变更到模块规范 |

## Acceptance Criteria

### Agent Verification

1. [x] `rg -n "Plan branch ownership|active Plan path|Plan-only" skills/dev-flow/SKILL.md` 返回匹配结果，确认生命周期契约已记录。
2. [x] `rg -n "branch:|path:|Worktree" skills/dev-flow/SKILL.md skills/dev-flow/scripts/lib/worktree.py` 确认显式字段元数据契约已记录并实现。
3. [x] `rg -n "commit_project_changes|commit_ontology_worktree|commit_all" skills/dev-flow/scripts/commands/complete.py skills/dev-flow/scripts/commands/archive.py` 返回空结果，确认无生命周期代码路径提交实施代码。
4. [x] `rg -n "Plan branch ownership|active Plan path|Plan-only" AGENTS.md` 确认模块规范已同步生命周期语义变更。
5. [x] `python -m pytest skills/dev-flow/tests/python/unit/test_worktree_context.py skills/dev-flow/tests/python/unit/test_git_semantics.py skills/dev-flow/tests/python/unit/test_verify_switch.py -q` 通过。
6. [x] `python -m pytest skills/dev-flow/tests/python/integration/test_no_issue_lifecycle.py -q` 通过，或记录已有的不相关失败。

### User Validation

#### Scenario 1: dev-flow worktree 生命周期可理解
- Goal: 确认修订后的 `SKILL.md` 清晰解释分支归属、活动 Plan 路径、代码提交所有权和归档职责。
- Precondition: 实施已更新 `skills/dev-flow/SKILL.md` 和生命周期脚本。
- User Actions:
  1. 阅读 `skills/dev-flow/SKILL.md` 中的 worktree 生命周期、Git 语义和委派章节。
  2. 确认文档流程清晰说明每个阶段 Plan 状态变更提交到哪个分支。
  3. 确认文档流程清晰说明 Wopal 向 fae 或 rook 委派时应传递哪个 Plan 路径。
- Expected Result: 生命周期文档可独立阅读理解，无需外部对话补充说明。

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 记录生命周期和 Wopal 编排契约

**Verification Intent**: AC#1

**Behavior**: `SKILL.md` 以正向目标状态语言阐述新的执行契约，解释分支归属、脚本职责、实施提交所有权、活动 Plan 路径、Wopal 侧编排、命令交接和精简 Worktree 元数据契约。

**Files**: `skills/dev-flow/SKILL.md`, `skills/dev-flow/references/plan-authoring.md`

**Pre-read**: `skills/dev-flow/SKILL.md`

**Design**:
在修改代码行为之前，先重写 worktree 隔离和 Git 语义章节。文档是后续脚本变更的真相源。遵循以下目标规则：

1. `planning` 和已批准的 `executing` 基线位于集成分支。
2. `complete` 将活动 feature Plan 变更为 `verifying`。
3. 用户验证在 feature 分支上进行。
4. `verify-switch --merge` 在用户明确确认后将 feature 分支集成到 main。
5. `verify --confirm` 将 main 分支 Plan 变更为 `done`。
6. `archive` 在 main 分支上将已接受 Plan 移至 `done/`。
7. 脚本命令只提交 Plan 文件。
8. 子代理 prompt 使用本地活动 Plan 路径。

同时记录消费此契约的 Wopal 侧编排规则：

1. Wopal 只使用活动 Plan 路径委派实施。
2. Wopal 将脏的实施树视为交接失败，要求实施者提交。
3. Wopal 在 feature 分支上运行 `verify-switch` 进行用户验证。
4. Wopal 仅在用户明确验证确认后运行 `verify-switch --merge`。
5. Wopal 仅在 feature 分支已集成或 PR 已合并后运行 `verify --confirm`。
6. Wopal 不要求生命周期脚本提交代码。

**TDD**: false — 文档先行重构；AC#1 验证所需的契约文本。

**Changes**:
1. 用显式 `branch`/`path` 字段格式替换 9 字段 WorktreeContext 文档。
2. 在 Git 语义区域新增「Plan 分支归属」章节。
3. 在委派章节下新增「委派用活动 Plan 路径」规则。
4. 新增 Wopal 编排规则：实施交接、脏树处理、`verify-switch --merge` 和 `verify --confirm`。
5. 更新 `complete`、`verify-switch`、`verify --confirm` 和 `archive` 的描述以匹配新的归属模型。
6. 声明生命周期脚本在脏实施树上报错退出，而非提交代码。
7. 更新 `.wopal/AGENTS.md` 中与 dev-flow worktree 生命周期相关的描述，确保模块规范与实现一致。

**Verify**:
`rg -n "Plan branch ownership|active Plan path|Plan-only" skills/dev-flow/SKILL.md`

**Done**:
任务产出：`SKILL.md` 及相关参考文档包含权威的生命周期和 Wopal 编排契约。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: 精简元数据并新增活动 Plan 解析

**Verification Intent**: AC#2, AC#4

**Behavior**: 新 Plan 以显式 `branch`/`path` 字段存储 Worktree 元数据。现有结构化 Worktree 块保持可读，确保进行中的 Plan 不会中断。生命周期命令能为其阶段解析正确的活动 Plan 副本。

**Files**: `skills/dev-flow/scripts/lib/worktree.py`, `skills/dev-flow/scripts/plan.py`, `skills/dev-flow/scripts/lib/project.py` 或 `skills/dev-flow/scripts/lib/` 下新建辅助模块, `skills/dev-flow/tests/python/unit/test_worktree_context.py`, `skills/dev-flow/tests/python/unit/test_git_semantics.py`

**Pre-read**: `skills/dev-flow/scripts/lib/worktree.py`, `skills/dev-flow/scripts/plan.py`, `skills/dev-flow/tests/python/unit/test_worktree_context.py`

**Design**:
将 Worktree 写入收拢为精简格式。保留同时接受精简和结构化元数据的解析器。存储路径归一化为 workspace 相对路径。返回只包含 `branch` 和 `path` 的小型 worktree 对象或 dict。项目类型、项目根、合并目标和验证模式在调用点从已有 Plan 元数据和项目解析函数推导。

新增共享活动 Plan 解析器，从 `find_plan` 找到的 main Plan 出发。它从 main Plan 读取 Worktree 元数据。对于 `complete` 和实施审查，将 main Plan 路径映射到 worktree 内的同一 repo-relative 路径。对于 `verify --confirm`，要求合并后的集成分支副本（PR 合并流程除外，此时 main 已包含 PR 结果）。对于 archive，使用集成后的 main 分支副本。

解析器应返回：

```text
active_plan_path
commit_repo_root
repo_relative_plan_path
branch_context
```

**TDD**: true

**Changes**:
1. RED: 新增测试覆盖精简写入格式、结构化读取兼容、相对路径归一化、无 worktree 解析、有 worktree 解析和合并后解析。
2. GREEN: 更新元数据解析和写入，优先使用显式字段格式：
   ```
   - **Worktree**:
     - branch: <name>
     - path: <relative-path>
   ```
3. GREEN: 实现活动 Plan 解析，最小化路径假设。
4. REFACTOR: 从新写入路径移除或弱化 9 字段 dataclass，同时保留兼容读取。

**Verify**:
`python -m pytest skills/dev-flow/tests/python/unit/test_worktree_context.py skills/dev-flow/tests/python/unit/test_git_semantics.py -q`

**Done**:
任务产出：Worktree 元数据精简、兼容，并由共享活动 Plan 解析器支持。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: 重排 approve 时序并重构 complete 归属

**Verification Intent**: AC#4

**Behavior**: `approve --confirm` 先在集成分支上提交 `executing` 和精简 Worktree 元数据，再创建 worktree。新 worktree 继承已批准的 Plan 基线。`complete` 永远不提交实施代码——它在脏实施树上阻断，将活动 feature Plan 更新为 `verifying`，并只提交活动 Plan 文件。

**Files**: `skills/dev-flow/scripts/commands/approve.py`, `skills/dev-flow/scripts/commands/complete.py`, `skills/dev-flow/tests/python/unit/test_git_semantics.py`

**Pre-read**: `skills/dev-flow/scripts/commands/approve.py`, `skills/dev-flow/scripts/lib/worktree.py`

**Design**:
在 preflight 阶段生成 feature 分支名和计划的 worktree 路径。将精简 Worktree 元数据写入 Plan，更新状态为 `executing`，在集成分支上提交并推送 Plan-only 基线，然后从已提交基线创建 worktree。保留 `--no-worktree` 作为无 Worktree 元数据的直接 main 分支路径。

然后更新 `complete` 使用活动 Plan 解析器。移除 same-repo 合并提交路径和代码提交兜底。在状态转换前检查实施 working tree 是否有未提交变更。脏实施树返回错误，提示用户要求 fae 提交。更新状态为 `verifying`，通过 `commit_paths` 只提交活动 Plan 路径。

**TDD**: true

**Changes**:
1. RED: 新增测试确认 worktree 在 Plan 状态提交点之后创建。
2. RED: 新增测试证明脏实施树阻断 `complete`，干净树产生 Plan-only commit。
3. GREEN: 重排 approve，使 Plan 基线提交发生在 worktree 创建之前。
4. GREEN: 从 `complete` 移除 `commit_all`、`commit_project_changes` 和 `commit_ontology_worktree` 路径。
5. REFACTOR: 移除重复的 WorktreeContext 字段构造，精简 Plan-only commit 消息。

**Verify**:
`python -m pytest skills/dev-flow/tests/python/unit/test_git_semantics.py -q`

**Done**:
任务产出：Approve 从已提交基线创建 worktree，complete 是带脏代码防护的 Plan-only 状态转换。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 4: 对齐 verify-switch、verify 和 archive 与已接受状态归属

**Verification Intent**: AC#3, AC#4, AC#5

**Behavior**: 用户验证在 feature 分支上进行。合并仅在用户明确确认后发生。`verify --confirm` 在合并后的集成分支上提交 `done`。`archive` 归档已接受 Plan 且永远不提交实施代码。

**Files**: `skills/dev-flow/scripts/commands/verify_switch.py`, `skills/dev-flow/scripts/commands/verify.py`, `skills/dev-flow/scripts/commands/archive.py`, `skills/dev-flow/tests/python/unit/test_verify_switch.py`, `skills/dev-flow/tests/python/integration/test_no_issue_lifecycle.py`

**Pre-read**: `skills/dev-flow/scripts/commands/verify_switch.py`, `skills/dev-flow/scripts/commands/verify.py`, `skills/dev-flow/scripts/commands/archive.py`

**Design**:
保持 `verify-switch` 作为用户验证分支切换命令。用户确认后，`verify-switch --merge` 将 feature 合并到 main，然后在 main 上运行或启用 `verify --confirm`。`verify --confirm` 在 worktree feature 分支未合并时报错阻断。对于 PR 流程，verify 检查 PR 已合并后才在 main 上提交 `done`。`archive` 移除代码提交兜底逻辑，确认无脏实施树，清理 worktree，将 main Plan 移至 `done/`，提交归档移动，更新 Issue 链接。

**TDD**: true

**Changes**:
1. RED: 新增测试覆盖直接合并、PR 合并和未合并 worktree 阻断行为。
2. GREEN: 更新 verify-switch 和 verify 分支检查，强制执行已接受状态归属。
3. GREEN: 从 archive 移除实施代码提交兜底。
4. REFACTOR: 在命令间共享脏树和分支状态检查。

**Verify**:
`python -m pytest skills/dev-flow/tests/python/unit/test_verify_switch.py skills/dev-flow/tests/python/integration/test_no_issue_lifecycle.py -q`

**Done**:
任务产出：已接受状态和归档行为在集成分支上发生，无代码提交兜底。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 文档先建立真相源，再改脚本 |
| 2 | Task 2 | fae | Task 1 | 元数据和活动 Plan 解析器实现文档中定义的契约基础 |
| 3 | Task 3 | fae | Task 2 | Approve 和 complete 依赖精简元数据和活动 Plan 解析 |
| 4 | Task 4 | fae | Task 2-3 | Verify 和 archive 集成完整的分支归属模型 |

所有实施任务适合 fae 执行。Wopal 在每个 Wave 完成后运行验证审查。Rook 在 `complete` 前审查最终实施。
