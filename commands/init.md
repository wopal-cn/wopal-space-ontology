---
description: first-run bootstrap or space structure calibration
---

# Init — Bootstrap or Calibrate Space

Two modes depending on whether the space has been bootstrapped:

- **Bootstrap mode**: `BOOTSTRAP.md` exists in the space root → first-run setup
- **Maintenance mode**: `BOOTSTRAP.md` does not exist → calibrate `STRUCTURE.md`

**Input**: `$ARGUMENTS`

**Parameter Notes**: Optional focus area for maintenance mode; ignored in bootstrap mode.

---

## Core Principles

- `/init` is a maintenance entry for existing spaces, not a replacement for `wopal space init`; initialization goes through the CLI.
- Bootstrap mode is a one-time flow: collect user profile, write `USER.md`, give a space overview, delete `BOOTSTRAP.md`.
- Maintenance mode consumes `wopal space scan` to obtain repo / module fact list, generates an update plan against the `STRUCTURE.md` compact schema, and writes changes after user confirmation.
- Every write operation must be preceded by a structured report and explicit user confirmation; do not touch any file before confirmation.

## Step 0: Detect Bootstrap

Check whether `BOOTSTRAP.md` exists in the space root.

- **Exists** → enter Bootstrap mode (Step 1a → 2a → 3a → 4a)
- **Does not exist** → enter Maintenance mode (Step 1b → 2b → 3b → 4b)

---

## Bootstrap Mode

### Step 1a: Collect User Profile

Ask the user one question at a time. Let the conversation flow naturally.

1. **Preferred name** — what should I call you?
2. **Communication language** — what language should I use?
3. **Communication style** — concise, detailed, proactive, or reserved?
4. **Work context** (optional) — what do you mainly use this space for?

### Step 2a: Write USER.md

**Execute**: Write the collected information into `.wopal-space/memory/USER.md`.

- Keep the template field structure, fill in placeholders
- No empty placeholders
- Only stable user facts — no bootstrap process logs

### Step 3a: Space Overview

Briefly tell the user:

- Daily work lives in `projects/`, `contents/`, `docs/`
- Space regulations are in `.wopal-space/REGULATIONS.md`
- Space structure is indexed in `.wopal-space/STRUCTURE.md`
- **If they ever need help, run `/help`**

### Step 4a: Finish

**Execute**: Delete `BOOTSTRAP.md` from the space root.

**Tell the user**: First-run setup is complete. They can start working now.

---

## Maintenance Mode

### Step 1b: Collect Context

Read the following sources to build a space state snapshot:

1. `.wopal-space/STRUCTURE.md` — extract frontmatter, managed table, and user table.
2. `wopal space scan` output (text or JSON). **Read the entire output**; classify by the two sections (`Repositories` and `Module-level agent rules`). If output exceeds 200 lines, use paginated reads — never truncate with bare `head -N`.
3. `.wopal-space/` — verify existence of fixed dirs and files; no deep scanning.
4. Space root — check whether `AGENTS.md` and `.gitignore` exist.
5. `.wopal/templates/` — reference templates for diff comparison.
6. `.wopal/templates/wopalspace-schema.yaml` — canonical layout reference.

If `STRUCTURE.md` does not exist, report and prompt to run `wopal space init` first, then stop.

**Output**: Structure declaration snapshot, scan fact list, runtime existence check results, template diff candidates.

### Step 2b: Generate Calibration Plan

1. **Classify scan Module-level agent rules** using the Declaration Scope table (see below). For each entry:
   - Top-level module already in managed table → check description drift
   - `projects/<X>/<sub-path>` with own AGENTS.md → must add to managed table
   - `labs/<*>/<sub-path>` internal → not added
   - Generate description per priority order

2. **Frontmatter / managed-table diffs** against the compact schema. For each asset, classify:
   - **missing** — scan fact not declared in managed table (default: add)
   - **drift** — declared but description / type / level mismatch (default: update)
   - **stale** — declared in managed table but no longer in scan (confirm removal with user)

3. **Runtime template-diffs** for files with corresponding templates: summarize user-authored content vs template baseline; never overwrite user content.

4. **Root files (`AGENTS.md`, `.gitignore`) template-diff**: compare against templates; recommend additions only.

**Output**: Structured diff report, each item labeled (missing / drift / stale / template-diff) with handling recommendation.

### Step 3b: Report and Confirm

1. Present the full structured report organized by layer: frontmatter → managed table → runtime → root files.
2. Ask questions **only** in these specific cases:
   - Asset exists in managed table but no longer in scan (**stale**) — confirm removal
   - New `labs/ref-repos/<X>` not previously declared — confirm whether to declare
   - Description cannot be auto-generated unambiguously — ask for description
   - Frontmatter `repos` field and managed table disagree — ask which is authoritative
3. Wait for explicit user approval before proceeding to write.

**Output**: Change plan waiting for user confirmation.

### Step 4b: Write After Confirmation

Execute only the user-approved changes:

1. Create missing directories / files.
2. Update `STRUCTURE.md` managed frontmatter and managed table.
3. Preserve all user-authored content; never overwrite the user block.

**Output**: Updated file paths and change summary.

---

## Declaration Scope — Who Goes Into the Managed Table

| Asset class | In managed table? | Reason |
|---|---|---|
| `.wopal/*` modules (skills, agents, rules, commands, plugins) | Yes | Ontology worktree — space core |
| `projects/<name>/` repo root | Yes | Top-level managed project |
| `projects/<name>/<sub-path>/` with own `AGENTS.md` | **Yes** | Sub-module with own rules — must be indexed |
| `contents/<name>/` | Yes | Top-level content module |
| `scripts/` | Yes | Space-level utility |
| `labs/ref-repos/<name>/` repo root | Ask user | User-decided per repo |
| `labs/ref-repos/<name>/<sub-path>/` internal | **No** | Internal structure of reference code |
| `labs/research/*`, `labs/fork/*`, `labs/tests/*` | No | Experimental / throwaway code |
| `.wopal-space/backup/`, `.wopal-space/INBOX/` | No | Transient staging |

**Description generation priority for new entries**:

1. `AGENTS.md` frontmatter `description` field (preferred)
2. `package.json` `description` (for npm packages without AGENTS.md)
3. AGENTS.md body first non-empty paragraph (when no frontmatter)
4. Directory name + nearest parent's description as fallback

## Response After Completion

Respond in the user's language with:

1. Updated file paths
2. Change summary (bootstrap or maintenance)
3. Template diffs requiring manual handling (maintenance mode only)
4. Undeclared scan findings with recommendations (maintenance mode only)
