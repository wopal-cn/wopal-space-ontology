---
version: 1
space: {space-name}

space-component-type: [ontology-worktree, space-runtime, projects, contents, docs]

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

projects: []

contents: []

---

# {space-name} 空间结构

| path | type | level | description |
|------|------|-------|-------------|
| `.wopal` | ontology-worktree | worktree | ontology worktree — {space-name} 空间 |
| `.wopal/skills/` | ontology-worktree | moduel | 技能定义 |
| `.wopal/agents/` | ontology-worktree | moduel | Agent 灵魂 |
| `.wopal/rules/` | ontology-worktree | moduel | 行为规则 |
| `.wopal/commands/` | ontology-worktree | moduel | 自定义命令 |
| `.wopal-space/.tmp/` | space-runtime | dir | 临时缓冲 |
| `.wopal-space/INBOX/` | space-runtime | dir | 外部技能暂存 |
| `.wopal-space/backup/` | space-runtime | dir | 空间内容备份 |
| `.wopal-space/logs/` | space-runtime | dir | 空间组件运行日志 |
| `.wopal-space/memory/` | space-runtime | dir | MEMORY.md + diary/ |
| `projects/` | projects | dir | 项目仓库 |
| `contents/` | contents | dir | 内容文档 |
| `docs/` | docs | dir | 空间级文档 |
