# 命令速查

## `flow.sh issue create`

创建规范化 Issue。

```bash
flow.sh issue create --title "<type>(<scope>): <description>" --project <name> [options]
```

**必填参数**：
- `--goal "<一句话目标>"` — 必填
- title 的 `<description>` 必须是英文祈使句（≤50 chars）

**常用参数**：`--background`、`--scope`、`--out-of-scope`、`--reference`

类型专属参数按需使用：perf（`--baseline`/`--target`）、refactor（`--affected-components`/`--refactor-strategy`）、docs（`--target-documents`/`--audience`）、test（`--test-scope`/`--test-strategy`）、fix（`--confirmed-bugs`/`--cleanup-scope`/`--key-findings`）

## `flow.sh issue update`

```bash
flow.sh issue update <issue> [options]
```

适合补充 Goal、Background、Scope、Acceptance Criteria 及各类型特定字段。

## `flow.sh sync`

手动把 Plan 同步回 Issue，不推进状态。

```bash
flow.sh sync <issue>
flow.sh sync <issue> --body-only
flow.sh sync <issue> --labels-only
```

## `flow.sh status`

```bash
flow.sh status <issue-or-plan-name>
```

显示：Issue 标题 / 状态 / labels、对应 Plan、Plan 状态、worktree 信息。

## `flow.sh list`

```bash
flow.sh list
```

扫描 GitHub Issues 和本地 Plan 文件，合并展示。无 Issue 关联的 Plan 显示为 `[status] <plan-name> (no issue)`。

## `flow.sh decompose-prd`

```bash
flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]
```

建议先：`flow.sh decompose-prd <prd-path> --dry-run`

## `flow.sh reset`

```bash
flow.sh reset <issue>
flow.sh reset <plan-name>
```

破坏性操作，只在用户明确要求时执行。
