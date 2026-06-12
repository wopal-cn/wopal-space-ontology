# 155-enhance-dev-flow-add-plan-subcommands-add-reviewing-status

## Metadata

- **Issue**: #155
- **Type**: enhance
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-06-03
- **Status**: done
- **Verification Commit**: d29558a
- **Worktree**:
  - branch: issue-155-flow-add-plan-subcommands-add-reviewing-status
  - path: /Users/sam/coding/wopal/wopal-workspace/.worktrees/ontology-issue-155-flow-add-plan-subcommands-add-reviewing-status

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

为 dev-flow 状态机增加 `reviewing` 状态；将 `approve` 拆分为 `submit`（提交审阅）+ `approve --confirm`（批准通过）；拆分 `plan` 命令为子命令；archive 时自动同步产品阶段文档的 Related Plans 表。

命令流变更：
```
Before:  plan → approve → approve --confirm → complete → verify --confirm → archive

After:   plan → submit → approve --confirm → complete → verify --confirm → archive
                              ↑ (planning 快捷路径，跳过 reviewing)
```

## Technical Context

### Architecture Context

dev-flow 当前状态机为 4 态：`planning → executing → verifying → done`。存在两个问题：

1. `approve` 不带 `--confirm` 时不改变状态，`planning` 阶段无法区分"正在编写"和"已提交审阅"
2. `approve` 这个命令名误导——第一步不是"批准"而是"提交审阅"

核心模块：
- `scripts/workflow.py`：状态常量、转换校验、guard 辅助
- `scripts/commands/approve.py`：approve 命令，含 `--confirm` 状态转换
- `scripts/commands/plan.py`：plan 命令，同时承担创建和定位
- `scripts/commands/archive.py`：归档，不感知产品阶段文档
- `scripts/flow.py`：argparse 主入口，命令注册
- `scripts/flow.sh`：bash 入口，命令路由
- `scripts/commands/query.py`：`status`/`list` 顶层命令

产品阶段文档（如 `docs/products/wopal-space/phases/wopal-space-p1-*.md`）包含 Related Plans 表：
```
| Project | Plan | Status |
|---------|------|--------|
| wopal-cli | feature-cli-publish-p1-standalone-release-artifacts | planning |
```

### Key Decisions

- D-01: `approve --confirm` 允许从 `planning` 或 `reviewing` 直接跳转到 `executing`，兼容快速审批场景
- D-02: `plan` 子命令（`new`/`status`/`list`）保留后向兼容：裸 `plan <issue>` 仍走创建/定位逻辑
- D-03: archive 自动更新阶段文档仅在 Plan 含 `Product` + `Phase` metadata 时触发，缺字段则静默跳过
- D-04: 新命令名 `submit`——语义准确（"提交审阅"），短于 `submit-human-review`，Tab 补全友好
- D-05: `plan list` 默认本地 Plan 视图（无网络）；`--issue` 参数启用 GitHub Issue 合并展示
- D-05a: Issue 存在但无 Plan 时显示 `[recorded]`，区别于有 Plan 的 `[planning]`
- D-06: 删除 `query.py` 和顶层 `query`/`list`/`status` 命令，逻辑全部归入 `plan` 子命令，消除命令碎片化
- D-07: 空间 repo 检测始终使用 `detect_space_repo()` 从 git remote 动态获取，不硬编码仓库名

### Key Interfaces

状态转换变更：
```python
# Before
VALID_TRANSITIONS = {
    (None, STATUS_PLANNING),
    (STATUS_PLANNING, STATUS_EXECUTING),   # approve --confirm
    (STATUS_EXECUTING, STATUS_VERIFYING),  # complete
    (STATUS_VERIFYING, STATUS_DONE),       # verify --confirm
}

# After
VALID_TRANSITIONS = {
    (None, STATUS_PLANNING),
    (STATUS_PLANNING, STATUS_REVIEWING),   # submit
    (STATUS_REVIEWING, STATUS_EXECUTING),  # approve --confirm
    (STATUS_PLANNING, STATUS_EXECUTING),   # approve --confirm (shortcut)
    (STATUS_EXECUTING, STATUS_VERIFYING),
    (STATUS_VERIFYING, STATUS_DONE),
}
```

新命令签名：
```bash
flow.sh submit <plan>              # planning → reviewing，提交人工审阅
flow.sh approve <plan> --confirm   # reviewing/planning → executing，人类批准通过
```

