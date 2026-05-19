---
name: dev-flow
description: |
  Issue / Plan 驱动的开发工作流。⚠️ 只有当任务以 GitHub Issue 或 Plan 作为执行载体时才使用本技能。

  必须使用本技能的场景：
  - 开发、修复、重构某个 GitHub Issue（如 "#14"、"这个 issue"、"处理 issue 120"）
  - 创建、修改、推进、验证、归档 Plan
  - 用户要求“写个方案 / 出个计划 / 开始开发 / 继续开发 / 执行计划”，且任务会通过 Plan 落地执行
  - 从 PRD 拆分 Issue

  不使用本技能的场景：
  - spec 驱动流程（Spec / OpenSpec / spec-first / spec-kit）
  - 单纯研究、讨论、解释、评审
  - 不需要 Issue 或 Plan 承载的临时小改动

  🔴 判断标准：任务是否要进入 “Issue / Plan → 实施 → 验证 → 归档” 这条开发链路。只有是，才使用本技能。

  依赖：git-worktrees 技能（可选，用于隔离开发环境）
compatibility:
  - bash 3.x+
  - gh CLI
  - jq
---

# dev-flow — Issue / Plan 驱动开发流程

统一状态机：

```text
planning → executing → verifying → done
```

统一命令链：

```text
plan → approve → approve --confirm → complete → verify --confirm → archive
```

## 核心原则

1. 先进入 Plan 生命周期，再开始实施。
2. `approve --confirm` 和 `verify --confirm` 都是人类授权门。
3. `complete` 只表示“实施完成，进入用户验证阶段”，不代表“用户已验证通过”。
4. `archive` 只做归档收尾，不承担验证职责。

## 最容易遗漏的两步

1. **Plan 写完后：`--check` → 必要时 `sync <issue> --body-only` → `approve` → 等用户审批。**
2. **实施完成后：每个 Task 运行 Verify 通过后勾选 Done → 完成 Agent Verification → `complete` → 再等用户验证。**

   **Done 勾选范围**：
   - Implementation：每个 Task 的 **Done** 里的 `- [ ]` checkbox
   - Agent Verification：`### Agent Verification` 中的 `- [ ]` checkbox

   `complete` 会强制校验以上所有 Done checkbox 必须全部勾选，否则阻断并提示。

## 状态机与命令映射

| 命令 | 前置状态 | 后置状态 | 作用 |
|------|---------|---------|------|
| `plan` | 无 / 初始 | `planning` | 创建或定位 Plan |
| `approve` | `planning` | `planning` | 校验 Plan，提交方案评审 |
| `approve --confirm` | `planning` | `executing` | 用户审批通过后开始实施 |
| `complete` | `executing` | `verifying` | 实施完成，进入用户验证阶段 |
| `verify --confirm` | `verifying` | `done` | 用户验证通过后进入 done |
| `archive` | `done` | 归档 | 归档 Plan，关闭 Issue |

命令顺序不合法时，回到正确状态顺序执行，不要强行推进。

## 人类授权门

| 命令 | 用户信号 |
|------|---------|
| `approve --confirm` | “审批通过”、“approved”、“可以开始” |
| `verify --confirm` | “验证通过”、“没问题”、“validation passed” |
| `reset` | “重置”、“reset” |

禁止：
- 未经授权执行任何 `--confirm`
- 跳过 `approve` 直接 `approve --confirm`
- 让用户自己执行这些脚本

## 标准流程

### A. 进入 planning

**Issue 驱动：**

```bash
flow.sh plan <issue>
```

**Plan 驱动（无 Issue）：**

```bash
flow.sh plan --title "<type>(<scope>): <description>" --project <name> --type <type> [--scope <scope>]
```

### B. Plan 写完后，进入方案评审

不要直接开工。按这个顺序推进：

1. 完成 Plan 编写；结构以 `templates/plan.md` 为准。
2. 显式运行校验：
   ```bash
   flow.sh plan <issue> --check
   ```
   无 Issue 模式则用原始 plan 参数重新定位并校验。
