# 命令参考

对所有命令，使用 `flow.sh <cmd> --help` 获取完整参数列表和说明。本文档仅补充 `--help` 不覆盖的使用模式和边缘场景。

---

## 命令概览

### 工作流命令（状态机推进）

| 命令 | 说明 |
|------|------|
| `plan new <issue>` | 创建新 Plan |
| `plan status <plan-id>` | 查看 Plan 完整状态 |
| `plan list [--issue]` | 列出活跃 Plan（`--issue` 含 GitHub Issues） |
| `submit <plan>` | 提交人工审阅（planning → reviewing） |
| `approve <plan> --confirm` | 用户审批通过，默认创建 worktree 隔离 |
| `approve <plan> --confirm --no-worktree` | 用户审批通过，跳过 worktree |
| `complete <issue> [--pr]` | 实施完成，进入用户验证 |
| `integrate <issue-or-plan> --confirm` | 将已验证的开发分支交付正式写入集成分支 |
| `verify <issue> --confirm` | 用户验证通过 |
| `archive <issue>` | 归档 Plan 并推送 Plan 变更 |
| `verify-switch <issue> [--yes]` | 切换到特性分支验证 |

### Issue 管理

| 命令 | 说明 |
|------|------|
| `issue create --title "..." [--project <name> ...] --body-file <path>` | 创建 Issue；项目标签 0..N（`--body-file` 为主路径） |
| `issue edit <issue> [--title] [--type] [--add-project X] [--remove-project X] [--body-file] [--append]` | 编辑 Issue；项目标签逐个增删 |
| `issue merge --into <primary> <issue...>` | 多 Issue、一份实施时归并 Issue |
| `issue close <issue>` | 关闭 Issue |
| `issue delete <issue>` | 删除 Issue |
| `issue list [--project X] [--status Y] [--limit N]` | 列出空间仓库未完成 Issue（含 repo URL，可按 project/status 过滤） |
| `issue view <issue> [--json]` | 查看单个 Issue 详情 |

### Plan 子命令

| 命令 | 说明 |
|------|------|
| `plan new <issue>` | 从 Issue 创建新 Plan |
| `plan status <plan-id>` | 查看 Plan 完整状态（metadata、Issue、worktree） |
| `plan list` | 列出本地活跃 Plan |
| `plan list --issue` | 列出活跃 Plan，含 GitHub Issues 合并展示 |

### 其他命令

| 命令 | 说明 |
|------|------|
| `sync <issue> [--body-only\|--labels-only]` | Plan → Issue 同步 |
| `reset <issue>` | 重置 Plan 到 planning 状态 |

---

## Active Plan Graph（当前实践阶段）

`flow.sh` 当前**不提供 Graph 维护命令，也不会在 lifecycle 命令内部自动修改 Graph**。主控者按 `references/active-plan-graph.zh-CN.md` 在每个生命周期节点后直接维护 `.wopal-space/plans/active-graph.json`。

Graph 维护是 dev-flow 主控职责，不属于 delegated implementer。Plan 已成功推进但 Graph 手工更新失败时，保留真实 Plan 状态并立即修复 Graph；在 Graph 恢复一致前不要批准或启动下一份 Plan。

---

## 用 Issue 编号定位 Plan

`submit` / `approve` / `complete` / `verify` / `archive` / `sync` / `reset` / `plan status` 等命令的 `plan-id` 位置，可以直接写 Issue 编号。解析按以下顺序，命中即停：

| 顺序 | 依据 | 说明 |
|------|------|------|
| 1 | 文件名前缀 | `<issue_number>-*.md` |
| 2 | Plan 元数据 `- **Issue**:` | 覆盖先建 Plan、后挂 Issue 的情况；当前契约只接受一个 `#N` |
| 3 | 活跃优先 | 同一编号命中多个 Plan 时，`done/` 下的归档 Plan 让位给活跃 Plan |

同一编号命中多个活跃 Plan 时命令**失败关闭**，打印候选路径并退出，不会随便挑一个。这时改用 Plan 名字执行（`flow.sh plan status <plan-name>`），既不改名也不重建 Plan——改名会孤立 feature 分支与 worktree，重建会让一个 Issue 出现两份进度。

