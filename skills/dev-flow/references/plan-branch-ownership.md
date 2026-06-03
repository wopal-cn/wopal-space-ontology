# Plan 分支归属详细说明

Plan 在不同阶段归属于不同分支。

## 阶段归属

| 阶段 | 归属分支 | Plan 状态 | 说明 |
|------|---------|----------|------|
| `planning` | 集成分支（main 或 space/main） | `planning` | Plan 基线在集成分支上提交 |
| `approve --confirm` | 集成分支 → 创建 feature 分支 | `executing` | 先在集成分支提交 executing + Worktree 元数据，再创建 worktree |
| 实施（executing） | feature 分支 | `executing` | 实施在 feature 分支的 worktree 中进行 |
| `complete` | feature 分支 | `verifying` | Plan-only 提交活动 Plan（脏实施树报错退出） |
| 用户验证 | feature 分支 | `verifying` | 用户在 feature 分支上验证实施结果 |
| `verify --confirm` | 集成分支 | `done` | Plan-only 提交到集成分支 |
| `archive` | 集成分支 | 归档 | 移至 done/，清理 worktree |

## Plan-only commit 原则

生命周期脚本只提交 Plan 状态变更，不提交实施代码。代码提交由实施 agent（fae）负责。脚本在遇到脏实施树时报错退出，而非代为提交代码。

## ontology-worktree 特殊行为

| 阶段 | 特殊行为 |
|------|---------|
| Issue 创建 | 自动注入 Project Type 和 Project Path |
| Plan 编制 | metadata 必填 Project Path 和 Project Type |
| approve | 从 ontology 主仓库创建 feature 分支，在 .worktrees/ 创建 worktree |
| archive | 检测 .wopal/ 变更，提交到 space/main，跳过 worktree 合并/清理逻辑 |

## standard 项目验证流程

standard 项目的 verify-switch 不执行 git 操作，仅打印指引：

1. 用户直接在 worktree 目录验证
2. Wopal 在项目仓库合并 feature → main
3. 执行 verify --confirm
4. 执行 archive
