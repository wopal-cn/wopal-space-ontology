# enhance-dev-flow-streamline-verify-switch-with-safety-checks-and-plan-metadata-updates

## Metadata

- **Type**: enhance
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal/
- **Project Type**: ontology-worktree
- **Created**: 2026-06-11
- **Status**: verifying
- **Worktree**:
  - branch: flow-streamline-verify-switch-with-safety-checks-and-plan-metadata-updates
  - path: /Users/sam/coding/wopal/wopal-workspace/.worktrees/ontology-flow-streamline-verify-switch-with-safety-checks-and-plan-metadata-updates

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

优化 `verify-switch` 流程：`complete` 完成时输出规范路径状态和验证选项；`verify-switch` 正确处理工作树移除、脏检查、Plan 元数据更新和提交，使标准项目和 ontology-worktree 项目的验证顺畅衔接后续流程。

## Technical Context

### Architecture Context

当前 dev-flow 的验证切换存在三个问题：

1. **脚本 bug**：`verify_switch.py` 的 `_switch_standard` 先 `git checkout` 再 `git worktree remove`，顺序反了。git 拒绝 checkout 已被工作树占用的分支。
2. **元数据缺失**：切换后 Plan 的 Worktree 字段不更新（仍指向已删除的工作树），后续 `archive` 和 agent 无法感知当前状态。
3. **流程断层**：`complete` 不提示验证选项，`verify-switch` 是独立命令，agent 容易遗忘。

两种项目类型在机制上一致（移除工作树 → 在规范路径 checkout 特性分支），只是规范路径不同：

| | Standard | Ontology-worktree |
|------|----------|-------------------|
| 规范路径 | `projects/<name>/`（从 Plan 元数据推导） | `.wopal/`（空间结构固定） |
| 宿主仓库 | 项目自身 git repo | `~/.wopal/ontologies/wopal-space-ontology/`（从 `.wopal/.git` 解析） |
| 验证方式 | 工作树内验证 或 切换分支验证 | 仅切换分支验证（ellamaka 从 `.wopal/` 加载运行时能力） |

路径全部动态——`repo_root`、`workspace_root`、项目路径均从 Plan 元数据和空间检测推导，不写死。

### Key Decisions

- D-01: `complete` 不自动切换分支——只检查规范路径状态并输出验证选项（工作树验证 vs 分支切换），切换由用户显式触发
- D-02: `verify-switch` 执行顺序：移除工作树 FIRST → THEN checkout 特性分支（修正当前反序 bug）
- D-03: 切换完成后更新 Plan Worktree 元数据：`path: (removed)` 标记工作树已清理，新增 `Verification Dir` 记录当前验证目录
- D-04: 元数据更新后 commit（Plan-only commit），保持特性分支 git 状态干净
- D-05: ontology-worktree 项目：complete 只输出分支切换选项（不提供工作树验证选项），因为 ellamaka 必须从 `.wopal/` 加载运行时能力
- D-06: 规范路径脏检查：`verify-switch` 检查规范路径 git 状态，脏时输出 warning 但不阻塞（用户显式选择了切换，git checkout 自带冲突保护）

## In Scope

- `complete.py`：提交 Plan → verifying 后，检查规范路径 git status，输出验证选项
- `verify_switch.py`：修正 checkout/worktree-remove 顺序，增加脏检查，切换后更新 Plan 元数据并 commit
- Plan 元数据 schema：支持 `path: (removed)` 和 `Verification Dir` 字段
- 文档更新：SKILL.md 验证流程章节、commands.md verify-switch 章节

## Out of Scope

- `archive.py` / `verify.py` 中集成分子硬编码为 `main` 的问题（预存问题，非本次变更引入）
- `verify-switch --merge` flag（ontology-worktree 合并流程保持手动，与本次优化无关）
- PR 工作流路径（`complete --pr` 的 switch 行为不在本次范围）

## Business Rules Impact

