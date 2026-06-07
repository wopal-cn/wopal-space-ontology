# 157-enhance-dev-flow-redesign-verify-switch-to-remove-merge

## Metadata

- **Issue**: #157
- **Type**: enhance
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Created**: 2026-06-03
- **Status**: done

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

重新设计 `verify-switch`：移除 `--merge`，统一两种项目类型的验证切换语义，`verify --confirm` 强制校验 merge 已完成。

命令流变更：
```
Before:  complete → verify-switch → verify-switch --merge → verify --confirm → archive

After:   complete → verify-switch（确认后切换分支）→ 用户手动验证 → 用户手动 merge
                → verify --confirm（校验 merge 已完成 → done）→ archive
```

## Technical Context

### Architecture Context

verify-switch 当前实现有两个根本问题：

1. **`--merge` 脚本化风险**：合并是高风险手动操作（冲突解决、代码审查），脚本化把不确定性封装在黑盒里
2. **项目类型差异性没有体现**：standard 仅印指引，ontology 切 `.wopal/`，没有统一的用户交互模型

核心模块：
- `scripts/commands/verify_switch.py`：当前 verify-switch，含 `--merge` 和 verify_mode 两阶段驱动
- `scripts/commands/verify.py`：verify --confirm，当前不校验 merge 状态
- `scripts/lib/worktree.py`：WorktreeContext 和 parse_worktree_meta
- `scripts/plan.py`：get_plan_worktree() 读取 Worktree metadata

### Key Decisions

- D-01: **移除 `--merge`** — 合并不脚本化，由用户手动执行 `git merge`
- D-02: **verify-switch 统一语义** — 两种项目类型都是"确认后切换工作空间到 feature 分支，准备验证"，非 TTY 环境用 `--yes` 跳过确认
- D-03: **verify --confirm 增加 merge 校验** — `git branch --merged` 检查 feature 分支已合并到集成分支，未合并报错退出
- D-04: **standard 项目清理 worktree** — 切换后 worktree 不再需要，`git worktree remove` 清理
- D-05: **ontology-worktree 保留 worktree** — `.wopal/` 运行时需要 feature 分支代码，worktree 保留不删
- D-06: **实施期间不提交** — fae 所有变更留在 working tree，rook 审查 working tree 后 PASS 才一次提交。杜绝 #155 的 10-commit 碎片历史（逐 Task 提交 + rook 修复迭代提交）

### Key Interfaces

verify-switch 新行为：
```python
# verify_switch.py 职责简化
def cmd_verify_switch(workspace_root, args):
    # 1. 读取 Plan Worktree metadata (branch + path)
    # 2. 确定切换目标（standard: projects/<p>/; ontology: .wopal/）
    # 3. 用户确认（--yes 跳过）
    # 4. git checkout <feature-branch>
    # 5. standard: git worktree remove <path>
    # 6. 输出验证指引
```

verify --confirm 新校验：
```python
# verify.py 增加 merge 状态检查
def _check_feature_branch_merged(plan, workspace_root):
    # git branch --merged <integration_branch> | grep <feature_branch>
    # 未合并 → log_error + return 1
```

## In Scope

- 移除 `verify-switch --merge` 参数和所有合并逻辑
- 移除 verify_mode 两阶段驱动（不再需要）
- 统一 standard/ontology 的切换逻辑：确认 → checkout → 输出指引
- standard 项目切换后清理 worktree
- `verify --confirm` 增加 feature 分支已合并的强制校验
- 更新 verify_switch.py 和 verify.py 的单元测试
- 更新 SKILL.md 的验证流程描述和 Plan 分支归属表

## Out of Scope

- 不改动 `complete`、`archive` 命令
- 不改动 worktree 创建逻辑（`approve --confirm`）
- 不引入 MergeConflictResolver 或任何合并辅助工具
- 不改变 Issue label 或状态定义

## Business Rules Impact

