---
name: wsf-map-codebase
description: "Analyze codebase with parallel mapper agents to produce .planning/codebase/ documents"
argument-hint: "[project] [--lang <code>] [optional: focus area]"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  write: true
  task: true
---


<objective>
Analyze existing codebase using parallel wsf-codebase-mapper agents to produce structured codebase documents.

Each mapper agent explores a focus area and **writes documents directly** to `.planning/codebase/`. The orchestrator only receives confirmations, keeping context usage minimal.

Output: .planning/codebase/ folder with 7 structured documents about the codebase state.
</objective>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/map-codebase.md
</execution_context>

<context>
Project:
- Optional first positional argument may be a target project name (for WopalSpace-style workspaces), e.g. `space-flow`

Language preference is determined by:
1. If `--lang <code>` is provided → use specified language (e.g., `--lang zh`)
2. If not provided → infer from context (check USER.md "沟通语言" field, user's conversation language in current session)
3. Default → English if no preference detected

Technical terms, code identifiers, file paths, and commands always remain in English regardless of output language.

Focus area:
- Remaining positional argument, if provided, tells agents to focus on a specific subsystem

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /wsf-new-project (brownfield codebases) - creates codebase map first
- After /wsf-new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use map-codebase for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (offer to refresh or skip)
2. Create .planning/codebase/ directory structure
3. Spawn 4 parallel wsf-codebase-mapper agents:
   - Agent 1: tech focus → writes STACK.md, INTEGRATIONS.md
   - Agent 2: arch focus → writes ARCHITECTURE.md, STRUCTURE.md
   - Agent 3: quality focus → writes CONVENTIONS.md, TESTING.md
   - Agent 4: concerns focus → writes CONCERNS.md
4. Wait for agents to complete, collect confirmations (NOT document contents)
5. Verify all 7 documents exist with line counts
6. Commit codebase map
7. Offer next steps (typically: /wsf-new-project or /wsf-plan-phase)
</process>

<success_criteria>
- [ ] .planning/codebase/ directory created
- [ ] All 7 codebase documents written by mapper agents
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] User knows next steps
</success_criteria>
