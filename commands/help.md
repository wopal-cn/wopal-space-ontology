---
description: show how to use this space
---

# Help — Space Usage Guide

Explain how this space works to the user. Read reference documents and current space runtime state, then synthesize a practical answer in the user's language.

**Input**: `$ARGUMENTS`

**Parameter Notes**: Optional topic filter. When omitted, output a full overview. Valid topics: `space`, `commands`, `skills`, `rules`, `workflow`.

---

## Core Principles

- Do not dump reference content raw. Understand the structure, then explain in your own words.
- When a topic filter is given, extract only the relevant sections.
- After reading references, always check current space runtime files for localized context.
- Output must be practical: tell the user where things are, how to use them, and when.
- Do not explain architecture principles.

## Step 1: Read Common Reference

Read `docs/references/help/common.md`. This is the baseline guide for all spaces.

## Step 2: Read Type-Specific Reference (If Available)

If a file matching `docs/references/help/*-space.md` exists in the current worktree, read it. This contains type-specific delta. Currently known: `coding-space.md`.

## Step 3: Read Current Space Runtime State

Read the following files for localized context:

- `.wopal-space/STRUCTURE.md` — current space structure
- `.wopal-space/REGULATIONS.md` — current space regulations
- `AGENTS.md` — user custom rules entry

## Step 4: Synthesize and Output

| Input | Output |
|-------|--------|
| `/help` (no topic) | Full overview: how to work + key files + commands + skills + rules |
| `/help space` | Space overview with current structure and type |
| `/help commands` | Command list with usage scenarios |
| `/help skills` | Skill list with trigger conditions |
| `/help rules` | Where rules live and how to customize |
| `/help workflow` | Workflow guidance (type-dependent) |

Use the user's communication language. Keep output concise and actionable.