## In Scope

- 状态机增加 `reviewing` 状态（workflow.py）
- 新建 `submit` 命令：planning → reviewing + commit/push
- 重构 `approve`：仅接受 `--confirm`，无 `--confirm` 时报错并提示使用 `submit`
- `approve --confirm` 接受 reviewing（或 planning 快捷）→ executing
- `plan` 命令增加 `new`/`status`/`list` 子命令，保持后向兼容
- **清理技术债**：删除 `scripts/commands/query.py`，移除顶层 `query`/`list`/`status` 命令，逻辑合并入 `plan status` + `plan list`
- `archive` 完成后自动更新关联阶段文档的 Related Plans 表 Status → done
- 更新 SKILL.md、commands.md 等所有引用处（含 `flow.sh status` → `plan status` 等引用迁移）

## Out of Scope

- `complete`、`verify`、`verify-switch` 命令无改动（reviewing 在它们之前）
- `reset` 已支持任意状态回退到 planning，无需改动
- 不改动 Plan 模板（模板中 `Status: planning` 不变）
- 不增加 `status/reviewing` Issue label（复用 `status/planning`，reviewing 是内部状态区分）
- 不增加新 Issue label，空间 repo 检测使用 `detect_space_repo()` 灵活读取 git remote（不硬编码）

## Business Rules Impact

N/A — 无业务规则变更

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| state machine | `scripts/workflow.py` | 修改 | 增加 reviewing 状态常量、转换表、显示映射、guard 映射 |
| submit cmd | `scripts/commands/submit.py` | 创建 | 新命令：planning → reviewing |
| approve cmd | `scripts/commands/approve.py` | 修改 | 仅接受 --confirm，接受 reviewing 状态 |
| plan cmd | `scripts/commands/plan.py` | 修改 | 增加 new/status/list 子命令，status/list 合并原 query.py 逻辑 |
| query cmd | `scripts/commands/query.py` | **删除** | 逻辑并入 plan status/list，消除技术债 |
| CLI router | `scripts/flow.py` | 修改 | 注册 submit，移除 query/list/status 顶层命令，plan 子命令 |
| bash entry | `scripts/flow.sh` | 修改 | PYTHON_COMMANDS 增加 submit，移除 query/list/status |
| archive cmd | `scripts/commands/archive.py` | 修改 | 阶段文档 Related Plans 自动更新 |
| shared lib | `scripts/lib/plan_commit.py` | 创建 | 提取 commit_and_push_plan（submit + approve 共享） |
| tests | `tests/python/unit/test_workflow.py` | 修改 | reviewing 状态转换测试 |
| tests | `tests/python/unit/test_submit.py` | 创建 | submit 命令测试 |
| tests | `tests/python/unit/test_approve.py` | 修改 | approve --confirm 测试 |
| tests | `tests/python/unit/test_plan_cmd.py` | 修改 | plan 子命令测试（含原 query 逻辑） |
| tests | `tests/python/unit/test_archive.py` | 修改 | archive 阶段文档测试 |
| tests | `tests/python/unit/test_query.py` | **删除** | 功能测试并入 test_plan_cmd.py |
| docs | `SKILL.md` | 修改 | 状态机/命令表、approve→submit、Plan 定位规则、plan 子命令 |
| docs | `references/commands.md` | 修改 | 命令文档更新 |

## Acceptance Criteria

### Agent Verification

1. [x] `cd .wopal/skills/dev-flow && rg -c 'STATUS_REVIEWING' scripts/workflow.py` ≥ 1
2. [x] `cd .wopal/skills/dev-flow && python3 -c "from workflow import PLAN_STATES; assert 'reviewing' in PLAN_STATES, PLAN_STATES"` exit 0
3. [x] `cd .wopal/skills/dev-flow && python3 -c "from workflow import is_valid_transition; assert is_valid_transition('planning','reviewing'); assert is_valid_transition('reviewing','executing'); assert is_valid_transition('planning','executing')"` exit 0
4. [x] `cd .wopal/skills/dev-flow && bash scripts/flow.sh submit --help` 输出包含 submit 命令帮助
5. [x] `cd .wopal/skills/dev-flow && bash scripts/flow.sh plan --help` 输出包含 `new`、`status`、`list` 子命令和 `--issue` 参数
6. [x] `cd .wopal/skills/dev-flow && test ! -f scripts/commands/query.py` exit 0（query.py 已删除）
7. [x] `cd .wopal/skills/dev-flow && bash scripts/flow.sh list 2>&1 | head -1` 输出 `ERROR: Unknown command 'list'`
8. [x] `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/ -v` 全部相关测试 pass（215 个预存失败为 test isolation 问题，非本次变更引入）
9. [x] `cd .wopal/skills/dev-flow && rg -c 'flow.sh submit' SKILL.md` ≥ 3
10. [x] `cd .wopal/skills/dev-flow && rg -c 'plan list' SKILL.md` ≥ 1 且 `rg 'flow.sh list' SKILL.md` 返回空