N/A — 无业务规则变更

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| verify-switch | `scripts/commands/verify_switch.py` | 修改 | 移除 --merge，统一切换逻辑 |
| verify | `scripts/commands/verify.py` | 修改 | 增加 merge 状态校验 |
| tests | `tests/python/unit/test_verify_switch.py` | 修改 | 更新测试（移除 --merge 用例，增加切换测试） |
| tests | `tests/python/unit/test_verify.py` | 修改 | 增加 merge 校验测试 |
| docs | `SKILL.md` | 修改 | 验证流程、分支归属表、编排规则 |

## Acceptance Criteria

### Agent Verification

1. [x] `cd .wopal/skills/dev-flow && rg -c '--merge' scripts/commands/verify_switch.py` = 0
2. [x] `cd .wopal/skills/dev-flow && rg -c 'verify_mode' scripts/commands/verify_switch.py` = 0
3. [x] `cd .wopal/skills/dev-flow && rg -c 'check.*merge\|verify.*merge\|branch.*merged' scripts/commands/verify.py` ≥ 1
4. [x] `cd .wopal/skills/dev-flow && python -m pytest tests/python/unit/ -v` 全部 pass（或新增回归 < 预存基线）

### User Validation

#### Scenario 1: standard 项目 verify-switch 统一切换
- Goal: verify-switch 确认后切换到 feature 分支，worktree 被清理，用户可直接验证
- Precondition: standard 项目有一个 verifying 状态的 Plan（含 Worktree metadata）
- User Actions:
  1. 执行 `flow.sh verify-switch <plan>`，出现确认提示
  2. 确认后，项目 repo 切换到 feature 分支
  3. 观察 `.worktrees/` 下对应目录已被移除
  4. 输出 "验证完成后手动 merge" 指引
- Expected Result: 工作空间在 feature 分支上，无需 worktree，用户可以直接运行测试验证

#### Scenario 2: verify --confirm merge 校验
- Goal: feature 分支未 merge 时 verify --confirm 报错退出
- Precondition: verifying 状态 Plan，feature 分支未合并
- User Actions: 执行 `flow.sh verify <plan> --confirm`
- Expected Result: 报错提示 feature 分支尚未合并到集成分支，exit 1

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 重写 verify_switch.py — 移除 --merge，统一切换逻辑

**Verification Intent**: AC#1, AC#2

**Behavior**: `verify-switch` 确认后切换工作空间到 feature 分支。standard 项目清理 worktree，ontology-worktree 保留。`--merge` 参数和 verify_mode 驱动全部移除。非 TTY 环境 `--yes` 跳过确认。

**Files**: `scripts/commands/verify_switch.py`

**Pre-read**: `scripts/commands/verify_switch.py`

**Design**:

新 `cmd_verify_switch` 流程：
1. 读取 Plan Worktree metadata（get_plan_worktree / WorktreeContext）
2. 确定切换目标目录（standard: 项目 repo；ontology: `.wopal/`）
3. 用户交互确认（提示将切换到的分支和目标目录）
4. `git fetch` + `git checkout <feature_branch>`
5. standard: `git worktree remove <worktree_path>`
6. 输出验证指引（如何测试、如何手动 merge）

移除内容：
- `--merge` 参数（argparse 注册）
- verify_mode 枚举和两阶段驱动逻辑
- `_merge_feature_branch()` 函数
- `verify-switch <issue>` 不带参数时的两阶段提示（改为直接执行切换）

**TDD**: true

**Changes**:
1. 移除 `--merge` 参数注册
2. 移除 verify_mode 枚举和所有两阶段判断
3. 移除 `_merge_feature_branch()` 函数
4. 重写 `cmd_verify_switch` 主函数为统一切换流程
5. standard 项目增加 worktree 清理逻辑
6. 增加用户确认交互（`--yes` 跳过）
7. 更新输出指引文本

