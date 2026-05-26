---
description: Commit uncommitted changes
---

# Commit Changes

Create Conventional Commits-compliant commits for uncommitted changes.

**Input**: `$ARGUMENTS` (target repo, optional)

---

## Core Principles

- **Intent-first grouping** — group by change intent / functional unit, not file type
- **Context-driven** — leverage session context; message describes "why"
- **Precise targeting** — with argument: process only specified repo; without: infer from work context
- **One-shot confirmation** — present plan in batch, execute after confirmation

---

## Step 1: Identify Target Repo

### With Argument

Fuzzy-match project name / path / alias to locate a single repo.

### Without Argument

**Default full scan**: check workspace + all project repos simultaneously.

```bash
# Check workspace
git status --short

# Check all independent Git repos under projects/ (covers submodules and standalone repos)
for dir in projects/*/; do
  if [ -d "$dir.git" ] || [ -f "$dir.git" ]; then
    _git_status=$(cd "$dir" && git status --short)
    if [ -n "$_git_status" ]; then
      echo "=== ${dir%/} ==="
      echo "$_git_status"
    fi
  fi
done
```

> ⚠️ **Critical**: must iterate `projects/*/` and check `.git` — do not rely solely on `git submodule status` (only detects submodules, misses standalone repos).

**Output format**: list all repos with changes, grouped by repo.

---

## Step 2: Analyze Change Intent

**For each repo with changes**:

```bash
git status --short
git diff --stat
```

**Core tasks**:
1. List all changed files (grouped by repo)
2. **Read diff content** to understand each change's purpose
3. Group by "repo × change intent"
4. Determine type and message for each group

### Grouping Example

```
📦 Workspace:
  - MEMORY.md
  - docs/projects/plans/xxx.md

📦 projects/ontology:
  - agents/wopal/commands/summon.md
  - commands/commit.md

Groups:
  [workspace] group1 (docs): update knowledge → MEMORY.md
  [workspace] group2 (chore): archive plan → plans/xxx.md
  [ontology] group1 (feat): optimize command prompts → summon.md + commit.md
```

### Type Classification

| Type | Criteria |
|------|----------|
| `feat` | New feature / capability |
| `fix` | Bug fix / error correction |
| `refactor` | Code restructuring, no behavior change |
| `docs` | Documentation only |
| `test` | Tests only |
| `chore` | Build / config / dependencies |
| `enhance` | Feature enhancement / improvement |
| `style` | Code formatting (no logic change) |
| `perf` | Performance optimization |
| `ci` | CI/CD config change |
| `build` | Build system change |
| `revert` | Rollback previous commit |

---

## Step 3: Generate Commit Plan

```
📋 Commit Plan (N repos, M commits)

📦 Workspace (main)
1. feat: add login token auto-refresh
   - src/auth/login.ts
   - src/auth/token.ts

2. docs: update knowledge base
   - MEMORY.md

📦 projects/ontology (main)
1. fix: fix commit command project scan gap
   - commands/commit.md

...
```

**Message conventions**: follow Git workflow rules.

⚠️ Wait for user confirmation (yes/no)

---

## Step 4: Execute Commits

**Execute by repo order** (projects first, then workspace):

```bash
# 1. Enter project repo and commit
cd projects/ontology
git add <files-group-1>
git commit -m "fix: fix commit command project scan gap"

# 2. Return to workspace and commit
cd ../..
git add <files-group-1>
git commit -m "docs: update knowledge base"
```

**Commit order**:
1. Project commits (projects/*)
2. Workspace commit