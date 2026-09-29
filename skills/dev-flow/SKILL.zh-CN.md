---
name: dev-flow
description: >
  Issue/Plan 驱动的开发流程。带设计面的任务必须有 GitHub Issue 或 Plan 承载。
  触发：#14 这类 Issue 引用、创建 Issue、创建 Plan、实施 Plan、执行
  Plan、检查 Plan、验证 Plan、Plan 生命周期推进
  (approve/complete/verify/archive)、从 PRD 拆分 Issue。不适用：规格驱动
  流程、纯研究/讨论/解释、一般 bug 修复——修复既有行为直接在主干分支完成，
  不建 Issue 或 Plan；只有特别复杂的 bug 或用户明确要求 Issue/Plan 载体
  才进入生命周期。
  本体能力资产（`.wopal/` 下的 skills、rules、agents、commands、
  plugins、assembly）归 `ontology-evolution`，不走本流程。
---

# dev-flow — Issue / Plan 驱动开发流程

## 脚本执行

所有 `flow.sh` 命令必须从本技能根目录执行：

- **workdir**: `.wopal/skills/dev-flow/`
- **命令格式**: `bash scripts/flow.sh <command> [args]`

本文档中所有 `flow.sh xxx` 引用（如 `flow.sh plan new`、`flow.sh complete`、`flow.sh verify-switch`）均按此方式执行。禁止 `source`、禁止绝对路径直接调用、禁止在非技能目录下执行。

## 何时适用本生命周期

生命周期服务于**带设计面的工作**——新功能、增强、重构、契约变更：这些工作的结果需要在写代码之前钉死并评审。

**Bug 修复是在修复已经商定的行为，不进生命周期。** 一般 bug 修复（包括在做别的事时顺带发现的修复）**直接在主干分支**实施并验证：不建 Issue、不建 Plan、不开 worktree。把一个修复塞进 `plan new → submit → approve → …` 等于给一个根本没有设计面的改动安排一轮设计评审；提交信息才是它的记录。

只有以下情况修复才进入生命周期：

- bug **特别复杂**——跨模块、单轮调查收不住，或者它动摇了"正确行为应该是什么"本身（修复已经变成设计工作），或
- **用户明确要求** Issue 或 Plan 载体。

拿不准时的判据：这次改动是**恢复**已经商定的意图（直接修），还是**新增**意图（走生命周期）？

## Plan 写给谁看

Plan 有两类读者：**评审的人**（要能看懂你要什么）和**实施的 agent**（要能照着做出来）。

所以 Plan 写清三件事就够：**要什么（行为）、什么算做成（验收）、什么不能碰（契约与边界）**。至于改哪个文件、内部怎么组织代码——那是实施时在真实代码上才能做好的决定，写在 Plan 里只会变成束缚和猜测。

**铁律：把契约面钉死，把实现面放开。** 行为规格、对外契约、验收判据、边界禁区在 Plan 阶段钉死；文件组织、内部 API、测试组织由实施 agent 在最新代码上决定。

## 命令速查

详细参数和边缘场景见 `references/commands.md`。

### 状态机推进

| 命令 | 场景 | 说明 |
|------|------|------|
| `plan new <issue>` | 创建 Plan | Issue 驱动；无 Issue 用 `--title --project --type` |
| `plan status <name>` | 查看 Plan 状态 | 含状态机位置、关联 Issue、worktree 信息 |
| `plan list [--issue]` | 浏览活跃 Plan | `--issue` 含 GitHub Issues 合并展示 |
| `plan check <name>` | 校验 Plan 质量 | 可选诊断；submit 自动校验 |
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
| `issue edit <issue> [--title] [--type] [--project] [--body-file] [--append]` | 编辑 Issue | 标题/类型/项目标签 + body 替换/追加 |
| `issue close <issue>` | 关闭 Issue | 自动定位空间仓库 |
| `issue delete <issue>` | 删除 Issue | 自动定位空间仓库 |
| `issue list [--project X] [--status Y] [--limit N]` | 列出空间仓库未完成 Issue | 自动检测仓库，显示 repo URL，可按 project/status 过滤 |
| `issue view <issue> [--json]` | 查看单个 Issue 内容 | 已知编号时直接查看，无需先 list；`--json` 输出原始 JSON |
| `sync <plan> [--body-only\|--labels-only]` | Plan → Issue 同步 | 三章节（Goal/Scope/AC）+ `\| Plan \|` 链接行；Plan 内容变更后必走 |

