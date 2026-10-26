---
name: dev-flow
description: >
  Issue/Plan-driven development lifecycle workflow. Use when creating or advancing Plans, organizing implementation and review, running approve/complete/verify/archive gates, coordinating user validation, or breaking PRDs/Issues into tasks.
---

# dev-flow — Issue / Plan Development Workflow

## Controller responsibilities

The controller advances the Plan lifecycle, organizes implementation and review, enforces workflow gates, and handles decisions that require user confirmation.

The controller may implement or review directly, or delegate:

- Implementation follows `df-implement`.
- Implementation review follows `df-implement-review`.
- Delegation does not change dev-flow gates or controller responsibility.

## Running the CLI

Run every command from the skill root:

- workdir: `.wopal/skills/dev-flow/`
- form: `bash scripts/flow.sh <command> [args]`

Do not `source` the script or bypass `flow.sh` for lifecycle state it owns. Full command arguments and Git-mutation details live in `references/commands.md`.

In restricted environments, use the current harness's native approval mechanism when a command needs Git-metadata writes. Do not change permission configuration to bypass restrictions. If a command fails, preserve the original error and stop rather than fabricating a successful state.

## DESIGN, Plan, implementation

**The hierarchy is fixed: DESIGN → approved Plan → implementation.**

- DESIGN defines the target state.
- The Plan defines what part is delivered now, with its boundaries and acceptance.
- Implementation realizes that delivery inside those constraints.

### Before Plan approval

The controller is responsible for making the Plan match formal DESIGN. Design facts for project/phase Plans may come only from DESIGN/sub-DESIGN documents with `Status: Active`; every Task maps to a concrete section, decision, or contract through `Design Source`.

`Draft` / `Proposed` designs are not settled. They may be used only as forward-looking reference, never as `Design Source` or as the basis for implementation targets, contracts, or acceptance. If the Plan itself is wrong or incomplete, fix it directly; if the Active DESIGN conflicts with the user's intended goal, do not choose for the user — ask whether the design should change.

`Design Source: N/A` is valid only for simple work with no project and no design basis.

### After Plan approval

The substantive content of an approved Plan and the DESIGN are no longer autonomous edit surfaces for the controller.

Lifecycle records — status, checkboxes, AC verification commands, Done evidence — may still be updated as defined. Substantive Tasks, scope, boundaries, behavior, approach, and acceptance intent may not be changed on the controller's own authority.

When implementation or validation exposes a problem:

1. If it can be solved inside the existing DESIGN + approved Plan, the controller may investigate, decide, and continue.
2. If the approved Plan or DESIGN must change, explain the conflict and impact to the user and let the user decide which side changes. Edit neither first.

## Lifecycle

Standard chain:

`plan new → submit → approve --confirm → implementation/review → complete → user validation → verify --confirm → archive`

State machine:

`planning → reviewing → executing → verifying → done → archived`

| Stage | Controller action | User gate |
|---|---|---|
| planning | Write the Plan, align it to DESIGN, run `submit` | none |
| reviewing | Revise the not-yet-approved Plan from feedback | user approves the Plan |
| executing | Organize implementation, implementation review, Agent Verification | no new scope/design authority |
| verifying | Coordinate user validation and any rework | user confirms validation; user confirms any Plan/design change |
| done | Run closure | as required by the closing command |
| archived | Plan archived | — |

Never force an illegal transition; return to the correct step instead.

## Planning and Reviewing

Create or locate Plans through `flow.sh plan ...`. Do not hand-create new Plan files or grep/glob around the space to guess where an existing Plan lives. Use `plan status` for a known name and `plan list` for browsing.

Write the Plan's actual content in the user's preferred language; keep structural headings and field names required by the template unchanged. Prefer plain language that a human reviewer can understand directly; use technical terms only where Interface, Constraints, commands, types/protocols, or similar precision requires them. A Plan fixes behavior, acceptance, contracts, and boundaries; internal implementation details stay with implementation. Task format, TDD selection, ACs, metadata, and naming rules live in `references/plan-guide.md`.

`Delegation Strategy` must assign Tasks from the currently available agents based on capability and Task relationships; the Agent column contains only the specific agent name.

After substantive Plan content changes, run `flow.sh sync <plan> --body-only` so the Issue's Goal / Scope / Acceptance Criteria and Plan link remain aligned.

