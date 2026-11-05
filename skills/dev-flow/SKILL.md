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

## Choosing Issue and Plan shape

Apply these rules in order before entering the lifecycle; do not use a complicated Plan shape to avoid making this decision:

1. **An Issue records a problem or goal.** Its `project/*` labels describe impact scope and may be absent, singular, or multiple; they do not force one implementation project.
2. **One Plan is one implementation.** It links at most one Issue and belongs to exactly one Target Project.
3. **Several Issues, one implementation** → merge them first with `issue merge --into`, keep one Issue, then create one Plan. Do not create a multi-Issue Plan.
4. **One confirmed overall delivery goal, several independent implementations** — within one project or across projects — → create the Plans separately and organize them in Active Plan Graph `groups`. Sharing a project, Phase, or time period alone is not a reason to group Plans. Express implementation order only with Graph `edges`.
5. **A Graph group is a flat organization container, not a Plan.** Each Plan belongs to at most one group; groups contain only submitted, non-archived Plan nodes and cannot nest. A group owns no Issue, lifecycle state, Acceptance Criteria, worktree, or Delivery, and no Plan lifecycle command targets it.

See `references/issue-guide.md` for Issue labels/merge, `references/plan-guide.md` and `references/active-plan-graph.md` for Plan/Graph authoring, and `references/commands.md` for exact commands.

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

`plan new → submit → approve --confirm → implementation/review → complete → user validation → integrate (when a work branch exists) → verify --confirm → archive`

State machine:

`planning → reviewing → executing → verifying → done → archived`

### Active Plan Graph

Each Space maintains `.wopal-space/plans/active-graph.json` as the **single source of truth for Plan implementation relationships during the lifecycle window from submit through archive**. Plan files own content and workflow state; Phase documents do not copy live Plan state or a Plan-level execution DAG.

During the current practice phase there is no Graph CLI. The controller maintains the Graph manually at lifecycle points; delegated implementers do not edit it. Read `references/active-plan-graph.md` for the full contract.

The controller enforces these gates:

- `plan new` does not change the Graph; an unsubmitted planning draft stays out.
- After the first successful `submit`, add the Plan to `nodes`. If the user has already confirmed its overall goal and group, also add it to that group; create the group when its first Plan is submitted, and add later Plans as they submit. Never add a draft as a fake node.
- Group creation, overall-goal changes, and substantive membership changes require prior user confirmation; do not group Plans merely because they look similar. Once the user confirms the organization, maintain membership mechanically on subsequent submits without asking again. A group never implies or generates dependency edges.
- Before `approve --confirm`, a normal Plan must already be in the Graph, and every incoming-edge producer must already be `done`; otherwise implementation is blocked.
- `complete` / `verify --confirm` do not change membership. A `done` Plan and its edges remain until archive so the current Graph can still show the implementation order.
- Only after successful `archive` remove the node, all incident edges, and group membership; delete a group when its last member leaves.
- `reset` itself does not change membership: a submitted non-archived Plan remains in the Graph even if it returns to planning.

Graph maintenance and lifecycle commands are currently two consecutive controller actions. If the lifecycle command already succeeded but the manual Graph edit fails, do not fabricate a rollback; restore Graph consistency before approving or starting other Plans.

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
| Standard isolation (default) | normal development. The script creates a work branch and worktree; development commits stay on the work branch, and formal delivery is squashed by default | `approve --confirm` |
| Trunk-direct | user explicitly asks for no worktree. Implement directly on the integration branch; create no work branch, do not run `integrate`, and do not squash | `approve --confirm --no-worktree` |
| Existing branch evolution | user asks to reuse an existing worktree/feature branch; multiple Plans may explicitly share one Delivery and one formal integration | `approve --confirm --existing-worktree <path>` |

`--no-worktree` and `--existing-worktree` are different semantics and are not substitutes. Use `--keep-worktree` only when the worktree must survive an archive step; shared-Delivery members keep it until the owner is archived last. See `references/commands.md` for exact behavior.

### Formal delivery and commit records

Modes with a work branch separate development history from formal delivery. The work branch may contain multiple implementation, review-fix, and validation-fix commits; the integration branch receives one summary commit by default. Normal archive removes the work branch and extra worktree, so per-step development history is guaranteed only until archive.

Plans use these fixed metadata fields:

| Field | Meaning |
|---|---|
| `Delivery` | The formal delivery identifier. A single Plan owns itself; Plans sharing a delivery all name the owner Plan. |
| `Commit Subject` | The exact subject used for the formal delivery commit. Every Plan in one Delivery must use the same value. |
| `Integration Strategy` | How the work reaches the integration branch. Default `squash`; `preserve-history` is allowed only when the user explicitly chooses it before integration. |
| `Integration Branch` | The formal branch that receives the delivered change, such as `main`. |
| `Work Branch` | The branch that keeps development commits. Newly generated names are at most 55 characters; when longer, only the Plan-name tail is shortened and a stable four-character checksum derived from the full name is appended. |
| `Delivery Base Commit` | The integration-branch commit immediately before this Delivery began. Shared-Delivery Plans use the same value. |
| `Verification Commit` | The exact commit the user validated. With a work branch it is a work-branch commit; with `--no-worktree` it is the validated integration-branch commit. |
| `Integration Commit` | The formal commit created on the integration branch for a work-branch Delivery. It is recorded once on the owner Plan and shared by the members. `--no-worktree` has no Integration Commit. |

