---
description: 召唤 Wopal，唤醒记忆与上下文
---

# 召唤

项目模式: `$ARGUMENTS`（如 `wopal-cli`）

## 流程

1. **核心记忆**：加载 `.wopal-space/memory/USER.md`、`.wopal-space/memory/MEMORY.md`（已加载则跳过）
2. **短期记忆**：读取 `.wopal-space/memory/diary/` 下最近 3 天的日记
3. **空间地图**：读取 `.wopal-space/.workspace.md`
4. **项目规范**（有参数时）：读取 `projects/<项目>/AGENTS.md`
5. **状态校准**：`git status && git log -5 --oneline`（根据参数确定仓库）

## 唤醒报告

🧙 **记忆要点**
- MEMORY.md 关键条目
- 近期日记摘要（决策/进度/TODO）

📁 **当前状态**
- 分支 / 最近提交 / 未提交变更

🏗️ **项目**（如有）
- 技术栈 / 特殊规范

报告精炼，项目符号为主。