```bash
flow.sh plan status 249    # 数字前缀或 Issue 元数据
flow.sh plan status enhance-dev-flow-resolver    # Plan 名字（歧义时）
```

## Git mutation surfaces 与失败语义

部分生命周期命令会写入 Git metadata（index / commit / refs / worktree / checkout）；普通工作区可写不代表这些 surface 可写，受限环境下 Agent 需先用当前 Harness 原生的 escalation/approval 机制取得能力（见 `SKILL.md`「脚本执行」）。下表按脚本真实调用链逐入口审计（定位采用 file + 函数/调用点锚点；精确行号随代码演进漂移，不写入本表。新增 Git mutation 时必须同步此表）。

### 逐入口审计矩阵

列义：**mutation 调用位置** = 实际执行 Git 写入的调用链（file + 函数/调用点）；**失败结果** = 关键 mutation 非零时命令的可观察结果；**后继门** = 外部可见（Issue sync/close/link/labels）或破坏性（worktree/branch/归档）动作必须等待的持久化门；**结论** = 符合契约 / 已修复（本轮变更）/ 记录性结论（理由见下一节）。

| 命令 | 实际 mutation 调用位置（file + 函数） | 失败结果 | 外部/破坏性后继门 | 结论 |
|------|--------------------------------------|----------|-------------------|------|
| `submit` | `scripts/lib/plan_commit.py` `commit_and_push_plan`（commit_paths → `scripts/lib/git.py` `commit_paths`；is_commit_in_remote → `git.py` `is_commit_in_remote`；push_repo → `git.py` `push_repo`） | commit 失败：结构化诊断（command/cwd/exit/stdout/stderr）+ 分层恢复（`scripts/lib/plan_state.py` `recover_plan_after_failed_commit`）+ 非零退出；push 失败：`RESULT_PUSH_FAILED`，本地提交保留、warn 继续（既有策略） | 无后续外部 side effect；状态以 commit 为准 | 符合契约 |
| `approve --confirm` | `scripts/commands/approve.py` `cmd_approve`（approve commit 与 rollback commit 均经 `scripts/lib/plan_commit.py` `commit_and_push_plan`）；worktree 创建经同文件 `_create_worktree` → `scripts/lib/worktree.py` `create_worktree`（双 attempt 证据在 `create_worktree` 的失败分支） | commit/worktree 失败：root failure 完整保留、rollback outcome 分层（`approve.py` `_abort_after_state_write`）；文件/index 分层恢复（`plan_state.py` `recover_plan_after_failed_commit`）；非零退出。push 失败：warn 继续（既有 #215 策略：本地提交已持久化，后续 push 同步） | Issue sync 仅在 commit 成功后；worktree 创建在 approve commit 之后 | 符合契约 |
| `complete` | `scripts/commands/complete.py` `_commit_plan_status_or_rollback`（commit_paths → `git.py` `commit_paths`）；可选 PR 路径只记录 PR 身份，不提前写 Verification Commit | commit 失败：结构化诊断 + 分层恢复 + 非零退出；不 Issue sync；已创建的 PR 身份保留（`_commit_plan_status_or_rollback` 的 preserve_pr 分支） | `cmd_complete` 的 Issue sync 块仅在 commit 成功后 | 符合契约（B-06 修复） |
| `integrate --confirm` | `scripts/commands/integrate.py`；本地路径执行 squash / preserve-history，PR 路径通过平台合并；随后只提交 Delivery Plan 记录 | 缺确认、共享字段不一致、dirty project、Git/PR 合入失败均非零退出；正式标题只取 Plan `Commit Subject` 原值 | 成功合入后记录各成员 `Verification Commit` 与负责人 `Integration Commit` | 符合交付历史契约 |
| `verify --confirm` | `scripts/commands/verify.py` `_commit_plan_status_or_rollback`（commit_paths → `git.py` `commit_paths`） | commit 失败：结构化诊断 + 分层恢复 + 非零退出；不 sync/close | `cmd_verify` 的 sync/close 块仅在 commit 成功后；close 吞错见记录性结论 #1 | 符合契约 |
| `verify-switch` | `scripts/commands/verify_switch.py` `_git_fetch`（fetch）；`_remove_worktree`（worktree remove → `_prune_worktrees` prune）；`_git_checkout`（checkout）；Plan 元数据 commit 经 `_update_plan_after_switch`（commit_paths） | 全部保留 command/cwd/exit/stderr；元数据 commit 失败：非零 + 手册指引；prune 属 janitor（rc+stderr 双查，报告后继续） | worktree removal 先于 checkout；元数据 commit 失败阻断成功返回 | 符合契约（B-04 修复） |
| `archive` | `scripts/commands/archive.py` `archive_plan_file`（`git mv` stage）；`commit_archived_plan`（commit_paths → push_repo → is_commit_pushed，`scripts/lib/git.py`）；`_cleanup_worktree` → `scripts/lib/worktree.py` `clean_worktree`（→ `delete_branch`） | stage/commit/push 失败：结构化诊断 + 非零退出；commit fallback 保留双 attempt 证据；push 绑定当前分支并在 origin 验证包含（`is_commit_pushed`）；cleanup 失败：partial + 非零 | durability（commit + push 验证）成功后才执行 Issue sync/link/labels（`cmd_archive` sync 块）、cleanup、close（`cmd_archive` close 块） | 符合契约 |
| `reset` / `plan new` / `sync` / `issue *` | 无本地 Git mutation（仅 Plan 文件 / GitHub API）；首次提交在 `submit` | — | — | 符合契约 |

