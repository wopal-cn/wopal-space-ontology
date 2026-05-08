---
name: wsf-new-project
description: "Initialize a new project with deep context gathering and PROJECT.md"
argument-hint: "[project] [--auto]"
tools:
  read: true
  bash: true
  write: true
  task: true
  question: true
---

<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `question`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API.
</runtime_note>

<context>
**Project:**
- Optional first positional argument may be a target project name (for WopalSpace-style workspaces), e.g. `space-flow`

**Flags:**
- `--auto` — Automatic mode. After config questions, runs research → requirements → roadmap without further interaction. Expects idea document via @ reference.
</context>

<objective>
Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

**Creates:**
- `.planning/PROJECT.md` — project context
- `.planning/config.json` — workflow preferences
- `.planning/research/` — domain research (optional)
- `.planning/REQUIREMENTS.md` — scoped requirements
- `.planning/ROADMAP.md` — phase structure
- `.planning/STATE.md` — project memory

**After this command:** Run `/wsf-plan-phase 1` to start execution.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/new-project.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/questioning.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/templates/project.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/templates/requirements.md
</execution_context>

<process>
Execute the new-project workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/new-project.md end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>
