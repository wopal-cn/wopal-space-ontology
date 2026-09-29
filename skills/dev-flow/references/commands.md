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
| `verify <issue> --confirm` | 用户验证通过 |
| `archive <issue>` | 归档 Plan，推送 Plan 变更，同步阶段文档 |
| `verify-switch <issue> [--yes]` | 切换到特性分支验证 |

### Issue 管理

| 命令 | 说明 |
|------|------|
| `issue create --title "..." --project <name> --body-file <path>` | 创建 Issue（`--body-file` 为主路径） |
| `issue edit <issue> [--title] [--type] [--project] [--body-file] [--append]` | 编辑 Issue（标题/类型/项目/body） |
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

## 使用模式

### issue create 参数速记

```bash
# 最小创建（--body-file 为主路径）；标题自由文本，type 由 --type 显式指定
flow.sh issue create --title "add skills remove command" --project <name> --type feat --body-file body.md

# --type 可选覆盖（默认从标题宽松前缀推断）
--type feat
```

`--body-file` 指向包含五段结构的 markdown 文件。不再支持 type-specific 参数（`--confirmed-bugs`、`--baseline` 等）——agent 在 body 文件的 `## Context` 中自由写入。

### issue edit

编辑现有 Issue：标题、类型、项目标签与 body。

```bash
flow.sh issue edit <issue> --body-file <path>     # 全量替换 body
flow.sh issue edit <issue> --append <path>        # 追加到 body 末尾
flow.sh issue edit <issue> --title "fix(api): ..." # 改标题（自动同步 type/project 标签）
flow.sh issue edit <issue> --type fix --project wopal-cli  # 改类型/项目标签
```

**行为**：
- `--body-file`：用文件内容替换整个 Issue body
- `--append`：在现有 body 末尾追加文件内容，用 `\n\n` 分隔
- `--title` / `--type` / `--project`：更新标题与对应标签（`type/*`、`project/*` 组自动同步）
- 空文件或文件不存在时报错退出（exit 1）
- 文件不以 `#` 或 `-` 开头时输出 warning
- 不指定 body 参数时保持 body 不变，仅应用标题/类型/项目变更

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
flow.sh issue list --project firecrawl      # 按 project 过滤（可多次，OR）
flow.sh issue list --status planning        # 按 status 过滤（可多次，OR）
flow.sh issue list --project firecrawl --project wopal-cli --status planning --status verifying
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
flow.sh plan new <issue> --type <type> --scope <scope> --slug <slug>  # 从 Issue 创建
flow.sh plan new --title "..." --project <name> --type <type>  # 无 Issue 创建
# 阶段关联：默认继承 Issue body 的 Product/Phase；--product <name> --phase <id> 可覆盖（须成对，缺一报错；无关联时两项均留空）

# 查询
flow.sh plan status <plan-id>           # 查看 Plan 完整状态
flow.sh plan list                       # 列出本地活跃 Plan
flow.sh plan list --issue               # 列出活跃 Plan + GitHub Issues

# 校验（可选诊断；submit/approve 已自动校验）
flow.sh plan check <plan-name-or-path>  # 校验 Plan 质量（Issue 号 / Plan 名 / 文件路径均可）
```

`plan list` 默认离线，仅扫描本地 Plan 文件。`--issue` 增加 GitHub Issues 合并展示，无 Plan 的 Issue 显示 `[recorded]`。

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
3. **`--existing-worktree <path>`**：**独立分支演进模式**。复用已有工作树路径 `<path>`，自动绑定其检出的 feature 分支写入 Plan 元数据，并将 Base Commit 记录为该分支当前最新 HEAD（上一个 Plan 的实施产物终点）。

### verify --confirm [--keep-worktree]

```bash
flow.sh verify <plan> --confirm                # 标准模式（要求已合并到集成分支）
flow.sh verify <plan> --confirm --keep-worktree # 演进模式（跳过 merge 检查，记录 feature HEAD）
```

### archive [--keep-worktree]

```bash
flow.sh archive <plan>                # 标准模式（清理 worktree 与分支）
flow.sh archive <plan> --keep-worktree # 演进模式（保留 worktree 与分支）
```

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

验证通过后，合并特性分支到集成分支。**默认优先 squash 合并**（保持 main 历史干净）：

```bash
cd <repo_root>
git checkout main
git merge --squash <feature_branch>   # 压成单个提交
git commit -m "feat(scope): <description> (#<issue>)"
# 或保留历史: git merge --no-ff <feature_branch>
```

squash 合入后 verify 的 tree 相等判据原生识别已合并，无需手动干预。

### reset（破坏性）

```bash
flow.sh reset <issue>       # Issue 驱动
flow.sh reset <plan-name>   # Plan 驱动
```
仅用户明确要求时使用。

---