N/A — 纯流程优化，无业务规则变更。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| 完成命令 | `scripts/commands/complete.py` | 修改 | 增加规范路径检查 + 验证选项输出 |
| 验证切换命令 | `scripts/commands/verify_switch.py` | 修改 | 修正顺序、脏检查、元数据更新、commit |
| 工作树库 | `scripts/lib/worktree.py` | 修改 | 支持新 Worktree 元数据字段 |
| 技能定义 | `SKILL.md` | 修改 | 更新验证流程描述 |
| 命令参考 | `references/commands.md` | 修改 | 更新 verify-switch 说明 |
| 测试（新增） | `tests/python/unit/test_verify_switch.py` | 创建 | verify-switch 单元测试 |
| 测试（新增） | `tests/python/unit/test_complete_output.py` | 创建 | complete 输出格式测试 |

## Acceptance Criteria

### Agent Verification

1. [x] `python -m pytest tests/python/ -v` 全部 pass
2. [x] `rg 'canonical path\|规范路径\|worktree verify\|branch-switch' scripts/commands/complete.py` ≥ 2（complete 输出验证选项）
3. [x] `rg 'worktree.*remove' scripts/commands/verify_switch.py` 行号 < `rg 'git checkout' scripts/commands/verify_switch.py` 行号（remove 在 checkout 之前）
4. [x] `rg 'Verification Dir' scripts/commands/verify_switch.py` ≥ 1（切换后写入 Verification Dir 元数据）
5. [x] `rg 'path: \(removed\)' scripts/commands/verify_switch.py` ≥ 1（切换后标记工作树路径已清理）
6. [x] `rg 'commit_paths' scripts/commands/verify_switch.py` ≥ 1（切换后 commit Plan 变更）

### User Validation

#### Scenario 1: Standard 项目 complete 输出验证选项
- Goal: complete 完成后，用户能看到规范路径状态和两个验证选项
- Precondition: Plan 处于 executing，工作树存在
- User Actions:
  1. 执行 `flow.sh complete <plan>`
  2. 观察输出
- Expected Result: 输出包含规范路径（如 `projects/ellamaka/`）的 git status（干净或脏），以及 "A) verify in worktree: .worktrees/xxx/ B) switch branch: flow.sh verify-switch <plan>" 选项

#### Scenario 2: Ontology-worktree 项目 complete 仅输出切换选项
- Goal: ontology 项目的 complete 不提供 worktree 验证选项
- Precondition: Plan 类型为 ontology-worktree
- User Actions:
  1. 执行 `flow.sh complete <plan>`
  2. 观察输出
- Expected Result: 仅输出分支切换选项（不包含 worktree 验证选项），提示用户重启 ellamaka 验证

#### Scenario 3: verify-switch 正确处理标准项目
- Goal: 执行 verify-switch 后，规范路径切换到特性分支，工作树已清理，Plan 元数据已更新
- Precondition: complete 已完成，工作树和分支存在
- User Actions:
  1. 执行 `flow.sh verify-switch <plan> --yes`
  2. 检查 projects/<name>/ 当前分支
  3. 检查 .worktrees/ 目录
  4. 检查 Plan 文件 Worktree 元数据
- Expected Result: projects/<name>/ 在特性分支上，工作树目录已删除，Plan 中 Worktree path 为 "(removed)"，存在 Verification Dir 字段

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: Enhance complete.py with canonical path check and verification guidance

**Verification Intent**: AC#2

**Behavior**: `complete` 提交 Plan → verifying 后，不对规范路径做任何 git 操作，只检查 `git status --porcelain` 并输出两种验证选项。ontology-worktree 类型只输出分支切换选项。

**Files**: `scripts/commands/complete.py`

**Pre-read**: `scripts/commands/verify_switch.py`, `scripts/lib/project.py`

**Design**:

在 `cmd_complete` 的无 PR 路径末尾（`print("Implementation complete...")` 之后），增加规范路径状态检查和验证选项输出：

```python
# 规范路径解析
from lib.worktree import parse_worktree_context
wt_ctx = parse_worktree_context(plan_path)

if wt_ctx and wt_ctx.project_type == "ontology-worktree":
    # only switch option
    print_ontology_verification_guidance(wt_ctx, issue)
else:
    # both options
    print_standard_verification_guidance(wt_ctx, issue, workspace_root)
```

`print_standard_verification_guidance`:
1. 从 wt_ctx.repo_root 获取规范路径（绝对路径）
2. `git status --porcelain` 检查脏状态
3. 输出：
   - 规范路径状态（干净/脏 + 未提交文件列表概要）
   - Option A: worktree verify（路径：wt_ctx.path）
   - Option B: branch-switch（命令：flow.sh verify-switch <plan>）
   - 提示：选 A 在 worktree 验证后需手动 merge；选 B 执行 verify-switch

