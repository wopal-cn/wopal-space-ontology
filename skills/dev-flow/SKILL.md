---
name: dev-flow
description: |
  Issue/Plan 驱动的开发工作流。⚠️ 任务需以 GitHub Issue 或 Plan 为执行载体。

  🔴 Trigger: "#14"、"这个 issue"、"出个计划"、"开始开发"、"执行计划"、Plan 生命周期推进（approve/complete/verify/archive）、从 PRD 拆分 Issue。
  ❌ Skip: spec 驱动流程、单纯研究/讨论/解释、不需 Issue/Plan 的临时小改动。
---

# dev-flow — Issue / Plan 驱动开发流程

## 状态机

`planning → executing → verifying → done`

| 命令 | 前置状态 | 后置状态 | 作用 |
|------|---------|---------|------|
| `plan` | 无 | `planning` | 创建或定位 Plan |
| `approve` | `planning` | `planning` | 校验 Plan，提交方案评审 |
| `approve --confirm` | `planning` | `executing` | 用户审批通过，开始实施 |
| `complete` | `executing` | `verifying` | 实施完成，Plan-only 提交活动 Plan |
| `verify --confirm` | `verifying` | `done` | 用户验证通过，Plan-only 提交到集成分支 |
| `archive` | `done` | 归档 | 归档 Plan，清理 worktree，关闭 Issue |

命令顺序不合法时，回到正确状态顺序执行，不要强行推进。

## 核心原则

1. **Plan 先行**：先进入 Plan 生命周期，再开始实施。Plan 必须通过 `flow.sh plan ...` 创建或定位，禁止手写创建。
2. **人类授权门**：`approve --confirm` 和 `verify --confirm` 都是用户授权，禁止未经授权执行。
3. **代码由实施 agent 提交**：`complete` 在脏实施树上报错退出，不提交代码——代码提交由 fae 负责。
4. **Plan-only commit**：生命周期脚本只提交 Plan 状态变更，不提交实施代码。
5. **活动 Plan 路径**：委派实施时，Plan 路径必须使用 feature 分支 worktree 中的活动副本，禁止使用 main 分支路径。

## 人类授权门

| 命令 | 用户信号 |
|------|---------|
| `approve --confirm` | "审批通过"、"approved"、"可以开始" |
| `verify --confirm` | "验证通过"、"没问题"、"validation passed" |
| `reset` | "重置"、"reset" |

## 标准流程

### A. Planning

```bash
flow.sh plan <issue>                    # Issue 驱动
flow.sh plan --title "..." --project <name> --type <type>  # 无 Issue
```

**Plan 目录**：标准项目 `projects/<project>/docs/plans/`；ontology-worktree `.wopal/docs/plans/`。`--project` 必填。

### B. Plan 审查

```bash
flow.sh plan <issue> --check           # 校验 Plan 质量
flow.sh sync <issue> --body-only       # 同步 Issue body（如需）
```

1. 委派 rook 审 Plan（强制）— prompt 契约见 agents-collab
2. rook PASS → 继续；REVISE/BLOCK → 修订后重审（最多 3 轮）
3. 通过后：`flow.sh approve <issue>`，停止推进，等用户审批

禁止：跳过 rook 审查直接 approve、rook BLOCK 后强行 approve。

### C. Executing

1. 用户审批后：`flow.sh approve <issue> --confirm`（默认创建 worktree）
2. 委派 fae 实施，每完成一个 Task 立即勾选 Done checkbox
3. 完成 Agent Verification 后委派 rook 审查（强制）
4. rook PASS → `flow.sh complete <issue>`

**委派要点**：
- 实施 → fae；审查 → rook
- fae 保留策略：rook 审查未完成前不 finish fae task（上下文 >50% 例外）
- rook 契约格式见 agents-collab；rook 自行加载 df-plan-review / df-implement-review

`complete` 硬门控：所有 Task Done ✓ + Agent Verification ✓ + rook PASS ✓。

