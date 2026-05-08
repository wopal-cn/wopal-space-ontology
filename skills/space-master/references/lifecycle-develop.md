---
title: Skill Development Lifecycle
description: Workflow for developing, optimizing, and deploying skills
---

# Skill Development Lifecycle

## Create New Skill

Use `skill-creator` for guided creation with scaffolding, validation, and optimization.

## Directory Structure

```
<skill-name>/
├── SKILL.md          # Required
├── scripts/         # If automation needed
├── references/      # Optional
└── templates/       # Optional
```

## SKILL.md Format

```yaml
---
name: skill-name
description: Description (1-1024 chars, include trigger contexts)
---
```

Optional fields: `license`, `compatibility`, `metadata`

## Naming Rules

- 1-64 chars, lowercase letters, numbers, single hyphens
- No leading/trailing `-`, no consecutive `--`
- Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Must match directory name

## Code Requirements

| Item | Requirement |
|------|-------------|
| Language | Python or Shell |
| Shebang | Python: `#!/usr/bin/env python` |
| Permission | `chmod +x` for scripts |
| Error handling | Return proper exit codes |

## Optimize Existing Skills


### Common Optimizations

| Task | Action |
|------|--------|
| Fix bugs | Edit scripts |
| Improve description | Update SKILL.md metadata |
| Add features | Extend scripts/SKILL.md |
| Enhance triggers | Update description keywords |

## Best Practices

- Keep SKILL.md <500 lines; move details to `references/`
- Progressive loading for complex skills
- Extract to `references/*.md` with frontmatter when large
- **Always verify after reinstall**: `ls .agents/skills/<name>`