注：`--no-worktree` / `--existing-worktree` / `--keep-worktree` 会跳过或改变对应的 refs / worktree / checkout mutation；实际执行以所选模式的实际路径为准。

**失败语义**：

- 任一关键 Git mutation 非零退出时，最终诊断必须保留 **command、cwd、exit code 与原始 stdout/stderr**；不得把底层失败降格为裸 `False` / warning 后沿成功路径继续。
- 关键 Git durability 未达成时，依赖它的后续步骤必须终止：Issue sync/close、外部状态推进、worktree / branch 等破坏性清理不得先行；清理自身失败时明确报告未完成的部分，不伪装成完整回滚。
- push 失败按各命令既有契约处理（本地提交已持久化时如实告警，由后续 push 同步），本参考不改变远端策略。
- worktree 删除只使用非强制命令；有未提交内容或已初始化 submodule 时保留 worktree 和分支，不使用 force 绕过 Git 的保护。
- Agent 不得静默绕过失败：完整上报，由用户决定下一步。

### 记录性结论

审计中确认、但按约定不改动的项，连同确切位置与保留理由：

1. **`verify` 的 Issue close 吞错**：`scripts/commands/verify.py` `cmd_verify` 的 Issue close 块对 `gh issue close` 不检查退出码、异常直接 `pass`；`scripts/commands/archive.py` `close_issue` 失败仅 warn（`cmd_archive` 的 close 块）。保留理由：close 是终态 best-effort，没有依赖它的后继步骤，失败不改变 Plan/记录的持久性；若未来 close 成为门控项需重新审计。
2. **worktree prune**：`scripts/lib/worktree.py` `remove_worktree` 的 prune 段、`scripts/commands/verify_switch.py` `_prune_worktrees`。已修复：`git worktree prune` 可能在 rc=0 时把删除错误写到 stderr，现同时检查退出码与 stderr 并报告；prune 是 janitor 操作，报告后不中断主流程（非关键继续，但不再静默）。
3. **branch delete 幂等语义**：`scripts/lib/worktree.py` `BranchDeleteResult` / `delete_branch` / `clean_worktree`。已修复：区分 deleted / absent / skipped（当前分支）/ failed；真失败保留 `-d`/`-D` 双 attempt 诊断并触发 partial cleanup + 非零退出。
4. **`write_worktree_context` 末尾 `return False`**：`scripts/lib/worktree.py` `write_worktree_context`。记录性结论：仅当 Plan 存在但既无 Worktree 块又无 Status 行时可达；所有 Plan 经 `check_doc`（Status 必需）后才进入 approve，实际不可达。无证据清理不做。
5. **`lib/git.py` 死代码**：`scripts/lib/git.py` `push`、`delete_branch` 无调用方。保留理由：删除超出本提案范围（避免无证据清理）；如需移除应走独立演化并确认无外部引用。

