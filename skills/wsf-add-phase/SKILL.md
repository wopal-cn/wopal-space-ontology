---
name: wsf-add-phase
description: "Add phase to end of current milestone in roadmap"
argument-hint: "<description> [project]"
tools:
  read: true
  write: true
  bash: true
---


<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

Routes to the add-phase workflow which handles:
- Phase number calculation (next sequential integer)
- Directory creation with slug generation
- Roadmap structure updates
- STATE.md roadmap evolution tracking
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/add-phase.md
</execution_context>

<context>
Description: phase description text (first positional argument)
Project: optional positional project name (e.g., `space-flow`). If specified, resolve to `$PROJECT_ROOT=projects/<project>/` via `wsf-tools init`.

Roadmap and state are resolved in-workflow via `init add-phase` and targeted tool calls.
</context>

<process>
**Follow the add-phase workflow** from `@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/add-phase.md`.

The workflow handles all logic including:
1. Argument parsing and validation
2. Roadmap existence checking
3. Current milestone identification
4. Next phase number calculation (ignoring decimals)
5. Slug generation from description
6. Phase directory creation
7. Roadmap entry insertion
8. STATE.md updates
</process>
