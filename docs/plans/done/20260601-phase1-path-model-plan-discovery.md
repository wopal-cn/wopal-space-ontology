# phase1-path-model-plan-discovery

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-05-28
- **Status**: done
- **Sequel**: phase2-worktree-git-lifecycle

## Scope Assessment

- **Complexity**: Medium-High
- **Confidence**: High

## Goal

将 dev-flow 技能的 Plan 路径模型从旧的 `docs/projects/` 迁移到"Plan 归属单个项目，与项目代码/文档同仓"的新模型。具体交付：(1) 公共解析层统一项目路径与 Plan 位置；(2) Plan 创建/查找迁移到新路径；(3) Issue Plan 链接指向正确的项目 repo；(4) 清理旧测试债，建立新 TDD 基线。

本 Plan 不涉及 worktree 默认策略、Git 提交语义重构、archive 归档流程改造——这些由 sequel Plan 处理。

## Technical Context

### Architecture Context

项目文档已从 `docs/projects/<project>/` 迁移到 `projects/<project>/docs/`，空间级 `docs/projects/<project>` 仅作为过渡软链接。dev-flow 当前仍以旧结构为事实源：

- Plan 创建和查找硬编码 `docs/projects/<project>/plans/`。
- approve/complete/verify/archive 的 Plan 状态变更和归档 Git 操作默认在空间仓库执行。
- Issue 中的 Plan 链接默认指向空间仓库路径。

新结构下，Plan 必须归属一个明确项目。标准项目的 Plan 属于项目仓库：`projects/<project>/docs/plans/`。`wopal-space-ontology` 的 Plan 属于 ontology worktree：`.wopal/docs/plans/`。

### Research Findings

- 当前 `scripts/commands/plan.py::_resolve_plan_dir()` 仍写入旧路径。
- 当前 `scripts/plan.py::find_plan_by_name()` 与 `find_plan_by_issue()` 依赖旧路径 glob。
- 当前 `scripts/plan.py::update_issue_plan_link()` 假设链接指向空间仓库。
- 当前 `scripts/commands/query.py` 和 `sync.py` 依赖旧路径。

**参考资料**：
- `.wopal/skills/dev-flow/scripts/commands/plan.py`
- `.wopal/skills/dev-flow/scripts/plan.py`
- `.wopal/skills/dev-flow/scripts/commands/query.py`
- `.wopal/skills/dev-flow/scripts/commands/sync.py`
- `.wopal/skills/dev-flow/scripts/lib/workspace.py`

### Key Decisions

- D-01: 标准项目 Plan 的规范路径为 `projects/<project>/docs/plans/`。
- D-02: dev-flow 不再支持空间级综合 Plan。`--project` 必填且必须解析为一个真实项目；跨项目工作必须拆分为多个项目 Plan。
- D-03: 引入公共解析层（ProjectContext / PlanLocation），统一解析项目类型、Plan 位置、所属仓库、GitHub blob URL。
- D-04: `wopal-space-ontology` 使用 `ontology-worktree` 项目类型：`code_repo_path = .wopal`，`docs_path = .wopal/docs`，`plan_dir = .wopal/docs/plans`。
- D-05: 旧路径 `docs/projects/<project>/plans/` 仅作为 **deprecated read-only fallback** 保留，新写入一律禁止。fallback 在代码中标注 `# DEPRECATED: legacy read-only compatibility`，且必须在 resolver 函数 docstring 中注明移除计划。
- D-06: Issue 仍归属空间仓库；Plan 链接必须指向 Plan 所属项目仓库的 blob URL。

### Key Interfaces

新增公共路径/仓库解析层，建议位置：`.wopal/skills/dev-flow/scripts/lib/project.py`。

核心数据结构：

- `ProjectContext`
  - `name`: Target Project 名称
  - `type`: `standard | ontology-worktree`
  - `project_path`: 项目代码仓库路径；标准项目为 `projects/<name>`，ontology-worktree 为 `.wopal`
  - `docs_path`: 项目文档路径；标准项目为 `projects/<name>/docs`，ontology-worktree 为 `.wopal/docs`
  - `docs_repo_path`: 文档所属 git repo root
  - `code_repo_path`: 代码所属 git repo root
  - `repo_slug`: GitHub owner/repo
  - `default_branch`: 默认分支

