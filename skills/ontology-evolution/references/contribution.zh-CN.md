# 原生 Git/GitHub 贡献流程

## 职责与授权

Agent 使用原生 `git` 与 GitHub CLI `gh` 创建、修改和收尾上游 PR。本规范不增加脚本、贡献记录文件或另一套恢复状态机：Git 分支/worktree 保存工作，GitHub 保存 PR。`ontology status` 只查看并提醒，`ontology sync` 只同步 main；状态为“已合并”不等于可以删除。

每次上行发布由用户决定；创建 PR 的授权不包含以后评审修复的发布、合并或删除。用户明确要求“同步并清理该 PR”才包含对应收尾动作。普通同步不顺带删除。未经授权不添加/修改 remote，不切换宿主本体主目录的分支。空间稀疏装配与私有保护仍由 `wopal space` 命令负责。

## 分支与工作区

- 新贡献只用 `contribute/<slug>`。slug 是 2–4 个英文词、最多 24 个字符，形如 `plan-lookup`；仅小写字母、数字与单连字符，不能有首尾连字符。
- 不从完整提交标题或提案长名称截断生成名字，不加日期、时间戳、随机串、`tmp`、`v2` 或不断叠加的修复后缀。
- worktree 固定为 `<space-root>/.worktrees/ontology-contribute-<slug>/`，从 upstream/main 完整检出。这里是 PR 的持续工作现场，不是 `.tmp/` 或系统临时目录。
- 一个主题一个 PR，一组分支/worktree；评审修改复用原现场，直到 PR 结束并完成授权清理。不因发布成功就拆掉 worktree，不为每轮修复新建分支。
- 创建前查本地/远端分支、`git worktree list --porcelain` 和同 head 的 PR。名称占用先辨认归属：同一主题复用；不同主题选另一个有意义的短名称，不覆盖、不加随机后缀。
- 现有长名称按原身份继续处理；不为了符合新规则重命名已开 PR 的分支。只处理本次明确关联的资源，不顺手清扫其他贡献。

## 先查清，再建立现场

以下为命令示例，不是可不加检查连续执行的脚本。变量需先填入从当前空间和 registry 核实的绝对路径/仓库身份，不能照抄占位符；`R` 是宿主本体仓库，`S` 是空间根，`W` 是本 PR 的 worktree。每条命令失败就停在现场，保留原始错误。

```bash
R='<verified-absolute-ontology-repo>'
S='<verified-absolute-space-root>'
SLUG='plan-lookup'
B="contribute/$SLUG"
W="$S/.worktrees/ontology-contribute-$SLUG"
UPSTREAM='<verified-upstream-owner/repo>'
FORK_OWNER='<verified-origin-owner>'
git -C "$R" status --short
git -C "$R" log --oneline -5
git -C "$R" remote -v
git -C "$R" worktree list --porcelain
git -C "$R" branch --list 'contribute/*'
git -C "$R" ls-remote --heads origin "refs/heads/$B"
gh pr list --repo "$UPSTREAM" --state all --head "$FORK_OWNER:$B" \
  --json number,url,state,baseRefName,headRefName,headRepository,headRepositoryOwner
```

核对 origin 为目标 fork、upstream 为正确上游，完整 head repository 与 branch 身份一致，目标为 main；clone 模式先说明需 fork，不擅自改拓扑。发现未提交变更先报告，不 stash、reset 或清理他人工作。

先检查 `wopal space status` 和 `wopal ontology status`。在用户授权范围内，先用 `wopal space sync --confirm` 汇入来源 Space，再用 `wopal ontology sync --confirm` 对齐来源链。同步失败就停，不拿旧状态继续发布。

核对最新 upstream/main 已在来源 main 的祖先链中，再按主题核对 `git diff --name-status upstream/main...main`。私有、空间独有或无关改动不进入 PR；文件名命中某目录不等于属于本主题，同文件内别人的改动也须排除。

仅在名称/目录不存在、仓库干净且归属已核实后创建；目录已存在时先检查内容，不覆盖。下面的创建命令只用于全新贡献：

```bash
git -C "$R" merge-base --is-ancestor upstream/main main
git -C "$R" worktree add -b "$B" "$W" upstream/main
```

如果只有已知本地分支、worktree 缺失，检查该分支与 PR 身份后，用 `git -C "$R" worktree add "$W" "$B"` 恢复同一现场。只有远端分支时，先 fetch 并核对 head，再以该远端分支为起点建立本地分支/worktree；不能重新从 upstream/main 开始覆盖原 PR。

## 选改动、提交、创建 PR