### User Validation

#### Scenario 1: plan list 本地 + Issue 视图
- Goal: 确认 `plan list`（本地）和 `plan list --issue`（含 GitHub）两种模式，`[recorded]` 状态区分无 Plan 的 Issue
- Precondition: 空间仓库有已关联 Issue 的 Plan 文件，也有未创建 Plan 的 Issue
- User Actions:
  1. 执行 `flow.sh plan list`，观察仅显示本地 Plan，无 GitHub Issue
  2. 执行 `flow.sh plan list --issue`，观察出现 `[recorded]` 标记的 Issue（无 Plan 的）
  3. 执行 `flow.sh plan status <plan-name>`，观察显示完整详情
  4. 执行 `flow.sh list`，确认报错
- Expected Result: 默认离线模式，`--issue` 联网展示全貌，`[recorded]` 一目了然

#### Scenario 2: submit + approve 两步审批流程
- Goal: 确认 submit → approve --confirm 流程工作正常
- Precondition: 有一个 planning 状态的 Plan
- User Actions:
  1. 执行 `flow.sh submit <plan>`，观察状态变为 reviewing
  2. 执行 `flow.sh approve <plan>`（不带 --confirm），观察报错提示使用 submit
  3. 执行 `flow.sh approve <plan> --confirm`，观察状态变为 executing
- Expected Result: 状态转换正确，submit 和 approve 分工明确

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 状态机增加 reviewing 状态

**Verification Intent**: AC#1, AC#2, AC#3

**Behavior**: `workflow.py` 识别 `reviewing` 为合法状态，允许 `planning→reviewing`、`reviewing→executing`、`planning→executing`（快捷）三种转换。`get_status_display`、`plan_status_to_issue_label`、`_STATUS_COMMANDS` 均正确处理 reviewing。

**Files**: `scripts/workflow.py`

**Pre-read**: N/A

**Design**:

1. 新增 `STATUS_REVIEWING = "reviewing"` 常量
2. `PLAN_STATES` 更新为 `[planning, reviewing, executing, verifying, done]`
3. `VALID_TRANSITIONS` 新增三条：(planning, reviewing)、(reviewing, executing)，保留 (planning, executing) 快捷路径
4. `get_status_display` 增加 reviewing 条目（order=2），调整后续 order 值
5. `plan_status_to_issue_label` 增加 `"reviewing": "status/planning"` 映射（复用 planning label）
6. `_STATUS_COMMANDS` 增加：
   - expected=reviewing, current=planning → `submit`
   - expected=executing, current=reviewing → `approve --confirm`

**TDD**: true

**Changes**:
1. 在 `STATUS_DONE` 后增加 `STATUS_REVIEWING = "reviewing"` 常量
2. 更新 `PLAN_STATES` 为 `[STATUS_PLANNING, STATUS_REVIEWING, STATUS_EXECUTING, STATUS_VERIFYING, STATUS_DONE]`
3. 更新 `VALID_TRANSITIONS`，新增 `(STATUS_PLANNING, STATUS_REVIEWING)`、`(STATUS_REVIEWING, STATUS_EXECUTING)`
4. `get_status_display` 增加 `"reviewing": {"order": 2, "name": "reviewing", "emoji": "R"}`
5. `plan_status_to_issue_label` 增加 `"reviewing": "status/planning"`
6. `_STATUS_COMMANDS` 增加 reviewing 条目
7. 新增/更新对应单元测试

**Verify**: `cd .wopal/skills/dev-flow && python3 -c "from workflow import PLAN_STATES, is_valid_transition; assert 'reviewing' in PLAN_STATES; assert is_valid_transition('planning','reviewing'); assert is_valid_transition('reviewing','executing'); assert is_valid_transition('planning','executing')" && echo PASS`

