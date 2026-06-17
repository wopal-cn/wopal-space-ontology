---
name: dev-flow
description: |
  Issue/Plan 驱动的开发工作流。⚠️ 任务需以 GitHub Issue 或 Plan 为执行载体。
  🔴 Trigger: "#14"、"创建 issue"、"出个计划"、"实施 plan"、"执行计划"、"check plan"、"verify plan"、Plan 生命周期推进（approve/complete/verify/archive）、从 PRD 拆分 Issue。
  ❌ Skip: spec 驱动流程、单纯研究/讨论/解释、不需 Issue/Plan 的临时小改动。
---

# dev-flow — Issue / Plan 驱动开发流程

## 脚本执行

所有 `flow.sh` 命令必须从本技能根目录执行：

- **workdir**: `.wopal/skills/dev-flow/`
- **命令格式**: `bash scripts/flow.sh <command> [args]`

本文档中所有 `flow.sh xxx` 引用（如 `flow.sh plan new`、`flow.sh complete`、`flow.sh verify-switch`）均按此方式执行。禁止 `source`、禁止绝对路径直接调用、禁止在非技能目录下执行。

## 命令速查

详细参数和边缘场景见 `references/commands.md`。

### 状态机推进

| 命令 | 场景 | 说明 |
|------|------|------|
| `plan new <issue>` | 创建 Plan | Issue 驱动；无 Issue 用 `--title --project --type` |
| `plan status <name>` | 查看 Plan 状态 | 含状态机位置、关联 Issue、worktree 信息 |
| `plan list [--issue]` | 浏览活跃 Plan | `--issue` 含 GitHub Issues 合并展示 |
| `plan check <name>` | 校验 Plan 质量 | submit 前必走 |
| `submit <plan>` | planning → reviewing | 提交人工审阅 |
| `approve <plan> --confirm` | reviewing → executing | 用户审批，默认创建 worktree；`--no-worktree` 跳过 |
| `complete <plan>` | executing → verifying | 实施完成，进入用户验证；脏树报错退出 |
| `verify <plan> --confirm` | verifying → done | 用户验证通过；需先 merge feature → 集成分支 |
| `archive <plan>` | done → 归档 | 归档 Plan、清理 worktree 和 feature 分支 |

### 验证辅助

| 命令 | 场景 | 说明 |
|------|------|------|
| `verify-switch <plan>` | 需在规范路径验证 | 移除 worktree + checkout feature 分支 |

### Issue 管理

| 命令 | 场景 | 说明 |
|------|------|------|
| `issue create --title "..." --project <name> --body-file <path>` | 创建 Issue | `--body-file` 为主路径 |
| `issue write <issue> --body-file <path>` | 全量替换 Issue body | |
| `sync <plan> [--body-only\|--labels-only]` | Plan → Issue 同步 | Plan 内容变更后必走 |

### 其他

| 命令 | 场景 | 说明 |
|------|------|------|
| `decompose-prd <prd-path>` | 从 PRD 拆分 Issue | `--dry-run` 预览 |
| `roadmap <prd-path> --product <name>` | 产品阶段规划 | 四阶段工作流 |
| `reset <plan>` | 重置 Plan | 破坏性，仅用户明确要求时使用 |

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

1. **Plan 先行**：先进入 Plan 生命周期，再开始实施。Plan 必须通过 `flow.sh plan new ...` 创建或定位，禁止手写创建。
2. **人类授权门**：`approve --confirm` 和 `verify --confirm` 都需要用户明确授权，禁止未经授权执行。
3. **脚本不碰代码**：`flow.sh` 所有命令只操作 Plan 文件，不提交实施代码。`complete` 遇脏树报错退出。
4. **活动 Plan 路径**：委派实施时，Plan 路径必须使用 feature 分支 worktree 中的活动副本，禁止使用 main 分支路径。
5. **rook 门禁**：Plan 审查（submit 前）和实施审查（complete 前）必须委派 rook，rook PASS 才能推进。最多 3 轮修订。
6. **Plan 语言与结构**：Plan 文档正文使用用户偏好语言编写，章节标题保持英文（与模板一致）。禁止混用中英文标题。

## Plan Task 字段要求

写 Plan 时每个 Task 必须包含以下字段（按顺序），详见 `references/plan-guide.md`：