优先选已经核对、只含本主题的提交，按顺序应用；不要把混有其他主题的整段 main 历史带过来。每次应用前确认贡献 worktree 干净：

```bash
git -C "$W" status --short
git -C "$W" cherry-pick --no-commit <verified-topic-commit>
git -C "$W" diff --cached --name-status
git -C "$W" diff --cached --stat
git -C "$W" diff --cached --check
```

检查实际 staged diff，完成适用验证后再提交。若提交混杂主题，提取并逐块检查主题补丁，不整提交 cherry-pick，也不盲目从 main 检出整个文件。可用下面的原生命令处理明确起止版本与文件的补丁（`PATCH` 位于空间 `.wopal-space/.tmp/`；同文件内仍需逐块检查）：

```bash
git -C "$R" diff --binary --full-index --no-renames <from> <to> -- <exact-paths> > "$PATCH"
git -C "$W" apply --3way --index "$PATCH"
```

补丁必须保留新增、修改、删除以及重命名两端；整文件复制会夹带同期改动或覆盖本 PR 的上游适配，不能把它当作默认方法。冲突时保留现场，人工核对后点名暂存；不自动选 ours/theirs，不 reset/clean。校验没有无关变化后提交：

```bash
git -C "$W" commit -m 'fix: resolve plan lookup'
git -C "$W" diff --name-status upstream/main...HEAD
git -C "$W" diff --stat upstream/main...HEAD
git -C "$W" push -u origin "$B"
```

创建前再次查询同一 upstream、fork、head 与 base 的已有 PR：有唯一对应 PR 就继续它；已关闭/已合并或候选不明则报告，不自动再开一个。push 成功但创建失败时保留分支/worktree，下次先查询再重试。

PR 正文用实际内容说明，不用“合并 main 到 upstream”之类空模板。至少包括：

- 背景与原因：解决什么问题，为什么需要这次贡献。
- 主要变化及影响的能力。
- 最终文件清单、增删行数和范围来源：根据哪些已验证提交/补丁选定，排除了什么；二进制文件不编造行数。
- 实际验证命令与结果；没做的验证明确说未做。

统计使用最终贡献分支相对当前 base 的 diff，不引用来源 main 的总变化。正文保存在空间临时目录，用文件传入：

```bash
gh pr create --repo "$UPSTREAM" --base main --head "$FORK_OWNER:$B" \
  --title 'fix: resolve plan lookup' --body-file "$BODY"
```

汇报 PR URL、分支、worktree 绝对路径、验证结果与下一步；保留现场等待评审。

## 评审修复与中断继续

先核对 PR 身份与 open 状态、worktree 路径/分支/干净状态、远端 head。

### 在哪里修

改在**来源 Space**，让改动由内向外流；这个方向不需要额外回流：

    来源 Space (.wopal) -> space sync -> local main -> 贡献 worktree -> PR

评审现场在 worktree 时，直接在贡献 worktree 修复是允许的，但它带来一项义务：**PR 分支从此拥有了 local main 没有的提交。** 在它们回流之前，local main 与上游对同样的行各持一说，下一次 `ontology sync` 就会报冲突——那看起来像上游改了什么，实际是你自己没回流的修改。

> **强制回流。** 贡献 worktree 里的任何提交，都必须在本 PR 合并前、且始终在运行 `ontology sync` 之前回到来源 Space。用下面的回流检查，不要依赖记忆。

### 回流检查

在 worktree 侧做过任何修复后跑一次，在请用户合并前再跑一次。

判回流只看内容，不看提交身份。squash 合并会重写源提交，`main.."$B"` 即使回流完美也会永远列出那条 PR 分支——用它做判据会得到一个永久误报。

改为把 PR 触碰的文件与真相源比对。合并前真相源是 local main：列出路径说明 worktree 里有 local main 从未收到的改动。合并后真相源是 `upstream/main`：列出路径说明 local main 还留着已合并内容的旧副本。

    # 合并前：从 worktree 分支相对于 upstream 提取文件集
    PR_PATHS=$(git -C "$W" diff --name-only upstream/main..."$B")
    # 合并前：local main 是否已包含本分支的内容
    git -C "$R" diff --name-only main "$B" -- $PR_PATHS

    # 合并后：从 merge commit 反推 PR 文件集（合并后 triple-dot diff 会退化为空集）
    MERGED_PATHS=$(git -C "$R" diff --name-only "$MERGE^1" "$MERGE")
    # 合并后：local main 与上游在这些文件上一致
    git -C "$R" diff --name-only upstream/main main -- $MERGED_PATHS

回流完整时两者都必须无输出。出现的路径就是要对齐的那个文件。

