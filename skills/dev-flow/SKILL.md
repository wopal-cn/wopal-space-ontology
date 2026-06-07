---
name: dev-flow
description: |
  Issue/Plan 驱动的开发工作流。⚠️ 任务需以 GitHub Issue 或 Plan 为执行载体。
  🔴 Trigger: "#14"、"创建 issue"、"出个计划"、"实施 plan"、"执行计划"、Plan 生命周期推进（approve/complete/verify/archive）、从 PRD 拆分 Issue。
  ❌ Skip: spec 驱动流程、单纯研究/讨论/解释、不需 Issue/Plan 的临时小改动。
---

# dev-flow — Issue / Plan 驱动开发流程

## 心智模型

dev-flow 管理两类产物，它们在 git 中独立演化：

| 产物 | 什么 | 谁提交 | 何时提交 |
|------|------|--------|----------|
| **Plan 文件** | 状态、checkbox、元数据 | `flow.sh` 脚本自动提交 | 状态推进时（submit/approve/complete/verify/archive） |
| **实施代码** | 源码、测试、文档变更 | agent（Wopal 或 fae）手动提交 | rook PASS 后、`complete` 之前 |

**铁律：脚本永远不碰代码。** `flow.sh` 的所有命令只操作 Plan 文件，不会 add、commit、merge、push 任何实施代码。代码的 commit 和 feature → 集成分支的 merge 由 agent 负责；push 由用户独占。

**实施产物 = 原子单元。** 实施代码变更 + Task Done checkbox + Agent Verification checkbox 是一个原子单元，同一次 commit 提交。禁止拆成多次 commit。

## 状态机

`planning → reviewing → executing → verifying → done`

| 命令 | 前置状态 | 后置状态 | Plan 操作 | 代码操作 |
|------|---------|---------|-----------|----------|
| `plan` | 无 | `planning` | 脚本提交 Plan | — |
| `submit` | `planning` | `reviewing` | 脚本提交 Plan status | — |
| `approve --confirm` | `reviewing`/`planning` | `executing` | 脚本提交 Plan status + worktree 元数据 | — |
| `complete` | `executing` | `verifying` | 脚本提交 Plan status | **脏树报错退出** |
| `verify --confirm` | `verifying` | `done` | 脚本提交 Plan status | — |
| `archive` | `done` | 归档 | 脚本提交 Plan 归档 + worktree 清理 | — |

命令顺序不合法时，回到正确状态顺序执行，不要强行推进。

## 提交序列

一次完整 Plan 的 git 提交序列（feature 分支视角）：

```
1. plan / submit / approve     → 脚本自动提交 Plan 文件（集成分支）
2. fae 实施                     → 变更留在 working tree，不提交
3. rook PASS                    → 触发下一步
4. agent 提交实施产物           → 一次 commit：代码 + Task Done + AC checkbox（feature 分支）
5. flow.sh complete             → 脚本自动提交 Plan status → verifying（feature 分支）
6. verify-switch → 用户验证    → 用户操作，无脚本提交
7. agent merge feature → 集成分支  → agent 操作（不删 feature 分支，留给 archive 清理）
8. flow.sh verify --confirm    → 脚本自动提交 Plan status → done（集成分支）
9. flow.sh archive              → 脚本自动提交 Plan 归档（集成分支）
```

**常见错误**：在步骤 4 之前执行 `complete`（代码未提交 → 报错）；步骤 4 拆成多次 commit（碎片化历史）；checkbox 单独 commit（多余 commit）。

## 核心原则

1. **Plan 先行**：先进入 Plan 生命周期，再开始实施。Plan 必须通过 `flow.sh plan ...` 创建或定位，禁止手写创建。
2. **人类授权门**：`approve --confirm` 和 `verify --confirm` 都需要用户明确授权，禁止未经授权执行。
3. **脚本不碰代码**：`flow.sh` 所有命令只操作 Plan 文件，不提交实施代码。`complete` 遇脏树报错退出。
4. **实施产物原子提交**：代码变更 + Task Done checkbox + Agent Verification checkbox 在一次 commit 中提交，不可拆分。
5. **活动 Plan 路径**：委派实施时，Plan 路径必须使用 feature 分支 worktree 中的活动副本，禁止使用 main 分支路径。
6. **rook 门禁**：Plan 审查（submit 前）和实施审查（complete 前）必须委派 rook，rook PASS 才能推进。最多 3 轮修订。

## Plan 定位

