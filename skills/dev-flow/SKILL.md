---
name: dev-flow
description: >
  Issue/Plan-driven development workflow. Design-bearing tasks must be
  backed by a GitHub Issue or Plan. Trigger: issue references like #14,
  creating issues, creating plans, implementing plans, executing plans, checking plans,
  verifying plans, Plan lifecycle transitions
  (approve/complete/verify/archive), decomposing PRDs into Issues. Skip:
  spec-driven workflows, research/discussion/explanation only, and
  ordinary bug fixes — fix existing behavior directly on the trunk branch
  without an Issue or Plan. Only an exceptionally complex bug, or an
  explicit user request for an Issue/Plan, enters the lifecycle.
  Ontology capability assets (skills, rules, agents, commands, plugins,
  assembly under `.wopal/`) belong to `ontology-evolution`, never here.
---

# dev-flow — Issue / Plan Driven Development Workflow

## Script execution

All `flow.sh` commands must run from the skill root directory:

- **workdir**: `.wopal/skills/dev-flow/`
- **Command format**: `bash scripts/flow.sh <command> [args]`

Every `flow.sh xxx` reference in this document (e.g. `flow.sh plan new`, `flow.sh complete`, `flow.sh verify-switch`) runs this way. No `source`, no absolute-path invocation, never run from outside the skill directory.

## When the lifecycle applies

The lifecycle exists for **design-bearing work** — features, enhancements, refactors, contract changes: work whose outcome must be pinned down and reviewed before code exists.

**Bug fixes repair behavior that was already agreed; they stay out of the lifecycle.** An ordinary bug fix — including a fix discovered while doing something else — is implemented and verified **directly on the trunk branch**, with no Issue, no Plan, and no worktree. Routing a fix through `plan new → submit → approve → …` spends a design review on a change that has no design surface; the commit message is the record.

A fix enters the lifecycle only when:

- the bug is **exceptionally complex** — it spans modules, needs investigation beyond a single pass, or turns out to question what the right behavior should be (the fix has become design work), or
- the **user explicitly asks** for an Issue or Plan carrier.

The test when unsure: does this change **restore** intent that was already agreed (fix it directly), or **add** new intent (lifecycle)?

## Who a Plan is written for

A Plan has two kinds of readers: **the human reviewer** (must understand what you want) and **the implementing agent** (must be able to build it).

So a Plan needs to state three things and three things only: **what is wanted (behavior)**, **what counts as done (acceptance)**, and **what must not be touched (contracts and boundaries)**. Which files to change and how to organize the code internally are decisions that can only be made well during implementation, against the real code — written into a Plan they become straitjackets and guesses.

**Iron rule: pin the contract surface, open up the implementation surface.** Behavior specs, external contracts, acceptance criteria, and boundaries are pinned at Plan time; file organization, internal APIs, and test structure are decided by the implementing agent on the latest code.

## Command quick reference

Full parameters and edge cases in `references/commands.md`.

### State machine transitions

| Command | Scenario | Notes |
|------|------|------|
| `plan new <issue>` | Create a Plan | Issue-driven; no Issue: `--title --project --type` |
| `plan status <name>` | View Plan status | State machine position, linked Issue, worktree info |
| `plan list [--issue]` | Browse active Plans | `--issue` merges GitHub Issues into the view |
| `plan check <name>` | Validate Plan quality | Optional diagnostics; submit validates automatically |
| `submit <plan>` | planning → reviewing | Submit for human review |
| `approve <plan> --confirm` | reviewing → executing | User approval; creates worktree by default; `--no-worktree` skips it |
| `complete <plan>` | executing → verifying | Implementation done, enter user validation; dirty tree aborts |
| `verify <plan> --confirm` | verifying → done | User validation passed; merge feature → integration branch first |
| `archive <plan>` | done → archived | Archive Plan, clean up worktree and feature branch |

### Validation helpers

| Command | Scenario | Notes |
|------|------|------|
| `verify-switch <plan>` | Must validate at canonical path | Removes worktree + checks out feature branch |

### Issue management