回流走正常的来源 Space 路径：把本轮主题改动应用到 `.wopal`、在那里提交、执行 `wopal space sync --confirm`、再执行 `wopal ontology sync --confirm`。**绝不手工改 local main 来抹平差异**：local main 由空间分支喂入，直接改既脱离协议，也正是下一次同步被中止的原因。

不要覆写原 PR 已有的冲突解决。

允许按评审增删文件，不设终身范围锁。推送前核对最终 diff，更新受影响的 PR 正文与验证说明：

```bash
git -C "$W" push origin "HEAD:refs/heads/$B"
gh pr edit <pr-number> --repo "$UPSTREAM" --body-file "$BODY"
```

只做普通 push；拒绝就停下查差异，不 force push。PR 创建/推送中断时，以 Git 与 GitHub 当前事实继续原分支，不能为了重试重新复制提交、换分支或新开 PR。open PR 和冲突现场都保留。

## 合并回流与授权清理

用户决定合并；Agent 不因评审通过自行合并。两条回流同步命令都不承担贡献资源清理。

### 回流闸

执行任何同步之前，按顺序跑完这些检查。每条回答一个不同的问题；前一条通过不代表可以跳过后面。

1. **没有未回流的 PR 内容。** 本 PR 的文件集必须已与 local main 一致：`git -C "$R" diff --name-only main "$B" -- $PR_PATHS` 无输出。有输出说明 worktree 侧的改动从未进入来源 Space，先回流（见「评审修复与中断继续」的回流检查）。不要先跑同步去「看看会怎样」。这里绝不能用 `main.."$B"`——squash 合并后它永远非空。
2. **PR 文件与上游一致。** 对 `$PR_PATHS`（合并后为 `$MERGED_PATHS`）里的每个路径，`git -C "$R" diff --quiet upstream/main main -- <路径>` 必须成功。某路径有差异，说明 local main 仍留着已合并内容的旧副本；要经来源 Space 对齐，不要直接改 local main。
3. **来源 Space 干净且已同步。** `git -C "$S/.wopal" status --short` 无输出，且 `wopal space status` 报告没有待贡献提交。

三条都通过后，才按此顺序执行：

    wopal ontology sync --confirm     # upstream/origin -> local main
    wopal space sync --confirm        # local main -> 空间分支

检查都过了之后同步仍报冲突，那是新信息，不是手工解冲突的理由：停下来，查看被点名的文件并汇报。CLI 会自行中止合并，local main 保持原样——动手之前先确认这一点。

删除前取得针对该 PR 的明确授权，并逐项检查：

1. GitHub 上仓库、fork/head branch、base main 与本次 PR 一致，状态为 MERGED，取得 `headRefOid` 与 `mergeCommit.oid`。查询失败或字段不全就保留。
2. mergeCommit 已是 local main 的祖先；origin/main 与 local main 对齐，来源 Space 同步成功。不能只凭内容相同判断已回流。
3. 精确路径对应目标分支。检查 worktree 中 tracked、untracked、ignored 内容；任何未提交/未跟踪/被忽略的工作先报告，不强制删除、不清空。
4. 本地分支 head 等于 PR 最终 head；远端分支若存在也必须相等。额外提交或其他 worktree 占用都保留，不能因为 PR 已合并就丢弃后加的工作。

```bash
gh pr view <pr-number> --repo "$UPSTREAM" \
  --json state,baseRefName,headRefName,headRepository,headRepositoryOwner,headRefOid,mergeCommit
git -C "$R" merge-base --is-ancestor <verified-merge-sha> main
git -C "$W" status --short --untracked-files=all --ignored
git -C "$R" rev-parse "refs/heads/$B"
git -C "$R" ls-remote --heads origin "refs/heads/$B"
```

证据齐全且已获删除授权后，先正常移除本 PR 的 worktree，再删仍存在的远端分支，最后删本地分支。每步成功后才继续，失败明确汇报残留，不假装收尾完成：

```bash
git -C "${R:?}" worktree remove "${W:?}"
git -C "${R:?}" push origin --delete "${B:?}"
git -C "${R:?}" branch -d "${B:?}"
```

已不存在的 worktree/远端分支跳过对应步骤，仍核对剩余资源。squash/rebase 合并可能使 `branch -d` 拒绝；只有上述证据与用户明确删除授权都齐全，才可对这一条已核实分支使用 `git branch -D`。不用 `--force` 移除 worktree，不用通配符批量删除，不全局 prune 其他任务的 worktree。

PR 为 CLOSED 且未合并时，保留现场并请用户决定如何保存/撤回未交付内容；关闭不构成删除授权。收尾报告列出清掉的资源、保留的资源及原因。
