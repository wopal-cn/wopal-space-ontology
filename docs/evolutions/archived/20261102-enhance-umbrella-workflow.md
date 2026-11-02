# enhance-umbrella-workflow

## Metadata

- **Type**: enhance
- **Project Path**: .wopal
- **Created**: 2026-10-29
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-enhance-umbrella-workflow
- **Branch**: ontology-enhance-umbrella-workflow
- **Base Commit**: 1f0753c765e657d30674a089a474b10fa451a829
- **Final Commit**: 4000260d387cd110e665739b2207d67e4dafb5c2

## Scope Assessment

- **Complexity**: High
- **Confidence**: High — 现有 dev-flow 的普通 Plan 生命周期可以保留；主要变化集中在 Issue 项目标签、Issue 合并、伞型 Plan 和少量生命周期门槛。

## Goal

让 dev-flow 能自然处理现实中的复杂需求，同时保持普通工作流简单：

1. Issue 可以暂时不知道项目，也可以同时涉及多个项目。
2. 多个 Issue 如果实际是一件事，可以先合并成一个伞型 Issue，再由一个 Plan 实施。
3. 一个目标如果需要多个 Plan，可以建立伞型 Plan，再拆成多个普通 Plan；伞型 Plan 可以跨项目，也可以没有 Issue。
4. 普通 Plan 继续保持简单：最多关联一个 Issue，并且只属于一个项目。

本提案不再让一个普通 Plan 同时管理多个 Issue，也不再要求每个生命周期命令批量同步、批量关闭多个 Issue。

## Technical Context

### Architecture Context

当前问题来自两个不同概念被混在了一起：

- Issue 是“问题或需求记录”。刚提出时，可能还不知道应该修改哪个项目；调查后也可能发现同时涉及多个项目。
- Plan 是“实际怎么做”。一个普通 Plan 最终一定要落到一个明确项目里实施。

现有 dev-flow 却把两者绑得太紧：

- `issue create` 实际要求必须指定一个 `--project`。
- 一个 Issue 只能保留一个 `project/*` 标签；同步时还会删除其它 `project/*` 标签。
- `plan new <issue>` 没有明确 `--project` 时，会从 Issue 标签里取一个项目；如果没有项目就失败。
- 之前为了让第二个 Issue 编号也能找到同一个 Plan，dev-flow 又允许 Plan 的 `Issue` 字段写多个编号。这样一旦进入 `approve`、`complete`、`verify`、`archive`，就会出现“到底同步哪个 Issue、关闭几个 Issue、失败一个怎么办”的连锁复杂度。

这不是应该继续扩大“多 Issue Plan”的理由，反而说明边界应该重新收紧。

WopalSpace 历史上已经使用过“总体 Plan + 多个子 Issue/子 Plan”的做法，例如 `.wopal-space/plans/upstream-wopal-space-ontology/done/20260414-87-refactor-umbrella.md`。本提案把这种做法正式化，但不新增一套状态机。

### Key Decisions