| Field | Required | Format |
|-------|----------|--------|
| Verification Intent | ✅ | AC#N |
| Behavior | ✅ TDD=true | 输入 → 输出映射 |
| Files | ✅ | `path/to/file` |
| Pre-read | ✅ | 文件路径或 N/A |
| Design | ✅ | 完整实施设计（非空） |
| TDD | ✅ | true / false |
| Changes | ✅ | 编号列表（禁止 checkbox） |
| Verify | ✅ | 可执行命令 |
| Done | ✅ | 产出描述 + 1 个 checkbox |

**提交前必跑**：`flow.sh plan check <name>`

## Plan 定位

当用户提到某个 Plan 名称（如 `155-enhance-dev-flow`）时，**必须**用脚本定位，**严禁** `grep`、`glob`、`read` 在空间内盲目搜索。

- `flow.sh plan status <name>` — 查看 Plan 完整状态，含状态机位置、关联 Issue、worktree 信息
- `flow.sh plan list [--issue]` — 浏览所有活跃 Plan（`--issue` 模式查看 GitHub Issues）
- `flow.sh plan check <name-or-path>` — 校验 Plan 质量

## 验证纪律

验证分三层，每层的责任人和规则不同。

### 第一层：Task Done（fae 即时勾选）

每个 Task 完成 → 运行 Task 内的 Verify 命令 → 通过后**立即勾选** Done checkbox。

- 委派 fae 的 prompt 必须包含"完成后勾选 Plan 中对应 Task 的 Done checkbox"指令
- 禁止积压到阶段末尾统一补勾

### 第二层：Agent Verification（Wopal 实证勾选）

rook 审查 PASS 后，Wopal **必须逐项真实验证** Agent Verification 的每个 AC。

验证方法：按 AC 描述**运行命令、检查输出、确认结果**。不能凭记忆或推测打勾，不能被 `complete` 脚本报错催着补勾。

**修复后必须重新验证**：rook 审查返回 REVISE/BLOCK → fae 修复后，AC 必须重新运行验证命令，不能沿用修复前的结果。

AC 全部通过 → 勾选 Agent Verification checkbox → 与代码一起提交（见提交序列步骤 4）。

### 第三层：User Validation（用户独占）

用户验证功能是否符合预期。checkbox 勾选权在用户，Agent **绝对禁止**代勾。

Agent 可以执行验证动作、展示结果，但必须等用户明确确认。

## 标准流程

### A. Planning

```bash
flow.sh plan new <issue>                              # Issue 驱动
flow.sh plan new --title "..." --project <name> --type <type>  # 无 Issue
```

完整命令链：`plan new → plan check → rook review → submit → approve --confirm → complete → verify --confirm → archive`。

**Plan 目录**：
- 标准项目:  `projects/<project>/docs/plans/`；
- ontology-worktree项目: `.wopal/docs/plans/`。

### B. Plan 审查与提交

```bash
flow.sh plan check <name-or-path>   # 校验 Plan 质量（必走）
flow.sh sync <issue> --body-only    # 同步 Issue body（变更目标和范围必须）
```

1. 委派 rook 审 Plan（强制）— prompt 契约见 agents-collab
2. rook PASS → `flow.sh submit <issue>`（planning → reviewing）
3. rook REVISE/BLOCK → 修订后重审（最多 3 轮）
4. 等用户审批后：`flow.sh approve <issue> --confirm`（reviewing/planning → executing）

### C. Executing

1. `flow.sh approve <issue> --confirm`（默认创建 worktree）
2. 委派 fae 实施（prompt 含活动 Plan 路径 + Done checkbox 指令）
3. fae 完成 Task → Verify 通过 → 即时勾选 Done checkbox 和 git commit
4. 全部 Task 完成 → Wopal **逐项实证** Agent Verification AC
5. AC 通过 → 勾选 checkbox，**与代码一起一次 commit**（提交序列步骤 4）
6. 委派 rook 审查实施（强制）
7. rook PASS → `flow.sh complete <issue>`（脚本提交 Plan status → verifying）

**委派要点**：
- 实施 → fae；审查 → rook
- **上下文复用原则**：fae/rook 完成后，优先 `reply` 续审或修复，禁止 `finish` 后新开。前提：子任务上下文 < 50%
- 复用链路：fae IDLE → reply rook 续审 → rook REVISE → reply fae 修复 → fae fix IDLE → reply rook 续审 → rook PASS → finish 两个 task
- rook 契约格式见 agents-collab；rook 自行加载 df-plan-review / df-implement-review 技能

`complete` 硬门控：所有 Task Done ✓ + Agent Verification ✓ + rook PASS ✓ + 实施代码已提交。

**⚠️ complete 时序铁律（严格约束）**：
实施代码提交 → rook PASS 后，Wopal **必须**立即执行 `flow.sh complete <issue>` 将 Plan 状态推进至 `verifying`，然后才能进入用户验证环节。

