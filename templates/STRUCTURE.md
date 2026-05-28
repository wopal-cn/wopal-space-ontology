---
version: 1
space: {space-name}

space-component-type: [ontology-worktree, space-runtime, projects, contents, docs]

ontology-worktree: {path: .wopal, repo: ${ONTOLOGY_REPO}@space/{space-name}}

space-runtime:
  path: .wopal-space
  dirs:
    - .tmp: temporary buffer
    - INBOX: external skill staging (research)
    - backup: space content backup
    - logs: space component runtime logs
    - memory: agent memory (diary, user preferences, long-term memory backup)
  files:
    - REGULATIONS.md: space regulations
    - STRUCTURE.md: space structure source of truth (this file)

projects: []

contents: []

---

# {space-name} Space Structure

| path | type | level | description |
|------|------|-------|-------------|
| `.wopal` | ontology-worktree | worktree | ontology worktree — {space-name} space |
| `.wopal/skills/` | ontology-worktree | moduel | skill definitions |
| `.wopal/agents/` | ontology-worktree | moduel | Agent souls |
| `.wopal/rules/` | ontology-worktree | moduel | behavior rules |
| `.wopal/commands/` | ontology-worktree | moduel | custom commands |
| `.wopal-space/.tmp/` | space-runtime | dir | temporary buffer |
| `.wopal-space/INBOX/` | space-runtime | dir | external skill staging |
| `.wopal-space/backup/` | space-runtime | dir | space content backup |
| `.wopal-space/logs/` | space-runtime | dir | space component runtime logs |
| `.wopal-space/memory/` | space-runtime | dir | MEMORY.md + diary/ |
| `projects/` | projects | dir | project repositories |
| `contents/` | contents | dir | content documents |
| `docs/` | docs | dir | space-level documentation |
