# refactor-dev-flow-adapt-to-project-level-docs-migration

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-05-28
- **Status**: planning

## Scope Assessment

- **Complexity**: High
- **Confidence**: High

## Goal

将 dev-flow 技能从旧的 `docs/projects/` Plan 存储模型，重构为“Plan 必须归属单个项目，项目文档与项目代码同仓同生命周期”的规范模型，并修正技能内部的 Plan 路径解析、Git 提交/推送、Issue 链接与归档流程。

## Technical Context

### Architecture Context

项目文档已从 `docs/projects/<project>/` 迁移到 `projects/<project>/docs/`，空间级 `docs/projects/<project>` 仅作为过渡软链接。dev-flow 当前仍以旧结构为事实源：

- Plan 创建和查找硬编码 `docs/projects/<project>/plans/`。
- approve/complete/verify/archive 的 Plan 状态变更和归档 Git 操作默认在空间仓库执行。
- Issue 中的 Plan 链接默认指向空间仓库路径。
- implementation commit 与 Plan commit 被分开处理，导致文档状态、Done checkbox、代码变更可能落在不同提交甚至不同仓库。

新结构下，Plan 不再允许作为空间级综合计划存在。每个 Plan 必须归属一个明确项目；跨项目工作必须拆成多个项目 Plan。标准项目的 Plan 属于项目仓库：`projects/<project>/docs/plans/`。Plan 文件、项目文档和项目代码应作为同一个项目仓库的工作产物被查找、提交、推送和链接。

`wopal-space-ontology` 是特殊项目：它的项目实体不是 `projects/wopal-space-ontology/`，而是 workspace 根目录下的 `.wopal/` ontology worktree。因此 ontology 项目的 docs 也应解析为 `.wopal/docs/`，Plan 路径为 `.wopal/docs/plans/`，与 `.wopal/skills/dev-flow/` 等 runtime source 同属 ontology worktree 仓库生命周期。

### Research Findings

- 当前 `scripts/commands/plan.py::_resolve_plan_dir()` 是 Plan 创建入口，仍写入旧路径。
- 当前 `scripts/plan.py::find_plan_by_name()` 与 `find_plan_by_issue()` 依赖旧路径 glob，且不应长期依赖软链接。
- 当前 `scripts/commands/approve.py::_commit_and_push_plan()` 总是在 `workspace_root` 提交/推送 Plan 状态变更。
- 当前 `scripts/commands/complete.py` 先提交项目代码，再更新 Plan 状态为 verifying；新模型下若 Plan 与代码同仓，会导致 Plan 状态变更落在提交之外。
- 当前 `scripts/commands/verify.py` 更新 Plan 状态为 done 后不提交，实际归档前存在未提交状态。
- 当前 `scripts/commands/archive.py::archive_plan_file()` 使用 `workspace_root` 执行 `git ls-files`、`git mv`、`git add`、commit、push；标准项目 Plan 在项目仓库时该逻辑不成立。
- 当前 `scripts/plan.py::update_issue_plan_link()` 假设归档文件相对 `docs/`，并将链接拼成空间仓库 URL。

**参考资料**：
- `.wopal/docs/AGENTS.md`
- `.wopal/skills/dev-flow/SKILL.md`
- `.wopal/skills/dev-flow/scripts/commands/approve.py`
- `.wopal/skills/dev-flow/scripts/commands/complete.py`
- `.wopal/skills/dev-flow/scripts/commands/verify.py`
- `.wopal/skills/dev-flow/scripts/commands/archive.py`
- `.wopal/skills/dev-flow/scripts/plan.py`

### Key Decisions