`Commit Subject` has one ownership chain:

1. **Draft**: the Plan author writes it before implementation, using `type(scope): result` to describe the delivered outcome. An Issue title may inform the draft but does not replace this field.
2. **Freeze**: `approve --confirm` confirms and freezes it with the rest of the Plan.
3. **Change**: after freeze, it changes only when the user asks to revise the approved Plan; the revised Plan must be confirmed again.
4. **Use**: `integrate` passes the Plan's `Commit Subject` through verbatim. It does not generate, concatenate, rewrite, or append automatic text. PR delivery uses the same exact subject.

Multiple `--existing-worktree` Plans may share one Delivery. The first approved Plan is the owner and records the shared integration branch, work branch, base commit, integration strategy, and commit subject. Later members name that owner in `Delivery` and reuse the same values; `approve` refuses any mismatch. Formal integration happens once. Starting `integrate` from any member discovers all unarchived Plans with that Delivery and includes every change after the shared base.

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
| standard isolation, worktree can run directly | user validates in the development worktree → `integrate <issue-or-plan> --confirm` → `verify --confirm` |
| standard isolation, canonical path is required | `verify-switch` → user validates the work branch → return to the integration branch → `integrate <issue-or-plan> --confirm` → `verify --confirm` |
| user explicitly chooses integrate-first | `integrate <issue-or-plan> --confirm` → user validates on the integration branch → `verify --confirm` |
| `--no-worktree` | user validates directly on the integration branch → `verify --confirm`; do not run `integrate` |
| shared Delivery | user validates the whole Delivery → run `integrate <any-member> --confirm` once → each member runs `verify --confirm` |

Default to validating before integration. Integrate-first is a user choice, not a controller default. `integrate --confirm` is the user's explicit authorization to write the validated work-branch content to the integration branch. It records the current work-branch commit as each member's `Verification Commit`; after the default squash it records the formal integration-branch commit as the owner Plan's `Integration Commit`. Each later `verify --confirm` checks that same formal delivery commit instead of treating a newer unrelated integration-branch commit as this Delivery.

`preserve-history` is an explicit exception only: the integration branch keeps the development commits only when `Integration Strategy` is already `preserve-history` and the user explicitly chooses that history-preserving delivery before integration. The default path must not fall back to ordinary `git merge`, which can carry intermediate commits or an extra merge commit into formal history.

Rework during validation follows the same conflict rule: the controller may decide fixes inside the existing DESIGN + Plan; any Plan or design change requires user confirmation first.

After the user explicitly confirms validation and authorizes the corresponding closure, finish the selected formal integration path and run:

```bash
flow.sh verify <plan> --confirm [--keep-worktree]
flow.sh archive <plan> [--keep-worktree]
```

For a shared Delivery, archive only after every member has completed formal integration and `verify --confirm`. Archive non-owner Plans first with `--keep-worktree`; archive the owner last without it so the common work branch and worktree are removed once.

## Branch and worktree boundaries

Dev-flow scripts own branch/worktree creation and deletion:

- `approve` creates or binds them;
- `verify-switch` only moves validation into the canonical project path; it does not formally integrate the work;
- when a work branch exists, `integrate` is the only normal path that writes the validated Delivery to the integration branch; the controller does not run a manual ordinary `git merge`;
- `archive` performs normal work-branch/worktree cleanup; a shared Delivery cleans them only when the owner is archived last;
- the controller does not manually create or delete feature branches or worktrees;
- `--no-worktree` starts and stays on the integration branch, so it has no work branch, no `integrate` step, and no work-branch cleanup at archive.

Cleanup is safe and automatic for regenerable output. Git already ignores cache, virtualenv, dependency, and build directories; they do not block a normal worktree removal. The scripts retry with `git worktree remove --force` only after confirming there are no tracked changes, no non-ignored untracked files, and no local-only submodule work. Anything that could be the only copy stops cleanup and keeps the worktree and branch.

When a project has submodules, the controller initializes and updates them according to the project instructions after worktree creation and after integration or branch switching. When cleanup stops, save or publish the reported local work, then rerun cleanup.

Do not load a separate worktree-management skill to take over worktrees already owned by dev-flow.

## User authorization gates

| Action | Required user signal |
|---|---|
| `approve --confirm` | explicit approval of the current Plan |
| substantive approved-Plan change | explicit confirmation of that Plan revision |
| DESIGN change | explicit confirmation of the design target/revision |
| user validation result | explicit pass confirmation or failure feedback |
| `integrate --confirm` | when a work branch exists, explicit authorization to write this Delivery to the integration branch |
| `verify --confirm` | explicit confirmation of that Plan's validation result and authorization to advance its state |
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
| `references/active-plan-graph.md` | maintaining active Plan membership, inter-Plan execution constraints, or Graph grouping |
| `references/commands.md` | command arguments, implementation modes, Git mutation, verify/archive behavior |
| `references/issue-guide.md` | creating or syncing Issues |
| `references/troubleshooting.md` | command failure, abnormal state, or edge cases |
