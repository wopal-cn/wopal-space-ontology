# phase2-worktree-git-lifecycle

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-05-28
- **Status**: verifying
- **Depends On**: phase1-path-model-plan-discovery

## Scope Assessment

- **Complexity**: High
- **Confidence**: High

## Goal

将 dev-flow 的 worktree 策略改为默认隔离，重构 Git 提交/推送/归档语义为 repo-aware（以 Plan 所属仓库为核心），并使同仓项目实现代码变更与 Plan 状态变更的合并提交。

**前置条件**：phase1-path-model-plan-discovery 已完成，ProjectContext / PlanLocation 公共解析层可用。

## Technical Context

### Architecture Context

phase1 建立了新的路径模型和公共解析层。本 Plan 在此基础上：

- 将 worktree 从可选策略升级为默认执行模式，引入结构化 WorktreeContext。
- 重构 approve/complete/verify/archive 的 Git 操作，使 Plan 文件在其所属 repo 中提交和推送。
- 同仓项目（包括 ontology-worktree）complete 时，代码变更和 Plan 状态变更进入同一个提交。

### Research Findings

- 当前 `scripts/commands/approve.py::_commit_and_push_plan()` 总是在 `workspace_root` 提交/推送。
- 当前 `scripts/commands/complete.py` 先提交项目代码，再更新 Plan 状态；同仓时 Plan 状态变更可能落在提交之外。
- 当前 `scripts/commands/verify.py` 更新 Plan 状态为 done 后不提交。
- 当前 `scripts/commands/archive.py` 使用 `workspace_root` 执行 git 操作；标准项目 Plan 在项目仓库时该逻辑不成立。

### Key Decisions

- D-01: worktree 是 dev-flow 默认执行策略；`approve --confirm` 默认创建 worktree，显式 `--no-worktree` 才跳过。
- D-02: WorktreeContext 是一等核心模型，字段包括 branch、path、repo_root、base_branch、merge_target、verify_mode、cleanup_policy。
- D-03: complete 阶段若 Plan 文件与项目代码在同一仓库，代码变更与 Plan status=verifying 进入同一个提交。
- D-04: approve --confirm 可产生 Plan-only 状态提交（planning → executing 授权边界）。
- D-05: verify --confirm 只更新 Plan status=done，提交到 Plan 所属 repo。
- D-06: archive 在 Plan 所属 repo 内完成 git mv/commit/push。
- D-07: ontology-worktree 项目中，runtime source 与 Plan docs 均在 `.wopal` 仓库内，complete 产生单次 ontology worktree commit。

### Key Interfaces

扩展 phase1 的公共解析层，新增 WorktreeContext 和 repo-aware Git 操作：

- `WorktreeContext`
  - `enabled`: bool
  - `project_type`: `standard | ontology-worktree`
  - `branch`: worktree 分支
  - `path`: worktree 路径
  - `repo_root`: worktree 所属 git repo root
  - `base_branch`: 创建时的基线分支
  - `merge_target`: 验证通过后合并回的目标分支
  - `verify_mode`: `direct | switch-runtime | pr`
  - `cleanup_policy`: `archive | pr-opened | manual`

公共函数：

- `resolve_worktree_context(plan_path, project_context, workspace_root) -> WorktreeContext | None`
- `create_worktree_context(plan_path, project_context, workspace_root) -> WorktreeContext`
- `commit_paths(repo_root, paths, message) -> bool`
- `push_repo(repo_root, branch=None) -> bool`

## In Scope

- 引入 WorktreeContext，将 worktree 设为默认执行模式。
- 重构 approve/complete/verify/archive 的 Git 操作为 repo-aware。
- 同仓项目 complete 时合并代码变更与 Plan 状态变更为单次提交。
- 更新 verify-switch 使用 WorktreeContext。
- 更新 dev-flow 文档、模板与测试。

## Out of Scope

- 不改变路径模型或 Plan 发现逻辑（phase1 已完成）。
- 不移除 `docs/projects/*` 软链接。
- 不修改 `.wopal/AGENTS.md`、`.wopal/rules/`、`.wopal/commands/` 等 dev-flow 技能外文件。

## Business Rules Impact

N/A — 无业务规则变更。