| Command | Scenario | Notes |
|------|------|------|
| `issue create --title "..." --project <name> --body-file <path>` | Create Issue | `--body-file` is the main path |
| `issue edit <issue> [--title] [--type] [--project] [--body-file] [--append]` | Edit an Issue | Title/type/project labels + body replace/append |
| `issue close <issue>` | Close an Issue | Auto-detects the space repo |
| `issue delete <issue>` | Delete an Issue | Auto-detects the space repo |
| `issue list [--project X] [--status Y] [--limit N]` | List open Issues in the space repo | Auto-detects the repo, shows repo URL, filterable |
| `issue view <issue> [--json]` | View a single Issue | Go straight to it when the number is known; `--json` outputs raw JSON |
| `sync <plan> [--body-only\|--labels-only]` | Plan → Issue sync | Three sections (Goal/Scope/AC) + `\| Plan \|` link row; mandatory after Plan content changes |

### Other

| Command | Scenario | Notes |
|------|------|------|
| `reset <plan>` | Reset a Plan | Destructive; explicit user request only — never to dodge a validation-stage fix |

## Mental model

dev-flow manages two artifact classes that evolve independently in git:

| Artifact | What | Who commits | When |
|------|------|--------|----------|
| **Plan file** | Status, checkboxes, metadata | Status/metadata by `flow.sh` scripts; checkboxes by the agent after checking them | On state transitions (submit/approve/complete/verify/archive); checkboxes when implementation completes |
| **Implementation code** | Source, tests, doc changes | agent (Wopal or fae) manually | One commit per completed Task, all in place before `complete` |

**Iron rule: scripts never touch project code, but manage their own infrastructure.** `flow.sh` commands never add, commit, merge, or push implementation code — code commits and the feature → integration merge belong to the agent. Worktree creation/cleanup and feature branch creation/deletion are dev-flow infrastructure operations managed by scripts.

**Implementation artifacts = one logical atomic unit.** Implementation code changes + Task Done checkbox + Agent Verification checkbox form one logical unit: code commits in the project repo (worktree), checkboxes are ticked in the space-repo Plan file. The two repos commit independently, but everything must be in place before `complete`. Checkbox/code divergence — ticking Done before code is committed, or reverting code after ticking — counts as not done.

## State machine

`planning → reviewing → executing → verifying → done`

| Command | Precondition | Post state | Plan operation | Code operation |
|------|---------|---------|-----------|----------|
| `plan` | — | `planning` | Script commits Plan | — |
| `submit` | `planning` | `reviewing` | Script commits Plan status | — |
| `approve --confirm` | `reviewing`/`planning` | `executing` | Script commits Plan status + worktree metadata | — |
| `complete` | `executing` | `verifying` | Script commits Plan status | **Dirty tree aborts** |
| `verify --confirm` | `verifying` | `done` | Script commits Plan status | — |
| `archive` | `done` | archived | Script commits Plan archive + worktree cleanup | — |

When the command order is invalid, go back to the correct order — never force a transition.

## Commit sequence

The full git commit sequence of a Plan (feature branch view):

```
1. plan / submit / approve     → script auto-commits Plan file (integration branch)
2. fae implements             → code commits on feature branch (worktree), one per completed Task
3. rook PASS                   → triggers next step
4. agent checks AC checkboxes  → space-repo commit of Plan file (checkboxes and code live in two repos, each commits its own)
5. flow.sh complete            → script commits Plan status → verifying (feature branch)
6. verify-switch → user validation → user actions + user authorization, no script commit
7. agent merges feature → integration branch → agent operation (feature branch NOT deleted; archive cleans up) ⚠️ Precondition: user has explicitly confirmed validation passed (or user chose scenario 3)
8. flow.sh verify --confirm    → script commits Plan status → done (integration branch)
9. flow.sh archive             → script commits Plan archive (integration branch)
```

**Common mistakes**: running `complete` before step 4 (code not committed → error); ticking Done before code is committed (checkbox/code divergence); skipping AC verification and jumping to complete.

## Core principles