3. **仅 Issue 驱动**：如果 Plan 调整会影响 Issue body 展示内容，执行：
   ```bash
   flow.sh sync <issue> --body-only
   ```
   说明：
   - 会根据当前 Plan 重新生成 Goal、Scope、AC 等章节并覆盖 Issue body
   - **Plan 链接仅在审批通过后（executing+）才写入真实 URL，planning 状态显示 `_待关联_`**
   - 保守策略：只要你认为 Issue body 应更新，就重新同步一次
4. **委派 rook 审 Plan**（强制）：
   使用 `wopal_task({ agent: "rook" })` 委派 rook，加载 df-plan-review 技能审查 Plan。
   Prompt 契约格式（review_type, goal, plan_path, files_to_read, depth）见 agents-collab 技能「Rook 子代理」章节。
5. 根据 rook 判定处理：
   - **PASS**：继续步骤 6
   - **REVISE**：修订 Plan → 重新执行步骤 2-4
   - **BLOCK**：修复 Plan → 重新执行步骤 2-4
   - **连续 3 轮 BLOCK/REVISE**：保留分歧注释，由用户在步骤 6 时裁决
6. 通过后执行：
   ```bash
   flow.sh approve <issue>
   ```
7. 停止推进，等待用户审批。收到明确授权后，才能执行：
   ```bash
   flow.sh approve <issue> --confirm [--worktree]
   ```

不要这样做：
- Plan 刚写完就直接开始实施
- 忘记执行 `approve`
- Plan 已调整但 Issue 仍停留在旧内容
- **跳过 rook Plan 审查直接 approve**
- **rook BLOCK 后强行 approve**

### C. 进入 executing 后实施

实施过程中，每完成一个 Task 就运行 Verify 命令通过后立即勾选对应 Done checkbox，不要积压到最后统一补勾。

**委派原则**：

**实施类 Task → fae**：
- Wopal 是主控 Agent，所有实施类 Task 默认委派 fae 执行
- Wopal 的职责：Plan 切片 → 委派 fae → 验证产出 → 推进下一 Wave
- 例外（可由 Wopal 直接执行）：极小收尾工作（勾选 checkbox、同步 Issue body）、非代码操作（更新记忆、纯审查）
- "代码复杂"或"需谨慎"不是跳过委派的理由 — 越复杂的任务越应该委派

**审查类 Task → rook**：
- Plan 评审、代码审查、质量复核、目标验证等审查类 Task 默认委派 rook
- rook 是只读审查代理，不修复、不实施、只报告
- rook 返回 PASS/REVISE/BLOCK 结构化结果，Wopal 根据判定推进或修正

**完整职责链**：

```text
Plan 切片 → 委派 fae 实施 → 委派 rook 审查 → 根据结果推进/修正 → 下一 Wave
```

**硬门控**：fae 产出未经 rook 代码审查不得进入 `complete`。

**委派工具与交互机制**：见 agents-collab 技能（wopal_task 启动、wopal_task_output 检查、wopal_task_reply 交互与恢复、wopal_task_delete 清理、通知处理、异常恢复）。

### 任务消息格式

委派 fae 执行 Plan Task 时，使用以下格式构造 prompt：

**Plan 驱动任务**（推荐）：

    ## Plan
    读取 Plan 文件，按 Task <N> 执行：
    <Plan 文档绝对路径>

    ## 特别注意
    - <仅在 Plan 之外需要额外强调的事项，无则省略此节>

    ## 完成标准
    - <简要列出关键验证点>

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**无 Plan 的临时任务**：

    ## 目标
    <一句话>

    ## 文件
    - /path/to/file

    ## 步骤
    1. 读取相关文件
    2. 修改文件
    3. 运行验证

    ## 完成标准
    - 功能验证通过

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**原则**：有 Plan 时 Plan 是单一信息源，prompt 不重复 Plan 内容。细节让 fae 从 Plan 自行读取（含 Technical Context、Code References 等）。

### 委派 prompt 必含项

每次委派 fae 执行 Plan Task 时，prompt 末尾必须附加：

    完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），Plan 文件路径：<绝对路径>
    禁止修改 Plan Status

缺少此指令 = fae 不会主动更新 Plan，导致 Done 全部遗漏。这是结构性保障，不是可选项。

