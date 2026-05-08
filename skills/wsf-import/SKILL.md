---
name: wsf-import
description: "Ingest external plans with conflict detection against project decisions before writing anything."
argument-hint: "--from <filepath>"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
  question: true
  task: true
---


<objective>
Import external plan files into the WSF planning system with conflict detection against PROJECT.md decisions.

- **--from**: Import an external plan file, detect conflicts, write as WSF PLAN.md, validate via wsf-plan-checker.

Future: `--prd` mode for PRD extraction is planned for a follow-up PR.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/import.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/ui-brand.md
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/gate-prompts.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the import workflow end-to-end.
</process>
