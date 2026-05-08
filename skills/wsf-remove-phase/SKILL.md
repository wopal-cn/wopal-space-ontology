---
name: wsf-remove-phase
description: "Remove a future phase from roadmap and renumber subsequent phases"
argument-hint: "<phase-number> [project]"
tools:
  read: true
  write: true
  bash: true
  glob: true
---

<objective>
Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

Purpose: Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.
Output: Phase deleted, all subsequent phases renumbered, git commit as historical record.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/remove-phase.md
</execution_context>

<context>
Phase: phase number to remove (first positional argument)
Project: optional positional project name (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.

Roadmap and state are resolved in-workflow via `init remove-phase` and targeted reads.
</context>

<process>
Execute the remove-phase workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/remove-phase.md end-to-end.
Preserve all validation gates (future phase check, work check), renumbering logic, and commit.
</process>