---

## 使用模式

### issue create 参数速记

```bash
# 最小创建（项目标签可省略）
flow.sh issue create --title "add skills remove command" --type feat --body-file body.md

# 一个 Issue 可声明多个受影响项目
flow.sh issue create --title "coordinate api and web" --project api --project web --type feat --body-file body.md

# --type 可选覆盖（默认从标题宽松前缀推断）
--type feat
```

`--body-file` 指向包含五段结构的 markdown 文件。不再支持 type-specific 参数（`--confirmed-bugs`、`--baseline` 等）——agent 在 body 文件的 `## Context` 中自由写入。

### issue edit

编辑现有 Issue：标题、类型、项目标签与 body。

```bash
flow.sh issue edit <issue> --body-file <path>     # 全量替换 body
flow.sh issue edit <issue> --append <path>        # 追加到 body 末尾
flow.sh issue edit <issue> --title "fix(api): ..." # 改标题
flow.sh issue edit <issue> --type fix --add-project api --add-project web
flow.sh issue edit <issue> --remove-project legacy-api
```

**行为**：
- `--body-file`：用文件内容替换整个 Issue body
- `--append`：在现有 body 末尾追加文件内容，用 `\n\n` 分隔
- `--title` / `--type`：更新标题/类型；type label 仍保持单值组同步
- `--add-project` / `--remove-project`：只增删指定 `project/*`，不清除其它项目标签；均可重复
- 空文件或文件不存在时报错退出（exit 1）
- 文件不以 `#` 或 `-` 开头时输出 warning
- 不指定 body 参数时保持 body 不变，仅应用标题/类型/项目变更

### issue merge

多个 Issue 实际只需要一份实施时，先归并，再创建一个普通 Plan：

```bash
flow.sh issue merge --into 40 41 42
```

目标 Issue 记录 `Merged from`；来源 Issue 记录 `Merged into`、移除活动状态标签并以 `not planned` 关闭。相同目标的重试不会重复写关系；来源已经归并到另一个目标时，命令在写入前失败。

### issue close / delete

关闭或删除 Issue（自动定位空间仓库，无需 `--repo`）。

```bash
flow.sh issue close <issue>     # 关闭 Issue
flow.sh issue delete <issue>    # 删除 Issue（gh 会要求确认）
```

**行为**：
- 通过 `detect_space_repo` 自动定位空间仓库，无需也不允许手动指定 `--repo`
- Agent 关闭/删除 Issue 一律使用本命令，避免 `gh` 直连查错仓库

### issue list

列出空间仓库中所有未完成（open）Issue，并显示所在仓库 URL。

```bash
flow.sh issue list                          # 列出未完成 Issue（默认 50 条）
flow.sh issue list --limit 100              # 指定数量
flow.sh issue list --project <name>         # 按 project 过滤（可多次，OR）
flow.sh issue list --status planning        # 按 status 过滤（可多次，OR）
flow.sh issue list --project <name> --status planning --status verifying
```

**行为**：
- 通过 `detect_space_repo` 自动定位空间仓库，无需也不允许手动指定 `--repo`
- `--project`：按项目过滤，多次指定取 OR
- `--status`：按状态过滤（`planning`/`executing`/`in-progress`/`verifying`/`done`，`executing` 与 `in-progress` 等价），多次指定取 OR；project 与 status 之间为 AND
- 每行显示 `#<number>  <title>  [<label>...]`
- 末尾显示 `Issues in: https://github.com/<owner>/<repo>`
- 仓库检测失败或 `gh` 调用失败时报错退出（exit 1）

Agent 查询未完成 Issue 一律使用本命令，避免手动 `gh issue list` 查错仓库。

### issue view

查看单个 Issue 的完整内容。已知 Issue 编号时的首选方式，无需先 `issue list`。

```bash
flow.sh issue view 215              # 格式化输出：编号/标题/Labels/State/body
flow.sh issue view 215 --json       # 原始 JSON（含全部 gh 字段）
```