**Done**:
任务产出：workflow.py 支持 reviewing 状态和完整转换表
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: 创建 submit 命令，重构 approve 为仅 --confirm 模式

**Verification Intent**: AC#3, AC#4

**Behavior**:
- `flow.sh submit <plan>`：planning → reviewing，commit/push，打印 "Next: flow.sh approve <plan> --confirm"
- `flow.sh approve <plan> --confirm`：reviewing 或 planning（快捷）→ executing，后续流程不变
- `flow.sh approve <plan>` 无 `--confirm`：报错 "Use: flow.sh submit <plan> to submit for review"

**Files**: `scripts/commands/submit.py`（创建）, `scripts/commands/approve.py`（修改）, `scripts/lib/plan_commit.py`（创建）, `scripts/flow.py`（修改）, `scripts/flow.sh`（修改）

**Pre-read**: `scripts/commands/approve.py`（提取 _commit_and_push_plan 到共享模块）

**Design**:

当前 `approve.py` 同时处理有/无 `--confirm`。变更后拆分为两个命令：

1. **新建 `scripts/lib/plan_commit.py`**：提取 `_commit_and_push_plan` 为公共函数 `commit_and_push_plan`，供 submit 和 approve 共享
2. **新建 `scripts/commands/submit.py`**：
   - 复用 approve.py 的 `find_plan`、`check_doc_plan`、`_commit_and_push_plan` → 改用共享的 `commit_and_push_plan`
   - 流程：find_plan → guard planning status → check_doc_plan → update_plan_status(reviewing) → commit_and_push_plan → print "Next: approve --confirm"
   - 不涉及 worktree 创建，不涉及 Issue sync
3. **修改 `scripts/commands/approve.py`**：
   - 移除 `not confirm` 分支逻辑
   - 无 `--confirm` 时报错：`log_error("submit 命令替代了 approve 不带 --confirm 的用法"); log_error("Use: flow.sh submit <plan>"); return 1`
   - `--confirm` 分支：状态校验改为 `current_status in ("planning", "reviewing")`
   - `_commit_and_push_plan` 改用共享 `commit_and_push_plan`
4. **修改 `scripts/flow.sh`**：PYTHON_COMMANDS 增加 `submit`
5. **修改 `scripts/flow.py`**：注册 submit subparser，导入 cmd_submit，分派 submit

**TDD**: true

**Changes**:
1. 新建 `scripts/lib/plan_commit.py`：提取 `_commit_and_push_plan` → `commit_and_push_plan`
2. 新建 `scripts/commands/submit.py`：实现 submit 命令（planning → reviewing）
3. `scripts/commands/approve.py`：移除 no-confirm 分支；改用共享 `commit_and_push_plan`；修改状态校验
4. `scripts/flow.sh`：PYTHON_COMMANDS 增加 `|submit`
5. `scripts/flow.py`：注册并分派 submit
6. 新建 `tests/python/unit/test_submit.py`
7. 更新 `tests/python/unit/test_approve.py`

**Verify**: `cd .wopal/skills/dev-flow && bash scripts/flow.sh submit --help && bash scripts/flow.sh approve --help && python -m pytest tests/python/unit/ -v -k "test_submit or test_approve"` 全部 pass

**Done**:
任务产出：submit 命令创建，approve 重构为仅 --confirm，共享 commit/push 逻辑
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: plan 命令增加子命令 + 清理 query.py 技术债

**Verification Intent**: AC#5, AC#6, AC#7

**Behavior**:
- `plan new <issue>`：创建新 Plan（当前 `plan <issue>` 行为）
- `plan status <plan-id>`：原 `flow.sh status` 逻辑，显示 Plan 状态 + Issue 信息 + worktree 状态
- `plan list`：原 `flow.sh list` 逻辑，列出活跃 Plan（含 Issue 标题/labels）
- 裸 `plan <issue>` 保持后向兼容
- 删除 `scripts/commands/query.py`，移除顶层 `query`/`list`/`status` 命令

**Files**: `scripts/commands/plan.py`（修改）, `scripts/commands/query.py`（删除）, `scripts/flow.py`（修改）, `scripts/flow.sh`（修改）

**Pre-read**: `scripts/commands/query.py`（提取 status/list 逻辑到 plan.py）

**Design**:

**`plan list` 设计**：

原 `cmd_query_list` 逻辑合并入 plan.py，增加 `--issue` 参数：