### 同步确认
- [ ] N/A — 无业务规则变更，无需同步

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Worktree model | `.wopal/skills/dev-flow/scripts/lib/worktree.py` | 修改/扩展 | WorktreeContext 建模与生命周期 |
| Git utilities | `.wopal/skills/dev-flow/scripts/lib/git.py` | 修改 | repo-aware commit/push |
| approve command | `.wopal/skills/dev-flow/scripts/commands/approve.py` | 修改 | 默认 worktree，repo-aware Plan 提交 |
| complete command | `.wopal/skills/dev-flow/scripts/commands/complete.py` | 修改 | 同仓合并提交 |
| verify command | `.wopal/skills/dev-flow/scripts/commands/verify.py` | 修改 | done 状态提交到 Plan 所属 repo |
| archive command | `.wopal/skills/dev-flow/scripts/commands/archive.py` | 修改 | repo-aware 归档 |
| verify switch | `.wopal/skills/dev-flow/scripts/commands/verify_switch.py` | 修改 | 基于 WorktreeContext |
| docs | `.wopal/skills/dev-flow/SKILL.md`, `.wopal/skills/dev-flow/references/*.md` | 修改 | 更新 worktree/git 语义说明 |
| tests | `.wopal/skills/dev-flow/tests/**` | 修改/新增 | worktree/git 生命周期测试 |

## Acceptance Criteria

### Agent Verification

1. [x] `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q` 全部 pass
2. [x] `cd .wopal/skills/dev-flow && python -m pytest tests/python/integration -q` 全部 pass 或记录需外部环境的跳过项
3. [x] 在临时 fixture repo 中验证：complete 阶段在 Plan 与代码同仓时产生单一提交，包含代码文件与 Plan status=verifying
4. [x] 在临时 fixture repo 中验证：archive 阶段在 Plan 所属 repo 内完成 `plans/<name>.md` → `plans/done/<date>-<name>.md` 的 git move/commit
5. [x] `flow.sh approve <plan> --confirm` 默认创建 WorktreeContext；`--no-worktree` 才跳过
6. [x] WorktreeContext 至少包含 branch、path、base_branch、merge_target、verify_mode、cleanup_policy
7. [x] ontology-worktree 项目的 complete 产生单次 `.wopal` 仓库 commit（含代码+Plan）

### User Validation

#### Scenario 1: 默认 worktree 隔离
- Goal: 确认 approve 默认创建 worktree
- User Actions: `flow.sh approve <plan> --confirm`，查看 Plan metadata 和 `.worktrees/`
- Expected Result: worktree 创建，Plan 中记录完整 WorktreeContext；只有 `--no-worktree` 才跳过

#### Scenario 2: 同仓合并提交
- Goal: 确认代码变更与 Plan 状态同仓同 commit
- User Actions: 完成实现后 `flow.sh complete <plan>`，查看项目仓库最新 commit
- Expected Result: 最新 commit 同时包含代码变更和 Plan status=verifying

#### Scenario 3: 归档在正确 repo
- Goal: 确认 archive 在 Plan 所属 repo 执行
- User Actions: `flow.sh archive <plan>`，查看归档 commit
- Expected Result: 归档 commit 在项目仓库（非空间仓库）

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Model WorktreeContext and make worktree the default

**Verification Intent**: AC#1, AC#5, AC#6

**Behavior**: dev-flow 默认通过 worktree 隔离执行；Plan 中记录结构化 WorktreeContext；后续 complete/verify-switch/archive 通过 WorktreeContext 驱动。

**Files**: `.wopal/skills/dev-flow/scripts/lib/worktree.py`, `.wopal/skills/dev-flow/scripts/commands/approve.py`

**Pre-read**: phase1 的 ProjectContext resolver, `.wopal/skills/dev-flow/scripts/lib/worktree.py`

**Design**:
1. 新增 `WorktreeContext` 数据结构及 parser/writer。
2. `approve --confirm` 默认等价于旧 `--worktree`；新增 `--no-worktree` 参数。
3. 标准项目 worktree：`verify_mode = direct`。
4. ontology-worktree worktree：`verify_mode = switch-runtime`。
5. Plan metadata 从单行 `Worktree: branch | path` 升级为结构化字段；保留 legacy parser 读取旧格式。
6. 旧 `.worktrees/<project>-issue-*` 猜测仅在 WorktreeContext 缺失时作为 legacy recovery。

**Git fixture design**:
- 临时 fixture repo 在 `/tmp` 创建，使用 `git init`，不涉及网络 push。
- 确定性 branch 设置：`main` 作为 base，`feature/test-issue-1` 作为 worktree branch。
- Verify 命令直接执行默认 worktree vs `--no-worktree` 场景。

**TDD**: true

**Changes**:
1. 为默认 worktree、显式 `--no-worktree`、标准项目、ontology-worktree 编写测试。
2. 实现 WorktreeContext parser/writer。
3. 改造 approve 默认行为和 CLI 参数。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_worktree_context.py -v
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 2: Redesign Git commit/push semantics around Plan ownership

**Verification Intent**: AC#3, AC#4, AC#7