- D-01：**Issue 的项目标签只是当前已知的影响范围，不是唯一归属。** `project/*` 可以没有、可以一个、也可以多个，后续可以补充或删除。
- D-02：**普通 Plan 最多关联一个 Issue，并且必须只属于一个项目。** 普通 Plan 的 `Target Project` 和 `Project Path` 继续作为实际实施位置。
- D-03：**一个普通 Plan 不允许填写多个 Issue。** 新建和校验都拒绝这种写法。已归档的旧文档不追溯，也不为旧多 Issue Plan 增加兼容逻辑或兼容测试。
- D-04：**多个 Issue 如果本质上是同一个目标，而且一个 Plan 就能完成，先合并为伞型 Issue。** Agent 先整理出统一的 Goal / Scope / Acceptance Criteria，再把原 Issue 归并进去。普通 Plan 只关联这个伞型 Issue。
- D-05：**Issue 合并不新增状态机。** 被归并的原 Issue 不再作为独立工作项：记录“已归并到 #N”，以 `not planned` 原因关闭，并移除活动中的 `status/*` 标签；伞型 Issue 继续走原来的 Issue 生命周期。
- D-06：**一个目标如果需要多个 Plan，就使用伞型 Plan。** 常见原因包括范围过大、需要独立实施、或涉及多个项目。
- D-07：**伞型 Plan 可以有一个 Issue，也可以没有 Issue；可以跨项目，因此自身不要求 `Target Project` / `Project Path`。** 它只列出子 Plan，不直接拥有代码实现。
- D-08：**子 Plan 全部仍是普通 Plan。** 每个子 Plan 最多一个 Issue、一个项目，独立走现有 dev-flow。子 Plan 可以没有 Issue；如果有自己的 Issue，就只同步自己的 Issue。
- D-09：**伞型 Plan 不替子 Plan 改状态。** 它只检查子 Plan 是否达到要求，不把自己的状态自动传播给子 Plan。
- D-10：**`integrate` 仍是普通 Plan 正式交付流程中的一步。** 它不是新的状态名，但在有工作分支的普通 Plan 中，仍位于用户验证之后、`verify --confirm` 之前；`--no-worktree` 继续没有这一步。伞型 Plan 自己没有代码，因此不执行 `integrate`，只要求各子 Plan 按自己的交付方式完成这一步后再进入最终完成条件。
- D-11：**伞型 Plan 与现有 `Delivery` 是两回事。** `Delivery` 继续表示多个普通 Plan 是否共享一次代码集成；伞型 Plan 只表示这些 Plan 属于同一个更大的目标。
- D-12：**Plan 同步 Issue 时，只确保本 Plan 的项目标签存在，不再删除 Issue 的其它 `project/*` 标签。** Plan 无权因为自己属于项目 A，就认定 Issue 与项目 B 无关。
- D-13：**Plan 模板清理继续留在本提案里，但只作为一个很小的生成和校验修正。** `plan new` 生成成品时去掉模板 HTML 注释；`plan check` 拒绝残留的 HTML 注释和已知作者占位文本，不把这件事扩展成单独工作流。

### Workflow

Agent 按下面顺序判断，不需要先理解复杂数据模型：

1. 创建或整理 Issue。项目未知时可以不加 `project/*`；知道多个相关项目时可以都加上。
2. 如果多个 Issue 实际是同一个目标，而且一份 Plan 就能完成：先合并为伞型 Issue，再创建一个普通 Plan。
3. 如果目标需要多份 Plan：创建伞型 Plan，再按项目或独立实施边界拆成多个普通 Plan。
4. 每个普通 Plan 独立实施、验证、交付。完整交付顺序继续是 `complete → 用户验证 → integrate（有工作分支时）→ verify → archive`；伞型 Plan 只负责整体进度和整体验证。

最短规则：

> 多个 Issue、一份实施：先合并 Issue。  
> 一个目标、多份实施：用伞型 Plan。

### Key Interfaces

| 能力 | 约定 |
|---|---|
| `issue create` | `--project <name>` 改为可选且可重复；不传项目也能创建 Issue |
| `issue edit` | 使用可重复的 `--add-project <name>` / `--remove-project <name>` 增删指定项目；不再保留“把项目改成唯一一个值”的旧语义 |
| `issue merge --into <umbrella> <issue...>` | 把若干原 Issue 归并到一个已经整理好的伞型 Issue；写入归并关系并关闭原 Issue |
| `plan new <issue>` | 普通 Plan；Issue 有 0 个或多个项目标签时，可用 `--project` 明确本 Plan 的项目 |
| `plan new --umbrella` | 创建伞型 Plan；可带一个 Issue，也可无 Issue；不要求项目 |
| 普通 Plan | `Issue = 0..1`；`Target Project = 1` |
| 伞型 Plan | `Issue = 0..1`；自身无项目限制；通过 `Child Plans` 列出多个普通 Plan |
| 伞型 Plan 存放位置 | 统一放在 `.wopal-space/plans/_umbrella/`；该目录是 dev-flow 保留目录，不代表真实项目 |
| `plan status <umbrella>` | 显示每个子 Plan 的名称、项目、Issue 和当前状态 |
| Plan 生成与检查 | `plan new` 生成的普通/伞型 Plan 都不保留模板 HTML 注释；`plan check` 拒绝残留 HTML 注释和已知作者占位文本 |