1. **Plan first — for design-bearing work**: enter the Plan lifecycle before implementing features, enhancements, refactors, or contract changes. Plans must be created or located via `flow.sh plan new ...` — never hand-written. Bug fixes are the standing exception: they restore already-agreed behavior and are fixed directly on the trunk branch (see "When the lifecycle applies").
2. **Human authorization gates**: both `approve --confirm` and `verify --confirm` require explicit user authorization.
3. **Scripts never touch project code**: `flow.sh` commands do not commit implementation code, but manage their own infrastructure (worktrees, feature branches). `complete` aborts on a dirty tree.
4. **Plan path**: Plan files live in the space repo at `.wopal-space/plans/<project>/`; no Plan copy exists in the worktree. The Plan path given to fae must be the space-repo absolute path; fae edits that file to tick Done checkboxes and never touches Plan Status metadata.
5. **rook gate**: implementation review (before complete) must be delegated to rook; rook PASS is required to advance; **review budget: at most 2 rounds — the first review must list ALL findings in one report, one re-review at most, then the review closes** (see the review-budget section in df-plan-review). Plan quality is gated by the built-in `plan check` at submit — rook does not review Plans.
6. **Plan language and structure**: Plan body in the user's preferred language, section headings in English (matching the template). Never mix Chinese and English headings.

## Plan Task field requirements

Every Task must contain these fields in order — see `references/plan-guide.md`:

| Field | Required | Format |
|-------|----------|--------|
| Verification Intent | ✅ | AC#N; which acceptance entries this behavior group answers for |
| Behavior | ✅ TDD=true | Testable behavior spec, directly translatable into a failing test |
| Pre-read | ✅ | File path or N/A |
| Design | ✅ | Technical approach and constraints (intent stated clearly; not file-by-file dictates) |
| TDD | ✅ | true / false |
| Changes | ✅ | Numbered list (no checkboxes); entry 1 is always RED |
| Verify | ✅ | Executable command |
| Done | ✅ | Output summary + actually-touched files + 1 checkbox |

**Tasks are split by behavior group**: one Task = one cohesive Behavior set + a full RED→GREEN→REFACTOR + an independently runnable Verify. The three granularity questions are in the plan guide.

**Submit validation**: `submit` runs `plan check` automatically; no manual run needed.

## The two-beat AC

Agent Verification entries are completed in two beats — this is how outcomes stay pinned:

1. **Beat 1 (at Plan-writing time)**: each AC = behavioral criterion + pass standard. Criterion-style entries are legal (no guessing future test file names), but must be decidable — able to catch a bad implementation; anything that passes regardless does not count.
2. **Beat 2 (at implementation RED stage)**: the implementing agent turns each AC into a real command and **writes it back into the Plan in place**.
3. **complete hard gate**: a checked AC must carry a real command — a criterion-style AC cannot pass complete checked. Definition lives in the Plan; proof lives in the tests.

## Locating Plans

When the user mentions a Plan name (e.g. `155-enhance-dev-flow`), you **must** locate it via the script — **never** blindly `grep`/`glob`/`read` across the space.

- `flow.sh plan status <name>` — full Plan status: state machine position, linked Issue, worktree info
- `flow.sh plan list [--issue]` — browse all active Plans (`--issue` includes GitHub Issues)
- `flow.sh plan check <name-or-path>` — Plan quality validation (optional diagnostics)

## Verification discipline

Verification has three layers, each with its own owner and rules.

### Layer 1: Task Done (fae ticks immediately)

Each Task completes → run the Task's Verify command → on pass, **immediately tick** the Done checkbox and backfill the actually-touched files.

- The fae delegation prompt must include "tick the corresponding Task's Done checkbox and backfill actually-touched files when done"
- Never batch-tick at the end of a phase

### Layer 2: Agent Verification (Wopal verifies empirically)

After rook PASS, Wopal **must verify every AC empirically, one by one**.

Method: per the AC description, **run the command, check the output, confirm the result**. No ticking from memory or inference; no being rushed by `complete` errors.

**Re-verify after fixes**: rook returns REVISE/BLOCK → after fae fixes, ACs must be re-run — stale pre-fix results do not count.

All ACs pass → tick the Agent Verification checkboxes → commit the Plan file in the space repo (code already on the feature branch, see commit sequence step 4).

