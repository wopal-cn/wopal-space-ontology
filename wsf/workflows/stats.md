<purpose>
Display comprehensive project statistics including phases, plans, requirements, git metrics, and timeline.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
**Load project context from workspace root:**

```bash
INIT=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" init stats $ARGUMENTS)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `project_root`, `project_exists`.

All subsequent file operations use `$PROJECT_ROOT/.planning/` instead of relative paths.

If `project_exists` is false (no `.planning/` directory):
```
No planning structure found at $PROJECT_ROOT

Run /wsf-new-project to start a new project.
```
Exit.
</step>

<step name="gather_stats">
Gather project statistics:

```bash
STATS=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" --cwd "${project_root}" stats json)
if [[ "$STATS" == @file:* ]]; then STATS=$(cat "${STATS#@file:}"); fi
```

Extract fields from JSON: `milestone_version`, `milestone_name`, `phases`, `phases_completed`, `phases_total`, `total_plans`, `total_summaries`, `percent`, `plan_percent`, `requirements_total`, `requirements_complete`, `git_commits`, `git_first_commit_date`, `last_activity`.
</step>

<step name="present_stats">
Present to the user with this format:

```
# 📊 Project Statistics — {milestone_version} {milestone_name}

## Progress
[████████░░] X/Y phases (Z%)

## Plans
X/Y plans complete (Z%)

## Phases
| Phase | Name | Plans | Completed | Status |
|-------|------|-------|-----------|--------|
| ...   | ...  | ...   | ...       | ...    |

## Requirements
✅ X/Y requirements complete

## Git
- **Commits:** N
- **Started:** YYYY-MM-DD
- **Last activity:** YYYY-MM-DD

## Timeline
- **Project age:** N days
```

If no `.planning/` directory exists, inform the user to run `/wsf-new-project` first.
</step>

</process>

<success_criteria>
- [ ] Statistics gathered from project state
- [ ] Results formatted clearly
- [ ] Displayed to user
</success_criteria>