## In Scope

- Issue 创建时允许不指定项目。
- 一个 Issue 允许同时保留多个 `project/*` 标签。
- Issue 编辑支持逐个增加、删除项目标签。
- Plan → Issue 同步不再删除其它项目标签。
- 新增机械的 Issue 合并能力：把多个原 Issue 归并到一个伞型 Issue。
- 普通 Plan 恢复为最多一个 Issue、且必须一个项目。
- `plan new <issue>` 在项目不唯一时要求 Agent 明确选择本 Plan 的项目。
- 新增伞型 Plan：可以跨项目、可以没有 Issue、只组织子 Plan。
- 伞型 Plan 统一存放在 `.wopal-space/plans/_umbrella/`，避免伪造一个 Target Project。
- 伞型 Plan 继续使用现有 `planning → reviewing → executing → verifying → done → archived` 状态，不新增状态。
- `submit`、`approve`、`complete`、`verify`、`archive`、`plan status` 对伞型 Plan 增加必要的判断。
- 普通 Plan 的正式交付流程继续包含 `integrate`：有工作分支时在用户验证后执行；`--no-worktree` 继续跳过。`integrate`、`verify-switch` 对伞型 Plan 给出清楚提示：代码交付应在子 Plan 上执行。
- `plan new` 生成文件时去掉模板 HTML 注释；`plan check` 增加轻量检查，拒绝残留 HTML 注释和已知作者占位文本。
- 更新 dev-flow 技能说明，让 Agent 用几条规则就能判断何时创建 Issue、合并 Issue、创建普通 Plan 或伞型 Plan。

## Out of Scope

- 不让普通 Plan 同时管理多个 Issue。
- 不给 Issue 或 Plan 新增生命周期状态。
- 不让伞型 Plan 自动修改子 Plan 或子 Issue 的状态。
- 不要求伞型 Plan 的所有子 Plan 共用一个 Delivery、一个 worktree 或一个仓库。
- 不自动决定如何把一个复杂目标拆成哪些子 Plan；这是 Plan 编写阶段的设计判断。
- 不自动把多个 Issue 的正文拼接成伞型 Issue。Agent 必须先读懂并整理成一个清晰的 Goal / Scope / Acceptance Criteria，再执行归并。
- 不迁移、不修复已归档的旧多 Issue Plan；历史文件保持原样。

## Affected Files

| 部分 | 主要文件 | 需要做什么 |
|---|---|---|
| Issue 创建和编辑 | `scripts/commands/issue.py` | 项目改成可选、可多个；增加/删除项目标签 |
| Issue 标签 | `scripts/issue.py` | 项目标签从“只留一个”改成“确保需要的标签存在” |
| GitHub Issue 查询 | `scripts/lib/github.py` | 兼容一个 Issue 多个项目标签 |
| Issue 合并 | `scripts/commands/issue.py` | 增加 `issue merge --into ...` |
| Plan 创建 | `scripts/commands/plan.py` | 普通 Plan 明确选项目；增加 `--umbrella` |
| Plan 读取与查找 | `scripts/plan.py`、`scripts/lib/project.py` | 支持伞型 Plan 位置与子 Plan 解析；普通 Plan 的 Issue 按单值契约处理 |
| Plan 校验 | `scripts/validation.py` | 普通 Plan 禁止多个 Issue；区分普通 Plan 与伞型 Plan 的项目规则；拒绝残留模板注释/作者占位 |
| Plan 模板 | `templates/plan.md`、新增伞型 Plan 模板 | 普通 Plan 保持单项目；伞型 Plan 增加 `Child Plans`；生成成品时去掉 HTML 作者注释 |
| 生命周期命令 | `approve.py`、`complete.py`、`verify.py`、`archive.py` | 伞型 Plan 不建 worktree，只检查子 Plan 是否达到相应阶段 |
| 不适用命令 | `integrate.py`、`verify_switch.py` | 伞型 Plan 直接提示应操作子 Plan |
| 状态查看 | `commands/plan.py` | `plan status` 展示伞型 Plan 的子 Plan 状态 |
| 技能与说明 | `SKILL.md`、`SKILL.zh-CN.md`、`references/issue-guide.md`、`references/plan-guide*.md`、`references/commands.md` | 写清简短判断规则和命令用法 |
| 测试 | `tests/python/` 相关测试 | 覆盖项目多标签、Issue 合并、普通 Plan 约束、伞型 Plan 生命周期 |

