---
name: git-worktrees
description: Workspace-level Git worktree management — create, list, remove, and prune isolated development environments. Use this skill whenever the user needs to create a worktree, set up an isolated workspace, work on multiple features in parallel, list existing worktrees, check what worktrees exist, remove or delete a worktree, clean up stale worktrees, or manage git working trees in any way. Triggers include "create worktree", "new worktree", "list worktrees", "show worktrees", "remove worktree", "delete worktree", "clean up worktree", "prune worktree", "isolated environment", "parallel development", "worktree for <project>", or any request involving git worktree operations.
---

# Git Worktree 管理工具

## 概述

工作空间级 Git worktree 管理工具，用于创建隔离的开发环境。基于本地主分支最新已提交状态创建，不检查脏区、不触碰未提交变更，对其他 agent 零干扰。

**核心特性**：
- 工作空间级统一管理（`.worktrees/` 目录）
- 自动识别项目主分支（`git ls-remote --symref` → `symbolic-ref` → `main`）
- 基于本地主分支最新已提交状态创建 worktree
- 创建后提示依赖安装命令，不自动执行

## 快速开始

### 基本用法

```bash
# 创建 worktree
./scripts/worktree.sh create <project> <branch>

# 列出 worktree
./scripts/worktree.sh list [--all|<project>]

# 删除 worktree
./scripts/worktree.sh remove <project> <branch>

# 清理
./scripts/worktree.sh prune <project>
```

### 创建 Worktree

```bash
# 基于主分支创建新功能分支的 worktree（默认）
./scripts/worktree.sh create ellamaka feature/optimize-workbench-ux

# 复用已有分支创建 worktree
./scripts/worktree.sh create ellamaka existing-branch --existing

# 创建后脚本会提示依赖安装命令，需手动执行
```

## 使用场景

### 1. 并行开发多个功能

```bash
./scripts/worktree.sh create ellamaka feature/auth
./scripts/worktree.sh create ellamaka feature/logging

cd .worktrees/ellamaka-feature-auth
cd .worktrees/ellamaka-feature-logging
```

### 2. 紧急修复隔离

```bash
./scripts/worktree.sh create ellamaka hotfix/security-patch

cd .worktrees/ellamaka-hotfix-security-patch
# 修复、提交...
cd ../../projects/ellamaka
git merge hotfix/security-patch
./scripts/worktree.sh remove ellamaka hotfix/security-patch
```

## 命令详解

### create

创建新的 worktree。

**语法**：
```bash
./scripts/worktree.sh create <project> <branch> [--existing]
```

**参数**：
- `<project>`: 项目名（从 `projects/` 下扫描到的 git 仓库中选择）
- `<branch>`: 分支名（分支中的 `/` 会自动转换为 `-`）
- `--existing`: 复用已有分支（默认创建新分支，分支已存在则报错）

**行为**：
- 自动识别项目的主分支名
- 默认模式：基于本地主分支最新已提交状态创建新分支的 worktree
- `--existing` 模式：使用已有分支创建 worktree，分支不存在则报错
- 不检查工作区是否脏，不触碰未提交变更
- 创建后输出依赖安装提示

**路径规则**：
```
.worktrees/<project>-<branch>
```

示例：
- 项目: `ellamaka`, 分支: `feature/optimize-workbench-ux`
- 路径: `.worktrees/ellamaka-feature-optimize-workbench-ux`

### list

列出 worktree。

**语法**：
```bash
./scripts/worktree.sh list [--all|<project>]
```

**参数**：
- 无参数或 `--all`: 列出所有项目的 worktree（详细模式）
- `<project>`: 只列出指定项目的 worktree

### remove

删除 worktree 和对应分支。

**语法**：
```bash
./scripts/worktree.sh remove <project> <branch>
```

执行非强制的 git worktree remove；删除失败时保留 worktree 和分支，不自动重试。删除成功后才删除本地分支（跳过当前分支）。

### prune

清理已删除分支的 worktree 记录。

**语法**：
```bash
./scripts/worktree.sh prune <project>
```

## 项目列表

可用项目名由脚本自动扫描 `projects/` 下包含 `.git` 的仓库目录得到。

```bash
# 查看可用项目
./scripts/worktree.sh list --all
```

## 依赖安装

脚本不自动安装依赖，也不初始化 submodule。创建 worktree 后，项目有 submodule 时由 Agent 按项目说明初始化；依赖安装提示如下：

- Node.js: 检测 `packageManager` 字段（bun/pnpm/npm），提示对应命令
- Python: 提示 `pip install -e .`
- Rust: 提示 `cargo build`
- Go: 提示 `go mod download`

## 注意事项

### 清理顺序

```bash
./scripts/worktree.sh remove <project> <branch>
```

脚本只在非强制删除成功后清理分支；失败时保留现场。

### 删除失败时

已忽略的缓存和构建产物不阻塞清理。普通删除失败后，脚本只在确认没有已跟踪修改、未忽略的未跟踪文件或子仓库本地独有工作时，才会自动强制删除干净的 submodule 工作树。发现本地待保留内容时保留 worktree 和分支；保存或发布后重新执行清理即可。

### 常见问题

**Q: 提示"无效项目名"？**
A: 项目名必须来自 `projects/` 下扫描到的 git 仓库目录。使用 `list --all` 查看可用项目。

**Q: worktree 已存在？**
A: 使用 `list` 命令查看现有 worktree，然后删除或使用不同的分支名。

**Q: 提示"本地不存在 main 分支"？**
A: 脚本需要本地有主分支 ref。执行 `git fetch origin main:main` 或 `git checkout main` 后再试。

## 完整工作流示例

```bash
# 1. 创建功能分支 worktree
./scripts/worktree.sh create ellamaka feature/new-feature

# 2. 安装依赖（按脚本提示执行）
cd .worktrees/ellamaka-feature-new-feature
bun install

# 3. 开发、提交
git add .
git commit -m "feat: add new feature"

# 4. 回到主工作区合并
cd ../../projects/ellamaka
git merge feature/new-feature --no-ff

# 5. 清理 worktree
./scripts/worktree.sh remove ellamaka feature/new-feature
```