**Verify**: `cd .wopal/skills/dev-flow && rg -c '--merge' scripts/commands/verify_switch.py` = 0 && rg -c 'verify_mode' scripts/commands/verify_switch.py` = 0 && python -m pytest tests/python/unit/test_verify_switch.py -v`

**Done**:
任务产出：verify-switch 移除 --merge，统一两种项目类型的切换逻辑
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: verify --confirm 增加 merge 状态校验

**Verification Intent**: AC#3

**Behavior**: `verify --confirm` 执行前检查 feature 分支已合并到集成分支。未合并时报错 "Feature branch not yet merged to <integration_branch>. Please merge first." 并 exit 1。

**Files**: `scripts/commands/verify.py`

**Pre-read**: `scripts/commands/verify.py`, `scripts/plan.py`（get_plan_worktree）

**Design**:

在 `cmd_verify` 的 `--confirm` 分支中，状态转换前增加 `_check_feature_branch_merged()`：
1. 从 Plan metadata 读取 Worktree branch
2. 确定集成分支（standard: main；ontology: space/main）
3. `git branch --merged <integration> | grep <feature_branch>`
4. 未合并 → `log_error` + `return 1`

**TDD**: true

**Changes**:
1. 新增 `_check_feature_branch_merged(workspace_root, plan)` 函数
2. 在 `cmd_verify --confirm` 中，状态转换前调用校验
3. 更新 `tests/python/unit/test_verify.py`：增加 merge 校验测试

**Verify**: `cd .wopal/skills/dev-flow && rg -c 'check.*merge\|branch.*merged' scripts/commands/verify.py` ≥ 1 && python -m pytest tests/python/unit/test_verify.py -v -k "merge"`

**Done**:
任务产出：verify --confirm 强制校验 merge 已完成
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: 更新 SKILL.md 和文档

**Verification Intent**: AC#1, AC#2（文档一致性），提交纪律规则完整性

**Behavior**: SKILL.md 的验证流程章节、Plan 分支归属表、Wopal 编排规则反映新的 verify-switch 行为。移除所有 `--merge` 引用。

**Files**: `SKILL.md`

**Pre-read**: N/A

**Design**:

SKILL.md 更新点：
1. 验证流程章节 D：描述新的统一验证流程（verify-switch 切换 → 手动验证 → 手动 merge → verify --confirm）
2. Plan 分支归属表：移除 `verify-switch --merge` 行，添加"用户手动 merge"行
3. Wopal 编排规则：更新规则 3、4
4. "不要这样做"：移除 merge 相关条目
5. **新增提交纪律规则**：fae 实施期间不提交代码，所有变更留在 working tree，rook 审查 PASS 后一次提交。增加"实施期间逐 Task 提交——碎片化 git history"到"不要这样做"

**TDD**: false（纯文档更新）

**Changes**:
1. SKILL.md 验证流程 D 节重写
2. Plan 分支归属表更新
3. Wopal 编排规则更新
4. 移除所有 `--merge` 引用
5. 新增 fae 不提交、rook PASS 后一次提交的规则
6. "不要这样做"增加"实施期间逐 Task 提交"

**Verify**: `cd .wopal/skills/dev-flow && rg -c '--merge' SKILL.md` = 0 && rg -c '手动 merge\|手动合并' SKILL.md` ≥ 1 && rg -c '一次提交\|single commit\|working tree' SKILL.md` ≥ 1

**Done**:
任务产出：SKILL.md 验证流程描述与新 verify-switch 一致
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | verify_switch.py 核心重写，涉及参数移除、流程重设计 |
| 1 | Task 2 | fae | 无 | verify.py 独立修改，不依赖 verify_switch 变更 |
| 2 | Task 3 | fae | Task 1,2 | 文档更新需所有代码变更完成后执行 |

**提交纪律**（D-06）：fae 实施期间 **不提交代码**。所有变更留在 working tree，rook 审查 `git diff` 后 PASS 才一次提交。此规则适用于本 Plan 自身实施。