**Tick precondition under two-beat ACs**: by this point all ACs should carry real commands (beat 2). Finding a criterion-style AC means fae skipped the RED write-back — have fae write back the command, run it green, then tick.

### Layer 3: User Validation (user-own)

User Validation carries only items **the user must execute and observe by hand**; the checkbox belongs to the user and **agents never tick it**.

**Boundary iron rule** — before writing anything into UV, ask twice: (1) Can an agent verify this automatically? If yes, **UV is forbidden** — it goes to Agent Verification. (2) Must the user execute and observe it manually? If not, forbidden. Any automatable verification (tests/lint/typecheck/static checks/scriptable behavior) must not be pushed to the user.

**Environment completeness**: every scenario needs validation environment + launch command (user can copy-paste) + pass criteria (assertable, not "behavior unchanged" waffle) + failure feedback. If a needed mechanism is not yet documented in the project's AGENTS.md, add it to the project spec first, then reference it.

Agents may perform validation actions and show results, but must wait for explicit user confirmation. See `references/plan-guide.md`.

## Standard flow

### A. Planning

```bash
flow.sh plan new <issue> --type <type> --scope <scope> --slug <slug>  # Issue-driven (all three flags required, explicit)
flow.sh plan new --title "..." --project <name> --type <type>  # no Issue
```

Full command chain: `plan new → submit → approve --confirm → complete → verify --confirm → archive`.

**Plan directory**: `.wopal-space/plans/<project>/`.

**Naming contract**: Issue title is free text (loose type prefix optional, no length limit); Plan name is chosen explicitly by Wopal (`<N>-<type>-<slug>`, slug ≤ 20 chars, core nouns only); branches derive from the Plan name and are bounded (`<project>-<plan-name>`, truncate slug + 4-char hash past 55 chars); worktree dir = branch. See `references/plan-guide.md`.

### B. Plan review and submission

```bash
flow.sh sync <issue> --body-only    # sync three sections (Goal/Scope/AC) + | Plan | link row (mandatory after Plan content changes)
```

1. `flow.sh submit <issue>` (planning → reviewing; built-in `plan check`; no rook for Plans)
2. A Plan in `reviewing` can be revised directly — no `flow.sh reset` back to `planning`. Tell the user when done; no re-`submit` needed
3. After user approval: `flow.sh approve <issue> --confirm` (reviewing/planning → executing)

**⚠️ submit timing iron rule**: after writing the Plan, Wopal **must** immediately run `flow.sh submit <issue>` to reach `reviewing` (submit runs `plan check`) before inviting the user to review it. Before the Plan reaches `reviewing`, Wopal must not request review or approval in any form (verbal prompts, command-line suggestions, Plan displays). This is Wopal's autonomous obligation and does not depend on user reminders. Violation = serious dereliction.

Violation pattern: write Plan → skip `submit` → invite the user to "review / take a look at this Plan / can we start?" → after approval, discover the Plan is still in `planning`.

### C. Executing and approve modes

When the user approves a Plan, the agent must pick the correct mode from their intent:

| Mode | User signal | Approve command | Location & branch | Closing chain |
|------|-------------|--------------|----------------|------------|
| **Mode A: standard (default)** | "let's go" / "approved" / nothing special | `flow.sh approve <plan> --confirm` | New branch + worktree from main | merge to main → `verify --confirm` → `archive` |
| **Mode B: direct on main** | "no worktree" / "directly on main" / "no isolation" | `flow.sh approve <plan> --confirm --no-worktree` | Implement on main (no worktree, no branch) | `verify --confirm` → `archive` (skip merge) |
| **Mode C: evolving branch** | "continue in that previous worktree" / "keep the worktree" / "evolve on branch X" / "PoC, not shipping" | `flow.sh approve <plan> --confirm --existing-worktree <path>` | Reuse existing worktree + feature branch | `verify --confirm --keep-worktree` → `archive --keep-worktree` |

#### Mode C iron rules