**Task 字段顺序与约束**：
- Verification Intent → Behavior → Files → Pre-read → Design → TDD → Changes → Verify → Done
- **Behavior 必填**：代码 Task（TDD=true）必须在 Behavior 中填写输入/输出映射；非代码 Task 可描述预期状态变化或跳过（TDD=false 时 Behavior 不强制）
- **Design 在 Behavior 后**：先定义"什么是对的"，再写实现设计
- **Changes 编号列表**：使用 `1. 2. 3.` 格式，禁止 checkbox

至少及时更新：
- `Implementation` 里的每个 Task 的 Done checkbox
- `Agent Verification` 的 checkbox

### D. 实施完成后，进入用户验证阶段

不要直接让用户验证。先完成这几步：

1. 回看 Plan，确认**所有 Task Done 都已勾选**。
2. **委派 rook 审 fae 实施结果**（强制）：
   使用 `wopal_task({ agent: "rook" })` 委派 rook，加载 df-implement-review 技能审查代码。
   Prompt 契约格式见 agents-collab 技能「Rook 子代理」章节。files_to_read 需包含 Plan 文档 + fae 修改的所有文件。
3. 根据 rook 判定处理：
   - **PASS**：继续步骤 4
   - **REVISE**：要求 fae 修正 → 修正后重新委派 rook → 重新执行步骤 1-3
   - **BLOCK**：要求 fae 修复 → 修复后重新委派 rook → 重新执行步骤 1-3
   - **连续 3 轮 BLOCK/REVISE**：保留分歧注释，由用户在 complete 时裁决
4. 通过后完成并勾选 `### Agent Verification`。
5. 然后必须执行：
   ```bash
   flow.sh complete <issue>
   ```

`complete` 的硬门控：
- Done completion：Implementation 中所有 Task 的 `- [ ]` Done checkbox 必须勾选
- Agent Verification：`### Agent Verification` 中所有 checkbox 必须勾选
- **rook 代码审查通过**：必须先委派 rook 审查并获得 PASS 判定

门控失败时会阻断并提示：
- 显示未勾选的步骤列表
- 提示 Agent 检查工作并完成勾选
- 提示未通过 rook 审查
- 再次执行 `complete`

`complete` 后，任务正式进入 `verifying`。

只有在仓库策略明确要求 Pull Request 时，才改用：

```bash
flow.sh complete <issue> --pr
```

不要这样做：
- Task 完成运行 Verify 通过后但不勾选 Done checkbox
- `Agent Verification` 未完成就推进
- 忘记执行 `complete`
- **跳过 rook 代码审查直接 complete**
- **rook BLOCK 后强行 complete**

### E. 用户验证通过后进入 done

用户完成验证并明确确认后，执行：

```bash
flow.sh verify <issue> --confirm
```

这一步的硬前提：
- Plan 当前状态是 `verifying`
- User Validation 最终 checkbox 已由用户勾选

### F. 最后归档

```bash
flow.sh archive <issue>
```

归档前提：Plan 状态已经是 `done`。

**归档时自动处理项目变更**：

归档时自动检测并处理项目仓库变更：
- 无 worktree：自动 commit + push 项目仓库未提交变更
- 有 worktree + PR 路径：仅清理 worktree
- 有 worktree + 无 PR 路径：合并分支到 main → push → 清理 worktree

冲突时归档会阻断并给出提示，需要手动解决冲突后重新执行。

## 主流路径

| 场景 | 命令路径 |
|------|----------|
| Issue 驱动 | `plan → --check → sync(issue, 如需) → approve → approve --confirm → complete → verify --confirm → archive` |
| Plan 驱动 | `plan → approve → approve --confirm → complete → verify --confirm → archive` |

补充：
- 无 Issue 模式下，没有 `sync` 这一步
- 无 Issue 模式下，后续统一用 `plan-name`

## worktree 场景

把 `--worktree` 视为隔离执行策略，而不是工作区不干净时的补救按钮。

优先在这些情况下使用 `--worktree`：
- 用户明确要求使用 worktree
- 希望把当前任务与其他工作隔离
- 多任务并行开发，避免上下文与改动互相污染
- 任务周期较长、改动面较大，或准备委派给 fae 持续执行

用法：

```bash
flow.sh approve <issue> --confirm --worktree
```