### 其他

| 命令 | 场景 | 说明 |
|------|------|------|
| `reset <plan>` | 重置 Plan | 破坏性，仅用户明确要求时使用——禁止用于绕过验证阶段修复 |

## 心智模型

dev-flow 管理两类产物，它们在 git 中独立演化：

| 产物 | 什么 | 谁提交 | 何时提交 |
|------|------|--------|----------|
| **Plan 文件** | 状态、checkbox、元数据 | 状态/元数据由 `flow.sh` 脚本提交；checkbox 由 agent 勾选后提交 | 状态推进时（submit/approve/complete/verify/archive）；checkbox 在实施完成时 |
| **实施代码** | 源码、测试、文档变更 | agent（Wopal 或 fae）手动提交 | 每完成一个 Task 提交一次，`complete` 前全部就位 |

**铁律：脚本不操作项目代码，但管理自身基础设施。** `flow.sh` 命令不 add、commit、merge、push 任何实施代码——代码的 commit 和 feature → 集成分支的 merge 由 agent 负责。worktree 创建/清理和 feature 分支创建/删除属于 dev-flow 基础设施操作，由脚本管理生命周期，不在此限。

**实施产物 = 逻辑原子单元。** 实施代码变更 + Task Done checkbox + Agent Verification checkbox 构成一个逻辑单元：代码在项目仓库（worktree）提交，checkbox 在空间仓库 Plan 文件勾选。两个仓库独立提交，但必须在 `complete` 前全部完成。禁止 checkbox 与代码脱节——代码未提交就勾选 Done，或勾选后代码被回退，都视为未完成。

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
2. fae 实施                     → 代码提交在 feature 分支（worktree），每完成一个 Task 提交一次
3. rook PASS                    → 触发下一步
4. agent 勾选 AC checkbox       → 空间仓库提交 Plan 文件（checkbox 与代码分属两个仓库，各自提交）
5. flow.sh complete             → 脚本自动提交 Plan status → verifying（feature 分支）
6. verify-switch → 用户验证    → 用户操作 + 用户授权，无脚本提交
7. agent merge feature → 集成分支  → agent 操作（不删 feature 分支，留给 archive 清理）⚠️ 前置：用户已明确确认验证通过（或用户选择场景 3）
8. flow.sh verify --confirm    → 脚本自动提交 Plan status → done（集成分支）
9. flow.sh archive              → 脚本自动提交 Plan 归档（集成分支）
```

**常见错误**：在步骤 4 之前执行 `complete`（代码未提交 → 报错）；代码未提交就勾选 Done checkbox（checkbox 与代码脱节）；跳过 AC 实证直接 complete。

## 核心原则

1. **Plan 先行——针对带设计面的工作**：实现新功能、增强、重构、契约变更前，先进入 Plan 生命周期。Plan 必须通过 `flow.sh plan new ...` 创建或定位，禁止手写创建。Bug 修复是固定例外：它恢复的是已经商定的行为，直接在主干分支修复（见「何时适用本生命周期」）。
2. **人类授权门**：`approve --confirm` 和 `verify --confirm` 都需要用户明确授权，禁止未经授权执行。
3. **脚本不操作项目代码**：`flow.sh` 命令不提交实施代码，但管理自身创建的基础设施（worktree、feature 分支）。`complete` 遇脏树报错退出。
4. **Plan 路径**：Plan 文件位于空间仓库 `.wopal-space/plans/<项目>/`，worktree 中不存在 Plan 副本。委派实施时给 fae 的 Plan 路径必须是空间仓库的绝对路径；fae 勾选 Done checkbox 时编辑该文件，禁止修改 Plan Status 元数据。
5. **rook 门禁**：实施审查（complete 前）必须委派 rook，rook PASS 才能推进。**评审预算：最多 2 轮——首次评审必须一次性列全所有 finding，最多 1 次复审，之后评审关闭**（见 df-plan-review 的评审预算章节）。Plan 质量由 `submit` 内置 `plan check` 自动校验把关，不委派 rook 审 Plan。
6. **Plan 语言与结构**：Plan 文档正文使用用户偏好语言编写，章节标题保持英文（与模板一致）。禁止混用中英文标题。

## Plan Task 字段要求

写 Plan 时每个 Task 必须包含以下字段（按顺序），详见 `references/plan-guide.zh-CN.md`：

| Field | Required | Format |
|-------|----------|--------|
| Verification Intent | ✅ | AC#N；这组行为为哪几条验收负责 |
| Behavior | ✅ TDD=true | 可测试的行为规格，能直接落成失败测试 |
| Pre-read | ✅ | 文件路径或 N/A |
| Design | ✅ | 技术方案与约束（设计意图写清，不规定到每文件） |
| TDD | ✅ | true / false |
| Changes | ✅ | 编号列表（禁止 checkbox）；第 1 条固定 RED |
| Verify | ✅ | 可执行命令 |
| Done | ✅ | 产出说明 + 实际触碰文件 + 1 个 checkbox |

**Task 拆分维度是行为组**：一个 Task = 一组高内聚 Behavior + 完整 RED→GREEN→REFACTOR + 独立可跑的 Verify。粒度三问见 plan-guide。

**提交校验**：`submit` 自动运行 `plan check`，无需手动执行。

## AC 两拍制

Agent Verification 的条目分两拍完成，这是结果盯死的机制：

1. **第一拍（写 Plan 时）**：每条 AC = 行为判据 + 通过标准。判据式写法合法（不用猜未来测试文件名），但必须可判定——能抓住坏实现，怎么写都能过的不算。
2. **第二拍（实施 RED 阶段）**：实施 agent 把每条 AC 落成真实命令，**原地回填** Plan。
3. **complete 硬门**：已勾选的 AC 必须带真实命令，判据式 AC 勾了也过不了 complete——定义权在 Plan，执行权在测试。

## Plan 定位

当用户提到某个 Plan 名称（如 `155-enhance-dev-flow`）时，**必须**用脚本定位，**严禁** `grep`、`glob`、`read` 在空间内盲目搜索。

- `flow.sh plan status <name>` — 查看 Plan 完整状态，含状态机位置、关联 Issue、worktree 信息
- `flow.sh plan list [--issue]` — 浏览所有活跃 Plan（`--issue` 模式查看 GitHub Issues）
- `flow.sh plan check <name-or-path>` — 校验 Plan 质量（可选诊断）

## 验证纪律

验证分三层，每层的责任人和规则不同。

### 第一层：Task Done（fae 即时勾选）

每个 Task 完成 → 运行 Task 内的 Verify 命令 → 通过后**立即勾选** Done checkbox，并在 Done 内回填「实际触碰文件」。

- 委派 fae 的 prompt 必须包含"完成后勾选 Plan 中对应 Task 的 Done checkbox 并回填实际触碰文件"指令
- 禁止积压到阶段末尾统一补勾

### 第二层：Agent Verification（Wopal 实证勾选）

rook 审查 PASS 后，Wopal **必须逐项真实验证** Agent Verification 的每个 AC。

验证方法：按 AC 描述**运行命令、检查输出、确认结果**。不能凭记忆或推测打勾，不能被 `complete` 脚本报错催着补勾。

**修复后必须重新验证**：rook 审查返回 REVISE/BLOCK → fae 修复后，AC 必须重新运行验证命令，不能沿用修复前的结果。

AC 全部通过 → 勾选 Agent Verification checkbox → 在空间仓库提交 Plan 文件（代码已在 feature 分支提交，见提交序列步骤 4）。

**两拍制下的勾选前提**：此时所有 AC 应已回填真实命令（第二拍）。若发现某条 AC 还是判据式，说明 fae 没执行 RED 回填——先让 fae 回填命令并运行通过，再勾选。

### 第三层：User Validation（用户独占）

User Validation 只承载**必须由用户手动执行并观察**的验证项，checkbox 勾选权在用户，Agent **绝对禁止**代勾。

**边界铁律**：写入 UV 前二连问——(1) Agent 能否自动验证？能则**禁止列入 UV**，放 Agent Verification；(2) 是否必须用户手动执行观察？否则禁止列入。任何可自动化的验证（测试/lint/typecheck/静态检查/可脚本断言的行为）不得推给用户。

**环境完整性**：每个场景必备 验证环境 + 启动命令（用户可直接复制执行）+ 通过判据（可断言，非"行为一致"空话）+ 失败反馈。依赖的验证机制若项目 AGENTS.md 尚未记录，必须先补入项目规范再引用。

Agent 可以执行验证动作、展示结果，但必须等用户明确确认。详见 `references/plan-guide.zh-CN.md`。

## 标准流程

### A. Planning

```bash
flow.sh plan new <issue> --type <type> --scope <scope> --slug <slug>  # Issue 驱动（三个旗标必填，显式指定）
flow.sh plan new --title "..." --project <name> --type <type>  # 无 Issue
```

完整命令链：`plan new → submit → approve --confirm → complete → verify --confirm → archive`。

**Plan 目录**：统一存放在 `.wopal-space/plans/<项目名>/`。

**命名契约**：Issue title 自由文本（宽松 type 前缀可选，不限制长度）；Plan name 由 Wopal 显式指定（`<N>-<type>-<slug>`，slug 须精简 ≤ 20 chars，仅核心名词）；Branch 从 Plan name 派生且有界（`<project>-<plan-name>`，总长超 55 chars 时截断 slug 并加 4-char 哈希）；worktree 目录 = branch。详见 `references/plan-guide.zh-CN.md`。

### B. Plan 审查与提交

```bash
flow.sh sync <issue> --body-only    # 同步三章节（Goal/Scope/AC）+ | Plan | 链接行（Plan 内容变更后必须）
```

1. `flow.sh submit <issue>`（planning → reviewing；内置 `plan check` 校验，不委派 rook 审 Plan）
2. Plan 处于 `reviewing` 状态时可直接修订内容，无需 `flow.sh reset` 回退到 `planning`。修订完成后告知用户即可，无需重新 `submit`
3. 等用户审批后：`flow.sh approve <issue> --confirm`（reviewing/planning → executing）

**⚠️ submit 时序铁律**：写完 Plan 后，Wopal **必须**立即执行 `flow.sh submit <issue>` 推进至 `reviewing`（submit 自动运行 `plan check` 校验），然后才能请用户评审 Plan。Plan 状态未达 `reviewing` 之前，Wopal 不得以任何形式（口头提示、命令行建议、Plan 展示）请求用户评审或审批 Plan。此规则是 Wopal 的自主执行义务，不依赖用户提醒。违反 = 严重失职。

违反模式：写完 Plan → 跳过 `submit` → 直接邀约用户"请评审/看看这个 Plan/可以开始吗" → 用户审批后才发现 Plan 还在 `planning`。

### C. Executing 与 Approve 模式选择

用户评审通过 Plan 时，Agent 必须根据用户指令意图选择正确的 Approve 实施模式：

| 模式 | 用户触发信号 | Approve 命令 | 实施位置与分支 | 收尾命令链 |
|------|-------------|--------------|----------------|------------|
| **模式 A：标准模式（默认）** | "可以开始" / "approved" / 无特殊修饰 | `flow.sh approve <plan> --confirm` | 从 main 新建独立分支与 worktree | 合入 main → `verify --confirm` → `archive` |
| **模式 B：main 直实施模式** | "不建工作树" / "直接在 main 上" / "不用隔离" | `flow.sh approve <plan> --confirm --no-worktree` | 直接在 main 分支实施（无 worktree 无分支） | `verify --confirm` → `archive`（跳过 merge） |
| **模式 C：独立分支演进模式** | "在之前那个 worktree 继续" / "保留工作树" / "基于分支 X 演进" / "POC 不发布" | `flow.sh approve <plan> --confirm --existing-worktree <path>` | 复用已有 worktree 目录与 feature 分支 | `verify --confirm --keep-worktree` → `archive --keep-worktree` |

#### 模式 C（独立分支演进）执行铁律

- ⚠️ **严禁使用 `--no-worktree` 代替 `--existing-worktree`**：`--no-worktree` 语义是 main 直修，会清除 Worktree 元数据并误导 Agent 在 main 主路径修改代码，造成极大污染；演进模式必须传入 `--existing-worktree <path>` 绑定已有工作树。
- ⚠️ **收尾必须带 `--keep-worktree`**：演进模式不发布、不合入 main，`verify --confirm --keep-worktree` 会跳过合并检查并记录 feature 分支最新 HEAD 为 Final Commit；`archive --keep-worktree` 会保留工作树目录与分支供后续 Plan 演进。
- ⚠️ **实施代码一律提交至工作树所在分支**：Base Commit 自动记录为工作树当前 HEAD（上一个 Plan 终点），所有改动堆叠在该 feature 分支。

#### 流程执行

1. `flow.sh approve <issue> --confirm [mode-flags]`（按上述模式判定）
2. 委派 fae 实施（prompt 含 Plan 绝对路径 + Done checkbox 指令 + AC 回填指令 + 目标工作路径 + 实施自由度声明）
3. fae 完成 Task → Verify 通过 → 即时勾选 Done checkbox、回填实际触碰文件、AC 回填真实命令，git commit（每 Task 一次提交）
4. 全部 Task 完成 → Wopal **逐项实证** Agent Verification AC
5. AC 通过 → 勾选 checkbox，在空间仓库提交 Plan 文件
6. 委派 rook 审查实施（强制）
7. rook PASS → `flow.sh complete <issue>`（脚本提交 Plan status → verifying）

**委派要点**：
- 实施 → fae；审查 → rook
- **每个 rook prompt 必须写明评审预算**：明确声明「评审预算：最多 2 轮；本轮一次性列全所有 finding（含边缘发现），不会有下一轮补漏」。首次评审必须穷尽；复审（验证修复 + 全量重扫）即终局
- **上下文复用原则**：fae/rook 完成后，优先 `reply` 续审或修复，禁止 `finish` 后新开。前提：子任务上下文 < 50%
- 复用链路：fae IDLE → reply rook 续审 → rook REVISE → reply fae 修复 → fae fix IDLE → reply rook 续审 → rook PASS → finish 两个 task
- rook 契约格式见 agents-collab；rook 自行加载 df-implement-review 技能

`complete` 硬门控：所有 Task Done ✓ + Agent Verification ✓（带真实命令）+ rook PASS ✓ + 实施代码已提交。

**⚠️ complete 时序铁律**：实施代码提交 → rook PASS 后，Wopal **必须**立即执行 `flow.sh complete <issue>` 推进至 `verifying`，然后才能进入用户验证环节。Plan 状态未达 `verifying` 之前，Wopal 不得以任何形式（口头提示、命令行建议、checkbox 勾选邀请）请求用户进行功能验证。此规则是 Wopal 的自主执行义务，不依赖用户提醒。违反 = 严重失职。

违反模式：实施代码提交 → 跳过 `complete` → 直接邀约用户"验证/验收/测试" → 用户确认后才发现 Plan 还在 `executing`。

### D. 验证（verifying）

`complete` 后 Plan 状态为 `verifying`。`complete` 会输出验证选项和规范路径 git status，agent 必须将其完整传达给用户，由用户选择验证方式。Agent 不得自行决定跳过任何场景。

#### 验证阶段返工是授权范围内的正常工作，不是状态机违规

Plan 处于 `verifying` 时，用户验证过程中**完全可能要求改代码、改 Plan，或两者同时改**——验证本来就是用来暴露问题的，修复它们正是收尾闭环的一部分。此时：

- **改代码**在 feature 分支上进行（no-worktree 模式在集成分支），提交后请用户重新验证。不需要重新走审批，Plan 已经批准过了
- **改 Plan** 可以动 Implementation、Tasks（为新工作追加 Task）、Acceptance Criteria（为新判据追加 AC）、User Validation 场景。原位编辑；改动映射章节后运行 `flow.sh sync <plan> --body-only`，把三章节（`## Goal` / `## Scope` / `## Acceptance Criteria`）+ `| Plan |` 链接行同步进 Issue，其余内容逐字保留。不需要重新 `submit`，也没有二次审批门——状态机停留在 `verifying`，之后由 `flow.sh verify --confirm` 记录终态
- **验证阶段新发现的工作与任何工作遵循同样的门禁**：同样按 TDD 纪律实施、实证验证、维持代码与 checkbox 的耦合。覆盖新工作的 AC 在通过时才勾选
- **`approve` 门禁已经发生过。** 验证阶段授权覆盖已批准范围内的实施与 Plan 编辑。如果用户要求的是实质性扩大 Plan 目标或契约面的变更，明确指出来，由用户决定它属于本 Plan 还是另开新 Plan
- **永远不要用 reset 去强行重走审批。** `flow.sh reset` 是破坏性操作，仅在用户明确要求时使用——它不是 agent 在验证暴露修复项时"回退重做"的工具。在 `verifying` 状态下原位修复，继续推进