## Acceptance Criteria

### Agent Verification

1. [x] **Issue 可以没有项目**：`issue create` 不传 `--project` 可以成功；创建后的 Issue 没有 `project/*` 标签。— `python -m pytest tests/python/unit/test_issue_projects.py -q`
2. [x] **Issue 可以有多个项目**：创建或编辑后，一个 Issue 可以同时保留多个 `project/*` 标签；增加项目 A 不会删除已有项目 B。— `python -m pytest tests/python/unit/test_issue_projects.py -q`
3. [x] **普通 Plan 项目选择明确**：Issue 没有项目标签或有多个项目标签时，`plan new <issue>` 如果没有明确 `--project` 就给出易懂提示；明确 `--project` 后正常创建，并确保该项目标签存在于 Issue 上。— `python -m pytest tests/python/unit/test_plan_cmd.py tests/python/unit/test_issue_projects.py -q`
4. [x] **普通 Plan 不再支持多个 Issue**：新建或校验普通 Plan 时，`Issue: #1, #2` 被拒绝；单 Issue 和无 Issue Plan 保持现有行为。已归档旧文档不迁移，也没有旧多 Issue 兼容分支。— `python -m pytest tests/python/unit/test_check_doc.py tests/python/unit/test_project_resolver.py -q`
5. [x] **Issue 可以被归并**：`issue merge --into #N #A #B` 后，#N 记录来源关系；#A/#B 记录“已归并到 #N”并以 `not planned` 关闭，不再作为独立活动工作项。— `python -m pytest tests/python/unit/test_issue_merge.py -q`
6. [x] **伞型 Plan 可以跨项目或无 Issue**：可以创建没有 Issue、没有 Target Project 的伞型 Plan，并在 `Child Plans` 中声明属于不同项目的普通 Plan。— `python -m pytest tests/python/unit/test_umbrella_plan.py -q`
7. [x] **伞型 Plan 不改变子 Plan 状态**：推进伞型 Plan 时，只检查子 Plan 状态，不自动执行子 Plan 的 submit/approve/complete/verify/archive，也不修改子 Issue。— `python -m pytest tests/python/unit/test_umbrella_lifecycle.py -q`
8. [x] **伞型 Plan 使用原状态机**：`complete` 只在全部子 Plan 至少进入 `verifying` 后通过；`verify --confirm` 只在全部子 Plan 已 `done` 或 `archived` 后通过；`archive` 只在全部子 Plan 已 `archived` 后通过。— `python -m pytest tests/python/unit/test_umbrella_lifecycle.py -q`
9. [x] **正式交付仍在普通 Plan**：普通 Plan 有工作分支时仍执行 `用户验证 → integrate --confirm → verify --confirm`；`--no-worktree` 仍直接验证后 `verify --confirm`。对伞型 Plan 执行 `integrate` 或 `verify-switch` 时不做 Git 操作，只提示去操作子 Plan。— `python -m pytest tests/python/unit/test_integrate.py tests/python/unit/test_verify_switch.py tests/python/unit/test_verify.py tests/python/unit/test_umbrella_lifecycle.py -q`
10. [x] **新建 Plan 不带模板垃圾**：`plan new` 生成的普通 Plan 和伞型 Plan 都不含 `<!-- ... -->`；`plan check` 会拒绝残留 HTML 注释和模板中明确的作者占位文本，同时不误伤 `<name>`、`<id>` 这类正常技术写法。— `python -m pytest tests/python/unit/test_check_doc.py tests/python/unit/test_plan_cmd.py tests/python/unit/test_umbrella_plan.py -q`
11. [x] **技能说明简短可执行**：dev-flow 主技能包含“多个 Issue、一份实施先合并 Issue；一个目标、多份实施用伞型 Plan”及完整判断顺序，不要求 Agent 阅读长篇背景才能正确选择流程。— `rg -n 'Several Issues, one implementation|One goal, several implementations' skills/dev-flow/SKILL.md` + `rg -n '多个 Issue|一个目标需要多份实施' skills/dev-flow/SKILL.zh-CN.md` + `wc -l skills/dev-flow/SKILL*.md`
12. [x] **回归通过**：普通单 Issue Plan、无 Issue Plan、共享 Delivery、`--no-worktree` 等既有流程测试全部通过。— `python -m pytest tests/python/unit -q` → 587 passed, 42 subtests passed。

