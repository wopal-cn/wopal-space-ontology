---
description: maintain ontology instance and collaboration
---

# Maintain Ontology Instance

Maintenance command for ontology instance: consume `wopal ontology status` and `wopal ontology list` to assess current state, generate a maintenance plan (update/apply/contribute), discuss with user, and execute confirmed actions.

**Input**: `$ARGUMENTS`

**Parameter Notes**: Optional focus area (e.g., "update", "contribute", "promote"); full assessment when not provided.

---

## Core Principles

- `/ontology-maintain` is a decision-support command, not an auto-executor. Every action must be confirmed by the user before execution.
- CLI commands (`wopal ontology *`) provide deterministic git operations; `/ontology-maintain` interprets status output and builds the right CLI invocations.
- Follow decision priorities from `.wopal/docs/DESIGN.md` §6.9.2: clean worktree → push → update → contribute.
- Capability promotion follows the capability-layers model: space incubation → type branch → upstream contribution. Never skip the type layer when promoting to main.

---

## Step 1: Collect Context

Execute and read in full:

1. `wopal ontology status` — current instance state, ahead/behind, worktree status
2. `wopal ontology list` — global type distribution and all space instances
3. `git status` in the worktree (if `ontology status` shows dirty)

Extract from status output:
- `Mode`: fork or clone
- `Instance.Branch`: current space branch
- `Instance.Type`: current type variant and git ref
- `Instance.Status`: clean or dirty (N files)
- `Ahead/Behind.Upstream`: ahead/behind vs upstream
- `Ahead/Behind.Fork`: ahead/behind vs fork baseline (fork mode only)
- `Ahead/Behind.Remote`: ahead/behind vs remote tracking

---

## Step 2: Analyze & Propose

Apply the Decision Framework in priority order:

| Priority | Condition | Action | CLI Command |
|----------|-----------|--------|-------------|
| 1 | Worktree dirty | Remind user to commit | `git add -A && git commit -m "..."` |
| 2 | Remote ahead > 0 | Remind user to push | `git push` |
| 3 | Upstream behind > 0 | Pull upstream updates | `wopal ontology update` |
| 4 | Fork behind > 0 | Sync fork baseline first | Manual: checkout main in repo, pull upstream, push origin; then `wopal ontology update` |
| 5 | Upstream ahead > 0 (small) | Normal — continue working | None needed |
| 6 | Upstream ahead significant | Discuss contribution | `wopal ontology contribute` |

Additional analysis:
- If instance type is `common` but user needs specialized capabilities → suggest `wopal space init --type <type>` for a new space
- If a type branch has diverged significantly → suggest `wopal ontology apply` to propagate changes

---

## Step 3: Report & Confirm

Present a structured report:

```markdown
## Ontology Maintenance Plan

### Current Status
- Mode: fork, branch space/sampx/ws
- Type: common (main)
- Worktree: clean

### Ahead / Behind
| Relation | Baseline | Ahead | Behind |
|---|---|---|
| Upstream | upstream/main | 55 | 9 |
| Fork | origin/main | 55 | 0 |
| Remote | origin/space/sampx/ws | 0 | 0 |

### Recommended Actions
1. **Update from upstream** — upstream is 9 commits ahead. Run `wopal ontology update`.
2. **Consider contribution** — 55 commits ahead of upstream. Review for general-purpose capabilities to contribute.
```

Ask questions only when:
- Multiple actions are valid and priority is unclear (e.g., both update and contribute are relevant)
- The user hasn't specified a focus area and the analysis suggests multiple directions
- Cherry-pick selection for contribute requires user judgment

Wait for explicit user confirmation before executing.

---

## Step 4: Execute

Execute only the user-confirmed actions:

1. Run the exact CLI command from the Decision Framework
2. Capture and interpret the output
3. If merge conflict → follow the conflict resolution guide in `upstream-sync.md` §4
4. If contribute → report PR URL and next steps
5. After any action that modifies agent/skill/rule files, remind user: "Restart ellamaka to load updated capabilities"

---

## Response After Completion

Respond in the user's language with:

1. Actions taken and their results
2. Updated status (re-run `wopal ontology status` if needed)
3. Remaining recommendations (if any were deferred)
4. PR URL (if contribution was made)
