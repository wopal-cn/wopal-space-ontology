---
name: wsf-fast
description: "Execute a trivial task inline — no subagents, no planning overhead"
argument-hint: "[task description]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  grep: true
  glob: true
---


<objective>
Execute a trivial task directly in the current context without spawning subagents
or generating PLAN.md files. For tasks too small to justify planning overhead:
typo fixes, config changes, small refactors, forgotten commits, simple additions.

This is NOT a replacement for /wsf-quick — use /wsf-quick for anything that
needs research, multi-step planning, or verification. /wsf-fast is for tasks
you could describe in one sentence and execute in under 2 minutes.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/fast.md
</execution_context>

<process>
Execute the fast workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/fast.md end-to-end.
</process>