**Behavior**: Plan 文件在其所属 repo 中提交；同仓 complete 时代码+Plan 合并提交；archive 在 Plan 所属 repo 内执行 git mv/commit/push。

**Files**: `.wopal/skills/dev-flow/scripts/commands/approve.py`, `.wopal/skills/dev-flow/scripts/commands/complete.py`, `.wopal/skills/dev-flow/scripts/commands/verify.py`, `.wopal/skills/dev-flow/scripts/commands/archive.py`, `.wopal/skills/dev-flow/scripts/lib/git.py`

**Pre-read**: phase1 resolver, Task 1 WorktreeContext

**Design**:
1. approve --confirm: Plan-only 提交到 `PlanLocation.repo_root`。
2. complete: 同仓时一次提交包含代码+Plan；不同仓时分别提交。
3. verify --confirm: Plan status=done 提交到 Plan 所属 repo。
4. archive: repo-aware git mv/commit/push。
5. ontology-worktree: complete 将 `.wopal/skills/...` 与 `.wopal/docs/plans/...` 纳入同一个 commit。

**Git fixture design**:
- 同仓场景：单个 fixture repo 包含代码和 docs/plans/。
- 不同仓场景：两个 fixture repo（代码 repo + Plan repo）。
- 每个 fixture 使用 `git init`，不 push。
- Verify 命令直接验证 `git log --name-only` 确认 commit 内容。

**TDD**: true

**Changes**:
1. 增加 fixture 测试覆盖 same-repo 和 different-repo 两种场景。
2. 改造 approve 的 `_commit_and_push_plan()` 为 repo-aware。
3. 改造 complete 的提交顺序。
4. 改造 verify 和 archive 的提交/移动逻辑。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q && python -m pytest tests/python/integration -q
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 3: Update verify-switch to use WorktreeContext

**Verification Intent**: AC#1

**Behavior**: verify-switch 基于 WorktreeContext 处理 ontology runtime 验证切换，不再通过路径猜测。

**Files**: `.wopal/skills/dev-flow/scripts/commands/verify_switch.py`

**Pre-read**: Task 1 WorktreeContext

**Design**:
1. verify-switch 读取 WorktreeContext 的 verify_mode 和 branch。
2. ontology-worktree 的 `switch-runtime` 模式：移除隔离 worktree → 检出 feature 分支 → 记录主分支。
3. 标准 project 的 `direct` 模式：保持现有行为。

**TDD**: true

**Changes**:
1. 增加 WorktreeContext 驱动的 verify-switch 测试。
2. 改造 verify_switch.py。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_verify_switch.py -v
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 4: Update dev-flow docs, templates and tests for both phases

**Verification Intent**: AC#1, AC#2

**Behavior**: dev-flow 技能内部文档说明新路径模型、新 worktree 策略和 Git 语义；模板反映新模型。

**Files**: `.wopal/skills/dev-flow/SKILL.md`, `.wopal/skills/dev-flow/templates/plan.md`, `.wopal/skills/dev-flow/references/*.md`, `.wopal/skills/dev-flow/tests/**`

**Pre-read**: 本 Plan 的 Key Decisions, phase1 Key Decisions

**Design**:
1. 将路径说明更新为 `projects/<project>/docs/...` 和 `.wopal/docs/...`。
2. 明确 `docs/projects/*` 是 deprecated legacy，不作为新写入目标。
3. 更新 SKILL.md 中 worktree 策略说明（默认隔离、`--no-worktree` 跳过）。
4. 更新 Git 语义说明（approve Plan-only、complete 同仓合并、verify/archive repo-aware）。
5. 更新 templates/plan.md 中的 Worktree metadata 格式。
6. 更新测试断言以匹配新行为。
7. 更新 commands/issue-format references 中的 Plan 路径示例。

**TDD**: false — 文档更新。

**Changes**:
1. 更新文档（路径 + worktree + git 语义）。
2. 更新模板。
3. 更新 references。
4. 更新测试断言。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q
rg -n 'docs/projects/.*/plans|docs/projects/\{project\}|docs/projects/<project>' .wopal/skills/dev-flow -g '*.md' -g '*.py'
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | phase1 完成 | WorktreeContext 是后续 Git 生命周期的基础 |
| 2 | Task 2 | fae | Task 1 | Git 语义风险最高，需在 worktree 模型稳定后改造 |
| 3 | Task 3 | fae | Task 1 | verify-switch 可与 Task 2 并行 |
| 4 | Task 4 | fae | Task 1, 2, 3 | 文档反映最终行为 |

每个 wave 完成后由 Wopal 运行对应 Verify 命令。全部 Task 完成后委派 rook 做 implementation review，重点审查 Git/worktree 操作安全性。