**行为**：
- 通过 `detect_space_repo` 自动定位空间仓库，无需也不允许手动指定 `--repo`
- 默认输出编号、标题、Labels、State 和完整 body（Markdown 原文）
- `--json`：输出 `gh issue view --json` 的原始结果，适合脚本/agent 结构化读取
- Issue 不存在、仓库检测失败或 `gh` 调用失败时报错退出（exit 1）

Agent 定位 Issue 的顺序：已知编号 → `issue view`；需要浏览/筛选 → `issue list`。两者均禁止手动 `gh issue view/list` 绕过脚本。

### plan 子命令

```bash
# 创建
flow.sh plan new <issue> --type <type> --slug <slug>  # 从 Issue 创建（type/slug 必填，无 scope 段）
flow.sh plan new <issue> --project <name> --type <type> --slug <slug>  # Issue 无项目或多项目时显式选本 Plan 项目
flow.sh plan new --project <name> --type <type> --slug <slug> [--title "..."]  # 无 Issue 普通 Plan
# 阶段关联：默认继承 Issue body 的 Product/Phase；--product <name> --phase <id> 可覆盖（须成对，缺一报错；无关联时两项均留空）

# 查询
flow.sh plan status <plan-id>           # 查看 Plan 完整状态
flow.sh plan list                       # 列出本地活跃 Plan
flow.sh plan list --issue               # 列出活跃 Plan + GitHub Issues

# 校验（可选诊断；submit/approve 已自动校验）
flow.sh plan check <plan-name-or-path>  # 校验 Plan 质量（Issue 号 / Plan 名 / 文件路径均可）
```

`plan list` 默认离线，仅扫描本地 Plan 文件。`--issue` 增加 GitHub Issues 合并展示，无 Plan 的 Issue 显示 `[recorded]`。

Plan 的 `Issue` 字段只允许 `N/A` 或一个 `#N`，且必须有一个 Target Project。一个目标需要多份实施时，分别创建多份 Plan，再按 `references/active-plan-graph.zh-CN.md` 在 Graph `groups` 中组织；不再创建额外协调 Plan。

### sync

```bash
flow.sh sync <issue>           # 全量同步（三章节 + | Plan | 链接行 + labels）
flow.sh sync <issue> --body-only    # 仅 body（三章节 + | Plan | 链接行）
flow.sh sync <issue> --labels-only  # 仅 labels（不触碰 body）
```

**同步内容**：body 侧 = 三章节（`## Goal` / `## Scope` / `## Acceptance Criteria`）外科式替换 + `## Related Resources` 的 `| Plan |` 链接行更新；三章节与链接行之外的 Issue body 内容（`## Context`、`## Goal` 前元信息行、`## Depends on` / `## Demo`、其它表格行等）逐字保留，不重写、不规范化。详见 `references/issue-guide.md`。

**自动同步时点**：`approve` / `complete` / `verify` / `archive` 状态推进时自动执行同一同步（与手动命令同一实现，内容同为三章节 + 链接行）；归档后另有一次链接行刷新，将 `| Plan |` 行指向归档后的 Plan 路径。

### submit

```bash
flow.sh submit <plan>       # planning → reviewing，提交人工审阅（自动运行 plan check 校验）
```

提交 Plan 状态变更，commit/push 到集成分支。校验不合格会被拒绝。输出 "Next: flow.sh approve <plan> --confirm" 提示。

### approve --confirm

```bash
flow.sh approve <plan> --confirm                            # 默认创建 worktree
flow.sh approve <plan> --confirm --no-worktree               # 跳过 worktree（main 直实施）
flow.sh approve <plan> --confirm --existing-worktree <path> # 独立分支演进模式（复用已有 worktree）
```

`approve` 不带 `--confirm` 时报错退出，提示使用 `submit`。`--confirm` 接受 `reviewing` 或 `planning`（快捷路径）→ `executing`。

