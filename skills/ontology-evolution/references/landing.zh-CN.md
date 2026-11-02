# 提案落地参考

仅在一个进化提案已经得到用户批准、准备进入或正在执行落地时读取本文件。主 Skill 决定“是否该落地”；本文件说明“如何安全落地”。具体命令参数和 CLI 拒绝语义见 [`commands.md`](commands.md)。

## 状态机

```text
draft → accepted → implementing → validating → archived
```

| 阶段 | 含义 |
|------|------|
| `draft` | 提案已落盘，等待用户阅读 |
| `accepted` | 用户已批准；模式与隔离信息已记录 |
| `implementing` | 任务实施、逐 task 提交和强制实施评审 |
| `validating` | 用户观察 / 验证；必要返工继续落在工作分支 |
| `archived` | 用户确认完成，提案归档 |

状态一次只前进一条边；没有回退边。返工用新提交表达，不回退阶段。评审不占阶段，它是 `implementing` 内的门禁。

## 谁负责什么

| 动作 | 执行者 | 条件 |
|------|--------|------|
| `accept` / `advance` / `commit` / `integrate` / `archive` | Wopal | 按状态机与用户门禁执行 |
| 实施能力资产 | Fae | 在 Wopal 指定的工作区和文件范围内 |
| 回填提案 Done 记录 | Wopal | 每个 task 验证后、提交前 |
| 实施评审 | Rook | 所有 task 完成并通过 Wopal 验证后、用户验证前 |
| 验证与集成放行 | 用户 | 评审通过后 |

实施评审不可跳过，最多 2 轮；首轮必须一次列全发现，不能靠逐轮挤牙膏延长预算。

## 记录与提交

提案的 `Done` 是实施台账：task 完成状态、产出和实际触碰文件。

- **唯一作者是 Wopal。** Fae 不编辑提案。
- **先验证，后回填，再提交。** 记录与该 task 的资产变更进入同一个提交。
- **每个完成的 task 恰好一次提交。** 实施 Agent 不自行提交。
- isolated 模式只写工作分支上的提案副本；不要同时在空间分支维护第二份记录。
- 并行 task 必须显式使用 `--paths` 限定本 task 文件加提案文件；新文件也必须显式列出。
- 不处理、重置、stash 或清理其他 task 的工作。遇到冲突或不明改动就停止并上报。

## 隔离模式与 Quick 模式

### 默认：isolated

`accept` 默认从 `.wopal` 派生隔离 worktree。实施、逐 task 提交与评审都发生在工作分支上；空间分支在用户验证通过并放行集成前保持不变。

关键约束：

- 隔离 worktree 必须保持与空间装配范围一致或更宽。
- 新能力进入提交前先扩展可见范围；不能用裸 `git add --sparse` 代替装配扩展。
- 空间分支只通过 `wopal space evo integrate <name> --confirm` 接收隔离成果。
- load-path 变更的真实验证是重启运行环境并观察，不以单纯测试通过替代。

### Quick 模式

用户明确将小范围变更限定为 quick 时，`accept <name> --no-worktree` 不创建隔离 worktree；逐 task 提交直接落空间分支。

Quick 只改变工作位置：记录、逐 task 提交、强制评审、用户验证和归档门禁不变。因为变更已在空间分支，所以没有 `switch` 和 `integrate`。

## 验证方式

评审通过并进入 `validating` 后，先让用户选择验证方式。

### 首选：branch switch

```bash
wopal space evo switch <name>   # 进入验证视图
# 重启运行环境并观察
wopal space evo switch <name>   # 返回空间分支
```

优点：用户可以直接观察 feature branch，而不必提前集成。观察期间发现的问题继续在工作分支提交，再重复验证。

### 备选：integrate-first

只有用户明确选择时，才在进入 `validating` 后提前运行：

```bash
wopal space evo integrate <name> --confirm
```

之后用户直接在空间分支验证当前 delivery candidate。若验证发现问题，返工仍提交到 working branch，再次运行 `integrate --confirm` 刷新同一个 candidate；不会在空间分支累积第二条交付提交。

## 集成门禁

`integrate --confirm` 代表用户明确放行。没有用户确认，不得集成；`--confirm` 本身不推进阶段。

branch-switch 路径：用户验证通过 → 退出验证视图 → 用户明确确认 → `integrate --confirm`。

integrate-first 路径：用户先明确选择提前集成 → `integrate --confirm` → 用户验证；若有返工，返工仍落 working branch，并重跑 `integrate --confirm` 刷新同一个 candidate 后再验证。

## 完整时序

1. 用户批准提案。
2. Wopal `accept`。
3. Wopal `advance --to implementing`。
4. Fae 实施 task。
5. Wopal 对每个 task：验证 → 回填 Done → `commit`。
6. Rook 做实施评审；最多 2 轮，首轮一次列全发现；必要时返工并复审。
7. Wopal `advance --to validating`。
8. Wopal 让用户选择 branch switch（推荐）或 integrate-first。
9. 用户重启 / 观察并反馈；必要时继续返工、刷新 candidate、重新验证。
10. 用户确认通过。
11. branch-switch 路径才执行 `integrate --confirm`。
12. 一旦用户验证已通过，成功的 `integrate` 不是停点；Wopal 立即 `advance --to archived`，然后 `archive`。
13. `space sync`、上游 PR、合并和删除由用户分别决定。

## Instant：直接能力维护

如果是缺陷修复，或 owner 清晰、范围受控、无需独立验证边界的小范围能力维护，不需要提案：

```bash
wopal space evo commit -m "<message>" --paths <path>...
```

Instant 直接提交到空间分支，不创建提案、不移动阶段，但仍执行同样的稀疏范围与按名暂存安全检查。

新增一个完整 Skill / Rule / Command 本身不要求 Proposal。只有变化需要独立设计或验证边界，例如跨能力契约、装配模型、加载生命周期、高风险迁移或多阶段验证时，才进入正式进化流程。

## 何时读命令参考

以下情况读取 [`commands.md`](commands.md)，不要靠本文件猜 CLI 细节：

- 需要某个 `wopal space evo` 命令的完整参数或 stage guard。
- 命令拒绝，需要理解错误前置条件。
- 涉及 sparse range、visibility / corpus assertion、Assembly Intent。
- 需要确认 instant、isolated、quick 三种模式的具体提交行为。
