---
name: agents-collab
description: |
  Foundation rules for how Wopal collaborates with sub-agents such as fae and rook. ⚠️ MUST load before ANY delegation — covers delegation tool APIs, task lifecycle, notifications, status handling, and recovery.

  🔴 Trigger: "delegate", "let fae implement", "fae task", "rook review", "check task status", "cancel task", "abort task", "agent collaboration", "委派", "让 fae 执行", "fae 任务", "rook 审查", "检查状态", or any intent to hand work to a sub-agent.

  🔴 Never delegate without loading this skill first. Skipping it is serious negligence.

  Note: this skill does not include workflow-specific prompt templates such as dev-flow templates. Those belong to the corresponding workflow skills.
---

# agents-collab — Sub-agent collaboration basics

This skill defines **how** Wopal should collaborate with sub-agents at the tool level. **When** to delegate, and which workflow-specific instructions must appear in the prompt (such as Plan paths or done checkboxes), are decided by higher-level workflow skills such as dev-flow.

---

## Tool priority

Always prefer `wopal_task` for delegation. Use the built-in `task` tool only when `wopal_task` is unavailable.
`wopal_task` provides bidirectional communication, progress monitoring, and non-blocking execution. Using `task` means downgrading execution and giving up those capabilities.

---

## Prompt format

Delegation prompts must be precise and complete so the sub-agent can succeed in one pass. Standard format:

```
Hello <agent>, I am wopal. Because <reason>, please do the following task:

Task: <task description>
Goal: <goal description>

<precise context: absolute paths, file:line anchors, current code, change locations, and boundaries of what must not be changed>
```

**Required location context**:
- If a Plan exists: provide the absolute path to the Plan file
- If a worktree is involved (such as `.wopal/`): explicitly state the worktree root and warn the sub-agent not to edit the wrong location

**Core principle**: give complete, precise context up front so rework is minimized.

### Code review delegation contract, especially for rook

When delegating code review to rook, you must first define the **change carrier**. Without it, rook cannot establish a correct review boundary:

| Scenario | Required prompt fields | How rook should review |
|------|----------------|------------------|
| **Uncommitted changes** | `review_type: implementation`, `project_path`, `change_scope: working_tree`, plus changed file list or an explicit instruction to review `git diff` / `git diff --cached` | Review against the working tree or staged diff using planless diff review |
| **Committed changes** | `review_type: implementation`, `project_path`, `commit: <hash>` or `commit_range: <A>..<B>`, and `background` | Review against the `git diff` for that commit or range; never rely on file paths alone |

Additional rules:

1. **For committed changes, never provide only file names.** Without a commit or range, rook tends to review whole files and loses precise diff context.
2. **Planless code review defaults to technical review.** Explicitly tell rook to focus on bugs, tests, repeated logic, convention violations, and technical debt rather than judging business logic.
3. **If business logic really must be reviewed**, say so explicitly in the prompt, for example: `business_logic_review: requested`. Otherwise rook should place severe logic concerns in a discussion-only section.

---

## Delegation tools

### wopal_task — launch a task

```typescript
wopal_task({
  description: "3-5 words",
  prompt: "<write the prompt using the format above>",
  agent: "fae"       // or "rook", "general", etc. Default: "general"
})
// Returns task_id for later monitoring and communication
```

- Asynchronous and non-blocking; the main session does not wait and can launch multiple tasks
- Concurrency limit: configurable via the wopal plugin; additional tasks queue automatically
- TTL: auto-cleanup after 30 minutes with no interaction

### wopal_task_output — inspect status and output

```typescript
wopal_task_output({ task_id })                              // summary status
wopal_task_output({ task_id, section: "text" })             // text output
wopal_task_output({ task_id, section: "tools" })            // tool calls
wopal_task_output({ task_id, section: "reasoning" })        // reasoning trace
wopal_task_output({ task_id, section: "text", last_n: 3 })  // last 3 text outputs only
```