### User Validation

1. [x] 用户确认本次不额外制造真实 Issue / Plan 数据跑手工流程，接受完整自动化回归（587 passed + 42 subtests）、实施复审 PASS（Blocker 0 / Warning 0）和 `wopal space evo check` OK 作为本次验收依据。
2. [x] 用户基于上述验收依据明确授权将 `enhance-umbrella-workflow` 集成到空间分支。

## Implementation

### Task 1: 让 Issue 的项目标签符合现实情况

**Goal**: Issue 可以不知道项目，也可以同时涉及多个项目。

**Verification Intent**: 1, 2, 3

**Behavior**:
- 创建 Issue 时不写项目也能成功。
- 增加一个项目标签时，不删除已有的其它项目标签。
- 普通 Plan 明确选择项目后，只补充该项目标签，不清理其它项目标签。

**TDD**: true

**Changes**:
- `issue create` 的 `--project` 改为可选，并允许重复传入多个项目。
- `issue edit` 增加项目和删除项目都只修改指定标签，不影响其它 `project/*`。
- Plan 同步 Issue 时，只补上本 Plan 的项目标签，不删除其它项目标签。
- 调整 Issue 查询和测试，使多项目标签不会被误当成错误数据。

**Verify**: Issue 无项目、单项目、多项目、后续增删项目四种情况都有自动测试。

**Done**:
- 任务产出：Issue 创建支持 0..N 个项目；Issue 编辑改为逐个增删项目；Plan 同步项目标签只补充本 Plan 项目、不删除其它项目标签。
- 文件：`skills/dev-flow/scripts/commands/issue.py`、`skills/dev-flow/scripts/issue.py`、`skills/dev-flow/tests/python/unit/test_issue_projects.py`、`test_issue_edit_meta.py`、`test_sync_consolidation.py`。
- 验证：`python -m pytest tests/python/unit/test_issue_*.py tests/python/unit/test_sync_consolidation.py -q` → 108 passed, 5 subtests passed。
- [x] 上述行为和自动测试全部通过。

---

### Task 2: 支持把多个 Issue 归并成一个伞型 Issue

**Goal**: 多个 Issue 如果实际是一件事，可以停止重复跟踪，只留下一个统一入口。

**Verification Intent**: 5

**Behavior**:
- Agent 先整理好伞型 Issue，再把原 Issue 归并进去。
- 被归并的 Issue 清楚指向伞型 Issue，并以 `not planned` 关闭。
- 重复执行归并不会制造重复关系或错误状态。

**TDD**: true

**Changes**:
- 增加 `issue merge --into <umbrella> <issue...>`。
- Agent 先整理好伞型 Issue 的正文，再执行 merge；命令本身不替 Agent 拼接需求内容。
- 原 Issue 写入“已归并到 #N”的清楚记录，并以 `not planned` 关闭；不把它伪装成“已经实现完成”。
- 伞型 Issue 继续作为普通 Issue 使用，不新增特殊状态机。

**Verify**: 归并关系、关闭原因、重复执行和异常输入都有测试。