这就是闭环的收拢方式：实施 → 审查 → 验证 → 用户驱动的调整 → 确认 → done。验证阶段是工作阶段，不是只读阶段；把每个修复都当作需要 reset 或重新审批的信号，才是要避免的失败模式。

##### 场景 1：工作树内验证

条件：有 worktree，且项目在 worktree 目录内可独立运行/测试（无路径依赖）。
流程：用户在 worktree 路径验证 → merge → verify --confirm → archive。

##### 场景 2：verify-switch 切换验证分支

条件：项目有路径依赖（目录结构要求、运行时加载路径、配置文件位置等），必须在规范路径（repo 根目录）验证。
流程：agent 执行 `flow.sh verify-switch <issue>`（移除 worktree + checkout feature）→ 用户在规范路径验证 → merge → verify --confirm → archive。

##### 场景 3：先合并后验证

条件：用户希望在集成分支直接验证，无需保留 feature 分支隔离。
流程：merge → 用户在集成分支验证 → verify --confirm → archive。

归属声明："先合并后验证"是用户可选的验证方式，agent 不得自行决定走场景 3；用户未表态时，默认等验证通过后再 merge。

##### 场景 4：无 worktree（`--no-worktree`）

条件：`approve --confirm --no-worktree` 时全程在集成分支，无 feature 分支。
流程：用户直接在集成分支验证 → verify --confirm → archive。