`print_ontology_verification_guidance`:
1. 检查 `.wopal/` git status
2. 仅输出分支切换命令，提示重启 ellamaka 验证

**TDD**: false — 输出格式化逻辑，TDD 不适合（测试验证的是字符串格式而非行为正确性，通过集成测试 run_verify_switch 覆盖）

**Changes**:
1. 新增 `_print_standard_verification_guidance(wt_ctx, issue, workspace_root)` 函数
2. 新增 `_print_ontology_verification_guidance(wt_ctx, issue, workspace_root)` 函数
3. 在 `cmd_complete` 无 PR 路径末尾调用或直接跳过

**Verify**: `rg 'worktree verify\|switch branch\|验证选项\|规范路径' scripts/commands/complete.py` ≥ 2

**Done**:
任务产出：complete.py 输出规范路径状态和验证选项
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 2: Rewrite verify_switch.py with proper ordering, dirty check, Plan metadata update, and commit

**Verification Intent**: AC#1, AC#3, AC#4, AC#5, AC#6

**Behavior**: `verify-switch` 执行时：
1. 检查规范路径脏状态，脏时输出 warning
2. 移除工作树
3. 在规范路径 checkout 特性分支
4. 更新 Plan Worktree 元数据（path → "(removed)"，新增 Verification Dir）
5. Commit Plan 变更
6. 打印验证指引

**Files**: `scripts/commands/verify_switch.py`, `scripts/lib/worktree.py`

**Pre-read**: `scripts/lib/project.py`, `scripts/lib/git.py`, `scripts/lib/worktree.py`, `scripts/plan.py`

**Design**:

修正 `_switch_standard`:
```python
def _switch_standard(workspace_root, wt_ctx, issue):
    repo_root = str(wt_ctx.repo_root)
    branch = wt_ctx.branch
    wt_path = str(_resolve_wt_path(wt_ctx.path, workspace_root))
    
    # 1. Fetch
    _git_fetch(repo_root)
    
    # 2. Dirty check on canonical path (warn, don't block)
    dirty_files = _check_dirty(repo_root)
    if dirty_files:
        log_warn(f"Canonical path has uncommitted changes ({len(dirty_files)} files)")
    
    # 3. Remove worktree FIRST
    _remove_worktree(repo_root, wt_path)
    
    # 4. THEN checkout
    _git_checkout(branch, repo_root)
    
    # 5. Update Plan metadata
    _update_plan_after_switch(plan_path, repo_root, branch)
    
    # 6. Print guidance
    print_switch_guidance(issue, branch, repo_root)
```

修正 `_switch_ontology`:
```python
def _switch_ontology(workspace_root, wt_ctx, issue):
    # Similar flow, but:
    # - repo_root = get_ontology_main_repo(workspace_root)
    # - canonical = workspace_root / ".wopal"
    # - Before checkout in .wopal/, must remove worktree from main_repo
```

新增 `_update_plan_after_switch`:
```python
def _update_plan_after_switch(plan_path: str, repo_root: str, branch: str):
    # 1. Update Worktree path → "(removed)"
    # 2. Add Verification Dir → repo_root
    # 3. Commit Plan changes
```

`run_verify_switch` 需要传入 `plan_path` 给 `_switch_standard` / `_switch_ontology`，用于元数据更新。当前代码已有 `plan_path` 变量。

**TDD**: true

**Changes**:

RED（先写测试）:
1. 创建 `tests/python/unit/test_verify_switch.py`
2. 测试 `_remove_worktree` 在 checkout 之前执行
3. 测试 Plan 元数据更新（path → "(removed)"）
4. 测试 Plan 元数据更新（Verification Dir 字段）
5. 测试 Plan commit 调用

GREEN:
1. 重写 `_switch_standard`：交换 remove/checkout 顺序；调用 `_update_plan_after_switch`
2. 重写 `_switch_ontology`：交换 remove/checkout 顺序；调用 `_update_plan_after_switch`
3. 新增 `_update_plan_after_switch` 函数
4. 新增 `_check_dirty` helper
5. `run_verify_switch` 传递 `plan_path` 给 switch 函数

