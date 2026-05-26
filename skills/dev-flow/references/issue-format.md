# Issue 与 Plan 命名规范

## Issue 标题格式

```text
<type>(<scope>): <description>
```

要求：
- `type` 必须合法
- `scope` 必填
- `description` 使用英文祈使句
- `description` ≤ 55 chars
- 整体标题 ≤ 72 chars

## 合法 type

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `perf` | 性能优化 |
| `refactor` | 重构 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 工具 / 构建 |
| `enhance` | 功能增强 |

## 示例

- `feat(cli): add skills remove command`
- `fix(dev-flow): handle expired tokens`
- `perf(sync): reduce issue body rewrite cost`

## Plan 名称

### Issue 模式

```text
<issue_number>-<type>-<scope>-<slug>
```

示例：

```text
110-feat-cli-add-skills-remove
```

### 无 Issue 模式

```text
<type>-<scope>-<slug>
```

示例：

```text
fix-dev-flow-handle-expired-tokens
```

## 规则

- `slug` 来自标题 description 部分
- 用 kebab-case
- 无 Issue 模式下，后续命令统一传 `plan-name`

## Plan 目录规则

- 新 Plan 必须先通过 `flow.sh plan ...` 生成或定位，禁止手写创建文件。
- Plan 目录由 dev-flow 项目名决定，不由组件名决定。
- 本空间约定：跨项目综合 Plan 使用 `--project wopal-space`，目录为 `docs/projects/wopal-space/plans/`。