- D-01: 标准项目 Plan 的规范路径为 `projects/<project>/docs/plans/`，归档路径为 `projects/<project>/docs/plans/done/`。理由：文档与代码同仓，Plan 生命周期随项目仓库演进。
- D-02: dev-flow 不再支持空间级综合 Plan。`--project` 必填且必须解析为一个真实项目；跨项目工作必须拆分为多个项目 Plan。理由：Plan 是项目工作产物，必须随项目代码和项目 docs 同仓演进。
- D-03: 在 dev-flow 技能脚本内引入公共解析层，统一解析 Project Type、Plan 位置、Plan 所属仓库、Target Project 路径、Issue 链接仓库。理由：禁止命令脚本各自拼路径，避免旧结构残留。
- D-04: complete 阶段若 Plan 文件与项目代码在同一仓库，代码变更、Done checkbox、Agent Verification、Plan status=verifying 必须进入同一个提交。理由：实现“文档和代码一体”的提交语义。
- D-05: approve --confirm 阶段允许产生 Plan-only 状态提交。理由：planning → executing 是实施授权边界，发生在代码实现之前。
- D-06: verify --confirm 阶段只更新用户验证状态和 Plan status=done，提交到 Plan 所属仓库；archive 阶段只移动 Plan 到 done/ 并提交归档。理由：用户验证和归档是不同生命周期事件。
- D-07: Issue 仍归属空间仓库；Plan 链接必须指向 Plan 所属项目仓库。理由：Issue 是协调入口，Plan 文件是项目资产。
- D-08: `wopal-space-ontology` 使用 `ontology-worktree` 项目类型：`code_repo_path = .wopal`，`docs_path = .wopal/docs`，`plan_dir = .wopal/docs/plans`。理由：该项目的真实 git 工作树就是 `.wopal/`，不存在对应的 `projects/wopal-space-ontology/` 标准项目。
- D-09: dev-flow 默认使用 worktree 隔离开发；`approve --confirm` 默认创建 worktree，只有用户显式传入 `--no-worktree` 才允许直接在主工作区实施。理由：默认隔离能避免并发任务和遗留变更污染项目主工作区。
- D-10: worktree 是一等核心模型，而不是 Plan metadata 中的裸字符串。理由：后续 complete、verify-switch、archive 都需要基于 worktree 类型、base branch、merge target、验证模式和清理策略做确定性处理。
- D-11: 本次重构先清理测试技术债，再进入 TDD 实施。无意义、非重点、过时、只验证旧 Bash 迁移过程或旧路径模型的测试一律删除；保留测试必须围绕新核心模型和关键生命周期。理由：本次是重要架构重构，旧测试会锁死错误设计并拖慢 TDD。

### Key Interfaces

新增公共路径/仓库解析层，建议位置：`.wopal/skills/dev-flow/scripts/lib/project.py` 或 `.wopal/skills/dev-flow/scripts/lib/plan_location.py`。

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

- `WorktreeContext`
  - `enabled`: 是否使用 worktree
  - `project_type`: `standard | ontology-worktree`
  - `branch`: worktree 分支
  - `path`: worktree 路径
  - `repo_root`: worktree 所属 git repo root
  - `base_branch`: 创建 worktree 时的基线分支
  - `merge_target`: 验证通过后合并回的目标分支
  - `verify_mode`: `direct | switch-runtime | pr`
  - `cleanup_policy`: `archive | pr-opened | manual`

公共函数：

- `resolve_project_context(plan_path | project_name, workspace_root) -> ProjectContext`
- `resolve_plan_dir(project_name, workspace_root) -> Path`（`project_name` 为空或无法解析时必须报错）
- `find_plan(input_ref, workspace_root) -> PlanLocation`
- `resolve_plan_location(plan_path, workspace_root) -> PlanLocation`
- `build_plan_blob_url(plan_location) -> str`
- `resolve_worktree_context(plan_path, project_context, workspace_root) -> WorktreeContext | None`
- `create_worktree_context(plan_path, project_context, workspace_root) -> WorktreeContext`
- `commit_paths(repo_root, paths, message) -> bool`
- `push_repo(repo_root, branch=None) -> bool`

## In Scope

- 将标准项目 Plan 创建/查找路径迁移到 `projects/<project>/docs/plans/`。
- 将 ontology-worktree 项目的 Plan 创建/查找路径解析到 `.wopal/docs/plans/`。
- 禁止创建或查找新的空间级 Plan 路径（包括 `docs/plans/`、`docs/projects/plans/`、`docs/projects/wopal-space/plans/`）。
- 引入公共解析函数，替代各脚本中的硬编码路径拼接。
- 引入 WorktreeContext，并将默认执行策略改为 worktree-first；显式 `--no-worktree` 才直改主工作区。
- 清理 dev-flow 测试套件：删除过时测试、合并重复测试、建立新路径/新 worktree/Git 生命周期测试基线。
- 重构 approve/complete/verify/archive 的 Git 操作，使 Plan 文件在其所属仓库提交和推送。
- 调整 complete 提交流程，使同仓项目的代码变更与 Plan 状态变更同 commit。
- 调整 Issue 相关 Plan 链接，指向项目仓库中的 Plan 文件。
- 更新 dev-flow 文档、模板和测试断言。
- 保留旧 `docs/projects/*` 软链接作为短期兼容读路径，但新写入不再使用旧路径。

