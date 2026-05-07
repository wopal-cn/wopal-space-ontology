---
name: wsf-ship
description: "Create PR, run review, and prepare for merge after verification passes"
argument-hint: "[phase number or milestone] [project]"
tools:
  read: true
  bash: true
  grep: true
  glob: true
  write: true
  question: true
---

<objective>
Bridge local completion → merged PR. After /wsf-verify-work passes, ship the work: push branch, create PR with auto-generated body, optionally trigger review, and track the merge.

Closes the plan → execute → verify → ship loop.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/ship.md
</execution_context>

<context>
Phase or milestone: $ARGUMENTS (first positional argument, e.g., '4' or 'v1.0')
Project: optional second positional argument (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.
</context>

Execute the ship workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/ship.md end-to-end.