**Done**:
- 任务产出：新增 `issue merge --into <umbrella> <issue...>`；伞型 Issue 与来源 Issue 双向记录归并关系，来源 Issue 移除活动状态标签并以 `not planned` 关闭；同目标重复归并幂等，跨目标重复归并在写入前拒绝。
- 文件：`skills/dev-flow/scripts/commands/issue.py`、`skills/dev-flow/scripts/issue.py`、`skills/dev-flow/tests/python/unit/test_issue_merge.py`。
- 验证：`python -m pytest tests/python/unit/test_issue_merge.py tests/python/unit/test_issue_*.py tests/python/unit/test_sync_consolidation.py -q` → 113 passed, 5 subtests passed。
- [x] 上述行为和自动测试全部通过。

---

### Task 3: 收紧普通 Plan 规则，并顺手清理模板残留

**Goal**: 普通 Plan 保持简单：最多一个 Issue、只属于一个项目；同时让新生成的 Plan 不再带模板注释和作者占位残留。

**Verification Intent**: 3, 4, 10, 12

**Behavior**:
- 新普通 Plan 只能写零个或一个 Issue。
- Issue 没项目或有多个项目时，必须明确选择本 Plan 的项目。
- 新生成的 Plan 不包含模板 HTML 注释；残留的模板作者占位会被 `plan check` 拒绝。

**TDD**: true

**Changes**:
- 普通 Plan 的 `Issue` 只允许空或一个编号。
- Issue 没项目或有多个项目时，创建 Plan 必须明确 `--project`；只有一个项目标签时可以继续自动采用。
- 如果明确选择的项目还不在 Issue 标签中，创建 Plan 时补上该标签。
- 删除“一个 Plan 可写多个 Issue”的合法格式和文档说明；已归档旧文件不迁移、不增加兼容分支。
- `plan new` 在写出普通或伞型 Plan 前剥离模板 HTML 注释。
- `plan check` 拒绝残留 HTML 注释和模板中已知的作者占位文本；检查规则保持窄范围，不把正常的 `<name>`、`<id>` 技术写法当成错误。

**Verify**: 单 Issue、无 Issue、零项目、多项目、多 Issue 拒绝、模板注释清理、作者占位拒绝和合法技术记号都有测试。

**Done**:
- 任务产出：普通 Plan 的 Issue 字段收紧为 0..1；Issue 无项目或多项目时必须显式 `--project`，单项目可自动采用；显式项目会以增量方式补到 Issue；Plan 反查不再兼容多 Issue 字段；生成文件剥离 HTML 注释，`plan check` 拒绝多 Issue、HTML 注释和已知作者占位文本，同时允许 `<name>` / `<id>` 等技术记号。
- 文件：`skills/dev-flow/scripts/commands/plan.py`、`scripts/plan.py`、`scripts/lib/project.py`、`scripts/validation.py`、`tests/python/unit/test_check_doc.py`、`test_plan_cmd.py`、`test_project_resolver.py`。
- 验证：`python -m pytest tests/python/unit/test_plan_*.py tests/python/unit/test_project_resolver.py tests/python/unit/test_check_doc.py tests/python/unit/test_sync_consolidation.py -q` → 164 passed。
- [x] 上述行为和自动测试全部通过。

---

### Task 4: 增加伞型 Plan

**Goal**: 一个目标需要多个 Plan 时，有一个简单的总计划负责组织它们。

**Verification Intent**: 6, 10

**Behavior**:
- 伞型 Plan 可以没有 Issue，也可以有一个 Issue。
- 伞型 Plan 自身不要求项目，可以列出不同项目的子 Plan。
- 子 Plan 仍按普通 Plan 规则创建和执行。

**TDD**: true

**Changes**:
- 增加 `plan new --umbrella` 和伞型 Plan 模板。
- 伞型 Plan 统一创建到 `.wopal-space/plans/_umbrella/`；归档后进入该目录下的 `done/`。
- 伞型 Plan 可以关联一个 Issue，也可以没有 Issue；自身不要求 Target Project / Project Path。
- 伞型 Plan 用 `Child Plans` 列出子 Plan 的名称、目标项目和简短职责。
- 子 Plan 仍是普通 Plan；可以有自己的 Issue，也可以没有 Issue，但不能把伞型 Plan 的 Issue 重复绑定给多个子 Plan。
- `plan status <umbrella>` 汇总显示每个子 Plan 的项目、Issue、状态和缺失情况。

