# 命令参考

对所有命令，使用 `flow.sh <cmd> --help` 获取完整参数列表和说明。本文档仅补充 `--help` 不覆盖的使用模式和边缘场景。

---

## 命令概览

### 工作流命令（状态机推进）

| 命令 | 说明 |
|------|------|
| `plan <issue>` | 创建或定位 Plan |
| `approve <issue>` | 方案评审 |
| `approve <issue> --confirm [--worktree]` | 用户审批通过，开始实施 |
| `complete <issue> [--pr]` | 实施完成，进入用户验证 |
| `verify <issue> --confirm` | 用户验证通过 |
| `archive <issue>` | 归档 Plan，push 代码 |
| `verify-switch <issue> [--merge]` | worktree 验证切换 |

### Issue 管理

| 命令 | 说明 |
|------|------|
| `issue create --title "..." --project <name> --goal "..."` | 创建 Issue |
| `issue update <issue>` | 更新 Issue |
| `decompose-prd <prd-path> [--dry-run]` | 从 PRD 拆分 Issue |

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
# 最小创建
flow.sh issue create --title "feat(scope): desc" --project <name> --goal "一句话目标"

# 常用附加
--background "背景说明" --scope "范围" --out-of-scope "不包括"
```

类型专属参数：
- `fix`: `--confirmed-bugs` / `--cleanup-scope` / `--key-findings`
- `refactor`: `--affected-components` / `--refactor-strategy`
- `perf`: `--baseline` / `--target`
- `docs`: `--target-documents` / `--audience`
- `test`: `--test-scope` / `--test-strategy`

### issue update

```bash
flow.sh issue update <issue> [options]
```
参数与 `issue create` 相同，用于补充 Issue 字段。

### plan（无 Issue 模式）

```bash
flow.sh plan --title "feat(scope): desc" --project <name> --type <type>
```

先运行这条命令生成或定位 Plan stub，再编辑内容；禁止手写创建新的 Plan 文件。

目录由 `--project` 决定。本空间约定：跨项目综合 Plan 使用 `--project wopal-space`，目录为 `docs/projects/wopal-space/plans/`。

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
flow.sh approve <issue> --confirm              # 直接开始实施
flow.sh approve <issue> --confirm --worktree   # 隔离 worktree 中实施
```

### complete --pr

```bash
flow.sh complete <issue> --pr    # PR 路径（默认不走 PR）
```

### verify-switch（worktree 验证专用）

```bash
# Phase 1: 切换到 feature 分支供用户验证
flow.sh verify-switch <issue>

# Phase 2: 合并回主分支 + verify --confirm（用户确认后 Wopal 自动执行）
flow.sh verify-switch <issue> --merge
```

### decompose-prd

```bash
flow.sh decompose-prd docs/projects/<project>/PRD.md --dry-run   # 预览
flow.sh decompose-prd docs/projects/<project>/PRD.md --project <name>  # 创建
```

### reset（破坏性）

```bash
flow.sh reset <issue>       # Issue 驱动
flow.sh reset <plan-name>   # Plan 驱动
```
仅用户明确要求时使用。

---
