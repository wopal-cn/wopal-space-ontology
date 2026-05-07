---
name: wsf-stats
description: "Display project statistics — phases, plans, requirements, git metrics, and timeline"
argument-hint: "[project]"
tools:
  read: true
  bash: true
---

<objective>
Display comprehensive project statistics including phase progress, plan execution metrics, requirements completion, git history stats, and project timeline.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/stats.md
</execution_context>

<context>
Project: optional positional project name (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.
</context>

<process>
Execute the stats workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/stats.md end-to-end.
</process>