要点：
- 用户已明确说明使用 worktree 时，必须带 `--worktree`
- `--worktree` 只在真正进入 `executing` 时使用
- 目标项目工作区不干净，不是选择 worktree 的理由本身，而是禁止继续在当前工作区执行的信号
- 不带 `--worktree` 且目标项目工作区不干净时，命令会阻断；此时应先清理/提交当前变更，或改用 `--worktree`
- worktree 创建失败时，状态应保持在 `planning`

**创建后必须验证目录结构**，防止在错误路径下编辑：

```bash
ls .worktrees/<project>-issue-<N>-*/
```

| 项目类型 | worktree 内结构 | 注意事项 |
|----------|---------------|---------|
| `ontology-worktree` | 平铺：`skills/`、`wopal-plugin/` 直接在根目录 | 不嵌套 `.wopal/` 子目录；编辑时用 worktree 内的正确相对路径 |
| `standard` | 保持项目原结构 | 与主工作空间结构一致 |

禁止在主工作空间对应目录编辑——所有变更必须在 worktree 路径下进行，防止污染运行时环境。

## PR（高级可选）

默认主流程不走 PR。

只在这些情况下使用 `--pr`：
- 目标仓库要求通过 PR 合并代码
- 你明确需要 GitHub Review / CI / branch protection 这条流程

最小记忆即可：

```text
complete --pr → PR opened → PR merged → verify --confirm → archive
```

如果不确定，就不要走 PR 路径。

## Plan 质量门

进入 `approve` 前，Plan 必须达到可执行质量，而不是空提纲。

SKILL.md 不重复模板章节内容，只规定流程要求：
- Plan 写完后先做质量校验
- 校验覆盖 Task 新字段（Verification Intent / Behavior / Design / TDD / Verify / Done）
- 校验通过后再进入 `approve`
- 实施过程中每完成 Task 运行 Verify 后勾选 Done
- 实施完成后补齐 `Agent Verification`，再执行 `complete`
- Delegation Strategy 的详细规则见模板注释（Wave 分配、委派规则、Autonomous 标记等）

**TDD 默认规则**：
- **代码 Task 默认启用 TDD**：Agent 编写 Plan 时应自动为代码变更 Task 设置 `**TDD**: true`，遵循 RED-GREEN-REFACTOR 流程，并填写 Behavior 字段（输入/输出映射）
- **非代码 Task 显式声明 false**：UI 布局、配置变更、胶水代码、探索性原型等不适合 TDD 的场景，需显式设置 `**TDD**: false`，并在注释中说明理由（如"TDD 不适用：纯 UI 样式调整，无业务逻辑"）
- 参考 `references/tdd-guide.md` 的判断启发式

如果 `approve` 被 check-doc 阻断，先修 Plan，再重试。

## Acceptance Criteria 的使用方式

### Agent Verification

由 agent 在 `complete` 前完成并勾选，用于机器可验证项。

**命令化要求**：每条必须写具体命令和预期输出（如 `rg -c 'pattern' file` ≥ 1），禁止纯描述性条目（如"代码构建通过"）。同时承载单 Task 内验证和跨 Task 集成验证。

### User Validation

由用户在真实验证后确认，用于人工感知项，如 UI / UX、业务流程、集成行为。

**排除规则**：禁止放入 Agent 可自动验证的项（构建、测试、lint、CLI 自测）。详细规则见 `references/plan-validation.md`。

关键约束：
- Agent 不得代勾选 User Validation 最终 checkbox
- `verify --confirm` 会严格检查这道门

## 命令面速查

### `flow.sh issue create`

创建规范化 Issue。开发任务建 Issue 时只用这个入口。

```bash
flow.sh issue create --title "<type>(<scope>): <description>" --project <name> [options]
```

**必填参数**：
- `--goal "<一句话目标>"` — 必填，不传会产生占位符 `<一句话描述目标>`
- title 的 `<description>` 必须是英文祈使句（≤50 chars），格式如 `add missing config keys`

**常用参数**：
- `--background`
- `--scope`
- `--out-of-scope`
- `--reference`

类型专属参数按需使用：
- perf：`--baseline` / `--target`
- refactor：`--affected-components` / `--refactor-strategy`
- docs：`--target-documents` / `--audience`
- test：`--test-scope` / `--test-strategy`
- fix：`--confirmed-bugs` / `--cleanup-scope` / `--key-findings`