##### 场景 5：独立分支演进验证（`--keep-worktree`）

条件：`approve --confirm --existing-worktree`（或首个 Plan 处于演进探索暂不发布）。
流程：用户在保留的 worktree 路径验证 → `flow.sh verify <plan> --confirm --keep-worktree`（跳过 merge 检查） → `flow.sh archive <plan> --keep-worktree`（保留 worktree 与分支供后续 Plan 演进）。

#### 分支生命周期铁律

- 分支创建：`approve --confirm`（脚本自动创建）；分支删除：`archive`（脚本自动删除）
- **Agent 唯一的分支操作是 merge，且必须在用户明确授权之后执行**：`git checkout <集成分支> && git merge <feature>`
- **合并策略**：默认优先 **squash 合并**（`git merge --squash <feature>`）——将 feature 全部提交压成单个提交合入集成分支，避免验证过程的修复提交污染 main 历史。合并后需手动 `git commit` 一次。verify 的 tree 相等判据原生支持 squash。用户明确要求保留提交历史时，改用 `--no-ff` 合并
- Agent 禁止 `git branch -d/-D`、禁止 `git branch <name>`、禁止任何分支的创建或删除
- 工作树生命周期由脚本管理：`approve` 创建，`verify-switch` 或 `archive` 删除

#### verify --confirm 内部机制