After writing the Plan, the controller must run `flow.sh submit <plan>` to reach `reviewing` before asking the user to review it. `submit` already runs `plan check`; a manual check first is unnecessary.

While the Plan is in `reviewing`, it is not approved yet. The controller may revise it from user feedback and sync it again; no reset and no second submit are required. The user's approval applies to the current Plan version.

After explicit user approval, run:

```bash
flow.sh approve <plan> --confirm [mode-flags]
```

### Implementation modes

| Mode | Use when | Command |
|---|---|---|
| Standard isolation (default) | normal development | `approve --confirm` |
| Trunk-direct | user explicitly asks for no worktree | `approve --confirm --no-worktree` |
| Existing branch evolution | user asks to reuse an existing worktree/feature branch | `approve --confirm --existing-worktree <path>` |

`--no-worktree` and `--existing-worktree` are different semantics and are not substitutes. Evolution mode closes with `--keep-worktree`. See `references/commands.md` for exact behavior.

## Executing: implementation, acceptance, review, Agent Verification

Once in `executing`, the controller chooses whether to implement each Task directly or delegate it. Implementation follows `df-implement`, but **Task acceptance, commits, and Plan progress always belong to the controller**.

For delegated implementation:

1. The implementer works against the Task's `Design Source`, Behavior, Pre-read, Interface, Constraints, and Verify without expanding scope.
2. The implementer runs Verify and reports what changed, actual touched files, verification commands/results, and the real commands corresponding to the relevant ACs; **the implementer does not commit, edit the Plan, or tick progress checkboxes**.
3. The controller inspects the actual diff and independently runs Task Verify. If the check fails, make no commit and no Plan progress update; return the findings and evidence to the implementer for repair.
4. Only after the check passes does the controller write back AC commands, Done evidence and touched files, tick Task Done, and create the Task's implementation commit.

Direct implementation by the controller follows the same order: implement first, then inspect as controller; record progress and commit only after the check passes. A failed implementation attempt creates neither a commit nor a Plan completion record.

Plan progress, AC commands, and Done evidence are controller-owned acceptance records, not an implementer write surface.

### Implementation review

After all Tasks are implemented, run an implementation review. The controller may load `df-implement-review` and review directly or delegate a reviewer; **the review skill, not an agent name, defines the review rules**.

#### Review iteration governance

The controller manages review cycles with a hard cap of **at most 3 rounds** to balance quality and prevent infinite loops:

1. **Round 1 (Initial)**: Full sweep across all 4 questions. Exhaustive reporting of all known defects.
2. **Round 2 (Re-review)**: Focused verification on reported fixes and their immediate blast radius. If all Blockers are resolved and only Warnings remain, the controller may grant **conditional PASS (Pass with Debt)** by recording remaining Warnings as follow-up debt.
3. **Round 3 (Blocker Elimination)**: Dedicated strictly to resolving persistent Blockers.
4. **Escalation circuit breaker**: If Blockers persist after Round 3, do not loop further. Halt and escalate to the user with the 3-round summary and two explicit choices:
   - **Rework design/plan**: Roll back or adjust the flawed approach under user direction.
   - **Manual intervention**: Proceed with explicit user fix instructions or user override.

Run final Agent Verification only after review PASS (or conditional PASS) so stale pre-fix evidence cannot be reused.

### Agent Verification

The controller runs each real Agent Verification command, checks the output, and only then ticks it. Any fix that affects an AC invalidates the old result and requires the command to be re-run.

Before `complete`, all of these must be true:

- every Task Done is complete;
- implementation code is committed;
- implementation review is PASS;
- every Agent Verification item has been run successfully and ticked.

Then immediately run:

```bash
flow.sh complete <plan>
```

`complete` advances `executing → verifying`. **Do not invite final user validation before the Plan reaches `verifying`.**

## Conflicts and rework

When implementation or validation reveals disagreement among the Plan, DESIGN, and code reality, the controller classifies the problem:

- **Implementation problem**: existing DESIGN + approved Plan already answer it → fix the code inside the current boundaries and re-verify.
- **Plan problem**: continuing requires a substantive approved-Plan change → explain cause and impact, then wait for user confirmation before revising and syncing the Plan.
- **Design problem**: continuing requires a DESIGN change → get the user's decision on the design target, run the appropriate design-maintenance flow, then realign the Plan.