### wopal_task_reply — communicate, resume, or redirect

Send a message to an idle, waiting, or stuck task to resume execution or correct direction. `error` tasks cannot be resumed; clean them up with `finish` and recreate them. The sub-agent **will wake up**.

```typescript
wopal_task_reply({ task_id, message: "Continue improving test coverage" })
wopal_task_reply({ task_id, message: "Change direction to...", interrupt: true })  // abort current execution + inject message
```

| Task state | Behavior |
|---------|------|
| `waiting` | Send a message and resume execution |
| `idle` | Clear the idle marker, send a message, and resume execution |
| `stuck` | Send a message and try again |
| `error` | Reply is invalid; finish and recreate with valid config |
| `running` | Must use `interrupt=true`, otherwise the message is queued |

**Forbidden**: `wopal_task_reply({ message: "Task complete" })` — this wakes the sub-agent and causes pointless extra work. `IDLE` is already the completion signal. If the output is accepted, end the task with `wopal_task_finish`.

### wopal_task_abort — stop an actively running task

Pure stop: no message, no wake-up. Afterward you can either `finish` the task or `reply` to resume it.

```typescript
wopal_task_abort({ task_id })
```

### wopal_task_finish — terminate a task

Terminate an idle, waiting, stuck, or error task and delete its sub-session. The sub-agent **will not wake up**. Running tasks must be `abort`ed first or redirected with `reply(interrupt=true)`.

```typescript
wopal_task_finish({ task_id })
```

---

## Task lifecycle

### State model

State model: `running | idle | waiting | stuck | error`

- `running`: the only active state; the sub-session is executing
- `idle`: stopped, with new assistant text, waiting for Wopal acceptance
- `waiting`: stopped, waiting for a native question reply
- `stuck`: stopped, with evidence of assistant execution but no new assistant text in the current round; can be resumed or cleaned up
- `error`: stopped before entering a recoverable execution chain, such as invalid agent config; must be cleaned up and recreated

### States and actions

| State | Meaning | Wopal action |
|------|------|-----------|
| `running` | Executing | Wait for notifications or inspect output when needed |
| `idle` | Stopped with output | Accept → `finish`, or reject → `reply` |
| `waiting` | Waiting for native question reply | Use `reply` to answer via the question.reply path |
| `stuck` | Execution evidence exists but no fresh output | Inspect output/logs → `reply` to recover or `finish` to clean up |
| `error` | Startup/config-level failure | Inspect cause → `finish` cleanup → recreate task |

---

## Notification-driven flow

Task state changes are reported through system notifications named `[WOPAL TASK *]`. **Do not poll. Wait for notifications.**

| Notification | Trigger | Handling |
|------|---------|---------|
| `[WOPAL TASK PROGRESS]` | Periodic heartbeat | Understand progress; no action needed |
| `[WOPAL TASK IDLE]` | Sub-agent session is idle with fresh assistant text | Follow the IDLE decision tree below |
| `[WOPAL TASK QUESTION]` | Sub-agent used the native question tool and is now waiting | Use `reply` to answer |
| `[WOPAL TASK STUCK]` | Assistant execution happened, but the current round stopped without fresh assistant text | Inspect `output(section="reasoning")` → `reply` to resume or `finish` to clean up |
| `[WOPAL TASK ERR]` | No assistant execution evidence before failure | Inspect the cause → `finish` cleanup; do not reply |

`STUCK` is produced when the sub-session stops, there is no new non-synthetic assistant text in the round, but there is prior evidence of assistant execution. `ERR` means the task never entered a recoverable execution chain. Bash command failures do not trigger `ERR`. `reply` cannot change agent type; changing agent type requires a new task.

---

## IDLE task decision tree