当用户提到某个 Plan 名称（如 `155-enhance-dev-flow`）时，**必须**用脚本定位，**严禁** `grep`、`glob`、`read` 在空间内盲目搜索。

- `flow.sh plan <name>` — 快速定位 Plan 文件路径（O(1)）
- `flow.sh plan status <name>` — 查看 Plan 完整状态，含状态机位置、关联 Issue、worktree 信息
- `flow.sh plan list` — 浏览所有活跃 Plan（含 `--issue` 模式查看 GitHub Issues）

## 验证纪律

验证分三层，每层的责任人和规则不同。

### 第一层：Task Done（fae 即时勾选）

每个 Task 完成 → 运行 Task 内的 Verify 命令 → 通过后**立即勾选** Done checkbox。

- 委派 fae 的 prompt 必须包含"完成后勾选 Plan 中对应 Task 的 Done checkbox"指令
- 禁止积压到阶段末尾统一补勾

### 第二层：Agent Verification（Wopal 实证勾选）

rook 审查 PASS 后，Wopal **必须逐项真实验证** Agent Verification 的每个 AC。

验证方法：按 AC 描述**运行命令、检查输出、确认结果**。不能凭记忆或推测打勾，不能被 `complete` 脚本报错催着补勾。

AC 全部通过 → 勾选 Agent Verification checkbox → 与代码一起提交（见提交序列步骤 4）。

### 第三层：User Validation（用户独占）

用户验证功能是否符合预期。checkbox 勾选权在用户，Agent **绝对禁止**代勾。

Agent 可以执行验证动作、展示结果，但必须等用户明确确认。

## 标准流程

### A. Planning

```bash
flow.sh plan <issue>                    # Issue 驱动
flow.sh plan --title "..." --project <name> --type <type>  # 无 Issue
```

完整命令链：`plan → submit → approve --confirm → complete → verify --confirm → archive`。

**Plan 目录**：标准项目 `projects/<project>/docs/plans/`；ontology-worktree `.wopal/docs/plans/`。`--project` 必填。

### B. Plan 审查与提交

```bash
flow.sh plan <issue> --check           # 校验 Plan 质量
flow.sh sync <issue> --body-only       # 同步 Issue body（如需）
```

1. 委派 rook 审 Plan（强制）— prompt 契约见 agents-collab
2. rook PASS → `flow.sh submit <issue>`（planning → reviewing）
3. rook REVISE/BLOCK → 修订后重审（最多 3 轮）
4. 等用户审批后：`flow.sh approve <issue> --confirm`（reviewing/planning → executing）

### C. Executing

1. `flow.sh approve <issue> --confirm`（默认创建 worktree）
2. 委派 fae 实施（prompt 含活动 Plan 路径 + Done checkbox 指令）
3. fae 完成 Task → Verify 通过 → 即时勾选 Done checkbox
4. 全部 Task 完成 → Wopal **逐项实证** Agent Verification AC
5. AC 通过 → 勾选 checkbox，**与代码一起一次 commit**（提交序列步骤 4）
6. 委派 rook 审查实施（强制）
7. rook PASS → `flow.sh complete <issue>`（脚本提交 Plan status → verifying）

**委派要点**：
- 实施 → fae；审查 → rook
- fae 保留策略：rook 审查未完成前不 finish fae task（上下文 >50% 例外）
- rook 契约格式见 agents-collab；rook 自行加载 df-plan-review / df-implement-review

`complete` 硬门控：所有 Task Done ✓ + Agent Verification ✓ + rook PASS ✓ + 实施代码已提交。

**⚠️ complete 时序铁律（严格约束）**：
实施代码提交 → rook PASS 后，Wopal **必须**立即执行 `flow.sh complete <issue>` 将 Plan 状态推进至 `verifying`，然后才能进入用户验证环节。

违反模式：实施代码提交 → 跳过 `complete` → 直接邀约用户"验证/验收/测试" → 用户确认后才发现 Plan 还在 `executing`。

正确模式：实施代码提交 → rook PASS → **`flow.sh complete`**（`executing→verifying`） → 再向用户发出任何验证邀约。

Plan 状态未达 `verifying` 之前，Wopal 不得以任何形式（口头提示、命令行建议、checkbox 勾选邀请）请求用户进行功能验证。此规则是 Wopal 的自主执行义务，不依赖用户提醒。违反 = 严重失职。

### D. 验证（verifying）

`complete` 后 Plan 状态为 `verifying`，代码和 Plan 都在 feature 分支上。

