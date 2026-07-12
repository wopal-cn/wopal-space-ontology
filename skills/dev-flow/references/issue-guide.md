# Issue 编写指南

Issue 创建、编写、同步的详细指导。核心规则见 SKILL.md。

## Issue 创建

**必须使用 `flow.sh issue create`**，禁止直接调 `gh issue create`。脚本通过 `detect_space_repo` 自动检测空间仓库，无需手动指定 `--repo`。

```bash
flow.sh issue create --title "feat(scope): description" --project <name>
```

**创建错误的 Issue 必须彻底删除**（`gh issue delete`），不能只是 close。用户不喜欢仓库里留垃圾记录。

## Issue 标题格式

```text
<type>(<scope>): <description>
```

要求：
- `type` 必须合法（见下表）
- `scope` 必填
- `description` 使用英文祈使句
- `description` ≤ 55 chars
- 整体标题 ≤ 72 chars

### 合法 type

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

### 示例

- `feat(cli): add skills remove command`
- `fix(dev-flow): handle expired tokens`
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

**映射关系**：
- Plan `Goal` → Issue `## Goal`
- Plan `In Scope` / `Out of Scope` → Issue `## Scope`
- Plan `Acceptance Criteria` → Issue `## Acceptance Criteria`
- Plan `Related Resources` → Issue `## Related Resources`

**不需要同步的章节**：`Implementation`、`Technical Context`、`Delegation Strategy` 等仅存在于 Plan 的章节。

**同步命令**：
```bash
flow.sh sync <issue> --body-only
```

## Issue 驱动 vs 无 Issue 流程

| 模式 | 触发词 | 流程 |
|------|--------|------|
| Issue 驱动 | Issue 号、"处理 issue"、"开发" | 先创建 Issue → 再出 Plan |
| 无 Issue（Plan 驱动） | "出方案"、"写 Plan" | 直接 `flow.sh plan --title ... --project ... --type ...` |

两者都是 dev-flow 流程，区别在于是否有 Issue 载体。

## Plan 命名规范

### Issue 模式

```text
<issue_number>-<type>-<scope>-<slug>
```

示例：`110-feat-cli-add-skills-remove`

### 无 Issue 模式

```text
<type>-<scope>-<slug>
```

示例：`fix-dev-flow-handle-expired-tokens`

规则：
- `slug` 来自标题 description 部分
- 用 kebab-case
- 无 Issue 模式下，后续命令统一传 `plan-name`

## Plan 目录规则

- 新 Plan 必须先通过 `flow.sh plan ...` 生成或定位，禁止手写创建文件
- `--project` 是必填参数，Plan 目录由其决定
- 所有项目统一存放在 `.wopal-space/plans/<项目名>/`
