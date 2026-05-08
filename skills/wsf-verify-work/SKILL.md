---
name: wsf-verify-work
description: "Validate built features through conversational UAT"
argument-hint: "[phase number] [project]"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  edit: true
  write: true
  task: true
---

<objective>
Validate built features through conversational testing with persistent state.

Purpose: Confirm what the agent built actually works from user's perspective. One test at a time, plain text responses, no interrogation. When issues are found, automatically diagnose, plan fixes, and prepare for execution.

Output: {phase_num}-UAT.md tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for /wsf-execute-phase
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/verify-work.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/templates/UAT.md
</execution_context>

<context>
Phase: first positional argument (optional)
Project: optional second positional argument, e.g. `space-flow`
- If provided: Test specific phase (e.g., "4")
- If not provided: Check for active sessions or prompt for phase

Context files are resolved inside the workflow (`init verify-work`) and delegated via `<files_to_read>` blocks.
</context>

<process>
Execute the verify-work workflow from @/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/verify-work.md end-to-end.
Preserve all workflow gates (session management, test presentation, diagnosis, fix planning, routing).
</process>