统一流程：
1. `flow.sh verify-switch <issue>` — 确认后切换工作空间到 feature 分支
2. 用户验证功能（重启 ellamaka / 运行测试 / 体验流程）
3. agent merge（feature → 集成分支，**不删 feature 分支**，留给 archive 清理）
4. agent 在集成分支执行 `flow.sh verify <issue> --confirm` — 校验 merge 已完成 → done
5. agent 执行 `flow.sh archive <issue>`

**standard 项目**：verify-switch 清理 worktree 后，用户在项目目录验证，agent 在集成分支上 merge feature。
**ontology-worktree**：verify-switch 切换 `.wopal/` 到 feature 分支，用户重启 ellamaka 验证后，agent 在 `space/main` 分支上 merge feature。

### E. Done

```bash
flow.sh verify <issue> --confirm
```

前置：Plan 状态 = `verifying`，User Validation checkbox 已勾选，feature 分支已合并到集成分支。

脚本在集成分支提交 Plan-only commit（`verifying` → `done`）。

### F. Archive

```bash
flow.sh archive <issue>
```

前置：Plan 状态 = `done`。脚本归档 Plan、清理 worktree、更新 Issue 链接。

## 人类授权门

| 命令 | 用户信号 |
|------|---------|
| `approve --confirm` | "审批通过"、"approved"、"可以开始" |
| `verify --confirm` | "验证通过"、"没问题"、"validation passed" |
| `reset` | "重置"、"reset" |

`submit` 不需要用户授权——Plan 审阅通过后 agent 可直接执行。`approve` 不带 `--confirm` 直接报错，提示使用 `submit`。

## 分支归属

| 阶段 | 归属分支 | 提交者 | 内容 |
|------|---------|--------|------|
| `planning` / `submit` / `approve` | 集成分支 | 脚本 | Plan 文件状态变更 |
| `executing`（实施代码） | feature 分支 | agent | 实施产物（代码 + checkbox） |
| `complete` | feature 分支 | 脚本 | Plan status → verifying |
| `agent merge feature → 集成分支` | 集成分支 | agent | 代码 merge（不脚本化、不删 feature 分支） |
| `verify --confirm` | 集成分支 | 脚本 | Plan status → done |
| `archive` | 集成分支 | 脚本 | Plan 归档 + worktree 清理 |

## 委派规则

| 原则 | 说明 |
|------|------|
| 优先 `wopal_task` | 委派时必须优先用 `wopal_task`，不可用时才用 Task |
| 委派前检查 | 加载记忆"委派"、检查路径（基于空间根的相对路径）、确认项目上下文 |
| 活动 Plan 路径 | 委派 prompt 使用 feature 分支 worktree 中的 Plan 路径 |
| Done checkbox 指令 | 委派 fae 的 prompt 必须包含"完成后勾选对应 Task 的 Done checkbox" |
| 树交接失败 | complete 因脏树报错 → 要求 fae 提交代码后重试 |

## 不要这样做

- **跳过 dev-flow 直接手动操作** — Issue/Plan 驱动的任务必须走 `flow.sh` 命令链
- **跳过 rook 审查直接 submit 或 complete** — Plan 审查和实施审查都是强制门禁
- **rook BLOCK 后强行 submit 或 complete** — 必须修订后重审，最多 3 轮
- **fae 实施期间逐 Task 提交代码** — 所有变更留在 working tree，rook PASS 后一次提交
- **checkbox 单独 commit** — 实施产物 = 代码 + checkbox，同一次 commit
- **未实际验证就勾选 AC** — 必须运行命令、检查输出，凭记忆打勾 = 严重失职
- **被 `complete` 报错催着补勾** — 应在 rook PASS 后立即实证，不是等到 `complete` 才发现
- **User Validation 越权代勾** — checkbox 勾选权在用户
- **grep/glob 搜索 Plan** — 使用 `flow.sh plan <name>` 或 `flow.sh plan status <name>`
- **`approve` 不带 `--confirm`** — 报错退出，使用 `submit` 提审
- **`verify-switch` 用于 standard 项目以外的场景** — standard 直接在 worktree 目录验证
- **合并后手动删除 feature 分支** — 保留到 `archive` 自动清理，确保 `verify --confirm` 能检测 merge 状态
- **跳过 `complete` 直接邀用户验证** — 代码提交 + rook PASS 后必须先 `flow.sh complete` 推进到 `verifying`，然后才能进入用户验证。未达 `verifying` 前请求用户验收 = 严重失职

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