Agent 需要知道脚本做了什么，以便在出错时排查。

1. 状态门控：Plan status 必须为 `verifying`
2. 用户验证门控：User Validation checkbox 必须已勾选
3. **Merge 检测**（场景 4 自动跳过），三级判定，任一层命中即视为已合并：
   - L1: `complete` 写入的 `Verification Commit`（SHA）祖先检测：`git merge-base --is-ancestor <sha> <集成分支>`
   - L2: **tree 相等判据**（squash merge 支持）：`git rev-parse <集成分支>^{tree}` == `git rev-parse <feature>^{tree}`。内容级检测，不依赖分支 ref。squash 合入后 main 只有 feature 内容的副本提交，feature tip 永远不会成为 main 祖先，但 tree 字节级一致。对 --no-ff / fast-forward 同样成立（L1 已提前命中）
   - L3: branch ref 检测（`git branch --merged` + remote + log --grep 兜底）
   - 全部不命中时报错退出，提示 agent 先 merge
4. **Final Commit 记录**：merge 检测通过后，写入集成分支 HEAD SHA 到 Plan `Final Commit` 字段。与 approve 时记录的 `Base Commit` 对照可确定本次 feature 的影响范围（revert 时尤其有用）
5. 状态转换：`verifying → done`，commit 在集成分支

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