```
IDLE notification arrives
    ↓
① Inspect text output with wopal_task_output(section="text")
    ↓
② Make acceptance decision
    ├─ Accepted, no more work needed → wopal_task_finish to free resources
    │                                ❌ Never do nothing and wait for TTL; zombie tasks waste concurrency slots
    ├─ Accepted, but may be reused later → keep alive
    ├─ Not accepted → wopal_task_reply for rework (⚠️ see high-context rules below)
    └─ Sub-agent asked a question → wopal_task_reply with the answer
```

## STUCK task decision tree

```
STUCK notification arrives
    ↓
① Inspect reasoning with wopal_task_output(section="reasoning")
    ↓
② Decide next action
    ├─ Reasoning is normal, just no text this round → optionally guide with wopal_task_reply
    ├─ Dead loop / repeated retries → wopal_task_abort or wopal_task_finish
    └─ Abnormal stop (session crash, etc.) → try wopal_task_reply or clean up with wopal_task_finish
```

## ERR task decision tree

```
ERR notification arrives
    ↓
① Inspect the error cause with wopal_task_output
    ↓
② Clean up with wopal_task_finish
    ↓
③ Recreate a new task if work must continue
```

---

## Rework and reuse strategy

### Controller responsibility

Wopal owns delegation rules, review conclusions, and the decision to reuse or replace a task. Fae and rook do not summarize delegation lessons. After receiving a review result, Wopal must actively drive the next step instead of waiting for the user to repeat authorization.

### Reuse priority

As long as the task is still alive, the scope has not materially changed, and context remains healthy, prefer `reply` reuse:

| Scenario | Preferred | Avoid |
|------|------|--------|
| Small fae rework | `reply` to continue | Opening a new fae task |
| Rook returned REVISE/BLOCK and code is fixed | `reply` the original rook task | Opening a new rook task |
| Supplying more information / continuing work | `reply` | Finishing then recreating |

### When to stop reusing a task

Open a new task, or have Wopal finish the work directly, when any of these is true:

1. Context > 50% (hard threshold)
2. One rework cycle already happened and context is 45%+
3. The task scope materially changed, such as moving from code fixing to rule writing
4. The sub-agent is clearly drifting, looping, or degrading in quality

Rule of thumb: do not interrupt a healthy running task. If quality is poor after IDLE and context is already high, avoid forcing another hard reply cycle.

---

## Child-session context compaction

When receiving `[WOPAL TASK PROGRESS]`, check context usage:

| Usage | Recommendation |
|------|------|
| < 45% | No action needed |
| 45-55% | Evaluate remaining workload |
| ≥ 55% | Consider compaction |
| ≥ 75% | Urgent compaction |

Before compacting, confirm there are no uncommitted changes, no blocking dependencies, and the task is not stuck.

**Main session**: `context_manage(action="compact")`. After compaction, the plugin sends recovery instructions automatically.

**Child session**: `context_manage(action="compact", session_id="wopal-task-xxx")`. After compaction, the plugin sends `[WOPAL TASK COMPACTED]`, and Wopal should use `reply` with precise recovery instructions.

---

## Cross-agent artifacts in parallel delegation

When multiple agents run in parallel, the file list returned by `output` may include work produced by other agents. Focus only on the expected artifacts for the current task, and use `git status` in the relevant project directory to verify them. Do not misclassify other agents' files as anomalies or delete them.

---

## Prohibitions and limits

| Prohibition | Reason |
|------|------|
| Delegating without loading this skill | Missing operating rules; errors become likely |
| Frequent `output` polling | Wastes context; wait for notifications instead |
| Nested `wopal_task` usage | Sub-agents already have it disabled |
| Repeated reply-based rework on the same task when context > 50% | Quality degrades in high-context sessions |
| `reply("Task complete")` | Wakes the sub-agent for no meaningful reason |

| Limit | Response |
|------|------|
| Concurrency is plugin-configurable | Additional tasks queue automatically |
| TTL is 30 minutes | Unhandled tasks are auto-cleaned after notification |

---

## Troubleshooting

See `references/troubleshooting.md`