- `PlanLocation`
  - `path`: Plan 绝对路径
  - `repo_root`: Plan 所属 git repo root
  - `repo_relative_path`: Plan 在所属 repo 内的相对路径
  - `github_repo`: Plan 所属 GitHub repo
  - `branch`: blob URL 使用的分支
  - `is_archived`: 是否在 `plans/done/`

公共函数：

- `resolve_project_context(project_name, workspace_root) -> ProjectContext`
- `resolve_plan_dir(project_name, workspace_root) -> Path`
- `find_plan(input_ref, workspace_root) -> PlanLocation`
- `resolve_plan_location(plan_path, workspace_root) -> PlanLocation`
- `build_plan_blob_url(plan_location) -> str`

## In Scope

- 清理 dev-flow 测试套件旧债。
- 引入 ProjectContext / PlanLocation 公共解析层。
- 将 Plan 创建/查找/列表/同步迁移到新路径。
- 修正 Issue Plan 链接生成，指向项目仓库 blob URL。
- 禁止新写入旧路径（`docs/plans/`、`docs/projects/plans/`、`docs/projects/wopal-space/plans/`）。
- 保留旧路径的 **deprecated read-only fallback**，明确标注移除计划。
- 清理旧测试债，建立新 TDD 基线。

## Out of Scope

- worktree 默认策略和 WorktreeContext 模型（sequel Plan）。
- Git 提交/推送语义重构：同仓合并提交、repo-aware commit（sequel Plan）。
- archive 归档流程改造（sequel Plan）。
- 不移除 `docs/projects/*` 软链接。
- 不修改 `.wopal/AGENTS.md`、`.wopal/rules/`、`.wopal/commands/` 等 dev-flow 技能外文件。
- 不更新 dev-flow 内部文档/模板（由 sequel Plan 收尾）。

## Business Rules Impact

N/A — 无业务规则变更。本次为 dev-flow 工程工作流重构。

### 同步确认
- [ ] N/A — 无业务规则变更，无需同步

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Path model | `.wopal/skills/dev-flow/scripts/lib/project.py` | 创建 | 统一解析项目、文档、Plan、repo、blob URL |
| Plan core | `.wopal/skills/dev-flow/scripts/plan.py` | 修改 | Plan 查找、链接入口适配新位置 |
| plan command | `.wopal/skills/dev-flow/scripts/commands/plan.py` | 修改 | 新 Plan 写入项目 docs 仓库 |
| query/sync | `.wopal/skills/dev-flow/scripts/commands/query.py`, `sync.py` | 修改 | 列表与同步查找新路径 |
| tests | `.wopal/skills/dev-flow/tests/**` | 删除/修改/新增 | 清理旧测试债，重建新模型 TDD 测试基线 |

## Acceptance Criteria

### Agent Verification

1. [x] `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q` 全部 pass
2. [x] `rg -n 'docs/projects/.*/plans|docs/projects/plans' .wopal/skills/dev-flow/scripts -g '*.py'` 仅剩标注 `DEPRECATED` 的 fallback read 代码
3. [x] `flow.sh plan --title "test(dev-flow): path smoke" --project wopal-space-ontology --type test --scope dev-flow` 在 `.wopal/docs/plans/` 创建/定位 Plan
4. [x] `flow.sh plan --title "test(dev-flow): standard path" --project gesp --type test --scope dev-flow` 在 `projects/gesp/docs/plans/` 创建/定位 Plan
5. [x] `flow.sh plan --title "test(dev-flow): no project" --type test` 报错提示 project 必填
6. [x] Issue body 中 Plan URL 指向 Plan 所属项目 repo 的真实路径（非空间仓库软链接路径）
7. [x] 测试清理完成后，`tests/python/COVERAGE.md` 被删除或重写为当前测试索引

### User Validation