有工作树的场景（场景 1-3）还要求 feature 分支已合并到集成分支，脚本通过三级检测（Verification Commit SHA → tree 相等 → branch ref）判断合并状态。squash 合入（`git merge --squash`）天然支持——tree 相等判据在 feature tip 非祖先时也能识别已合并。

verify --confirm 会记录 `Final Commit`（合入后的集成分支 HEAD）到 Plan metadata，与 approve 时的 `Base Commit` 形成实施基线 → 落地点闭环。

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

`submit` 不需要用户授权——agent 写完 Plan 后可直接执行，submit 自动运行 `plan check` 校验。`approve` 不带 `--confirm` 直接报错，提示使用 `submit`。

## 分支归属

| 阶段 | 归属分支 | 提交者 | 内容 |
|------|---------|--------|------|
| `planning` / `submit` / `approve` | 集成分支 | 脚本 | Plan 文件状态变更 |
| `approve`（Base Commit） | 集成分支 | 脚本 | 记录集成分支 HEAD 到 Plan `Base Commit` 字段（实施基线） |
| `executing`（实施代码） | feature 分支 | agent | 实施代码（每 Task 一次提交）；checkbox 在空间仓库 Plan 文件独立提交 |
| `complete` | feature 分支 | 脚本 | Plan status → verifying + Verification Commit SHA |
| `verify --confirm` | 集成分支 或 feature 分支 | 脚本 | Plan status → done（三级 merge 检测，squash 支持）+ Final Commit 记录 |
| `agent merge feature → 集成分支` | 集成分支 | agent | 代码 merge（**不删 feature 分支**；squash 合入受支持） |
| `archive` | 集成分支 | 脚本 | Plan 归档 + 删 worktree + 删 feature 分支 |

