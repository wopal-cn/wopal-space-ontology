---
name: wsf-remove-workspace
description: "Remove a WSF workspace and clean up worktrees"
argument-hint: "<workspace-name>"
tools:
  bash: true
  read: true
  question: true
---

<context>
**Arguments:**
- `<workspace-name>` (required) — Name of the workspace to remove
</context>

<objective>
Remove a workspace directory after confirmation. For worktree strategy, runs `git worktree remove` for each member repo first. Refuses if any repo has uncommitted changes.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/remove-workspace.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
</execution_context>

<process>
Execute the remove-workspace workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/remove-workspace.md end-to-end.
</process>