**模式选择**：
1. **默认模式**：创建独立 feature 分支与工作树（`.worktrees/<project>-<plan-name>`），记录集成分支 HEAD 为 Base Commit。
2. **`--no-worktree`**：直接在集成分支（main）实施，不建分支不建工作树。
3. **`--existing-worktree <path>`**：**独立分支演进模式**。复用已有工作树路径 `<path>`，自动绑定其检出的 work branch。多个 Plan 可以通过同一个 `Delivery` 共用一次正式交付；成员必须复用负责人记录的 `Integration Branch`、`Work Branch`、`Delivery Base Commit`、`Integration Strategy` 和 `Commit Subject`，任一不一致都拒绝批准。

有开发分支的 Plan 使用固定交付字段：`Delivery`、`Commit Subject`、`Integration Strategy`、`Integration Branch`、`Work Branch`、`Delivery Base Commit`、`Verification Commit`、`Integration Commit`。`--no-worktree` 只使用 `Verification Commit`，其余交付分支字段留空。

`Commit Subject` 在 Plan 审批时随 Plan 一起冻结。冻结后只能通过用户确认的 Plan 修订改变。正式交付时，`integrate` 与 PR 合并路径都逐字使用该字段，不生成、不拼接、不改写，也不追加 Issue 编号或其他自动文本。

### integrate --confirm

```bash
flow.sh integrate <issue-or-plan> --confirm
```

只用于存在开发分支的交付；`--no-worktree` 不运行此命令。参数可以是 Issue 编号、负责人 Plan 或任一成员 Plan。

执行时：
1. 找到该 Plan 的 `Delivery` 负责人，并收集所有尚未归档、`Delivery` 相同的成员。
2. 要求所有成员都处于 `verifying`，开发工作目录无未提交改动，并逐项核对 `Integration Branch`、`Work Branch`、`Delivery Base Commit`、`Integration Strategy` 与 `Commit Subject` 一致。
3. 将当前 work-branch HEAD 记录为各成员的 `Verification Commit`。
4. 从共同 `Delivery Base Commit` 到当前 work branch 收集整次 Delivery 的全部改动。默认 `squash` 为正式分支的一条提交；只有 `Integration Strategy: preserve-history` 且用户明确选择时才保留开发提交。
5. 正式提交标题直接使用 Plan 的 `Commit Subject`。PR 路径使用平台的 squash 合并时也必须使用同一标题。
6. 把正式分支实际生成的提交记录为负责人 Plan 的 `Integration Commit`；成员随后执行 `verify --confirm` 时都校验这同一提交。

### verify --confirm [--keep-worktree]

```bash
flow.sh verify <plan> --confirm                 # 有开发分支时校验负责人记录的 Integration Commit
flow.sh verify <plan> --confirm --keep-worktree # 归档时仍需保留共用 worktree 的成员路径
```

`--no-worktree` 不使用 `Integration Commit`；`verify --confirm` 校验并记录用户实际查看到的 integration-branch commit 作为 `Verification Commit`。

### archive [--keep-worktree]

```bash
flow.sh archive <plan>                # 标准模式（清理 worktree 与分支）
flow.sh archive <plan> --keep-worktree # 演进模式（保留 worktree 与分支）
```

共享 Delivery 先归档非负责人 Plan，并对这些成员使用 `--keep-worktree`；最后归档负责人 Plan，不带 `--keep-worktree`，由正常清理一次性删除共用 work branch 和 worktree。

### complete --pr

```bash
flow.sh complete <issue> --pr    # PR 路径（默认不走 PR）
```

### verify-switch

切换工作空间到特性分支供用户验证。

执行流程：
1. 检查规范路径 git 状态（脏时输出 warning，不阻塞）
2. 移除开发工作树
3. 在规范路径 checkout 特性分支
4. 更新 Plan Worktree 元数据（path → "(removed)"，新增 Verification Dir 字段）
5. commit Plan 变更（保持特性分支 git 状态干净）
6. 输出验证指引

规范路径为项目目录（如 `projects/<name>/`）。

```bash
# 切换到特性分支验证
flow.sh verify-switch <issue>
```

验证通过后回到正式分支，并运行 `flow.sh integrate <issue-or-plan> --confirm`。`verify-switch` 只负责切换验证位置，不再输出或要求手工 `git merge`。

### reset（破坏性）

```bash
flow.sh reset <issue>       # Issue 驱动
flow.sh reset <plan-name>   # Plan 驱动
```
仅用户明确要求时使用。

---