**--no-worktree 模式**：无 feature 分支，全部阶段在集成分支。

## 委派规则

| 原则 | 说明 |
|------|------|
| 优先 `wopal_task` | 委派时必须优先用 `wopal_task`，不可用时才用 Task |
| 委派前检查 | 加载记忆"委派"、检查路径（基于空间根的相对路径）、确认项目上下文 |
| 活动 Plan 路径 | 委派 prompt 使用空间仓库 Plan 绝对路径（worktree 无 Plan 副本） |
| Done checkbox 指令 | 委派 fae 的 prompt 必须包含"完成后勾选对应 Task 的 Done checkbox + 回填实际触碰文件" + "RED 阶段把 AC 落成真实命令回填 Plan" + "每完成一个 task commit git" |
| 树交接失败 | complete 因脏树报错 → 要求 fae 提交代码后重试 |
| **委派边界** | Plan Task → 委派 fae；单文件小变更（删几行、改配置）→ 直接执行，不委派 |
| **强依赖处理** | 多 Task 存在强逻辑依赖时，整组委派给单个 fae，禁止拆分导致上下文丢失 |
| **非 dev-flow 的 rook** | 对话模式下小修小补，委派 rook 前先征得用户同意；dev-flow 中的 rook 审查自动执行 |
| **回复复用优先** | rook/fae 完成后，修复和复审必须 `reply` 续原 task，禁止 `finish` 后新开。前提：上下文 < 50%；> 50% 时 finish 后新开 |

## 不要这样做