违反模式：实施代码提交 → 跳过 `complete` → 直接邀约用户"验证/验收/测试" → 用户确认后才发现 Plan 还在 `executing`。

正确模式：实施代码提交 → rook PASS → **`flow.sh complete`**（`executing→verifying`） → 再向用户发出任何验证邀约。

Plan 状态未达 `verifying` 之前，Wopal 不得以任何形式（口头提示、命令行建议、checkbox 勾选邀请）请求用户进行功能验证。此规则是 Wopal 的自主执行义务，不依赖用户提醒。违反 = 严重失职。

### D. 验证（verifying）

`complete` 后 Plan 状态为 `verifying`。`complete` 会输出验证选项和规范路径 git status，
agent 必须将其完整传达给用户，由用户选择验证方式。

**分支生命周期铁律**：
- 分支创建：`approve --confirm`（脚本会自动创建）
- 分支删除：`archive`（脚本会自动删除）
- **Agent 唯一的分支操作是 merge**：`git checkout <集成分支> && git merge <feature>`
- Agent 禁止 `git branch -d/-D`、禁止 `git branch <name>`、禁止任何分支的创建或删除
- 工作树生命周期由脚本管理：`approve` 创建，`verify-switch` 或 `archive` 删除

#### 验证场景

`complete` 后 agent 必须将验证选项完整呈现给用户，由用户选择验证方式。
Agent 不得自行决定跳过任何场景。

##### 场景 1：工作树内验证

条件：有 worktree，且项目在 worktree 目录内可独立运行/测试（无路径依赖）。
流程：用户在 worktree 路径验证 → merge → verify --confirm → archive。

##### 场景 2：verify-switch 切换验证分支

条件：项目有路径依赖（目录结构要求、运行时加载路径、配置文件位置等），
必须在规范路径（repo 根目录）验证。适用于 standard 和 ontology-worktree 项目。
流程：agent 执行 `flow.sh verify-switch <issue>`（移除 worktree + checkout feature）→ 用户在规范路径验证 → merge → verify --confirm → archive。

##### 场景 3：先合并后验证

条件：用户希望在集成分支直接验证，无需保留 feature 分支隔离。
流程：merge → 用户在集成分支验证 → verify --confirm → archive。

##### 场景 4：无 worktree（`--no-worktree`）

条件：`approve --confirm --no-worktree` 时全程在集成分支，无 feature 分支。
流程：用户直接在集成分支验证 → verify --confirm → archive。

#### verify --confirm 内部机制

Agent 需要知道脚本做了什么，以便在出错时排查。

1. 状态门控：Plan status 必须为 `verifying`
2. 用户验证门控：User Validation checkbox 必须已勾选
3. **Merge 检测**（场景 4 自动跳过）：
   - 优先使用 `complete` 写入的 `Verification Commit`（SHA）做祖先检测：
     `git merge-base --is-ancestor <sha> <集成分支>`
   - SHA 检测不依赖 branch ref，合并后分支删除也能正常通过
   - 若无 `Verification Commit`（旧 Plan），回退到 branch ref 检测
   - 未合并时报错退出，提示 agent 先 merge
4. 状态转换：`verifying → done`，commit 在集成分支

#### Agent 检查清单

`complete` 后 agent 必须：
- [ ] 将 `complete` 输出的验证选项和路径状态完整传达给用户
- [ ] 等用户选择验证方式并确认验证通过
- [ ] merge feature → 集成分支（场景 1-3；场景 4 跳过）
- [ ] 执行 `flow.sh verify <issue> --confirm`
- [ ] 执行 `flow.sh archive <issue>`

Agent 不得：
- [ ] 未等用户确认就执行 merge 或 verify --confirm
- [ ] 创建或删除任何分支
- [ ] 删除工作树（verify-switch 和 archive 负责）
- [ ] 跳过 merge 直接 verify --confirm（场景 4 除外）

### E. Done

```bash
flow.sh verify <issue> --confirm
```

前置：Plan 状态 = `verifying`，User Validation checkbox 已勾选。

有工作树的场景（场景 1-3）还要求 feature 分支已合并到集成分支，
脚本通过 `Verification Commit` SHA 或 branch ref 检测合并状态。

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
| `complete` | feature 分支 | 脚本 | Plan status → verifying + Verification Commit SHA |
| `verify --confirm` | 集成分支 或 feature 分支 | 脚本 | Plan status → done（SHA 或 branch ref 检测 merge） |
| `agent merge feature → 集成分支` | 集成分支 | agent | 代码 merge（**不删 feature 分支**） |
| `archive` | 集成分支 | 脚本 | Plan 归档 + 删 worktree + 删 feature 分支 |