## Out of Scope

- 不移除 `docs/projects/*` 软链接；软链接移除属于后续迁移收尾。
- 不重写历史 Plan 链接；只保证新同步和归档后的链接正确。
- 不改变 GitHub Issue 归属；Issue 仍在对应项目配置的 Issue 仓库中承载协调状态。
- 不改变 wsf 系列工作流；本 Plan 仅覆盖 dev-flow 技能。
- 不修改 `.wopal/AGENTS.md`、`.wopal/rules/`、`.wopal/commands/`、`.wopal/plugins/` 等 dev-flow 技能外文件；这些路径引用由独立小改动处理。

## Business Rules Impact

N/A — 无业务规则变更。本次为 dev-flow 工程工作流重构，不引入业务约束。

### 同步确认
- [ ] N/A — 无业务规则变更，无需同步 `BUSINESS_RULES.md`

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| Path model | `.wopal/skills/dev-flow/scripts/lib/project.py` 或 `lib/plan_location.py` | 创建 | 统一解析项目、文档、Plan、repo、blob URL |
| Worktree model | `.wopal/skills/dev-flow/scripts/lib/worktree.py`, 新增/扩展 resolver 文件 | 修改/创建 | 建模 WorktreeContext，统一创建、解析、合并、清理 |
| Plan core | `.wopal/skills/dev-flow/scripts/plan.py` | 修改 | Plan 查找、链接、commit message 入口适配新位置 |
| plan command | `.wopal/skills/dev-flow/scripts/commands/plan.py` | 修改 | 新 Plan 写入项目 docs 仓库 |
| approve command | `.wopal/skills/dev-flow/scripts/commands/approve.py` | 修改 | 默认创建 worktree，Plan 状态提交到 Plan 所属 repo |
| complete command | `.wopal/skills/dev-flow/scripts/commands/complete.py` | 修改 | 同仓合并提交代码与 Plan 状态 |
| verify command | `.wopal/skills/dev-flow/scripts/commands/verify.py` | 修改 | done 状态提交到 Plan 所属 repo |
| archive command | `.wopal/skills/dev-flow/scripts/commands/archive.py` | 修改 | 在 Plan 所属 repo 中 git mv/add/commit/push |
| verify switch | `.wopal/skills/dev-flow/scripts/commands/verify_switch.py` | 修改 | 基于 WorktreeContext 处理 ontology runtime 验证切换 |
| query/sync | `.wopal/skills/dev-flow/scripts/commands/query.py`, `sync.py` | 修改 | 列表与同步查找新路径 |
| docs | `.wopal/skills/dev-flow/SKILL.md`, `.wopal/skills/dev-flow/references/*.md`, `.wopal/skills/dev-flow/templates/plan.md` | 修改 | 更新技能内部路径规则与工作流说明 |
| tests | `.wopal/skills/dev-flow/tests/**` | 删除/修改/新增 | 清理旧测试债，重建新模型 TDD 测试基线 |

## Acceptance Criteria

### Agent Verification

1. [ ] `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q` 全部 pass
2. [ ] `cd .wopal/skills/dev-flow && python -m pytest tests/python/integration -q` 全部 pass 或记录需外部 gh/git 环境的跳过项
3. [ ] `rg -n 'docs/projects/.*/plans|docs/projects/plans' .wopal/skills/dev-flow -g '*.py' -g '*.md'` 仅剩兼容说明或测试 fixture 中明确标注的 legacy case
4. [ ] `cd .wopal/skills/dev-flow && bash scripts/flow.sh plan --title "test(dev-flow): path smoke" --project wopal-space-ontology --type test --scope dev-flow` 在 `.wopal/docs/plans/` 创建/定位 Plan
5. [ ] 对一个临时 fixture repo 验证：complete 阶段在 Plan 与代码同仓时产生单一提交，且提交同时包含代码文件与 Plan status=verifying
6. [ ] 对一个临时 fixture repo 验证：archive 阶段在 Plan 所属 repo 内完成 `plans/<name>.md` → `plans/done/<date>-<name>.md` 的 git move/commit
7. [ ] Issue body 中 Plan URL 指向 Plan 所属项目 repo 的真实路径：标准项目为 `projects/<project>/docs/plans/...` 所属 repo，ontology-worktree 为 `.wopal/docs/plans/...` 所属 repo，而不是空间仓库软链接路径
8. [ ] `flow.sh approve <plan> --confirm` 默认创建 Worktree metadata；`flow.sh approve <plan> --confirm --no-worktree` 才不创建 worktree
9. [ ] Worktree metadata 至少包含 branch、path、base branch、merge target、verify mode，后续 complete/verify-switch/archive 均通过 WorktreeContext 读取
10. [ ] 测试清理完成后，`tests/python/COVERAGE.md` 被删除或重写为当前测试索引，不再保留 Bash→Python 迁移矩阵的 pending 历史状态
11. [ ] `rg -n 'docs/projects|FLOW_BIN|legacy-only|Bash → Python|wopal-space/plans' .wopal/skills/dev-flow/tests` 仅剩显式命名的 legacy recovery 测试或无匹配

