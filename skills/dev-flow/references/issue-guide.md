# Issue 编写指南

Issue 创建、编写、同步的详细指导。核心规则见 SKILL.md。

## Issue 创建

**必须使用 `flow.sh issue create`**，禁止直接调 `gh issue create`。脚本通过 `detect_space_repo` 自动检测空间仓库，无需手动指定 `--repo`。

```bash
flow.sh issue create --title "add skills remove command" --type feat
flow.sh issue create --title "coordinate api and web" --project api --project web --type feat
```

**创建错误的 Issue 必须彻底删除**（`flow.sh issue delete`），不能只是 close。用户不喜欢仓库里留垃圾记录。

### `--project` 怎么填

`--project` 是可选、可重复参数，只给 Issue 增加 `project/<name>` 影响范围标签。Issue 可以有 0..N 个项目标签；它们**不再决定某一份 Plan 的目录**。普通 Plan 创建时仍必须选定自己的唯一项目：Issue 恰好只有一个 `project/*` 时可以自动采用；没有或有多个时必须显式传 `plan new ... --project <name>`。

项目名填的是**工作对象所在的空间组件**，不是流程名，也不是话题名：

| Issue 要改的东西 | `--project` | 后续流程 |
|---|---|---|
| 本体组件（本体 worktree 下的 skills、rules、agents、commands、plugins、assembly） | 该组件在 `STRUCTURE.md` 里的项目名 | `ontology-evolution` |
| `projects/` 下的某个仓库 | 该仓库在 `STRUCTURE.md` 里的名字 | `dev-flow` |

名字从 `STRUCTURE.md` 读，不要凭印象猜。Issue 标签表示影响范围；普通 Plan 的 Target Project 才决定 Plan 落到 `.wopal-space/plans/<name>/`。

### 增删项目标签

不要再用“设置唯一项目”的思路编辑 Issue。项目标签按单个标签增删，其他 `project/*` 保持不动：

```bash
flow.sh issue edit 42 --add-project api --add-project web
flow.sh issue edit 42 --remove-project legacy-api
```

### 多个 Issue 归并成一份实施

如果多个 Issue 实际描述同一份实施，先归并 Issue，再创建一个普通 Plan：

```bash
flow.sh issue merge --into 40 41 42
```

`#40` 保留为主 Issue，并记录 `Merged from`；来源 Issue 记录 `Merged into: #40`，移除活动状态标签并以 `not planned` 关闭。重复执行同一归并是幂等的；已经归并到别处的 Issue 会在写入前被拒绝。

**不要**为了保留多个 Issue 而写 `Issue: #40, #41` 之类的多 Issue Plan。普通 Plan 的 Issue 字段最多一个。

### 本体相关的 Issue 不走 dev-flow

改动落在本体组件里的 Issue 就是**本体变更**：写提案、走 `wopal space evo` 生命周期，即 `ontology-evolution` 技能。dev-flow 的 Plan、分支、worktree 都不参与。

先判断工作对象，再决定流程：

- 改的是本体 worktree 下的技能、规则、agent、命令、插件、装配 → 本体提案（`ontology-evolution`）
- 改的是 `projects/` 下的代码 → dev-flow Plan

拿不准时看改动路径落在哪个组件。详见 `space-master` 的场景路由表。

## Issue 查询

**查询未完成 Issue 必须使用 `flow.sh issue list`**，禁止手动 `gh issue list`。脚本通过 `detect_space_repo` 自动定位空间仓库并显示 repo URL，避免 Agent 因不知道仓库归属而查错仓库（如误查已禁用 issues 的 ontology 仓库）。

```bash
flow.sh issue list                          # 列出空间仓库所有未完成 Issue
flow.sh issue list --project firecrawl      # 按 project 过滤
flow.sh issue list --status planning        # 按 status 过滤
flow.sh issue list --limit 100              # 指定数量
```

**查看单个 Issue 必须使用 `flow.sh issue view <编号>`**，禁止手动 `gh issue view`。已知编号时的首选方式，自动定位空间仓库，直接输出标题、标签、状态和完整 body；`--json` 输出原始 JSON。

## Issue 标题格式

Issue 标题是**自由文本**，不再强制 `type(scope): description` 格式。宽松 type 前缀（可选）用于 label 推断。

