<purpose>
Research how to implement a phase. Spawns wsf-phase-researcher with phase context.

Standalone research command. For most workflows, use `/wsf-plan-phase` which integrates research automatically.
</purpose>

<available_agent_types>
Valid WSF subagent types (use exact names — do not fall back to 'general-purpose'):
- wsf-phase-researcher — Researches technical approaches for a phase
</available_agent_types>

<process>

## Step 0: Initialize Context

```bash
INIT=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `phase_dir`, `padded_phase`, `phase_number`, `state_path`, `requirements_path`, `context_path`, `project_root`.

**Project root context:**
If `project_root` is set in init output, all file operations are scoped to `$PROJECT_ROOT`. If not set, defaults to current working directory.

## Step 1: Resolve Model Profile

@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/model-profile-resolution.md

Resolve model for:
- `wsf-phase-researcher`

## Step 1: Normalize and Validate Phase

@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/references/phase-argument-parsing.md

```bash
PHASE_INFO=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" --cwd "${project_root}" roadmap get-phase "${PHASE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/RESEARCH.md 2>/dev/null || true
```

If exists: Offer update/view/skip options.

## Step 3: Gather Phase Context

```bash
# Phase context already loaded in Step 0
AGENT_SKILLS_RESEARCHER=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" --cwd "${project_root}" agent-skills wsf-researcher 2>/dev/null)
```

## Step 4: Spawn Researcher

```
Task(
  prompt="<objective>
Research implementation approach for Phase {phase}: {name}
</objective>

<files_to_read>
- {context_path} (USER DECISIONS from /wsf-discuss-phase)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

${AGENT_SKILLS_RESEARCHER}

<additional_context>
Phase description: {description}
</additional_context>

<output>
Write to: .planning/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>",
  subagent_type="wsf-phase-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — Display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>
