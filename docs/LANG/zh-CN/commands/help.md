---
description: 查看空间使用指南
---

# Help — 空间使用指南

向用户解释这个空间怎么用。读取参考文档和当前空间运行态信息，用用户的语言合成一份实用的解答。

**输入**: `$ARGUMENTS`

**参数说明**: 可选的专题筛选。不传时输出完整总览。合法专题：`space`、`commands`、`skills`、`rules`、`workflow`。

---

## 核心原则

- 不要直接 dump 参考文件的内容。理解结构后，用自己的话解释
- 传入专题筛选时，只提取并呈现相关章节
- 读完参考文件后，必须检查当前空间运行态文件以提供本地上下文
- 输出必须实用：告诉用户东西在哪、怎么用、什么时候用。不要讲架构原理

## Step 1: 读通用参考

读 `docs/references/help/common.md`。这是所有空间通用的基线。

## Step 2: 读类型专属参考（如果存在）

如果当前 worktree 中存在 `docs/references/help/*-space.md` 文件，读它。这是类型专属的增量说明。

## Step 3: 读当前空间运行态

读以下文件以获取当前空间的本地上下文：

- `.wopal-space/STRUCTURE.md` — 当前空间的结构索引
- `.wopal-space/REGULATIONS.md` — 当前空间守则
- `AGENTS.md` — 用户个性化规则入口

## Step 4: 合成并输出

| 输入 | 输出 |
|------|------|
| `/help`（无专题） | 完整总览：协作方式 + 关键文件 + 命令 + 技能 + 守则 |
| `/help space` | 空间概览 + 当前结构和类型 |
| `/help commands` | 命令清单 + 使用场景 |
| `/help skills` | 技能清单 + 触发条件 |
| `/help rules` | 守则在哪、怎么自定义 |
| `/help workflow` | 工作流程（类型相关） |

用用户的沟通语言输出。保持简洁实用。