### D. 验证（分项目类型）

`complete` 后 Plan 状态为 `verifying`，代码和 Plan 都在 feature 分支上。

**standard 项目**：
1. 用户直接在 worktree 目录验证（`cd .worktrees/<project>-*/`）
2. 验证满意后，Wopal 在项目仓库合并：`cd projects/<project>/ && git merge <branch>`
3. 执行 `flow.sh verify <issue> --confirm`
4. 执行 `flow.sh archive <issue>`

**ontology-worktree**：
1. Phase 1：`flow.sh verify-switch <issue>` — 切换 .wopal/ 到 feature 分支
2. 用户验证（重启 ellamaka 确认行为）
3. Phase 2：`flow.sh verify-switch <issue> --merge` — 合并回集成分支
4. 执行 `flow.sh verify <issue> --confirm`
5. 执行 `flow.sh archive <issue>`

### E. Done

```bash
flow.sh verify <issue> --confirm
```

前置：Plan 状态 = `verifying`，User Validation checkbox 已勾选（由用户或 rook 勾选），feature 分支已合并到集成分支。

`verify --confirm` 在集成分支上提交 Plan-only commit（`verifying` → `done`）。

### F. Archive

```bash
flow.sh archive <issue>
```

前置：Plan 状态 = `done`。归档 Plan，清理 worktree，更新 Issue 链接。

## Done 勾选范围

Implementation 中每个 Task 的 `- [ ]` checkbox，以及 `### Agent Verification` 中的所有 checkbox。`complete` 强制校验全部勾选。

**User Validation checkbox**：由用户或 rook 在审查通过后勾选，Wopal 不得自行代勾。

## Worktree 隔离（默认）

`approve --confirm` 默认创建 worktree。`--no-worktree` 跳过。

```yaml
- **Worktree**:
  - branch: <feature-branch-name>
  - path: <workspace-relative-worktree-path>
```

## Plan 分支归属

| 阶段 | 归属分支 | 说明 |
|------|---------|------|
| `planning` | 集成分支 | Plan 基线在集成分支上提交 |
| `executing` | feature 分支 | 实施在 worktree 中进行 |
| `complete` | feature 分支 | Plan-only 提交活动 Plan |
| `verify --confirm` | 集成分支 | Plan-only 提交到集成分支 |
| `archive` | 集成分支 | 移至 done/，清理 worktree |

## 委派规则

| 原则 | 说明 |
|------|------|
| 优先 `wopal_task` | 委派时必须优先用 `wopal_task`，不可用时才用 Task |
| 委派前检查 | 加载记忆"委派"、检查路径、确认项目上下文 |
| 活动 Plan 路径 | 委派 prompt 使用 feature 分支 worktree 中的 Plan 路径 |
| 树交接失败 | complete 因脏树报错 → 要求 fae 提交代码后重试 |

## 不要这样做

- Done checkbox 积压不即时勾选
- Agent Verification 未完成就推进
- 跳过 rook 审查直接 complete
- rook BLOCK 后强行 complete
- **User Validation 越权代勾** — 这是用户的验证权，不是 agent 的
- **verify-switch 误用于 standard 项目** — standard 项目直接在 worktree 目录验证
- 未实际验证就标记 AC 完成

## 参考

| 文件 | 用途 |
|------|------|
| `references/commands.md` | 命令完整参数与使用模式 |
| `references/plan-authoring.md` | Plan 质量门、AC、TDD、委派 prompt 格式 |
| `references/plan-branch-ownership.md` | Plan 分支归属完整说明 |
| `references/troubleshooting.md` | 错误处理、边缘场景、PR 工作流 |
| `templates/plan.md` | Plan 骨架模板 |
| `templates/issue*.md` | 各类型 Issue 模板 |
| `references/plan-validation.md` | Plan 校验规则 |
| `references/tdd-guide.md` | TDD Task 编写指南 |
| `references/issue-format.md` | Issue 标题、Plan 命名规范 |