- **把一般 bug 修复塞进 Plan 生命周期** — 修复恢复的是已经商定的行为，直接在主干分支实施并验证；只有特别复杂的 bug 或用户明确要求，才值得 Issue/Plan 载体。给每个修复都套 `plan new → submit → approve`，正是这条规则要堵住的失败模式
- **跳过 dev-flow 直接手动操作（针对带设计面的工作）** — Issue/Plan 驱动的任务必须走 `flow.sh` 命令链
- **直接调 `gh issue create` 绕过 flow.sh** — Issue 创建必须走 `flow.sh issue create`，脚本通过 `detect_space_repo` 自动定位空间仓库，无需也不允许手动指定 `--repo`。直接调 `gh` 会导致 Issue 创建到错误仓库 = 严重失职
- **手动 `gh issue list` 查询未完成 Issue** — 查询未完成 Issue 必须走 `flow.sh issue list`，脚本自动定位空间仓库并显示 repo URL，避免 Agent 因不知道仓库归属而查错仓库
- **手动 `gh issue view` 查看单个 Issue** — 已知编号时必须走 `flow.sh issue view <编号>`，自动定位空间仓库；直接调 `gh` 查错仓库风险同上
- **跳过 rook 审查直接 complete** — 实施审查是强制门禁，complete 前必须委派 rook
- **手动 `plan check` 再 submit** — 冗余步骤；`flow.sh submit` 已自动运行 `plan check` 校验，不合格会被拒绝，直接 submit 即可
- **跳过 `submit` 直接请用户评审** — 请用户评审 Plan 前必须先 `flow.sh submit` 推进到 `reviewing`。跳过 submit 会让 Plan 停在 `planning`，用户审批后无法直接进入实施
- **rook BLOCK 后强行 complete** — 必须修订后重审；**评审预算最多 2 轮**（首次列全所有 finding + 1 次复审即关闭；之后上报用户，由用户决定是否新开会话重审）
- **rook 复审新开 task** — rook 返回 REVISE/BLOCK → fae 修复后，必须 `wopal_task_reply` 续审原 rook task，禁止 `finish` 后新开。新开会话丢失审查上下文，浪费 token
- **checkbox 与代码脱节** — 代码未提交就勾选 Done/AC checkbox，或勾选后代码被回退。代码在 feature 分支提交，checkbox 在空间仓库提交，两者独立但必须在 `complete` 前全部完成
- **未实际验证就勾选 AC** — 必须运行命令、检查输出，凭记忆打勾 = 严重失职
- **判据式 AC 直接勾选过 complete** — AC 勾选前必须已回填真实命令（两拍制第二拍），脚本会拦下无命令的勾选条目
- **被 `complete` 报错催着补勾** — 应在 rook PASS 后立即实证，不是等到 `complete` 才发现
- **User Validation 越权代勾** — checkbox 勾选权在用户
- **把可自动化验证推给用户** — UV 只放"Agent 无法自动 + 必须用户手动观察"的项；测试/lint/typecheck 等放 Agent Verification
- **UV 场景无启动命令** — 每个场景必须有用户可直接复制的命令与可断言判据；依赖的验证机制缺失时先补入项目规范
- **grep/glob 搜索 Plan** — 使用 `flow.sh plan status <name>`
- **`approve` 不带 `--confirm`** — 报错退出，使用 `submit` 提审
- **用 reset 绕过修复或重新审批** — `flow.sh reset` 是破坏性操作，仅限用户明确要求。验证阶段的修复（代码与 Plan 编辑）在 Plan 保持 `verifying` 时原位进行——见 D 段。禁止用 reset"回退重做"或强行重走审批
- **verify-switch 前未先移除 worktree** — 脚本内已处理顺序（先 remove worktree 再 checkout），agent 不手动操作
- **合并后手动删除 feature 分支** — 分支由 `archive` 自动删除。`verify --confirm` 通过 SHA 检测 merge 状态，分支删除不影响检测
- **手动创建或删除分支** — 分支生命周期由脚本独占：`approve --confirm` 创建，`archive` 删除。Agent 唯一的分支操作是 merge，且必须在用户明确授权之后执行
- **手动删除工作树** — 工作树由 `verify-switch` 或 `archive` 删除
- **跳过 `complete` 直接邀用户验证** — 代码提交 + rook PASS 后必须先 `flow.sh complete` 推进至 `verifying`，然后才能进入用户验证。未达 `verifying` 前请求用户验收 = 严重失职
- **归档时清理未声明的资源** — archive 只处理 Plan metadata 中声明的 Worktree/分支。看到名字相似不等于归属相同，必须确认。误删用户活跃分支 = 严重失职
- **在 dev-flow 中加载 git-worktrees 技能** — dev-flow 的 worktree 创建/清理由 `flow.sh approve` 和 `flow.sh archive` 脚本内置管理，禁止加载 git-worktrees 技能或手动执行 worktree 命令
- **把"提交吧"解读为"完成整个收尾流程"** — 每个状态机推进动作（merge/verify/archive）都需要独立明确指令，不能从一个"提交吧"推断出全部收尾授权

## 参考

| 文件 | 用途 |
|------|------|
| `references/commands.md` | 命令完整参数与使用模式 |
| `references/plan-guide.zh-CN.md` | Plan 编写详细指导：契约、AC 两拍制、行为拆分、TDD、AV/UV 规则、Metadata、委派 prompt、命名规范、分支归属 |
| `references/issue-guide.md` | Issue 编写指南：标题格式、body 结构、同步规则 |
| `references/troubleshooting.md` | 错误处理、边缘场景 |