#### Scenario 1: 标准项目 Plan 路径
- Goal: 确认新 Plan 写入项目仓库 docs
- User Actions: 对任一标准项目执行 `flow.sh plan --title ... --project <project> --type ...`
- Expected Result: 输出路径为 `projects/<project>/docs/plans/<plan>.md`

#### Scenario 2: ontology-worktree Plan 路径
- Goal: 确认 `wopal-space-ontology` 解析到 `.wopal/docs/plans/`
- User Actions: `flow.sh plan --title ... --project wopal-space-ontology --type ...`
- Expected Result: 输出路径为 `.wopal/docs/plans/<plan>.md`

#### Scenario 3: Issue 链接正确性
- Goal: 确认 Issue 中 Plan URL 指向正确 repo
- User Actions: 创建 Plan 并同步到 Issue，查看 Issue body 中的 Plan URL
- Expected Result: URL 指向项目仓库（如 `github.com/sampx/gesp/blob/main/docs/plans/...`），而非空间仓库

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Clean and reset the dev-flow test suite baseline

**Verification Intent**: AC#1, AC#7

**Behavior**: 测试套件只保留能约束新架构的测试；删除旧 Bash 迁移残留、旧路径模型断言、重复覆盖、过宽且与核心无关的测试。

**Files**: `.wopal/skills/dev-flow/tests/**`

**Pre-read**: `.wopal/skills/dev-flow/tests/python/COVERAGE.md`, `.wopal/skills/dev-flow/tests/python/unit/*`, `.wopal/skills/dev-flow/tests/python/integration/*`

**Design**:
1. 删除或重写 `tests/python/COVERAGE.md`：它当前是 Bash→Python 迁移矩阵，状态大量 `pending`，不再代表当前测试真相。
2. 删除旧 `docs/projects` 路径绑定测试，改由新 resolver 测试覆盖。
3. 删除 Bash 兼容/迁移专用测试信号（`FLOW_BIN`、`legacy-only`、函数存在性等）。
4. 合并重复覆盖：保留最小关键路径。
5. 保留并强化核心测试类别：ProjectContext/PlanLocation、Plan discovery、Issue link。
6. 形成测试清理清单：每个删除的测试必须有一句删除理由，记录在 commit body 中。

**TDD**: false — 测试债清理与基线重置。

**Changes**:
1. 删除无意义、非重点、过时测试文件。
2. 合并重复测试为更小的单元测试。
3. 为后续 TDD 留出明确测试文件位置和命名。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q
rg -n 'docs/projects|FLOW_BIN|legacy-only|Bash → Python|wopal-space/plans' tests
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 2: Build shared project and Plan location resolver

**Verification Intent**: AC#1, AC#2

**Behavior**: dev-flow 所有命令通过公共解析层获取项目路径、文档路径、Plan repo、代码 repo 和 GitHub blob URL。

**Files**: `.wopal/skills/dev-flow/scripts/lib/project.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Pre-read**: `.wopal/skills/dev-flow/scripts/lib/workspace.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Design**:
1. 新增 `ProjectContext` 与 `PlanLocation` 数据结构。
2. 标准项目解析为 `projects/<project>` 与 `projects/<project>/docs`。
3. ontology-worktree 解析为 `.wopal` 与 `.wopal/docs`。
4. 当输入缺少 project、project 无法解析、或 project 为废弃的 `wopal-space` 时，resolver 必须失败并提示"跨项目工作请拆分为多个项目 Plan"。
5. 提供统一 blob URL 构造函数。
6. 旧路径 fallback read 必须标注 `# DEPRECATED: legacy read-only compatibility`。

**Fixture safety**: 所有测试使用 `tmp_path` pytest fixture 创建临时目录结构，不修改真实 workspace 或项目仓库。

**TDD**: true

**Changes**:
1. 为标准项目、ontology-worktree、缺失 project、废弃 `wopal-space` 编写 resolver 单元测试。
2. 实现 resolver。
3. 将 `build_plan_link_for_issue()`、`update_issue_plan_link()` 改为使用 `PlanLocation`。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_project_resolver.py -v
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 3: Migrate Plan creation, lookup, query and sync to the new paths

