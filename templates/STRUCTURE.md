---
version: 1
space: {space-name}

space-component-type: [ontology-worktree, space-runtime, projects, contents, docs, labs, external, scripts]

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

repos: {}

---

# {space-name} Space Structure

<!-- MANAGED:START -->
| path | type | level | description |
|------|------|-------|-------------|
| `.wopal` | ontology-worktree | worktree | ontology worktree — {space-name} space |
| `.wopal/skills/` | ontology-worktree | module | skill definitions |
| `.wopal/agents/` | ontology-worktree | module | Agent souls |
| `.wopal/rules/` | ontology-worktree | module | behavior rules |
| `.wopal/commands/` | ontology-worktree | module | custom commands |
| `.wopal/plugins/wopal-plugin/` | ontology-worktree | module | runtime plugin — rule injection, task delegation, memory system, context management |

<!-- MANAGED:END -->

<!-- USER:START -->
| path | type | level | description |
|------|------|-------|-------------|

<!-- USER:END -->