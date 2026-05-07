# Subagent Tool Adapter — Task vs wopal_task Parameter Mapping

> **Purpose**: Define parameter correspondence between WSF Task tool and wopal_task, and differences in completion detection.
> **Usage**: Guide workflows to correctly call and detect completion under different delegation modes.

---

## 1. Parameter Mapping Table

### 1.1 Launch Parameters

| Task Parameter | wopal_task Parameter | Notes |
|----------------|---------------------|-------|
| `subagent_type` | `agent` | Subagent type name |
| `description` | `description` | Task description (display name) |
| `prompt` | `prompt` | Task instruction (full prompt content) |
| `model` | — | wopal_task uses agent's default model, no override |
| `isolation` | — | **Invalid parameter**, subagent creates worktree internally via bash |
| `run_in_background` | — | **Invalid parameter**, wopal_task is native async, doesn't need this |

### 1.2 Task Invalid Parameters in OpenCode

| Parameter | OpenCode Actual Behavior |
|-----------|-------------------------|
| `isolation="worktree"` | **Ignored** — Parameter not in Task schema |
| `run_in_background=true` | **Ignored** — Task always sync blocking |

**Alternative**: Include `<worktree_branch_check>` logic block in prompt, let subagent create worktree via bash.

---

## 2. Completion Detection Comparison

### 2.1 Task Completion Detection

| Detection Method | Implementation |
|------------------|----------------|
| **Blocking return** | Task() returns full result text after execution completes |
| **Marker parsing** | Regex match `## XXX COMPLETE` markers from returned text |
| **Spot-check** | Check SUMMARY.md + git commits as fallback |

**Common WSF markers:**

```
## PLANNING COMPLETE
## EXECUTION COMPLETE
## VERIFICATION PASSED
## MAPPING COMPLETE
## REVIEW COMPLETE
```

### 2.2 wopal_task Completion Detection

| Detection Method | Implementation |
|------------------|----------------|
| **Verdict event** | When sub-session enters idle, plugin determines verdict (completed/failed) |
| **Synthetic marker** | `[WOPAL TASK COMPLETED]` or `[WOPAL TASK FAILED]` injected into output |
| **Output polling** | `wopal_task_output(task_id, section="text")` checks output content |
| **Spot-check** | Check SUMMARY.md + git commits as fallback (consistent) |

**wopal_task state machine:**

```
running → waiting → idle → completed/error
                    ↓
            verdict determination
```

---

## 3. Polling Modes

### 3.1 Task Mode (Blocking)

```markdown
Task(
  subagent_type="wsf-executor",
  prompt="...",
  description="Execute plan 01-01"
)
// Blocks until complete, returns result text
// Parse result for completion marker
```

### 3.2 wopal_task Mode (Async + Polling)

```markdown
// Step 1: Launch async task
wopal_task(
  agent="wsf-executor",
  prompt="...",
  description="Execute plan 01-01"
)
→ Returns task_id immediately

// Step 2: Poll for completion (via notification or periodic check)
wopal_task_output(task_id="xxx", section="text")
→ Check for synthetic marker or verdict in output

// Step 3: Spot-check fallback (same as Task mode)
ls phase_dir/SUMMARY.md
git log --oneline --grep="phase-plan"
```

---

## 4. Worktree Handling Differences

### 4.1 Task Mode (Pseudo isolation)

Task's `isolation="worktree"` parameter is invalid, actually implemented via prompt instruction:

```xml
<worktree_branch_check>
FIRST ACTION: verify worktree branch base
ACTUAL_BASE=$(git merge-base HEAD {EXPECTED_BASE})
If mismatch → git rebase or reset to correct base
</worktree_branch_check>
```

### 4.2 wopal_task Mode

wopal_task has no isolation parameter concept, subagent also creates worktree via prompt instruction:

```xml
<worktree_execution>
You are running as a PARALLEL executor agent.
Create worktree: git worktree add .worktrees/plan-xxx
Use --no-verify on commits to avoid hook contention.
</worktree_execution>
```

**Conclusion**: Both modes need worktree creation logic in prompt, parameter declaration is just documentation.

---

## 5. Error Handling Comparison

### 5.1 Task Errors

| Error Type | Task Handling |
|------------|---------------|
| Subagent execution failed | Returns failed text, parse marker as FAILED |
| Task doesn't return (Copilot) | Spot-check verification + timeout fallback |
| Runtime bug | classifyHandoffIfNeeded error → spot-check pass = success |

### 5.2 wopal_task Errors

| Error Type | wopal_task Handling |
|------------|---------------------|
| Sub-session crash | Task status → error, verdict = failed |
| Permission denied | Sub-session waits → wopal_task_reply or abort |
| Timeout | No timeout set, managed by system (memory: setting timeout kills large tasks) |

---

## 6. Conversion Examples

### 6.1 Task Call → wopal_task Call

**Original Task call:**

```
Task(
  subagent_type="wsf-executor",
  description="Execute plan 01-01",
  model="opus",
  isolation="worktree",
  prompt="
    <objective>Execute plan...</objective>
    <worktree_branch_check>...</worktree_branch_check>
    ...
  "
)
```

**Convert to wopal_task:**

```
wopal_task(
  agent="wsf-executor",
  description="Execute plan 01-01",
  prompt="
    <objective>Execute plan...</objective>
    <worktree_branch_check>...</worktree_branch_check>
    ...
  "
)
// model parameter omitted (use agent default)
// isolation parameter omitted (invalid)
```

### 6.2 Completion Detection Conversion

**Task mode:**

```
# Task returns directly, parse marker
if result contains "## EXECUTION COMPLETE":
  plan_complete = true
else:
  # Spot-check fallback
  if SUMMARY.md exists AND commits found:
    plan_complete = true
```

**wopal_task mode:**

```
# Poll for idle verdict
output = wopal_task_output(task_id, section="text")
if output contains "[WOPAL TASK COMPLETED]":
  plan_complete = true
else if output contains "[WOPAL TASK FAILED]":
  plan_failed = true
else:
  # Still running, continue poll or wait for notification
  # Spot-check fallback (same logic)
  if SUMMARY.md exists AND commits found:
    plan_complete = true
```

---

## 7. Conditional Logic in Workflow

Workflow branching example:

```xml
<step name="spawn_executor">
**If DELEGATION_MODE is `wopal_task`:**
```
wopal_task(
  agent="wsf-executor",
  prompt="...",
  description="Execute plan {plan_id}"
)
```

**If DELEGATION_MODE is `Task`:**
```
Task(
  subagent_type="wsf-executor",
  prompt="...",
  description="Execute plan {plan_id}"
)
```

**If DELEGATION_MODE is `inline`:**
Read and execute execute-plan.md directly (no spawning)
</step>
```

---

## 8. Important Notes

1. **wopal_task doesn't support model parameter** — Subagent uses its defined default model
2. **wopal_task is native async** — Doesn't need `run_in_background`, returns immediately after launch
3. **Both modes share spot-check** — Disk artifact verification is the most reliable completion criterion
4. **Worktree needs prompt instruction** — Parameter declaration is invalid, actual logic in prompt
5. **Don't poll too frequently** — wopal_task should wait for notification before checking, frequent polling wastes context (memory: check only after 50+ seconds without output)

---

## 9. Related Documents

- `runtime-detection.md` — Tool availability detection flow
- `agent-contracts.md` — Subagent completion marker contract
- `context-budget.md` — Context budget management (wopal_task notification includes context usage)