**Verify**: 同项目多个子 Plan、跨项目子 Plan、无 Issue 伞型 Plan、保留目录定位、缺失子 Plan 都有测试。

**Done**:
- 任务产出：新增 `plan new --umbrella` 与 `_umbrella/` 保留目录；伞型 Plan 通过 `Plan Kind: umbrella` 与普通 Plan 区分，不声明 Target Project / Project Path，可带 0..1 个 Issue；`Child Plans` 只保存子 Plan 名称、项目与职责；`plan status` 实时展示子 Plan 的实际项目、Issue、状态并标出 `MISSING`；普通 Plan/伞型 Plan 的项目归属校验已分流。
- 文件：`skills/dev-flow/templates/umbrella-plan.md`、`umbrella-plan.zh-CN.md`、`scripts/commands/plan.py`、`scripts/plan.py`、`scripts/validation.py`、`tests/python/unit/test_umbrella_plan.py`、`test_check_doc.py`。
- 验证：`python -m pytest tests/python/unit/test_plan_*.py tests/python/unit/test_umbrella_plan.py tests/python/unit/test_project_resolver.py tests/python/unit/test_check_doc.py -q` → 152 passed。
- [x] 上述行为和自动测试全部通过。

---

### Task 5: 让伞型 Plan 复用现有生命周期

**Goal**: 不增加新状态，只给伞型 Plan 加最少的完成条件。

**Verification Intent**: 7, 8, 9, 12

**Behavior**:
- 伞型 Plan 只读取子 Plan 状态，不替子 Plan 推进状态。
- 子 Plan 未达到要求时，伞型 Plan 明确说明哪个子 Plan 还没完成。
- 子 Plan 仍按现有正式交付顺序完成用户验证、必要的 `integrate`、`verify` 和 `archive`；代码集成相关命令不会在伞型 Plan 上执行 Git 操作。

**TDD**: true

**Changes**:
- `submit` / `approve` 继续使用现有状态推进；伞型 Plan 不创建 worktree，也不建立代码 Delivery。
- `complete`：所有子 Plan 至少到 `verifying` 才允许伞型 Plan进入 `verifying`。
- 普通子 Plan 在 `verifying` 阶段继续走现有正式交付流程：用户验证通过后，有工作分支的 Plan 执行 `integrate --confirm`，`--no-worktree` 跳过；随后各自执行 `verify --confirm`。
- `verify --confirm`：所有子 Plan 已 `done` 或 `archived`，并且伞型 Plan 自己的整体验证通过后，才允许伞型 Plan进入 `done`。子 Plan 能到 `done` 已经代表它按自己的模式完成了必要的 `integrate`/`verify`。
- `archive`：所有子 Plan 已 `archived` 才允许归档伞型 Plan。
- `integrate` / `verify-switch`：伞型 Plan 没有自己的代码交付，直接提示去操作子 Plan。
- 所有判断都只读子 Plan 状态，不自动推进子 Plan，也不自动修改子 Issue。

**Verify**: `complete`、子 Plan 正式交付（含有/无 `integrate` 两种模式）、伞型 `verify`、`archive` 分别覆盖通过和阻塞情况，并证明伞型命令对子 Plan 没有写操作。

**Done**:
- 任务产出：伞型 Plan 复用 `planning → reviewing → executing → verifying → done`，但 `approve` 不创建 worktree/Delivery；`complete` 只在全部子 Plan 至少 `verifying` 时放行；`verify --confirm` 只在全部子 Plan `done/archived` 且伞型自身 User Validation 通过时放行；`archive` 要求全部子 Plan 已归档；`integrate` / `verify-switch` 在任何代码 Git 操作前拒绝伞型 Plan。共享门禁只读子 Plan 状态，不修改子 Plan 或子 Issue。
- 文件：`skills/dev-flow/scripts/lib/umbrella.py`、`scripts/commands/approve.py`、`complete.py`、`verify.py`、`archive.py`、`integrate.py`、`verify_switch.py`、`scripts/plan.py`、`tests/python/unit/test_umbrella_lifecycle.py`。
- 验证：`test_umbrella_lifecycle.py + test_approve.py` → 44 passed；`test_complete_verification_commit.py test_verify.py test_archive.py test_archive_delivery.py test_integrate.py test_verify_switch.py` → 85 passed；`test_submit.py test_umbrella_lifecycle.py` → 20 passed。
- [x] 上述行为和自动测试全部通过。