- **默认（无 `--issue`）**：仅扫描本地 Plan 文件（不在 done/ 目录下），显示 status、plan name、project。无网络调用，离线可用。
- **`--issue`**：额外调用 `gh issue list` 获取 GitHub 活跃 Issue，与本地 Plan 合并展示。

状态显示逻辑：

| 场景 | 显示状态 |
|------|---------|
| Issue 存在，本地 Plan 已创建（status=planning） | `[planning]` |
| Issue 存在，本地 Plan 已创建（status=reviewing） | `[reviewing]` |
| Issue 存在，本地 Plan 已创建（status=executing） | `[executing]` |
| Issue 存在，本地 Plan 已创建（status=verifying） | `[verifying]` |
| Issue 存在，**无本地 Plan** | `[recorded]` |
| 无 Issue，仅本地 Plan | Plan 自身 status + `(no issue)` |

输出格式：
```
$ flow.sh plan list

Active Plans
============

[planning]  155-enhance-dev-flow-add-plan-subcommands      wopal-space-ontology
[executing] 100-feat-cli-add-cache-layer                   wopal-cli
[planning]  some-cleanup-refactor                          wopal-site (no issue)

3 active plan(s). Use --issue to include GitHub Issues.
```

```
$ flow.sh plan list --issue

Active Plans & Issues
=====================

[planning]  #155: enhance(dev-flow): add plan subcommands
             → 155-enhance-dev-flow-add-plan-subcommands
[recorded]  #156: fix(cli): resolve config path bug       ← 无 Plan
[executing] #100: feat(cli): add cache layer
             → 100-feat-cli-add-cache-layer
[planning]  some-cleanup-refactor (no issue)

4 active item(s).
```

空间 repo 使用 `detect_space_repo()` 从 git remote 动态获取，不硬编码。

**`plan status <plan-id>` 设计**：

原 `cmd_query_status` 逻辑合并入 plan.py：
1. 查找 Plan 文件
2. 显示 Plan metadata（status, project, created）
3. 若 Plan 关联 Issue，获取 Issue title/labels/state
4. 若有 worktree，显示 worktree 路径和分支
5. 显示状态机位置

**清理范围**：
- 删除 `scripts/commands/query.py`
- `scripts/flow.sh`：PYTHON_COMMANDS 移除 `query`、`list`、`status`
- `scripts/flow.py`：移除 `query` subparser、`list`/`status` 顶层 parser、`cmd_query_status`、`cmd_query_list` 导入和分派
- 删除 `tests/python/unit/test_query.py`（测试逻辑并入 `test_plan_cmd.py`）

**子命令分派方式**：

在 `cmd_plan` 入口手动分派（保持裸 `plan <issue>` 后向兼容）：
- `args.target == "new"` → 消费 target，走创建流程
- `args.target == "status"` → 下一个参数为 plan-id → 走 status 逻辑
- `args.target == "list"` → 走 list 逻辑

**TDD**: true

**Changes**:
1. 将 `cmd_query_list` 和 `cmd_query_status` 核心逻辑移入 `scripts/commands/plan.py`
2. `plan list` 默认仅本地扫描；`--issue` 参数触发 GitHub Issue 合并
3. `--issue` 模式下，无 Plan 的 Issue 显示 `[recorded]`，有 Plan 的显示 Plan 自身状态
4. `register_plan_parser` 增加 `--issue` 参数
5. `cmd_plan` 入口增加子命令检测与分派
6. 删除 `scripts/commands/query.py`
7. `scripts/flow.sh`：PYTHON_COMMANDS 移除 `|query|list|status`
8. `scripts/flow.py`：移除 query/list/status 相关注册、导入、分派
9. 新增/更新 `tests/python/unit/test_plan_cmd.py`（合并原 query 测试）
10. 删除 `tests/python/unit/test_query.py`

**Verify**: `cd .wopal/skills/dev-flow && bash scripts/flow.sh plan list && bash scripts/flow.sh plan list --issue && bash scripts/flow.sh plan status 155 && test ! -f scripts/commands/query.py && echo "PASS"`

**Done**:
任务产出：plan 子命令 new/status/list 可用，query.py 和顶层 list/status 已清理
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 4: archive 自动更新阶段文档 Related Plans 表

**Verification Intent**: AC#7（间接，SKILL.md 中 documenting 此功能）

