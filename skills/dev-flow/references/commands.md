# 命令参考

对所有命令，使用 `flow.sh <cmd> --help` 获取完整参数列表和说明。本文档仅补充 `--help` 不覆盖的使用模式和边缘场景。

---

## 命令概览

### 工作流命令（状态机推进）

| 命令 | 说明 |
|------|------|
| `plan <issue>` | 创建或定位 Plan |
| `approve <issue>` | 方案评审 |
| `approve <issue> --confirm` | 用户审批通过，默认创建 worktree 隔离 |
| `approve <issue> --confirm --no-worktree` | 用户审批通过，跳过 worktree |
| `complete <issue> [--pr]` | 实施完成，进入用户验证 |
| `verify <issue> --confirm` | 用户验证通过 |
| `archive <issue>` | 归档 Plan，push 代码 |
| `verify-switch <issue> [--merge]` | worktree 验证切换 |
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

### 查询与诊断

| 命令 | 说明 |
|------|------|
| `status <issue>` | 查看 Issue + Plan 状态 |
| `list` | 列出所有活跃 Plan |
| `sync <issue> [--body-only\|--labels-only]` | Plan → Issue 同步 |
| `reset <issue>` | 重置 Plan 到 planning 状态 |

### 工具

| 命令 | 说明 |
|------|------|
| `query` | 低层数据查询（内部用） |

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

### plan（无 Issue 模式）

```bash
flow.sh plan --title "feat(scope): desc" --project <name> --type <type>
```

先运行这条命令生成或定位 Plan stub，再编辑内容；禁止手写创建新的 Plan 文件。

目录由 `--project` 决定（必填参数）。标准项目：`projects/<project>/docs/plans/`；ontology-worktree：`.wopal/docs/plans/`。`docs/projects/<project>/plans/` 已废弃，仅作只读回退。

### plan --check

```bash
flow.sh plan <issue> --check
```
校验 Plan 质量，不推进状态。

### sync

```bash
flow.sh sync <issue>           # 全量同步（body + labels）
flow.sh sync <issue> --body-only    # 仅 body
flow.sh sync <issue> --labels-only  # 仅 labels
```

### approve --confirm

```bash
flow.sh approve <issue> --confirm              # 默认创建 worktree
flow.sh approve <issue> --confirm --no-worktree # 跳过 worktree
```

### complete --pr

```bash
flow.sh complete <issue> --pr    # PR 路径（默认不走 PR）
```

### verify-switch（ontology-worktree 验证专用）

verify-switch 仅用于 ontology-worktree 的 switch-runtime 模式。standard 项目直接在 worktree 目录验证，合并后走 verify --confirm。

```bash
# Phase 1: 切换 .wopal/ 到 feature 分支供用户验证
flow.sh verify-switch <issue>

# Phase 2: 合并回主分支 + verify --confirm（用户确认后执行）
flow.sh verify-switch <issue> --merge
```

standard 项目执行 verify-switch 时会打印验证指引，不执行任何 git 操作。

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
