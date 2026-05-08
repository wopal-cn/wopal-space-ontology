---
name: wsf-undo
description: "Safe git revert. Roll back phase or plan commits using the phase manifest with dependency checks."
argument-hint: "[project] --last N | --phase NN | --plan NN-MM"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  question: true
---


<objective>
Safe git revert — roll back WSF phase or plan commits using the phase manifest, with dependency checks and a confirmation gate before execution.

Three modes:
- **--last N**: Show recent WSF commits for interactive selection
- **--phase NN**: Revert all commits for a phase (manifest + git log fallback)
- **--plan NN-MM**: Revert all commits for a specific plan
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/undo.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/gate-prompts.md
</execution_context>

<context>
Project: optional first positional argument (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.
Undo mode: --last N | --phase NN | --plan NN-MM
</context>

<process>
Execute the undo workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/undo.md end-to-end.
</process>