### User Validation

#### Scenario 1: 使用 dev-flow 创建项目 Plan
- Goal: 用户能感知到新 Plan 不再写入空间级 `docs/projects/`，而是写入项目仓库 docs。
- Precondition: dev-flow 修改完成并重启 ellamaka。
- User Actions:
  1. 对任一标准项目执行 `flow.sh plan --title ... --project <project> --type ...`。
  2. 查看输出 Plan 路径。
- Expected Result: 输出路径为 `projects/<project>/docs/plans/<plan>.md`。

#### Scenario 2: 使用 dev-flow 创建 ontology-worktree Plan
- Goal: 用户能确认 `wopal-space-ontology` 不被解析为不存在的 `projects/wopal-space-ontology/`。
- Precondition: dev-flow 修改完成并重启 ellamaka。
- User Actions:
  1. 执行 `flow.sh plan --title ... --project wopal-space-ontology --type ...`。
  2. 查看输出 Plan 路径。
- Expected Result: 输出路径为 `.wopal/docs/plans/<plan>.md`。

#### Scenario 3: 完成一个项目任务后查看 git 提交
- Goal: 用户能确认代码变更与 Plan 状态记录同仓、同生命周期。
- Precondition: 有一个小型 dev-flow Plan 处于 executing。
- User Actions:
  1. 完成实现并运行 `flow.sh complete <plan>`。
  2. 查看项目仓库最新 commit。
- Expected Result: 最新 commit 同时包含项目代码变更和 Plan 中 Done/status=verifying 的变更。

#### Scenario 4: 默认 worktree 隔离开发
- Goal: 用户能确认 dev-flow 默认不会污染项目主工作区。
- Precondition: 有一个 planning 状态 Plan。
- User Actions:
  1. 执行 `flow.sh approve <plan> --confirm`。
  2. 查看 Plan metadata 和 `.worktrees/`。
- Expected Result: dev-flow 创建 worktree，并在 Plan 中记录完整 Worktree metadata；只有显式 `--no-worktree` 才跳过隔离。

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Clean and reset the dev-flow test suite baseline

**Verification Intent**: AC#1, AC#10, AC#11

**Behavior**: 测试套件只保留能约束新架构的测试；删除旧 Bash 迁移残留、旧路径模型断言、重复覆盖、过宽且与本次核心无关的测试。清理完成后再开始后续 TDD。

**Files**: `.wopal/skills/dev-flow/tests/**`

**Pre-read**: `.wopal/skills/dev-flow/tests/python/COVERAGE.md`, `.wopal/skills/dev-flow/tests/python/unit/*`, `.wopal/skills/dev-flow/tests/python/integration/*`

**Design**:
1. 删除或重写 `tests/python/COVERAGE.md`：它当前是 2026-04-22 Bash→Python 迁移矩阵，状态大量 `pending`，不再代表当前测试真相。
2. 删除旧 `docs/projects` 路径绑定测试，改由新 resolver/link 测试覆盖。
3. 删除 Bash 兼容/迁移专用测试信号，例如 `FLOW_BIN` 双入口、`legacy-only`、函数存在性等非 Python 架构行为。
4. 合并重复覆盖：User Validation、Issue body/link、archive plan link 等相近测试保留最小关键路径。
5. 保留并强化核心测试类别：ProjectContext/PlanLocation、WorktreeContext、Plan discovery、repo-aware commit/push、Issue link、archive move、validation gates。
6. 形成测试清理清单：每个删除的测试必须有一句删除理由，记录在 Plan 或 commit body 中。