REFACTOR:
1. 统一 `_switch_standard` 和 `_switch_ontology` 的共同逻辑（可选）

**Verify**: `python -m pytest tests/python/ -v` 全部 pass

**Done**:
任务产出：verify_switch.py 正确执行切换并更新 Plan 元数据
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

### Task 3: Update documentation (SKILL.md, commands.md)

**Verification Intent**: AC#2 (documentation reflects new flow)

**Behavior**: SKILL.md 验证流程章节和 commands.md verify-switch 章节反映优化后的流程。文档更新严格遵循 skill-creator 技能规范。

**Files**: `SKILL.md`, `references/commands.md`

**Pre-read**: `SKILL.md` 全文, `references/commands.md` verify-switch 章节

**Design**:

skill-creator 核心约定（来自 `.wopal/AGENTS.md` 和 `references/lifecycle-develop.md`）：

- **description 是触发信号**：description 在 frontmatter 中，是 agent 判断是否加载技能的唯一依据。必须包含完整的触发场景和关键词。
- **Body 是执行指令**：body 仅在技能触发后加载，不应在 body 中写"何时加载本技能"。
- **渐进式加载**：SKILL.md ≤500 行（当前 241 行，符合），细节放 `references/`。
- **命名规则**：`^[a-z0-9]+(-[a-z0-9]+)*$`，1-64 字符，匹配目录名。

当前 dev-flow SKILL.md 已基本符合约定（241 行，标准 frontmatter）。本次仅更新与 verify-switch 相关的段落。

**SKILL.md 变更点**：

**D 节（验证）重写**（第 150-162 行）：

旧：
```
统一流程：
1. flow.sh verify-switch → 
2. 用户验证 → 
3. merge → 
4. verify --confirm → 
5. archive
```

新：
```
统一流程：
1. complete 完成后输出验证选项：
   - 工作树验证：在 .worktrees/<name>/ 直接验证
   - 分支切换：flow.sh verify-switch <issue>
     → 移除工作树 → checkout 特性分支到规范路径 → 更新 Plan 元数据 → commit
2. 用户验证功能
3. agent merge（feature → 集成分支，不删 feature 分支）
4. agent 在集成分支执行 flow.sh verify <issue> --confirm
5. agent 执行 flow.sh archive <issue>
```

标准项目提供两种选项；ontology-worktree 仅提供分支切换（ellamaka 从 `.wopal/` 加载运行时能力）。

**"提交序列" 节更新**（verify-switch 步骤描述变化）

**"不要这样做" 节更新**：

- 移除：`verify-switch 用于 standard 项目以外的场景`（第 225 行）→ 改为通用说明
- 新增：`verify-switch 前未先移除 worktree` — 需先执行脚本处理

**commands.md 变更点**：

- 移除 "verify-switch 仅用于 ontology-worktree 的 switch-runtime 模式" 限定
- 更新为：两种项目类型统一使用 verify-switch，脚本自动区分规范路径
- 说明 verify-switch 会更新 Plan 元数据（path → "(removed)"，新增 Verification Dir）并 commit

**TDD**: false — 文档更新，无需测试代码

**Changes**:
1. 更新 `SKILL.md` D 节验证流程（第 150-162 行）
2. 更新 `SKILL.md` 提交序列中的 verify-switch 描述
3. 更新 `SKILL.md` "不要这样做" 节：移除 outdated verify-switch 限制，新增 worktree-remove 顺序要求
4. 更新 `references/commands.md` verify-switch 章节

**Verify**: `rg 'verify-switch' SKILL.md` ≥ 3 且 `rg '仅用于 ontology-worktree' references/commands.md` = 0 且 `rg 'worktree verify\|工作树验证\|branch-switch\|分支切换' SKILL.md` ≥ 2

**Done**:
任务产出：SKILL.md 和 commands.md 反映优化后的验证流程，遵循 skill-creator 规范
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1, Task 3 | fae | 无 | Task 1（complete 输出）和 Task 3（文档）无代码依赖，可并行 |
| 2 | Task 2 | fae | Task 1 | Task 2 依赖 Task 1 的 verify-switch 调用约定 |

Task 2 含 TDD（先写测试再实现），是三个 Task 中最重的。Task 1 和 Task 3 先完成以建立接口约定。