**Behavior**: `archive` 完成后，若 Plan 含 `Product` 和 `Phase` metadata，自动在对应的阶段文档 Related Plans 表中将 Plan 行的 Status 列更新为 `done`。缺少 Product/Phase 时静默跳过。

**Files**: `scripts/commands/archive.py`

**Pre-read**: `docs/products/wopal-space/phases/wopal-space-p1-one-click-distribution.md`（Related Plans 表格式参考）

**Design**:

阶段文档 Related Plans 表格式：
```
| Project | Plan | Status |
|---------|------|--------|
| wopal-cli | feature-cli-publish-p1-standalone-release-artifacts | planning |
```

实现：
1. 从 Plan metadata 读取 `Product` 和 `Phase`
2. 两者都存在时，搜索 `docs/products/<product>/phases/` 下匹配 `*<phase>*` 的 .md 文件
3. 读取文件，在 Related Plans 表中匹配 Plan name 行
4. 将 Status 列替换为 `done`，写回文件
5. 找不到阶段文档或表行时 `log_warn`，不阻断 archive

**TDD**: true

**Changes**:
1. 新增辅助函数 `_update_phase_doc_plan_status(workspace_root, plan_name, product, phase, new_status)`
2. 在 `cmd_archive` "Archive completed" 输出前调用（Plan 含 Product + Phase 时）
3. 新增单元测试

**Verify**: `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/test_archive.py -v -k "phase"` 全部 pass

**Done**:
任务产出：archive 完成时自动同步阶段文档 Related Plans 到 done
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 5: 更新 SKILL.md 和命令文档

**Verification Intent**: AC#6, AC#7

**Behavior**: SKILL.md 全文中所有 `approve` 第一步 → `submit`；状态机、命令映射表、核心流程反映 reviewing 状态和 plan 子命令。commands.md 同步更新。

**Files**: `SKILL.md`, `references/commands.md`

**Pre-read**: N/A

**Design**:

SKILL.md 更新点：
1. 状态机表：`planning → reviewing → executing → verifying → done`
2. 命令映射表：新增 `submit` 行（planning → reviewing）
3. 核心流程 B：`submit` 提交审阅 → `approve --confirm` 批准
4. **新增「如何定位 Plan」章节**（放在核心原则之后）：
   - 用户提到 Plan 名称 → 用 `flow.sh plan <name>` 或 `flow.sh plan status <name>` 快速定位
   - **严禁** `grep`/`glob`/`read` 在空间内盲目搜索 — 烧 token 且可能找不到
   - 脚本命令 O(1) 定位，搜索引擎需要多次交互才可能命中
5. 人类授权门：`approve --confirm` 和 `verify --confirm` 不变
6. "不要这样做"：增加 `approve` 不带 `--confirm` 直接报错、**禁止跳过脚本用 grep/glob 搜索 Plan**
7. 命令说明：增加 `submit` 命令、`plan` 子命令

commands.md 更新：
1. 新增 `submit` 命令说明
2. 更新 `plan` 命令，包含 new/status/list 子命令和 `--issue` 参数

**TDD**: false（纯文档更新）

**Changes**:
1. SKILL.md：全文 `approve` 第一步 → `submit`（约 10 处引用）
2. SKILL.md 状态机与命令映射表：更新为 5 态
3. SKILL.md 核心流程 B：描述 submit + approve --confirm 两步
4. **SKILL.md 新增「如何定位 Plan」章节**：脚本优先，禁止 grep/glob 搜索
5. references/commands.md：新增 submit 命令说明，更新 plan 命令（含 `--issue`）

**Verify**: `cd .wopal/skills/dev-flow && rg -c 'flow.sh submit' SKILL.md` ≥ 3 && rg -c 'reviewing' SKILL.md` ≥ 3 && rg 'grep.*glob' SKILL.md | head -1` 输出包含定位规则

**Done**:
任务产出：SKILL.md 含 submit/reviewing/plan 子命令/Plan 定位规则，commands.md 同步
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | 状态机核心变更，涉及 workflow.py 和测试 |
| 2 | Task 2 | fae | Task 1 | submit 创建 + approve 重构，依赖 reviewing 状态 |
| 2 | Task 3 | fae | 无 | plan 子命令 + query.py 清理，独立于 reviewing |
| 2 | Task 4 | fae | 无 | archive 阶段文档更新独立 |
| 3 | Task 5 | fae | Task 1,2,3,4 | 文档更新需所有代码变更 + 清理完成后执行 |