**Verification Intent**: AC#1, AC#3, AC#4, AC#5

**Behavior**: 新 Plan 写入 `projects/<project>/docs/plans/` 或 `.wopal/docs/plans/`；Plan 查找、列表、同步使用新路径；旧路径仅作为 deprecated read-only fallback。

**Files**: `.wopal/skills/dev-flow/scripts/commands/plan.py`, `.wopal/skills/dev-flow/scripts/plan.py`, `.wopal/skills/dev-flow/scripts/commands/query.py`, `.wopal/skills/dev-flow/scripts/commands/sync.py`

**Pre-read**: Task 2 resolver

**Design**:
1. `_resolve_plan_dir()` 改为调用 `resolve_plan_dir()`。
2. `find_plan_by_name()` 和 `find_plan_by_issue()` 搜索新路径，旧路径作为 deprecated fallback read。
3. query/sync 共享同一 Plan discovery 函数。
4. 移除 `docs/plans`、`docs/projects/plans`、`docs/projects/wopal-space/plans` 的新流程写入支持。
5. deprecated fallback 必须标注移除计划，不得作为创建目标。

**Fixture safety**: 所有测试使用 `tmp_path` 创建隔离的临时 workspace 目录（含 `projects/<name>/docs/plans/` 和 `.wopal/docs/plans/` 结构），不修改真实文件系统。flow.sh verify 使用 `--dry-run` 或 `--scope dev-flow` 避免创建真实 Plan。

**TDD**: true

**Changes**:
1. 增加新路径查找测试（标准项目 + ontology-worktree）。
2. 增加 deprecated fallback read 测试（确认只读不写）。
3. 修改创建和查找实现。
4. 修改 query/sync 调用统一 discovery。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q
cd .wopal/skills/dev-flow && bash scripts/flow.sh plan --title "test(dev-flow): path smoke" --project wopal-space-ontology --type test --scope dev-flow
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

---

### Task 4: Fix Issue Plan links and GitHub repo resolution

**Verification Intent**: AC#1, AC#6

**Behavior**: Issue body 中的 Plan 链接指向 Plan 实际所属 GitHub repo 和 repo-relative path，不再默认指向空间仓库。

**Files**: `.wopal/skills/dev-flow/scripts/issue.py`, `.wopal/skills/dev-flow/scripts/plan.py`, `.wopal/skills/dev-flow/scripts/commands/sync.py`

**Pre-read**: Task 2 resolver

**Design**:
1. `build_plan_blob_url()` 使用 `PlanLocation.github_repo` 和 `repo_relative_path`，支持传入 branch。
2. Issue status/labels 仍使用空间仓库 Issue repo；Plan blob URL 使用 Plan repo。两者不能混用。
3. active Plan 和 archived Plan 链接均指向 Plan 所属项目 repo。

**Fixture safety**: 使用 `tmp_path` 创建包含 mock `.git` 目录的 fixture workspace，模拟 `git remote` 输出和 repo slug 解析。不访问真实 GitHub API，不修改真实 repo。

**TDD**: true

**Changes**:
1. 更新 Plan link contract 测试（active + archived 两种场景）。
2. 改造 `build_plan_link_for_issue()` 和 `update_issue_plan_link()`。

**Verify**:
```bash
cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_plan_link_contract.py -v
cd .wopal/skills/dev-flow && python -m pytest tests/python/integration/test_related_resources_links.py -v -k "plan_link"
```

**Done**:
- [x] 实施 Agent 已完成功能开发和验证，确认结果符合预期

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 先清理测试债，避免旧测试锁死错误设计 |
| 2 | Task 2 | fae | Task 1 | 建立公共抽象，后续任务依赖 |
| 3 | Task 3 | fae | Task 2 | 路径迁移与发现逻辑 |
| 3 | Task 4 | fae | Task 2 | 链接修正可与路径迁移并行 |

每个 wave 完成后由 Wopal 运行对应 Verify 命令。全部 Task 完成后委派 rook 做 implementation review。
