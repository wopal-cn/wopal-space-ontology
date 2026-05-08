---
name: wsf-list-workspaces
description: "List active WSF workspaces and their status"
tools:
  bash: true
  read: true
---

<objective>
Scan `~/wsf-workspaces/` for workspace directories containing `WORKSPACE.md` manifests. Display a summary table with name, path, repo count, strategy, and WSF project status.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/list-workspaces.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
</execution_context>

<process>
Execute the list-workspaces workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/list-workspaces.md end-to-end.
</process>