### `flow.sh issue update`

```bash
flow.sh issue update <issue> [options]
```

适合补充 Goal、Background、Scope、Acceptance Criteria 及各类型特定字段。

### `flow.sh sync`

手动把 Plan 同步回 Issue，不推进状态。

```bash
flow.sh sync <issue>
flow.sh sync <issue> --body-only
flow.sh sync <issue> --labels-only
```

### `flow.sh status`

```bash
flow.sh status <issue-or-plan-name>
```

显示：Issue 标题 / 状态 / labels、对应 Plan、Plan 状态、worktree 信息（若存在）。支持传入 Issue number 或 Plan 文件名（无 Issue 的 Plan 也能查到）。

### `flow.sh list`

```bash
flow.sh list
```

同时扫描 GitHub Issues（带 status/* label 的 open issue）和本地 Plan 文件（`docs/products/*/plans/*.md`，排除 done/），合并展示。无 Issue 关联的 Plan 显示为 `[status] <plan-name> (no issue)`。

### `flow.sh decompose-prd`

```bash
flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]
```

建议先：

```bash
flow.sh decompose-prd <prd-path> --dry-run
```

### `flow.sh reset`

Issue 驱动：

```bash
flow.sh reset <issue>
```

Plan 驱动：

```bash
flow.sh reset <plan-name>
```

这是破坏性操作，只在用户明确要求时执行。

## 边缘场景

1. **已有 Plan 再次执行 `plan`**：不重复创建，继续基于现有 Plan 推进。
2. **`complete` 时 Done 未勾选**：先勾选 Implementation 中所有 Task 的 Done checkbox，不要强行进入 `verifying`。
3. **`complete` 时 Agent Verification 未完成**：先补齐 `Agent Verification`，不要强行进入 `verifying`。
4. **rook 审查返回 BLOCK**：停止推进，根据 Blocker 要求 fae 修复，修复后重新委派 rook，不要强行 complete/approve。
5. **rook 审查连续 3 轮 BLOCK/REVISE**：保留分歧注释，停止循环，由用户在 approve/complete 时裁决，不要再委派 rook。
6. **`verify --confirm` 时 PR 未 merged**：先等 PR merge。
7. **`verify --confirm` 时用户未勾选最终 checkbox**：先让用户完成 User Validation。
8. **目标项目工作区不干净**：这表示当前工作区不适合继续执行；先清理/提交当前变更，或改用 `--worktree`。
9. **参数选择规则**：Issue 驱动一律传 issue number；无 Issue 的 Plan 驱动一律传 plan-name。

## 错误处理

| 错误 | 处理 |
|------|------|
| `Invalid transition` | 回到正确状态顺序执行 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修好 Plan 再 `approve` |
| `Done completion failed` | 勾选 Implementation 中所有 Task Done checkbox，再 `complete` |
| `Agent Verification failed` | 补齐 Agent Verification checkbox，再 `complete` |
| `dirty workspace` | 当前工作区不适合继续执行；先清理/提交，或改用 `--worktree` |
| `PR not merged yet` | 等 merge 后再 `verify --confirm` |
| `User Validation gate failed` | 让用户完成验证并勾选最终 checkbox |

## 参考

按需读取：

| 文件 | 用途 |
|------|------|
| `templates/plan.md` | Plan 骨架模板 |
| `templates/issue.md` | 通用 / feature / enhance / chore 类型 Issue 模板 |
| `templates/issue-fix.md` | fix 类型 Issue 模板 |
| `templates/issue-perf.md` | perf 类型 Issue 模板 |
| `templates/issue-refactor.md` | refactor 类型 Issue 模板 |
| `templates/issue-docs.md` | docs 类型 Issue 模板 |
| `templates/issue-test.md` | test 类型 Issue 模板 |
| `references/plan-validation.md` | Plan 校验规则（Agent/User 验证边界、新字段校验） |
| `references/tdd-guide.md` | TDD Task 编写指南（判断启发式、写法、提交建议） |
| `references/issue-format.md` | Issue 标题与 Plan 命名规范 |
