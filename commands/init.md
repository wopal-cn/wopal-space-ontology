---
description: calibrate space runtime structure
---

# Calibrate Space Runtime Structure

Maintenance command for existing spaces: consume `wopal space scan` to obtain repo / module fact list, generate an update plan against the `STRUCTURE.md` compact schema, verify the runtime skeleton and template diffs, and write changes after user confirmation.

**Input**: `$ARGUMENTS`

**Parameter Notes**: Optional focus area or constraints; full calibration when not provided.

---

## Core Principles

- `/init` is a maintenance entry for existing spaces, not a replacement for `wopal space init`; initialization goes through the CLI.
- Call `wopal space scan` to obtain the fact list of repos / worktrees and `AGENTS.md` module rules; `/init` performs no recursive scanning of its own.
- Generate frontmatter / table diffs against the compact schema: the managed block may be rewritten by `/init`; the user block is never modified; non-pinned assets deleted by the user from the managed table must not be silently restored.
- The runtime `.wopal-space/` is checked only for the existence of fixed directories and files; do not deep-scan runtime content or write runtime into the table.
- Every write operation must be preceded by a structured report and explicit user confirmation; do not touch any file before confirmation.
- Label each finding: **missing** (does not exist), **drift** (exists but differs from declared structure), or **template-diff** (instance differs from template).

## Step 1: Collect Context

Read the following sources to build a space state snapshot:

1. `.wopal-space/STRUCTURE.md` — extract frontmatter, managed table, and user table.
2. `wopal space scan` JSON — repo / module fact list.
3. `.wopal-space/` — verify existence of fixed dirs and files; no deep scanning.
4. Space root — check whether `AGENTS.md` and `.gitignore` exist.
5. `.wopal/templates/` — reference templates for diff comparison.
6. `.wopal/templates/wopalspace-schema.yaml` — canonical layout reference.

If `STRUCTURE.md` does not exist, report and prompt to run `wopal space init` first, then stop.

**Output**: Structure declaration snapshot, scan fact list, runtime existence check results, template diff candidates.

## Step 2: Generate Calibration Plan

1. Generate frontmatter / table diffs against the compact schema and managed/user block rules.
2. Identify missing items, drift items, and undeclared scan findings.
3. For each runtime file that has a corresponding template, show a diff summary highlighting user-authored content.

**Output**: Structured diff report, with each item labeled by type (missing / drift / template-diff) and handling recommendation.

## Step 3: Report and Confirm

1. Present the full structured report.
2. Ask questions only when the available information is insufficient: ambiguous structure entries, conflicts between declarations and facts that need a decision, stale managed table entries to confirm deletion.
3. Wait for explicit user approval before proceeding to write.

**Output**: Change plan waiting for user confirmation.

## Step 4: Write After Confirmation

Execute only the user-approved changes:

1. Create missing directories / files.
2. Update `STRUCTURE.md` managed frontmatter and managed table.
3. Preserve all user-authored content; never overwrite the user block.

**Output**: Updated file paths and change summary.

## Response After Completion

Respond in the user's language with:

1. Updated file paths
2. Change summary (frontmatter / table / runtime layers)
3. Template diffs requiring manual handling
4. Undeclared scan findings with recommendations
