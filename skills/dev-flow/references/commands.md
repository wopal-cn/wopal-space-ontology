# 命令参考

对所有命令，使用 `flow.sh <cmd> --help` 获取完整参数列表和说明。本文档仅补充 `--help` 不覆盖的使用模式和边缘场景。

---

## 命令概览

### 工作流命令（状态机推进）

| 命令 | 说明 |
|------|------|
| `plan <issue>` | 创建或定位 Plan（裸命令，后向兼容） |
| `plan new <issue>` | 创建新 Plan |
| `plan status <plan-id>` | 查看 Plan 完整状态 |
| `plan list [--issue]` | 列出活跃 Plan（`--issue` 含 GitHub Issues） |
| `submit <plan>` | 提交人工审阅（planning → reviewing） |
| `approve <plan> --confirm` | 用户审批通过，默认创建 worktree 隔离 |
| `approve <plan> --confirm --no-worktree` | 用户审批通过，跳过 worktree |
| `complete <issue> [--pr]` | 实施完成，进入用户验证 |
| `verify <issue> --confirm` | 用户验证通过 |
| `archive <issue>` | 归档 Plan，push 代码，同步阶段文档 |
| `verify-switch <issue> [--yes]` | 切换到特性分支验证 |
| `roadmap <prd-path> [--product ...] [--project ...]` | 产品阶段规划（四阶段工作流） |

### Issue 管理

| 命令 | 说明 |
|------|------|
| `issue create --title "..." --project <name> --body-file <path>` | 创建 Issue（`--body-file` 为主路径） |
| `issue write <issue> --body-file <path>` | 全量替换 Issue body |
| `issue write <issue> --append <path>` | 追加到 Issue body 末尾 |
| `issue update <issue>` | ⚠️ **已废弃**，使用 `issue write` 替代 |
| `decompose-prd <prd-path> [--dry-run]` | 从 PRD 拆分 Issue |
| `decompose-prd --from ROADMAP.md [--product <name>] [--dry-run]` | 从 ROADMAP.md Slices 表生成 Slice Issues |

### Plan 子命令

| 命令 | 说明 |
|------|------|
| `plan new <issue>` | 创建新 Plan，与裸 `plan <issue>` 等效 |
| `plan status <plan-id>` | 查看 Plan 完整状态（metadata、Issue、worktree） |
| `plan list` | 列出本地活跃 Plan |
| `plan list --issue` | 列出活跃 Plan，含 GitHub Issues 合并展示 |
| `plan <issue>` | 裸命令，后向兼容（自动创建或定位 Plan） |

### 其他命令

| 命令 | 说明 |
|------|------|
| `sync <issue> [--body-only\|--labels-only]` | Plan → Issue 同步 |
| `reset <issue>` | 重置 Plan 到 planning 状态 |

---

## 使用模式

### issue create 参数速记

```bash
# 最小创建（--body-file 为主路径）
flow.sh issue create --title "feat(scope): desc" --project <name> --body-file body.md

# --type 可选覆盖（默认从标题推断）
--type feat
```

`--body-file` 指向包含五段结构的 markdown 文件。不再支持 type-specific 参数（`--confirmed-bugs`、`--baseline` 等）——agent 在 body 文件的 `## Context` 中自由写入。

### issue write

写入 Issue body（全量替换或追加）。

```bash
flow.sh issue write <issue> --body-file <path>    # 全量替换 body
flow.sh issue write <issue> --append <path>       # 追加到 body 末尾
```

**行为**：
- `--body-file`：用文件内容替换整个 Issue body
- `--append`：在现有 body 末尾追加文件内容，用 `\n\n` 分隔
- 空文件或文件不存在时报错退出（exit 1）
- 文件不以 `#` 或 `-` 开头时输出 warning

### issue update（已废弃）

```bash
flow.sh issue update <issue> [options]
```

⚠️ 已废弃，使用 `issue write --body-file` 或 `--append` 替代。调用时输出 deprecated 警告。

### plan 子命令