Do not use `reset` as a substitute for this decision. `reset` is destructive and runs only on explicit user request.

## Three verification layers

| Layer | Owner | Rule |
|---|---|---|
| Task Done | controller | inspect the implementation diff and independently run Task Verify; only after pass, backfill evidence, tick, and commit |
| Agent Verification | controller | run the commands and inspect results; never tick from memory |
| User Validation | user | only for behavior that truly requires human observation; agents never tick it for the user |

Automatable tests, lint, typecheck, static checks, and script assertions belong in Agent Verification, not User Validation. User Validation authoring rules live in `references/plan-guide.md`.

## Verifying and user validation

After `complete`, relay the script's validation location and available modes to the user and let the user choose. The controller does not skip user validation or confirm it on the user's behalf.

Common validation modes:

| Scenario | Flow |
|---|---|
| worktree can run directly | user validates in worktree → merge → `verify --confirm` |
| canonical path is required | `verify-switch` → user validates → merge → `verify --confirm` |
| user explicitly chooses merge-first | merge → user validates on integration branch → `verify --confirm` |
| `--no-worktree` | user validates directly on integration branch → `verify --confirm` |
| `--existing-worktree` evolution mode | user validates in kept worktree → `verify --confirm --keep-worktree` |

Default to validating before merge. Merge-first is a user choice, not a controller default.

Rework during validation follows the same conflict rule: the controller may decide fixes inside the existing DESIGN + Plan; any Plan or design change requires user confirmation first.

After the user explicitly confirms validation and authorizes the corresponding closure, finish the selected merge path and run:

```bash
flow.sh verify <plan> --confirm [--keep-worktree]
flow.sh archive <plan> [--keep-worktree]
```

## Branch and worktree boundaries

Dev-flow scripts own branch/worktree creation and deletion:

- `approve` creates or binds them;
- `verify-switch` / `archive` remove them;
- the controller does not manually create or delete feature branches or worktrees;
- in standard mode, the only manual branch action is the user-authorized feature → integration merge; prefer squash by default, and use `--no-ff` only when the user explicitly wants history preserved.

Do not load a separate worktree-management skill to take over worktrees already owned by dev-flow.

## User authorization gates

| Action | Required user signal |
|---|---|
| `approve --confirm` | explicit approval of the current Plan |
| substantive approved-Plan change | explicit confirmation of that Plan revision |
| DESIGN change | explicit confirmation of the design target/revision |
| user validation result | explicit pass confirmation or failure feedback |
| merge / `verify --confirm` | explicit authorization appropriate to the chosen validation mode |
| `reset` | explicit reset request |

Do not expand a single instruction such as “commit it” into authorization for the whole closing sequence.

## Boundaries that must hold

- Do not bypass dev-flow for design-bearing work.
- Ontology issues are not dev-flow work. When an Issue's project is the ontology component — its changes land in the ontology worktree (skills, rules, agents, commands, plugins, assembly) rather than in a repository under `projects/` — hand it to `ontology-evolution` instead of planning it here. The Issue stays the demand record; the proposal is the implementation authority. See `references/issue-guide.md` for how `--project` decides this.
- Do not ask for Plan approval before `reviewing`, and do not implement an unapproved Plan.
- Do not rewrite approved Plan intent or DESIGN and continue without user confirmation.
- Do not `complete` before implementation review PASS and Agent Verification are complete.
- Do not invite final user validation before `complete` reaches `verifying`.
- Never tick User Validation for the user.
- Keep code state and completion checkboxes aligned; if code is reverted, the evidence must become true again before completion is claimed.
- Use `flow.sh issue ...` for Issue creation/query/edit/close instead of bypassing space-repo detection with direct `gh issue ...` calls.
- Locate Plans with `flow.sh plan status/list`, not grep/glob guesses.
- Do not manually create/delete branches or worktrees managed by dev-flow.
- Run `reset` only on explicit user request, never to bypass rework or approval.

## References

Load details only when needed instead of duplicating them in the main workflow:

| File | Read when |
|---|---|
| `references/plan-guide.md` | authoring/revising Plans, Tasks, ACs, User Validation, naming, or handoff |
| `references/commands.md` | command arguments, implementation modes, Git mutation, verify/archive behavior |
| `references/issue-guide.md` | creating or syncing Issues |
| `references/troubleshooting.md` | command failure, abnormal state, or edge cases |
