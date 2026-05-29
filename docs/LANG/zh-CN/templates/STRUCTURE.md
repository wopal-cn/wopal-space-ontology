---
version: 1
space: {space-name}

space-component-type: [ontology-worktree, space-runtime, projects, contents, docs, labs, external, scripts]

ontology-worktree: {path: .wopal, repo: ${ONTOLOGY_REPO}@space/{space-name}}

space-runtime:
  path: .wopal-space
  dirs:
    - .tmp: 临时缓冲
    - INBOX: 外部技能暂存（研究）
    - backup: 空间内容备份
    - logs: 空间组件运行日志
    - memory: agent 记忆（日记、用户偏好、长期记忆备份）
  files:
    - REGULATIONS.md: 空间守则
    - STRUCTURE.md: 空间结构真相源（本文件）

repos: {}

---

# {space-name} 空间结构

<!-- MANAGED:START -->
| path | type | level | description |
|------|------|-------|-------------|
| `.wopal` | ontology-worktree | worktree | ontology worktree — {space-name} 空间 |
| `.wopal/skills/` | ontology-worktree | module | 技能定义 |
| `.wopal/agents/` | ontology-worktree | module | Agent 灵魂 |
| `.wopal/rules/` | ontology-worktree | module | 行为规则 |
| `.wopal/commands/` | ontology-worktree | module | 自定义命令 |
| `.wopal/plugins/wopal-plugin/` | ontology-worktree | module | 运行时插件 — 规则注入、任务委派、记忆系统、上下文管理 |

<!-- MANAGED:END -->

<!-- USER:START -->
| path | type | level | description |
|------|------|-------|-------------|

<!-- USER:END -->
