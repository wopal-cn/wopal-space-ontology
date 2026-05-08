---
name: wsf-insert-phase
description: "Insert urgent work as decimal phase (e.g., 72.1) between existing phases"
argument-hint: "<after> <description> [project]"
tools:
  read: true
  write: true
  bash: true
---


<objective>
Insert a decimal phase for urgent work discovered mid-milestone that must be completed between existing integer phases.

Uses decimal numbering (72.1, 72.2, etc.) to preserve the logical sequence of planned phases while accommodating urgent insertions.

Purpose: Handle urgent work discovered during execution without renumbering entire roadmap.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/insert-phase.md
</execution_context>

<context>
After: phase number to insert after (first positional argument)
Description: phase description text (second positional argument)
Project: optional positional project name (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.

Roadmap and state are resolved in-workflow via `init insert-phase` and targeted tool calls.
</context>

<process>
Execute the insert-phase workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/insert-phase.md end-to-end.
Preserve all validation gates (argument parsing, phase verification, decimal calculation, roadmap updates).
</process>