- ⚠️ **Never substitute `--no-worktree` for `--existing-worktree`**: `--no-worktree` means direct-on-main; it clears Worktree metadata and misleads the agent into editing the main path — major pollution. Evolving mode must pass `--existing-worktree <path>`.
- ⚠️ **Closing must carry `--keep-worktree`**: this mode ships nothing and never merges to main. `verify --confirm --keep-worktree` skips merge checks and records the feature HEAD as Final Commit; `archive --keep-worktree` keeps the worktree and branch for later Plans.
- ⚠️ **Implementation commits go to the worktree's branch**: Base Commit is recorded as the worktree's current HEAD (the previous Plan's endpoint); all changes stack on that feature branch.

#### Execution flow

1. `flow.sh approve <issue> --confirm [mode-flags]` (per the mode table)
2. Delegate to fae (prompt: Plan absolute path + Done checkbox instruction + AC write-back instruction + target work path + implementation-freedom statement)
3. fae completes Task → Verify passes → immediately tick Done, backfill touched files, write back real AC commands, git commit (one per Task)
4. All Tasks done → Wopal **empirically verifies** every AC
5. ACs pass → tick checkboxes, commit the Plan file in the space repo
6. Delegate implementation review to rook (mandatory)
7. rook PASS → `flow.sh complete <issue>` (script commits Plan status → verifying)

**Delegation notes**:
- Implementation → fae; review → rook
- **Review budget in every rook prompt**: state it explicitly — "review budget: 2 rounds max; list ALL findings in this round (including borderline ones); no further rounds". First review must be exhaustive; the re-review (verify fixes + full re-sweep) is final
- **Context reuse**: after fae/rook finish, prefer `reply` to continue the session; never `finish` then re-spawn. Precondition: subtask context < 50%
- Reuse chain: fae IDLE → reply rook to review → rook REVISE → reply fae to fix → fae fix IDLE → reply rook to re-review → rook PASS → finish both tasks
- rook contract format in agents-collab; rook loads df-implement-review itself

`complete` hard gates: all Task Done ✓ + Agent Verification ✓ (with real commands) + rook PASS ✓ + implementation code committed.

**⚠️ complete timing iron rule**: after implementation commits + rook PASS, Wopal **must** immediately run `flow.sh complete <issue>` to reach `verifying` before entering user validation. Before the Plan reaches `verifying`, Wopal must not invite the user to validate in any form. This is Wopal's autonomous obligation. Violation = serious dereliction.

Violation pattern: code committed → skip `complete` → invite the user to "validate / accept / test" → after confirmation, discover the Plan is still `executing`.

### D. Validation (verifying)

After `complete` the Plan is `verifying`. `complete` prints the validation options and canonical-path git status; the agent must relay them fully and let the user choose. The agent never skips a scenario on its own.

#### Rework during validation is authorized work, not a state-machine violation

While a Plan is `verifying`, the user validates and **may legitimately ask for code changes, Plan changes, or both** — validation exposes problems, and fixing them is the normal closing loop. When that happens:

- **Code changes are made on the feature branch** (or the integration branch in no-worktree mode), committed there, and readied for the user to re-validate. Do not ask for a fresh approval cycle; the Plan is already approved.
- **Plan changes may touch Implementation, Tasks (add a Task for new work), Acceptance Criteria (add an AC for a new criterion), and User Validation scenarios.** Edit in place; after editing the mapped sections, run `flow.sh sync <plan> --body-only` to sync the three sections (`## Goal` / `## Scope` / `## Acceptance Criteria`) + the `| Plan |` link row into the Issue, preserving everything else. There is no re-`submit` and no re-approval gate — the state machine stays in `verifying`; `flow.sh verify --confirm` later records the final state.
- **New work discovered during validation follows the same gates as any other work**: implement it with the same TDD discipline, verify it empirically, and keep the code/checkbox coupling intact. The ACs that cover the new work get checked when they pass, not before.
- **The `approve` gate already happened.** Validation-stage authorization covers implementation and Plan edits inside the approved scope. If the user asks for a change that materially expands the Plan's goal or contract, say so and let them decide whether it belongs in this Plan or a new one.
- **Never reset the Plan to force a re-approval.** `flow.sh reset` is a destructive operation for explicit user request only — it is not a tool for agents to "go back and redo" when validation surfaces a fix. Fix in place, in `verifying`, and continue.

This is how the loop closes: implementation → review → validation → user-driven adjustments → confirm → done. The verification stage is a working stage, not a read-only one; treating every fix as needing a reset or re-approval is the failure mode to avoid.

##### Scenario 1: validate inside the worktree

Condition: worktree exists and the project runs/tests independently inside it (no path dependencies).
Flow: user validates at worktree path → merge → verify --confirm → archive.

##### Scenario 2: verify-switch to validation branch

Condition: project has path dependencies (layout requirements, runtime load paths, config locations) and must be validated at the canonical path (repo root).
Flow: agent runs `flow.sh verify-switch <issue>` (removes worktree + checks out feature) → user validates at canonical path → merge → verify --confirm → archive.

##### Scenario 3: merge first, validate after

Condition: user prefers to validate directly on the integration branch.
Flow: merge → user validates on integration branch → verify --confirm → archive.

Ownership note: scenario 3 is the user's choice; the agent never picks it alone. Absent a user signal, default to validating before merging.

##### Scenario 4: no worktree (`--no-worktree`)

Condition: `approve --confirm --no-worktree` — everything on the integration branch, no feature branch.
Flow: user validates on the integration branch → verify --confirm → archive.

##### Scenario 5: evolving-branch validation (`--keep-worktree`)

Condition: `approve --confirm --existing-worktree` (or a first Plan kept as exploration, not shipping).
Flow: user validates at the kept worktree path → `flow.sh verify <plan> --confirm --keep-worktree` (skip merge checks) → `flow.sh archive <plan> --keep-worktree` (keep worktree + branch for later evolution).

#### Branch lifecycle iron rules

- Branch creation: `approve --confirm` (script); deletion: `archive` (script)
- **The agent's only branch operation is merge, and only after explicit user authorization**: `git checkout <integration> && git merge <feature>`
- **Merge strategy**: prefer **squash merge** (`git merge --squash <feature>`) — compresses all feature commits into one, keeping fix-during-validation noise out of main history. Requires one manual `git commit` after. verify's tree-equality check supports squash natively. Use `--no-ff` only when the user explicitly wants commit history kept
- Agent never runs `git branch -d/-D`, never `git branch <name>`, never creates or deletes branches
- Worktree lifecycle is script-owned: `approve` creates, `verify-switch` or `archive` deletes

#### verify --confirm internals

The agent should know what the script does, for debugging:

1. State gate: Plan status must be `verifying`
2. User validation gate: User Validation checkbox must be checked
3. **Merge detection** (skipped in scenario 4), three levels, any hit counts as merged:
   - L1: ancestry check on the `Verification Commit` SHA written by `complete`: `git merge-base --is-ancestor <sha> <integration>`
   - L2: **tree equality** (squash-friendly): `git rev-parse <integration>^{tree}` == `git rev-parse <feature>^{tree}`. Content-level detection independent of branch refs. After a squash merge, main holds only a copy commit of the feature content — the feature tip is never an ancestor, but the trees are byte-identical. Holds for --no-ff / fast-forward too (L1 already hit)
   - L3: branch ref check (`git branch --merged` + remote + log --grep fallback)
   - No hit → error exit, telling the agent to merge first
4. **Final Commit recording**: after merge detection, the integration branch HEAD SHA is written to the Plan's `Final Commit`. Paired with the approve-time `Base Commit` it brackets the feature's impact (especially useful for reverts)
5. State transition: `verifying → done`, commit on the integration branch

#### Agent checklist

After `complete` the agent must:
- [ ] Relay the validation options and path status from `complete` output fully to the user
- [ ] Wait for the user to pick a validation mode and confirm it passed
- [ ] Merge feature → integration branch (scenarios 1-3; skip in scenario 4)
- [ ] Run `flow.sh verify <issue> --confirm`
- [ ] Run `flow.sh archive <issue>`
- [ ] Close the gaps the Plan delivered: remove each Gap entry whose Plan has reached `done` from the target project's `GAPS.md` (removal, not checkbox-ticking — a gap entry disappears when closed; commit in the project repo)

The agent must not:
- [ ] Merge or verify --confirm without user confirmation
- [ ] Create or delete any branch
- [ ] Delete the worktree (verify-switch and archive own that)
- [ ] verify --confirm without merging (except scenario 4)

### E. Done

```bash
flow.sh verify <issue> --confirm
```

Preconditions: Plan status = `verifying`, User Validation checkbox checked.

Worktree scenarios (1-3) also require the feature branch merged; the script detects it via three levels (Verification Commit SHA → tree equality → branch ref). Squash merges (`git merge --squash`) are natively supported — tree equality recognizes them even when the feature tip is not an ancestor.

verify --confirm records `Final Commit` (post-merge integration HEAD) into Plan metadata, closing the loop with the approve-time `Base Commit`.

The script commits a Plan-only commit on the integration branch (`verifying` → `done`).

Reaching `done` closes the gaps the Plan's Gaps column names. In the same closing pass, the agent removes those Gap entries from the project's `GAPS.md` — the file is a live tracker of open divergence only, so closed entries are deleted rather than ticked; if the removal empties the file, the file itself goes. The change commits in the project repo.

### F. Archive

```bash
flow.sh archive <issue>
```

Precondition: Plan status = `done`. The script archives the Plan, cleans the worktree, updates Issue links.

## Human authorization gates

| Command | User signal |
|------|---------|
| `approve --confirm` | "approved", "let's go", "可以开始" |
| `verify --confirm` | "validation passed", "looks good", "验证通过" |
| `reset` | "reset", "重置" |

`submit` needs no user authorization — the agent runs it right after writing the Plan; submit runs `plan check` itself. `approve` without `--confirm` errors out, pointing to `submit`.

## Branch ownership

| Stage | Branch | Committer | Content |
|------|---------|--------|------|
| `planning` / `submit` / `approve` | integration branch | script | Plan file status changes |
| `approve` (Base Commit) | integration branch | script | Records integration HEAD into Plan `Base Commit` (implementation baseline) |
| `executing` (implementation code) | feature branch | agent | Implementation code (one commit per Task); checkboxes commit independently in the space-repo Plan file |
| `complete` | feature branch | script | Plan status → verifying + Verification Commit SHA |
| `verify --confirm` | integration or feature branch | script | Plan status → done (three-level merge detection, squash supported) + Final Commit |
| `agent merge feature → integration` | integration branch | agent | Code merge (**feature branch not deleted**; squash supported) |
| `archive` | integration branch | script | Plan archive + worktree removal + feature branch deletion |

**--no-worktree mode**: no feature branch; everything on the integration branch.

## Delegation rules

| Principle | Notes |
|------|------|
| Prefer `wopal_task` | Always prefer `wopal_task` when delegating; built-in Task only as fallback |
| Pre-delegation checks | Load the "delegation" memory, verify paths (space-root-relative), confirm project context |
| Active Plan path | Delegation prompts use the space-repo Plan absolute path (no Plan copy in worktrees) |
| Done checkbox instruction | fae prompts must include "tick the corresponding Task's Done checkbox + backfill actually-touched files" + "write real commands back into the ACs at the RED stage" + "git commit after each completed task" |
| Dirty-tree handoff failure | `complete` aborts on a dirty tree → have fae commit and retry |
| **Delegation boundary** | Plan Task → delegate to fae; tiny single-file changes → do it directly |
| **Strong dependencies** | Tasks with tight logical coupling go to one fae as a group — never split into context loss |
| **rook outside dev-flow** | In conversational mode, ask the user before delegating rook; inside dev-flow, review runs automatically |
| **Reply-reuse first** | After fae/rook finish, fixes and re-reviews must `reply` the original task; never `finish` then re-spawn. Precondition: context < 50%; above that, finish and re-spawn |

## Never do this

- **Route an ordinary bug fix through the Plan lifecycle** — fixes restore already-agreed behavior; implement and verify them directly on the trunk branch. Only an exceptionally complex bug or an explicit user request justifies an Issue/Plan carrier. Wrapping every fix in `plan new → submit → approve` is the failure mode this rule exists to stop
- **Bypass dev-flow with manual operations for design-bearing work** — Issue/Plan-driven tasks must use the `flow.sh` chain
- **Calling `gh issue create` directly** — must go through `flow.sh issue create`; the script locates the space repo via `detect_space_repo`, no `--repo` needed or allowed. Direct `gh` puts Issues in the wrong repo = serious dereliction
- **Manual `gh issue list`** — must use `flow.sh issue list`; same wrong-repo risk
- **Manual `gh issue view`** — must use `flow.sh issue view <number>`; same wrong-repo risk
- **Skipping rook review before complete** — implementation review is a mandatory gate
- **Manual `plan check` then submit** — redundant; `flow.sh submit` already runs `plan check`
- **Skipping `submit` before user review** — the Plan must reach `reviewing` first, or approval cannot proceed to implementation
- **Forcing complete after rook BLOCK** — revise and re-review; **review budget: 2 rounds max** (first review lists ALL findings; one re-review; then the review closes — after that, report to the user, who decides whether to start a fresh review)
- **Re-spawning rook for re-review** — after fae fixes, `wopal_task_reply` the original rook task; a fresh session loses the review context and wastes tokens
- **Checkbox/code divergence** — no ticking before the code is committed; no code revert after ticking. Both must be in place before `complete`
- **Ticking ACs without actually verifying** — run commands and check outputs; ticking from memory = serious dereliction
- **Ticking criterion-style ACs past complete** — the AC must have its real command written back (beat 2) before it can be checked; the script blocks command-less checked entries
- **Being rushed by `complete` errors into back-ticking** — verify empirically right after rook PASS, not at `complete`
- **Ticking User Validation on the user's behalf** — that checkbox belongs to the user
- **Leaving closed gap entries in `GAPS.md`** — a Plan reaching `done` closes its Gaps; delete the entries instead of ticking them, and remove the whole file when the last gap goes
- **Pushing automatable verification to the user** — UV only holds items agents cannot verify and the user must observe; tests/lint/typecheck go to Agent Verification
- **UV scenarios without a launch command** — every scenario needs a copy-pasteable command and assertable criteria; document missing mechanisms in the project spec first
- **grep/glob for Plans** — use `flow.sh plan status <name>`
- **`approve` without `--confirm`** — errors out; use `submit`
- **Resetting a Plan to dodge a fix or bypass re-approval** — `flow.sh reset` is destructive and reserved for explicit user request only. Validation-stage fixes (code and Plan edits) proceed in place while the Plan stays in `verifying` — see section D. Never reset to "redo" or to force a fresh approval cycle
- **Removing the worktree before verify-switch** — the script sequences it (remove then checkout); the agent never does it manually
- **Deleting the feature branch after merge** — `archive` deletes it; `verify --confirm` detects merges by SHA, unaffected by branch deletion
- **Creating or deleting branches manually** — the script owns the lifecycle: `approve --confirm` creates, `archive` deletes. The agent's only branch operation is merge, after explicit authorization
- **Deleting worktrees manually** — `verify-switch` or `archive` owns that
- **Skipping `complete` before inviting user validation** — after commits + rook PASS, run `flow.sh complete` to reach `verifying` first. Inviting acceptance before `verifying` = serious dereliction
- **Cleaning up undeclared resources at archive** — archive touches only the Worktree/branches declared in Plan metadata. Similar names ≠ same ownership. Deleting a user's active branch = serious dereliction
- **Loading git-worktrees skill inside dev-flow** — worktree lifecycle is built into `flow.sh approve` / `flow.sh archive`; never load git-worktrees or run worktree commands manually
- **Reading "commit it" as "run the whole closing sequence"** — every state transition (merge/verify/archive) needs its own explicit instruction; do not infer the full closing authorization from one "commit it" |

## References

| File | Purpose |
|------|------|
| `references/commands.md` | Full command parameters and usage patterns |
| `references/plan-guide.md` | Detailed Plan authoring: contracts, two-beat ACs, behavior splitting, TDD, AV/UV rules, Metadata, delegation prompts, naming, branch ownership |
| `references/issue-guide.md` | Issue authoring: title format, body structure, sync rules |
| `references/troubleshooting.md` | Error handling, edge cases |