---

### Task 6: 把 dev-flow 说明改成 Agent 一眼能执行的规则

**Goal**: 不让 Agent 为了选择流程消耗大量上下文。

**Verification Intent**: 10

**Behavior**:
- 主技能只保留判断规则和流程选择，不堆命令细节。
- 详细命令写进 references。
- 中英文说明表达同一套规则。

**TDD**: false

**Changes**:
- 在主技能保留下面几条核心规则，不写成长篇教程：
  1. Issue 记录问题，项目标签可以没有、一个或多个。
  2. 普通 Plan 最多一个 Issue，并且只属于一个项目。
  3. 多个 Issue、一份实施：先合并 Issue。
  4. 一个目标、多份实施：用伞型 Plan。
  5. 伞型 Plan 只组织子 Plan，不替子 Plan 改状态。
- 详细命令例子放到 references，主技能只保留判断顺序。
- 中英文技能和 references 保持同义。

**Verify**: 文档检查 + 全量 dev-flow 测试通过。

**Done**:
- 任务产出：中英文主技能新增同义的 5 条 Issue/普通 Plan/伞型 Plan 选择规则；Issue 归并、项目标签、伞型创建与生命周期细节下沉到 references；移除 references 中旧的多 Issue Plan 兼容说明。
- 文件：`skills/dev-flow/SKILL.md`、`SKILL.zh-CN.md`、`references/issue-guide.md`、`references/plan-guide.md`、`references/plan-guide.zh-CN.md`、`references/commands.md`、`tests/python/unit/test_two_beat_ac.py`。
- 验证：文档一致性检查通过；`python -m pytest tests/python/unit -q` → 581 passed, 42 subtests passed。
- [x] 主技能、references 和实际命令行为一致。

## Implementation Review

- **Round 1 — BLOCK**（Blocker 2 / Warning 2）：按 `df-implement-review` 对全部实现执行 Q1–Q4。发现 4 个偏差：跨项目同名子 Plan 会被错误解析；伞型模板的作者占位文本未完全纳入 `plan check`；缺少“伞型 Issue 不得重复绑定多个子 Plan”的机械校验；`issue merge` 在活动状态标签删除失败时仍可能继续关闭来源 Issue。
- **Fixes**：子 Plan 解析改为优先使用 `Child Plans` 声明的 Target Project；`plan status` 与生命周期门禁共用同一只读解析；补齐普通/伞型模板的已知作者占位检查；`plan check` 检查伞型 Issue 的重复子绑定；`remove_status_labels` 返回真实 mutation 结果，归并命令在失败时停止且不关闭来源 Issue；同时修正 `flow.sh help` 的旧入口说明。
- **Round 2 — PASS**（Blocker 0 / Warning 0）：针对 4 个 finding 与直接影响面复审；专项回归 36 passed，主要行为/生命周期组合回归 200 passed，完整 `tests/python/unit` 为 587 passed + 42 subtests；`git diff --check` clean；新 helper 的调用方、公开帮助与 references 均重新扫描，无新 orphan、契约漂移或未覆盖直接影响面。

## Delegation Strategy

| 顺序 | Task | 原因 |
|---|---|---|
| 1 | Task 1、Task 3 | 先把 Issue 项目语义和普通 Plan 边界定稳 |
| 2 | Task 2、Task 4 | 在稳定边界上增加 Issue 归并和伞型 Plan |
| 3 | Task 5 | 伞型 Plan 结构确定后再接入生命周期 |
| 4 | Task 6 | 最后按真实行为写简短技能说明 |

## Delivery

本提案只定义 dev-flow 本体改造；是否执行 `space sync`、提交和发布由用户在实施完成并验证后决定。