**--no-worktree 模式**：无 feature 分支，全部阶段在集成分支。

## 委派规则

| 原则 | 说明 |
|------|------|
| 优先 `wopal_task` | 委派时必须优先用 `wopal_task`，不可用时才用 Task |
| 委派前检查 | 加载记忆"委派"、检查路径（基于空间根的相对路径）、确认项目上下文 |
| 活动 Plan 路径 | 委派 prompt 使用 feature 分支 worktree 中的 Plan 路径 |
| Done checkbox 指令 | 委派 fae 的 prompt 必须包含"完成后勾选对应 Task 的 Done checkbox" + "每完成一个 task commit git" |
| 树交接失败 | complete 因脏树报错 → 要求 fae 提交代码后重试 |
| **委派边界** | Plan Task → 委派 fae；单文件小变更（删几行、改配置）→ 直接执行，不委派 |
| **强依赖处理** | 多 Task 存在强逻辑依赖时，整组委派给单个 fae，禁止拆分导致上下文丢失 |
| **非 dev-flow 的 rook** | 对话模式下小修小补，委派 rook 前先征得用户同意；dev-flow 中的 rook 审查自动执行 |
| **回复复用优先** | rook/fae 完成后，修复和复审必须 `reply` 续原 task，禁止 `finish` 后新开。前提：上下文 < 50%；> 50% 时 finish 后新开 |

## 不要这样做

- **跳过 dev-flow 直接手动操作** — Issue/Plan 驱动的任务必须走 `flow.sh` 命令链
- **直接调 `gh issue create` 绕过 flow.sh** — Issue 创建必须走 `flow.sh issue create`，脚本通过 `detect_space_repo` 自动定位空间仓库，无需也不允许手动指定 `--repo`。直接调 `gh` 会导致 Issue 创建到错误仓库 = 严重失职
- **跳过 rook 审查直接 submit 或 complete** — Plan 审查和实施审查都是强制门禁
- **rook BLOCK 后强行 submit 或 complete** — 必须修订后重审，最多 3 轮
- **rook 复审新开 task** — rook 返回 REVISE/BLOCK → fae 修复后，必须 `wopal_task_reply` 续审原 rook task，禁止 `finish` 后新开。新开会话丢失审查上下文，浪费 token
- **checkbox 单独 commit** — 实施产物 = 代码 + checkbox，同一次 commit
- **未实际验证就勾选 AC** — 必须运行命令、检查输出，凭记忆打勾 = 严重失职
- **被 `complete` 报错催着补勾** — 应在 rook PASS 后立即实证，不是等到 `complete` 才发现
- **User Validation 越权代勾** — checkbox 勾选权在用户
- **grep/glob 搜索 Plan** — 使用 `flow.sh plan <name>` 或 `flow.sh plan status <name>`
- **`approve` 不带 `--confirm`** — 报错退出，使用 `submit` 提审
- **verify-switch 前未先移除 worktree** — 脚本内已处理顺序（先 remove worktree 再 checkout），agent 不手动操作
- **合并后手动删除 feature 分支** — 分支由 `archive` 自动删除。`verify --confirm` 通过 SHA 检测 merge 状态，分支删除不影响检测
- **手动创建或删除分支** — 分支生命周期由脚本独占：`approve --confirm` 创建，`archive` 删除。Agent 唯一的分支操作是 merge
- **手动删除工作树** — 工作树由 `verify-switch` 或 `archive` 删除
- **跳过 `complete` 直接邀用户验证** — 代码提交 + rook PASS 后必须先 `flow.sh complete` 推进到 `verifying`，然后才能进入用户验证。未达 `verifying` 前请求用户验收 = 严重失职
- **归档时清理未声明的资源** — archive 只处理 Plan metadata 中声明的 Worktree/分支。看到名字相似不等于归属相同，必须确认。误删用户活跃分支 = 严重失职

## 参考

| 文件 | 用途 |
|------|------|
| `references/commands.md` | 命令完整参数与使用模式 |
| `references/plan-guide.md` | Plan 编写详细指导：TDD、AV/UV 规则、Metadata、委派 prompt、分支归属 |
| `references/issue-guide.md` | Issue 编写指南：标题格式、body 结构、同步规则、Plan 命名 |
| `references/troubleshooting.md` | 错误处理、边缘场景 |
