---
name: dev-flow
description: |
  Issue/Plan 驱动的开发工作流。⚠️ 任务需以 GitHub Issue 或 Plan 为执行载体。

  🔴 Trigger: "#14"、"这个 issue"、"出个计划"、"开始开发"、"执行计划"、Plan 生命周期推进（approve/complete/verify/archive）、从 PRD 拆分 Issue。
  ❌ Skip: spec 驱动流程、单纯研究/讨论/解释、不需 Issue/Plan 的临时小改动。
compatibility:
  - bash 3.x+
  - gh CLI
  - jq
---

# dev-flow — Issue / Plan 驱动开发流程

统一状态机：`planning → executing → verifying → done`

统一命令链：`plan → approve → approve --confirm → complete → verify --confirm → archive`

## 核心原则

1. 先进入 Plan 生命周期，再开始实施。
2. `approve --confirm` 和 `verify --confirm` 都是人类授权门。
3. `complete` 表示"实施完成，代码已提交，进入用户验证阶段"，不代表"用户已验证通过"。
4. `archive` 只做 push + 归档收尾，不承担验证职责。

## 最容易遗漏的两步

1. **Plan 写完后**：`--check` → 必要时 `sync <issue> --body-only` → `approve` → 等用户审批。
2. **实施完成后**：每个 Task 运行 Verify 通过后立即勾选 Done → 完成 Agent Verification → `complete` → 再等用户验证。

**Done 勾选范围**：Implementation 中每个 Task 的 `- [ ]` checkbox，以及 `### Agent Verification` 中的所有 checkbox。`complete` 强制校验全部勾选。

## 状态机与命令映射

| 命令 | 前置状态 | 后置状态 | 作用 |
|------|---------|---------|------|
| `plan` | 无 | `planning` | 创建或定位 Plan |
| `approve` | `planning` | `planning` | 校验 Plan，提交方案评审 |
| `approve --confirm` | `planning` | `executing` | 用户审批通过，开始实施 |
| `complete` | `executing` | `verifying` | 实施完成，提交代码 |
| `verify --confirm` | `verifying` | `done` | 用户验证通过 |
| `archive` | `done` | 归档 | push 代码，归档 Plan，关闭 Issue |

命令顺序不合法时，回到正确状态顺序执行，不要强行推进。

## 人类授权门

| 命令 | 用户信号 |
|------|---------|
| `approve --confirm` | "审批通过"、"approved"、"可以开始" |
| `verify --confirm` | "验证通过"、"没问题"、"validation passed" |
| `reset` | "重置"、"reset" |

禁止未经授权执行任何 `--confirm`；禁止跳过 `approve` 直接开工。

## 标准流程

### A. 进入 planning

Issue 驱动：`flow.sh plan <issue>`。无 Issue：`flow.sh plan --title "..." --project <name> --type <type>`。

### B. Plan 写完后，方案评审

1. 完成 Plan 编写，运行 `flow.sh plan <issue> --check`
2. Issue 驱动时若 Plan 影响 Issue body，执行 `flow.sh sync <issue> --body-only`
3. **委派 rook 审 Plan**（强制）—— prompt 契约格式见 agents-collab
4. 根据 rook 判定：PASS → 继续；REVISE/BLOCK → 修订后重审（最多 3 轮）
5. 通过后：`flow.sh approve <issue>`，停止推进，等用户审批
6. 用户授权后：`flow.sh approve <issue> --confirm [--worktree]`

禁止：跳过 rook 审查直接 approve、rook BLOCK 后强行 approve。

### C. 进入 executing 后实施

每完成一个 Task 立即勾选 Done checkbox，不积压。

**委派体系**：

- 实施 Task → 委派 fae。Wopal 职责：切片 → 委派 → 验证 → 推进下一 Wave
- 审查 Task → 委派 rook。rook 返回 PASS/REVISE/BLOCK

```text
Plan 切片 → 委派 fae 实施 → 委派 rook 审查 → 根据结果推进/修正 → 下一 Wave
```