```text
<自由描述>            # 推荐
<type>: <描述>        # 可选 type 前缀
<type>(<scope>): <描述>  # 兼容旧格式
```

要求：
- 宽松 type 前缀（若存在）必须合法（见下表）
- `scope` 不再必填
- `description` 使用英文祈使句
- `description` ≤ 70 chars（量的是 type 前缀之后的文本）
- 整体标题 ≤ 100 chars

### 合法 type

| type | 用途 |
|------|------|
| `feature` | 新功能 |
| `fix` | Bug 修复 |
| `perf` | 性能优化 |
| `refactor` | 重构 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 工具 / 构建 |
| `enhance` | 功能增强 |

### 示例

- `add skills remove command`
- `fix: handle expired tokens`
- `perf(sync): reduce issue body rewrite cost`

**标题语言规则**：标题使用英文（遵循项目仓库规范）。body 内容使用用户偏好语言编写（与 Plan 文档一致）。

## Issue body 五段结构

所有 Issue body 统一使用以下五段式结构（按顺序）：

| 段落 | 标题 | 用途 |
|------|------|------|
| 1 | `## Goal` | 一句话目标 |
| 2 | `## Context` | 背景、研究发现、决策依据、参考资料——agent 自由写入 |
| 3 | `## Scope` | `### In` + `### Out`，明确范围边界 |
| 4 | `## Acceptance Criteria` | 可验证的完成条件，plan 阶段细化 |
| 5 | `## Related Resources` | 关联文档（Plan、PRD、Roadmap 等）表格 |

**Roadmap 生成的 Issue** 在 `## Goal` 之前额外包含元信息行：
```markdown
- **Product**: {product}
- **Phase**: {phase-id}
```

**Roadmap Slice Issue** 额外包含 `## Depends on` 和 `## Demo` 段落。

## Issue 同步规则

只要 Plan 中实际映射到 issue body 的章节发生变化，**必须立即同步**，不应反问用户是否要同步。

**同步内容 = 三章节 + 链接行**。映射关系（只替换章节正文，标题行不动）：
- Plan `Goal` → Issue `## Goal`
- Plan `In Scope` / `Out of Scope` → Issue `## Scope`（规范渲染为 `### In` + `### Out` 两个子节）
- Plan `Acceptance Criteria` → Issue `## Acceptance Criteria`（保留 `### Agent Verification` / `### User Validation` 子节；编号式 checkbox 转为 `- [ ]` / `- [x]`）

**链接行**：Issue `## Related Resources` 中的 `| Plan |` 行由同步自动更新（Plan 未批准时为 `| Plan | _待关联_ |`），不来自 Plan 章节映射；行更新仅发生在该章节内，章节缺失时沿用既有兜底追加行为。

**保全承诺**：三章节与链接行之外的内容逐字保留——包括 `## Context`、`## Goal` 前的元信息行、`## Depends on` / `## Demo`、其它表格行等一切非映射内容；同步不做重写、不规范化。

**缺节与 legacy 兜底**：
- 目标章节在 Issue 中缺失 → 跳过该目标并告警（非致命），其余目标照常同步；不插入缺失章节。
- Issue 无规范 `## Scope`、但存在 legacy 顶层 `## In Scope` / `## Out of Scope` → 就地更新这两个章节的正文，保留原标题，不做结构重写。

**不需要同步的章节**：`Implementation`、`Technical Context`、`Delegation Strategy` 等仅存在于 Plan 的章节。

**同步命令**：
```bash
flow.sh sync <issue> --body-only
```

## Issue 驱动 vs 无 Issue 流程

| 模式 | 触发词 | 流程 |
|------|--------|------|
| Issue 驱动 | Issue 号、"处理 issue"、"开发" | 先创建 Issue → 再出 Plan |
| 无 Issue（Plan 驱动） | "出方案"、"写 Plan" | 直接 `flow.sh plan new --project ... --type ... --slug ...` |

一个目标需要**多份**实施时，不要合并成一个跨项目 Plan；分别创建多份 Plan，再用 Active Plan Graph `groups` 组织共同目标、用 `edges` 表达实施先后。详见 `references/plan-guide.md` / `references/plan-guide.zh-CN.md` 与 `references/active-plan-graph.md`。

两者都是 dev-flow 流程，区别在于是否有 Issue 载体。
