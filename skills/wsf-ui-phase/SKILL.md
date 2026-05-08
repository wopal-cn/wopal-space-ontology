---
name: wsf-ui-phase
description: "Generate UI design contract (UI-SPEC.md) for frontend phases"
argument-hint: "[phase]"
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
  task: true
  webfetch: true
  question: true
  mcp__context7__*: true
---

<objective>
Create a UI design contract (UI-SPEC.md) for a frontend phase.
Orchestrates wsf-ui-researcher and wsf-ui-checker.
Flow: Validate → Research UI → Verify UI-SPEC → Done
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/ui-phase.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
</execution_context>

<context>
Phase number: $ARGUMENTS — optional, auto-detects next unplanned phase if omitted.
</context>

<process>
Execute @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/ui-phase.md end-to-end.
Preserve all workflow gates.
</process>