**TDD**: false — 这是测试债清理与测试基线重置，后续 Task 才按 TDD 编写新测试。

**Changes**:
1. 删除无意义、非重点、过时测试文件。
2. 合并重复测试为更小的单元测试。
3. 为后续 TDD 留出明确测试文件位置和命名。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q && rg -n 'docs/projects|FLOW_BIN|legacy-only|Bash → Python|wopal-space/plans' tests`

**Done**:
任务产出：dev-flow 测试套件完成技术债清理，后续 TDD 不再受旧设计测试约束。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: Build shared project and Plan location resolver

**Verification Intent**: AC#1, AC#3

**Behavior**: dev-flow 所有命令通过公共解析层获取项目路径、文档路径、Plan repo、代码 repo 和 GitHub blob URL，不再自行拼接 `docs/projects/*`。

**Files**: `.wopal/skills/dev-flow/scripts/lib/project.py` 或 `.wopal/skills/dev-flow/scripts/lib/plan_location.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Pre-read**: Task 1 清理后的测试基线, `.wopal/skills/dev-flow/scripts/lib/workspace.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Design**:
1. 新增 `ProjectContext` 与 `PlanLocation` 数据结构。
2. 标准项目解析为 `projects/<project>` 与 `projects/<project>/docs`。
3. ontology-worktree 的代码路径和 docs repo 均解析为 `.wopal`，文档路径解析为 `.wopal/docs`。
4. 当输入缺少 project、project 无法解析、或 project 为废弃的 `wopal-space` 综合项目名时，resolver 必须失败并提示“跨项目工作请拆分为多个项目 Plan”。
5. 提供统一 blob URL 构造函数，基于 Plan 所属 repo root 和 repo-relative path。

**TDD**: true

**Changes**:
1. 为标准项目、ontology-worktree、缺失 project、废弃 `wopal-space` 综合项目名编写 resolver 单元测试。
2. 实现 resolver。
3. 将 `build_plan_link_for_issue()`、`update_issue_plan_link()` 改为使用 `PlanLocation`。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q`

**Done**:
任务产出：公共解析层可稳定解析新文档结构和 Plan 所属仓库。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: Migrate Plan creation, lookup, query and sync to the new paths

**Verification Intent**: AC#1, AC#3, AC#4

**Behavior**: 新 Plan 写入 `projects/<project>/docs/plans/`；Plan 查找、列表、同步优先使用新路径，仅保留 legacy 读兼容。

**Files**: `.wopal/skills/dev-flow/scripts/commands/plan.py`, `.wopal/skills/dev-flow/scripts/plan.py`, `.wopal/skills/dev-flow/scripts/commands/query.py`, `.wopal/skills/dev-flow/scripts/commands/sync.py`

**Pre-read**: Task 2 产出的 resolver 文件

**Design**:
1. `_resolve_plan_dir()` 改为调用公共 resolver。
2. `find_plan_by_name()` 和 `find_plan_by_issue()` 搜索新路径：`projects/*/docs/plans`、`projects/*/docs/plans/done`、`.wopal/docs/plans`、`.wopal/docs/plans/done`。
3. 旧路径仅作为 fallback read path，并在代码注释中标注 legacy compatibility。
4. query/sync 共享同一 Plan discovery 函数，避免重复 glob。
5. 移除 `docs/plans`、`docs/projects/plans`、`docs/projects/wopal-space/plans` 的新流程支持；如需 legacy read compatibility，必须显式标注为 deprecated，且不得作为创建目标。

**TDD**: true

**Changes**:
1. 增加新路径查找测试。
2. 修改创建和查找实现。
3. 修改 query/sync 调用统一 discovery。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q && bash scripts/flow.sh plan --title "test(dev-flow): path smoke" --project wopal-space-ontology --type test --scope dev-flow`

**Done**:
任务产出：Plan 创建、查找、列表和同步均使用新项目文档路径。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 4: Model WorktreeContext and make worktree the default execution mode

**Verification Intent**: AC#1, AC#8, AC#9

**Behavior**: dev-flow 默认通过 worktree 隔离执行；Plan 中记录结构化 Worktree metadata；后续 complete、verify-switch、archive 通过 WorktreeContext 解析并处理 worktree 生命周期。

**Files**: `.wopal/skills/dev-flow/scripts/lib/worktree.py`, `.wopal/skills/dev-flow/scripts/commands/approve.py`, `.wopal/skills/dev-flow/scripts/commands/complete.py`, `.wopal/skills/dev-flow/scripts/commands/verify_switch.py`, `.wopal/skills/dev-flow/scripts/commands/archive.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Pre-read**: Task 2 resolver, `.wopal/skills/dev-flow/scripts/lib/worktree.py`, `.wopal/skills/dev-flow/scripts/commands/verify_switch.py`

**Design**:
1. 新增 `WorktreeContext`，字段包括 branch、path、repo_root、base_branch、merge_target、verify_mode、cleanup_policy。
2. `approve --confirm` 默认等价于旧 `approve --confirm --worktree`。
3. 新增 `--no-worktree` 参数，作为唯一跳过隔离开发的显式入口。
4. 标准项目 worktree：`verify_mode = direct`，archive 阶段 merge/cleanup。
5. ontology-worktree worktree：`verify_mode = switch-runtime`，verify-switch 阶段将 `.wopal` 切到 feature 分支供用户验证，验证通过后合并回 base branch。
6. Plan metadata 从单行 `Worktree: branch | path` 升级为结构化字段；保留 legacy parser 读取旧单行格式。
7. archive 不再通过 `.worktrees/<project>-issue-*` 猜测 worktree；只在 WorktreeContext 缺失时作为 legacy recovery。

**TDD**: true

**Changes**:
1. 为默认 worktree、显式 `--no-worktree`、标准项目 merge、ontology switch-runtime 编写测试。
2. 实现 WorktreeContext parser/writer。
3. 改造 approve 默认行为和 CLI 参数。
4. 改造 complete/verify-switch/archive 使用 WorktreeContext。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q && python -m pytest tests/python/integration -q`

**Done**:
任务产出：worktree 成为 dev-flow 默认执行模型，并由结构化上下文驱动后续生命周期。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 5: Redesign Git commit/push semantics around Plan ownership

**Verification Intent**: AC#1, AC#5, AC#6

**Behavior**: Plan 文件在其所属 repo 中提交；同仓项目 complete 时，代码变更和 Plan 状态变更进入同一个提交；archive 在 Plan 所属 repo 内执行 git mv/commit/push。

**Files**: `.wopal/skills/dev-flow/scripts/commands/approve.py`, `.wopal/skills/dev-flow/scripts/commands/complete.py`, `.wopal/skills/dev-flow/scripts/commands/verify.py`, `.wopal/skills/dev-flow/scripts/commands/archive.py`, `.wopal/skills/dev-flow/scripts/lib/git.py`, `.wopal/skills/dev-flow/scripts/plan.py`

**Pre-read**: `.wopal/skills/dev-flow/scripts/lib/git.py`, Task 2 resolver, Task 4 WorktreeContext

**Design**:
1. approve --confirm:
   - 更新 Plan status=executing。
   - 提交 Plan 文件到 `PlanLocation.repo_root`。
   - 如需 push，推送 Plan 所属 repo 当前分支。
2. complete:
   - 先完成 gate 校验。
   - 更新 Plan status=verifying。
   - 若 `PlanLocation.repo_root == code_repo_path`，一次提交包含代码变更和 Plan 变更。
   - 若不同仓，分别提交代码 repo 与 Plan repo，并在日志中清晰说明两个提交。
3. verify --confirm:
   - 校验用户 validation checkbox。
   - 更新 Plan status=done。
   - 提交 Plan 文件到 Plan 所属 repo，不在 archive 阶段才补提交。
4. archive:
   - 使用 Plan 所属 repo 的相对路径执行 `git mv`。
   - 归档提交发生在 Plan 所属 repo。
   - push 目标为 Plan 所属 repo 当前分支或默认分支。
5. ontology-worktree 项目中，runtime source 与 Plan docs 均在 `.wopal` 仓库内；complete 阶段应将 `.wopal/skills/...` 代码变更与 `.wopal/docs/plans/...` Plan 状态变更纳入同一个 ontology worktree commit。

**TDD**: true

**Changes**:
1. 增加 fixture 测试覆盖 Plan repo 与 code repo 相同/不同两种场景。
2. 改造 approve 的 `_commit_and_push_plan()` 为 repo-aware。
3. 改造 complete 的提交顺序，确保状态更新先于 commit。
4. 改造 verify 和 archive 的提交/移动逻辑。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit -q && python -m pytest tests/python/integration -q`

**Done**:
任务产出：dev-flow Git 操作以 Plan 所属仓库为核心，并支持文档代码同仓提交。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 6: Fix Issue links and GitHub repo resolution

**Verification Intent**: AC#1, AC#7

**Behavior**: Issue body 中的 Plan 链接指向 Plan 实际所属 GitHub repo 和 repo-relative path，不再默认指向空间仓库 `docs/projects/*`。

**Files**: `.wopal/skills/dev-flow/scripts/issue.py`, `.wopal/skills/dev-flow/scripts/plan.py`, `.wopal/skills/dev-flow/scripts/commands/sync.py`, `.wopal/skills/dev-flow/scripts/commands/archive.py`

**Pre-read**: Task 2 resolver

**Design**:
1. `build_repo_blob_url()` 支持传入 branch，默认从 repo resolver 获取。
2. Plan link 使用 `PlanLocation.github_repo` 和 `repo_relative_path`。
3. Issue status/labels 仍使用空间仓库 Issue repo；Plan blob URL 使用 Plan repo。两者不能混用。
4. archive 后更新 Issue 中 Plan URL 到 archived Plan 的项目仓库路径。

**TDD**: true

**Changes**:
1. 更新 Plan link contract 测试。
2. 改造 build/update link 函数。
3. 覆盖 active Plan 与 archived Plan 两种链接。

**Verify**:
`cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_plan_link_contract.py tests/python/integration/test_related_resources_links.py -q`

**Done**:
任务产出：Issue 中 Plan 链接准确指向项目仓库中的 Plan 文件。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 7: Update dev-flow docs, templates and tests for the new model

**Verification Intent**: AC#1, AC#2, AC#3

**Behavior**: dev-flow 技能内部文档说明新路径、新提交语义和同仓模型；模板不再引导 agent 读取旧路径。

**Files**: `.wopal/skills/dev-flow/SKILL.md`, `.wopal/skills/dev-flow/templates/plan.md`, `.wopal/skills/dev-flow/references/*.md`, `.wopal/skills/dev-flow/tests/**`

**Pre-read**: 本 Plan 的 Key Decisions

**Design**:
1. 将路径说明更新为 `projects/<project>/docs/...`。
2. 明确 `docs/projects/*` 是 legacy compatibility，不作为新写入目标。
3. 文档中补充 Git 语义：approve 可 Plan-only，complete 同仓合并提交，verify/ archive 分别提交状态与归档。
4. 更新测试 fixture 中旧路径断言；必要时保留 legacy fixture 并显式命名。

**TDD**: false — 文档与 fixture 更新，验证通过 rg 与现有测试完成。

**Changes**:
1. 更新 dev-flow 技能说明。
2. 更新模板中的 BUSINESS_RULES 路径。
3. 更新 commands/issue-format/troubleshooting references。
4. 更新测试断言。

**Verify**:
`rg -n 'docs/projects/.*/plans|docs/projects/\{project\}|docs/projects/<project>' .wopal/skills/dev-flow -g '*.md' -g '*.py'`

**Done**:
任务产出：dev-flow 技能内部文档、模板和测试均表达新项目文档结构。
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 先清理测试债，避免旧测试锁死错误设计 |
| 2 | Task 2 | fae | Task 1 | 建立公共抽象，后续任务依赖 |
| 3 | Task 3 | fae | Task 2 | 路径迁移与发现逻辑集中改造 |
| 3 | Task 6 | fae | Task 2 | 链接生成可与路径迁移并行 |
| 4 | Task 4 | fae | Task 2, Task 3 | worktree 默认策略影响后续 Git 生命周期 |
| 5 | Task 5 | fae | Task 2, Task 3, Task 4 | Git 语义风险最高，需在路径与 worktree 模型稳定后改造 |
| 6 | Task 7 | fae | Task 1-6 | 文档和测试应反映最终行为 |

每个 wave 完成后由 Wopal 运行对应 Verify 命令；Task 5 完成后必须委派 rook 做 implementation review，重点审查 Git/worktree 操作是否会误提交、误 push、跨仓错位或错误合并。