```bash
# 创建
flow.sh plan new <issue>                # 从 Issue 创建
flow.sh plan new --title "..." --project <name> --type <type>  # 无 Issue 创建

# 查询
flow.sh plan status <plan-id>           # 查看 Plan 完整状态
flow.sh plan list                       # 列出本地活跃 Plan
flow.sh plan list --issue               # 列出活跃 Plan + GitHub Issues

# 校验
flow.sh plan check <plan-name-or-path>  # 校验 Plan 质量（Issue 号 / Plan 名 / 文件路径均可）
```

`plan list` 默认离线，仅扫描本地 Plan 文件。`--issue` 增加 GitHub Issues 合并展示，无 Plan 的 Issue 显示 `[recorded]`。

### sync

```bash
flow.sh sync <issue>           # 全量同步（body + labels）
flow.sh sync <issue> --body-only    # 仅 body
flow.sh sync <issue> --labels-only  # 仅 labels
```

### submit

```bash
flow.sh submit <plan>       # planning → reviewing，提交人工审阅
```

提交 Plan 状态变更，commit/push 到集成分支。输出 "Next: flow.sh approve <plan> --confirm" 提示。

### approve --confirm

```bash
flow.sh approve <plan> --confirm              # 默认创建 worktree（接受 reviewing 或 planning）
flow.sh approve <plan> --confirm --no-worktree # 跳过 worktree
```

`approve` 不带 `--confirm` 时报错退出，提示使用 `submit`。`--confirm` 接受 `reviewing` 或 `planning`（快捷路径）→ `executing`。

### complete --pr

```bash
flow.sh complete <issue> --pr    # PR 路径（默认不走 PR）
```

### verify-switch

切换工作空间到特性分支供用户验证。适用 standard 和 ontology-worktree 两种项目类型。

执行流程：
1. 检查规范路径 git 状态（脏时输出 warning，不阻塞）
2. 移除开发工作树
3. 在规范路径 checkout 特性分支
4. 更新 Plan Worktree 元数据（path → "(removed)"，新增 Verification Dir 字段）
5. commit Plan 变更（保持特性分支 git 状态干净）
6. 输出验证指引

standard 项目规范路径为项目目录（如 `projects/<name>/`）；ontology-worktree 规范路径为 `.wopal/`。

```bash
# 切换到特性分支验证
flow.sh verify-switch <issue>
```

验证通过后，手动合并特性分支到集成分支：

```bash
cd <repo_root>
git checkout main        # standard 项目；ontology-worktree 用 space/main
git merge <feature_branch>
```

### decompose-prd

```bash
# 从 PRD 拆分 Issue（兼容旧模式）
flow.sh decompose-prd projects/<project>/docs/PRD.md --dry-run   # 预览
flow.sh decompose-prd projects/<project>/docs/PRD.md --project <name>  # 创建

# 从 ROADMAP.md Slices 表生成 Slice Issues
flow.sh decompose-prd --from ROADMAP.md [--product <name>] [--dry-run]
```

`--from ROADMAP.md` 模式解析 ROADMAP.md 中 `## Slices` 下的 markdown table，为每个 Slice 生成独立 Issue。Slices 表格式见 ROADMAP.md Slices 语法规范。`--product` 指定产品线名称，用于 Issue 标签和 body 元信息。

### roadmap

```bash
flow.sh roadmap projects/<project>/docs/PRD.md --product <name> [--project <name>] [--yes] [--dry-run]
```

四阶段工作流：Analyze → Discuss → Produce → Decompose。

- `--product`：产品线名称（默认从 PRD 文件名推断）
- `--project`：指定项目（影响 Issue label）
- `--yes`：跳过 Discuss 交互，直接使用 Analyze 结果（非 TTY 环境必须指定）
- `--dry-run`：只输出阶段分析，不创建文件和 Issue

### reset（破坏性）

```bash
flow.sh reset <issue>       # Issue 驱动
flow.sh reset <plan-name>   # Plan 驱动
```
仅用户明确要求时使用。

---