**fae 保留策略**：rook 审查未完成前不 finish fae task（上下文 >50% 例外）。rook REVISE/BLOCK 时 reply 同一 fae 修复，不新开 task。

**rook 委派时机**：
1. Plan 写完后（approve 前）— 审方案质量
2. fae 关键波次后 — 复核代码
3. fae 最终交付后（complete 前）— 最终审查

rook 契约格式见 agents-collab。委派 rook 前不预加载 df-plan-review / df-implement-review —— rook 自行加载。

**委派 prompt 必须**：末尾附加 Done checkbox 更新指令（格式见 `references/delegation-templates.md`）。

### D. 实施完成后，进入用户验证

1. 确认所有 Task Done 已勾选
2. **委派 rook 审 fae 实施结果**（强制，prompt 格式见 agents-collab）
3. 根据 rook 判定：PASS → 继续；REVISE/BLOCK → fix + re-review（最多 3 轮）
4. 通过后勾选 `### Agent Verification`
5. `flow.sh complete <issue>`

`complete` 硬门控：所有 Task Done ✓ + Agent Verification ✓ + rook PASS ✓。

### worktree 隔离下的验证切换

`complete` 后代码在 feature 分支。用户验证需切换运行时环境：

**ontology-worktree**：
```bash
# 移除隔离 worktree
git -C ~/.wopal/ontologies/wopal-space-ontology worktree remove .worktrees/ontology-issue-<N>-<slug> --force
# 切换运行时
git -C .wopal checkout <feature-branch>
# 提示用户重启验证
```

**Wopal 自动执行**：用户确认验证通过后，必须自动执行三步——用户只需说"验证通过"：
```bash
git -C .wopal checkout space/main
git -C .wopal merge <feature-branch>
flow.sh verify <issue> --confirm
```

**严禁**在验证前 merge feature 分支到主分支——提前 merge 后回退需 revert，revert 会在后续 merge 时产生大量冲突。

### E. 用户验证通过后进入 done

用户确认后：`flow.sh verify <issue> --confirm`。前置：Plan 状态 = `verifying`，User Validation 最终 checkbox 已勾选。

### F. 最后归档

`flow.sh archive <issue>`。前置：Plan 状态 = `done`。

## 主流路径

| 场景 | 命令路径 |
|------|----------|
| Issue 驱动 | `plan → --check → sync(如需) → approve → approve --confirm → complete → verify --confirm → archive` |
| Plan 驱动 | `plan → approve → approve --confirm → complete → verify --confirm → archive` |

## worktree 场景

`--worktree` 是隔离执行策略。优先使用场景：多任务并行、改动面大、或用户明确要求。

```bash
flow.sh approve <issue> --confirm --worktree
```

创建后验证目录结构：`ls .worktrees/<project>-issue-<N>-*/`

禁止在主工作空间编辑——所有变更在 worktree 内进行。

## 不要这样做

- Task 完成但不勾选 Done checkbox
- Agent Verification 未完成就推进
- 忘记执行 `complete`
- 跳过 rook 审查直接 complete
- rook BLOCK 后强行 complete
- 用户验证通过前 merge feature 分支到主分支——提前 merge 留下 revert 补丁，后续 merge 产生大量冲突

## 参考

按需读取：

| 文件 | 用途 |
|------|------|
| `references/commands.md` | 7 个 flow.sh 子命令的完整参数和用法 |
| `references/delegation-templates.md` | 委派 prompt 格式、Task 字段顺序、TDD 规则 |
| `references/plan-quality.md` | Plan 质量门、AC 分类（Agent vs User Validation） |
| `references/troubleshooting.md` | 边缘场景与错误处理 |
| `references/pr-workflow.md` | PR 工作流（可选） |
| `templates/plan.md` | Plan 骨架模板 |
| `templates/issue*.md` | 各类型 Issue 模板 |
| `references/plan-validation.md` | Plan 校验规则 |
| `references/tdd-guide.md` | TDD Task 编写指南 |
| `references/issue-format.md` | Issue 标题与 Plan 命名规范 |
