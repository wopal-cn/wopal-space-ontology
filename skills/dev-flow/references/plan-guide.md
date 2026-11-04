# Plan Authoring Guide

A Plan has two kinds of readers: **the human reviewer** (must understand what you want) and **the implementing agent** (must be able to build it).

So a Plan's job is to state three things: **what is wanted (behavior)**, **what counts as done (acceptance)**, and **what must not be touched (contracts and boundaries)**. Which files to change and how to organize code internally are decisions that can only be made well during implementation, against the real code — written into a Plan they become straitjackets and guesses.

One line: **pin the contract surface, open up the implementation surface.**

## Plans and multi-Plan organization

- **One Plan = one implementation**: it links 0..1 Issue and must have exactly one Target Project. When created from an Issue, the only `project/*` label may be inferred; zero or multiple project labels require explicit `--project <name>`.
- **Several Issues but one implementation**: run `issue merge --into` first, then author one Plan. Multi-Issue Plan metadata is not supported.
- **One confirmed overall delivery goal requiring several implementations**: create separate Plans, then organize them in `.wopal-space/plans/active-graph.json` `groups` as each one is submitted. Never group solely because they share a project, Phase, or time period. Express implementation order only with Graph `edges`.
- A Graph group is not a Plan. It owns no Issue, lifecycle state, Acceptance Criteria, worktree, or Delivery. It records only the overall goal, currently submitted members, and responsibilities. Each Plan belongs to at most one group; groups do not nest. Once the user confirms the organization, the Agent keeps membership in sync mechanically. See `active-plan-graph.md`.
- Current implementation relationships between Plans do not belong in the Plan itself. Active Plan Graph owns the current nodes, hard dependencies, and groups.

Examples:

```bash
flow.sh plan new 42 --project api --type feature --slug endpoint
flow.sh plan new --project api --type feature --slug local-task
```

## Writing style

Write Plan content in the user's preferred language while keeping template headings and field names unchanged. Prefer plain, direct language that a human reviewer can understand without engineering context. Avoid jargon, abbreviations, and abstract technical wording when ordinary words are enough.

Use exact technical terms where precision matters — especially `Design Source`, `Interface`, `Constraints`, commands, identifiers, types, and protocol names. When a non-obvious term is unavoidable, explain its practical meaning on first use. Do not repeat the same fact across multiple fields.

## A Plan must come from formal design

For project/phase work, use only DESIGN/sub-DESIGN documents with `Status: Active` as design facts before splitting Tasks. Every Task uses **Design Source** to point to the concrete section, decision, or contract it implements; list multiple sources when needed. `N/A` is only for simple work with no project and no design basis.

`Draft` / `Proposed` designs may appear only in Research Findings / References as explicitly unsettled forward-looking material. They never belong in Design Source and must not define Behavior, Key Interfaces, ACs, or implementation targets.

Before approval, fix the Plan when it disagrees with Active DESIGN; if no Active design basis can be found, the Plan is not ready to submit. If the Active DESIGN itself conflicts with the user's goal, do not edit design on your own — ask the user to decide the design target. After approval, substantive changes to either the Plan or design require user confirmation.

## How to define contracts: Key Interfaces

`Technical Context > Key Interfaces` is the external-contract section. **Entry is a red line.**

**What belongs**: interfaces that cross modules, cross projects, or face outward — CLI commands, API endpoints, events, schemas, exported types. **What does not**: module-private functions and internal helper types. Let those in and the section degenerates into another file-by-file manifest — the rigidity returns.

**How precise**: signature + error codes + key semantics (idempotency, versioning, failure behavior). Write them in the project's own language — TS interface, Python type, JSON Schema all work, as code blocks.

**One criterion**: if a downstream consumer could write their calling code and compatibility tests from this section alone, the contract is defined. If not, it isn't finished.

**Binding force**: if implementation reveals that a signature, error code, or key semantic must change, stop and return to the controlling workflow. Continue only if the issue can be resolved inside the existing DESIGN + approved Plan; a Plan or design change requires user confirmation through the controller. Write N/A when the Plan has no shared or cross-Task contract.

Keep this top-level section for contracts shared across Tasks or important across module/project boundaries. A contract owned only by one Task belongs in that Task's `Interface`; if a Task uses a top-level Key Interface, reference it instead of copying it.

**Example**:

```typescript
/** Registers a Plan execution. Repeated calls with the same execution ID
 *  return the same result; no double execution. */
interface BeginExecution {
  request:  { executionId: string; planId: string }
  response: { status: 'started' | 'already-running'; revision: string }
  errors:
    | 'APPROVAL_EXPIRED'   // approval no longer valid, re-review needed
    | 'DEPENDENCY_PENDING' // upstream not delivered
}
```

## How to pin outcomes: the two-beat AC

You cannot write future test commands at Plan time (the test files do not exist yet) — that is reality, not a defect. The two-beat scheme pins outcomes by separating the *right to define* from the *right to prove*:

**Beat 1 (at Plan-writing time)**: each AC = behavioral criterion + pass standard. Write "what observable behavior the system shows, and what you see when it passes". Criterion-style entries are legal — no guessing future file names.

There is exactly one standard for a good beat-1 entry: **can this AC catch a bad implementation?** Ask yourself: if the agent cuts corners or gets it wrong, will this criterion fail? An AC that passes no matter what ("feature works", "build passes") is decoration and must be rejected during authoring/review.

**Beat 2 (during implementation and controller acceptance)**: the implementer determines the real verification command while implementing/Verifying and reports the command and result to the controller; after the Task passes controller acceptance, the controller **writes it back into the Plan in place**. The implementer does not edit the Plan.

At `complete`, the script only checks that Agent Verification checkboxes are actually complete. Whether the command/evidence is meaningful is a controller and review responsibility, not something a regex should guess. Definition lives in the Plan; proof comes from the controller actually running the verification.

**Evolution example**:

```markdown
Beat 1 (at Plan-writing time):
1. [ ] Runner consistency tests all green, no interactive hang in the background
2. [ ] Repeated begin with the same execution ID returns the same result, no double execution

Beat 2 (after controller acceptance of the Task):
1. [ ] `python -m pytest tests/runner/consistency/ -v` all green (interactive hang covered by test_no_stdin_hang)
2. [ ] `python -m pytest tests/runner/test_idempotent_begin.py -v` all green

During final Agent Verification, the controller re-runs these commands and ticks them only after they pass.
```

## How to split Tasks

One Task should represent one cohesive outcome or behavior group and have an independently runnable `Verify`. Do not force every Task into TDD; TDD is chosen from the nature of the change.

Use three checks when splitting:

1. Does the Task describe one coherent outcome instead of a file list?
2. Does the work fit one implementation context?
3. Can its result be verified independently?

`Pre-read` carries forward useful investigation already done by the Plan author: list the files/docs the implementer should read first. It is not a predicted edit list. Plan-level `Affected Files` gives coarse impact; `Done` records what was actually touched after acceptance.

### Task-local Interface and Constraints

- `Interface` is optional. Use it for a contract this Task adds, changes, removes, or must preserve: API/CLI shape, event/schema, exported type, or an important module boundary. Shared/cross-Task contracts belong in top-level `Key Interfaces`; reference them from the Task instead of duplicating them.
- `Constraints` is optional. Use it only for hard implementation limits not already clear from `Design Source`, `Behavior`, or `Interface`.
- Do not add a generic `Design` field just to restate upstream design or Behavior.

## TDD decision rule

TDD is a behavior-design tool, not a tax on every code change. Set `TDD: true` only when all three are true:

1. the Task adds, fixes, or intentionally changes observable behavior;
2. that behavior can be stated as an automated assertion before implementation;
3. the test remains useful as regression protection after the Task is done.

Typical `TDD: true` work includes business rules, validation/parsing/data transforms, state machines, API/CLI behavior, and reproducible bug fixes.

Use `TDD: false` when RED→GREEN would add little or no design value, including pure behavior-preserving refactors, removal of obsolete internal code/modules, move/rename/import cleanup, config/build/CI/metadata/dependency work, UI layout/style changes, exploratory work, or glue/wiring better checked by integration/smoke validation.

`TDD: false` never means “no testing.” Choose verification that matches the risk: existing regression tests, characterization tests, build/typecheck/static checks, integration tests, smoke tests, or user validation as appropriate.

**Deletion rule**: when removing obsolete behavior/code, remove tests whose only purpose was to assert that deleted behavior. Keep or update tests that still protect surviving contracts. If deletion creates a new observable behavior (for example an old command must now be rejected), TDD may apply to that new behavior — never to the fact that source code was deleted.

**Refactor rule**: pure refactoring keeps existing behavior and tests green. If the legacy area lacks a safety net, add characterization/regression tests for current behavior before refactoring; do not manufacture a fake RED test for unchanged behavior.

Avoid trivial or implementation-coupled tests that add maintenance cost without protecting a meaningful contract.

### Task example

```markdown
**Verification Intent**: AC#1, AC#2

**Design Source**: `projects/example/docs/DESIGN.md#validation-contract`

**Behavior**:
- Valid email is accepted.
- Empty or malformed email is rejected without throwing.

**Pre-read**: `src/validators/pattern.py`

**Interface**: `valid_email(value: str) -> bool`

**Constraints**: Reuse the existing validation style; do not change caller error handling.

**TDD**: true

**Verify**: `python -m pytest tests/ -v`

**Done**:
Actually touched files: (backfilled after controller acceptance)
- [ ] Controller accepted this Task after Verify passed
```

## Task field quick reference

| Field | Required | Meaning |
|------|------|------|
| **Verification Intent** | yes | Which Agent Verification entries this Task is responsible for |
| **Design Source** | project/phase Plans | Authoritative Active DESIGN `path#heading`; simple no-design work may use N/A |
| **Behavior** | yes | Observable outcome in plain language; technical precision only where needed |
| **Pre-read** | yes | Files/docs the Plan author already found important to read first; N/A if none |
| **Interface** | optional | Task-local contract added/changed/removed or explicitly preserved |
| **Constraints** | optional | Hard implementation limits not already stated elsewhere |
| **TDD** | yes | true only under the TDD rule above; false should state the short reason |
| **Verify** | yes | Real command(s) that verify this Task |
| **Done** | yes | Controller-owned completion checkbox + actual touched files |

## The Agent Verification / User Validation boundary

### Agent Verification (everything automatable)

Everything verifiable automatically goes here: tests, lint, typecheck, static checks, scriptable behavior assertions. Two-beat scheme above. Cross-Task verifications go at the end of the list, marked "(cross-Task)".

Purely descriptive entries are forbidden: ❌ "build passes" / "feature works" / "no errors" — criteria must be able to catch a bad implementation.

### User Validation (only what the user can verify)

Carries only items **the user must execute and observe by hand**: UI/UX, interaction feel, business flows, visual confirmation.

**Mandatory double question before writing into UV**:

1. Can an agent verify this automatically? → Yes: **UV forbidden**; put it in Agent Verification
2. Must the user execute and observe it manually? → No: **UV forbidden**

**Four mandatory elements per scenario**:

| Element | Requirement | Bad example (fails) |
|---|---|---|
| Validation environment | Reference the mechanism section in project specs or the script entry | Just "start the app" |
| Launch command | One real command the user can copy-paste, env vars included | "Run the command and observe" |
| Pass criteria | A specific, assertable observable result | "Confirm behavior is correct" |
| Failure feedback | What the user provides on failure (log path, diff output) | Missing |

If a mechanism the validation depends on is not yet documented in the project's AGENTS.md, add it to the project spec first, then reference it — never let it appear once in a Plan and be lost.

**Correct scenario example**:

```markdown
#### Scenario 1: onboarding flow regression-free
- Goal: Confirm each wizard step behaves as before the change
- Validation environment: AGENTS.md "validation mechanisms" section (ELLAMAKA_TEST_ONBOARDING sandbox mode)
- Precondition: sandbox mode (WOPAL_HOME=/tmp/wopal-onboarding-sandbox), no build needed
- Launch command: `ELLAMAKA_TEST_ONBOARDING=1 ./scripts/dev.sh desktop`
- User Actions:
  1. Walk the onboarding flow: system check → install CLI → configure AI provider
  2. Watch prompts and status at each step
- Pass criteria: steps advance normally, no new errors, no `[object Object]` text in the UI
- Failure feedback: attach `logs/dev/<scope>/ellamaka-dev-desktop.log` and `git diff -w` output

- [ ] The user has completed the validation above and confirmed the results
```

## Metadata rules

`Product` and `Phase` items are always present in a Plan — creation renders both lines even when empty. The pair is atomic: a phase-linked plan declares both values, an unlinked plan leaves both empty. Values come from the Issue body or the `--product`/`--phase` flags at creation (flags override the body); a half-declared pair is rejected at creation, and `check_doc_plan` gates item presence and pair atomicity at submit/approve. These fields describe stable product/phase traceability only; they do not drive Plan status synchronization or execution ordering.

`Project Path`, `Project Type`, `Target Project` are looked up from the space's `STRUCTURE.md`:

1. Determine the domain from the code paths involved (projects / contents / ...)
2. Match path/type/repo in `STRUCTURE.md` frontmatter or tables
3. Fill in the mapping:

| STRUCTURE.md type | Project Type | Project Path example |
|---|---|---|
| `projects` | projects | `projects/<name>/` |
| `contents` | contents | `contents/<name>/` |

Common mistakes: treating a subdirectory (e.g. `projects/<name>/packages/app/`) as the project root — use the repo root.

## Plans, phases, and Gaps

Plans add no Gap-related metadata fields. The phase–Gap relationship is carried naturally by product phase documents; a Plan only states its phase in Goal or Context.

- **Plan phase**: the `Phase` metadata field (declared at creation from the Issue body or `--product`/`--phase`). A phase splits into multiple Plans by scope area; its `Related Plans` table is stable scope/gap/project traceability and does not copy Plan state.
- **Plan execution relationships**: Plan-level ordering, blockers, and current implementation sequence belong only to the Active Plan Graph. A Phase may describe capability-level ordering where inherently necessary, but never maintains a Plan DAG.
- **Archive boundary**: `archive` no longer writes Plan status into the Phase document. A Plan enters the Active Graph after its first successful `submit` and stays there until `archive` succeeds; `done` is only a workflow state and does not remove Graph membership. The Phase does not participate in that lifecycle synchronization.
- **Unlinked Plans** do not need `Product`/`Phase`, and no Phase row is invented merely to display status or orchestration.
- **Gaps**: the single source of truth is the project's `GAPS.md`. Plans reference the Gap identifier they close (e.g. `CLI-G3`) in Goal or Context without copying the description. When a Plan reaches `done` and its Exit criteria hold, the entry is removed from `GAPS.md` (the number retires, never reused).

## Delegation Strategy

Assign work from the agents currently available using capability fit, Task dependencies, and parallelism; the Agent column contains only the specific agent name.

## Implementation handoff

The controller may implement directly or delegate. Whoever implements should load `df-implement`; do not duplicate that skill inside a handoff prompt.

For a delegated Plan Task, pass only the context needed to do the work:

    ## Plan
    Read the Plan and execute Task <N>:
    <absolute path to the Plan document>

    ## Context
    - Working path: <project/worktree absolute path>
    - Baseline: <Delivery Base Commit from Plan Metadata>
    - Follow project/module AGENTS.md

    ## Report
    Return: Goal / Accomplished / Files / Verified / AC Commands / Status

The Task already carries `Design Source`, Behavior, Pre-read, any task-local Interface/Constraints, and Verify. A delegated implementer returns only implementation evidence: actual touched files, Verify commands/results, and the real commands corresponding to relevant ACs; **do not commit code, edit the Plan, or tick Done/AC**. The controller then inspects the actual diff and independently runs Task Verify; failure goes straight back for repair, while success is the point at which the controller updates Plan evidence and creates the Task's implementation commit.

If the implementer is also the controller, keep the same order: implementation → controller check → Plan update/commit. Conflicts return to dev-flow handling. With delegated implementation, conflicts return to the delegator. `df-implement` owns STOP/report format; dev-flow owns acceptance and any escalation to the user.

## Validation and advancement

`plan check` is intentionally mechanical. It checks lifecycle structure needed by the workflow: valid `Status`, Product/Phase pairing, the 0..1 Issue contract, a Target Project and usable Project Path, and authoring residue such as HTML comments / known template placeholders. It does **not** judge design quality, TDD choice, Behavior wording, Interface/Constraints, or User Validation prose; those belong to authoring/review.

`complete`/`verify` only gate completion state: Task Done, Agent Verification, and User Validation checkboxes must be completed where those sections exist.

- `submit` / `approve` run `plan check` automatically; do not repeat it manually.
- `submit` moves the Plan into `reviewing`; only then ask the user to review it.
- Run `approve --confirm` only after the user explicitly approves the current Plan; if validation blocks it, fix the Plan and retry.

## Plan naming rules

The Plan name is the authoritative identifier used to derive feature branches. Names must be lean — Issue titles are free text; Plan names and branch names must be short.

### Naming structure

```
<issue_number>-<type>-<slug>     # Issue-driven
<type>-<slug>                    # no Issue
```

- `type` uses standard values (feature/fix/enhance/refactor/docs/test/chore/perf), fully spelled
- No `scope` segment — scope already shows up in `--project` and the slug

### Finding a Plan by Issue

Anywhere a lifecycle command takes a `plan-id`, an Issue number works. Resolution order is fixed:

1. **Filename prefix** — `<issue_number>-*.md`; a hit wins immediately.
2. **Metadata lookup** — when the filename carries no number (Plan created first, Issue linked later), read the single `- **Issue**: #N` field. Multi-Issue metadata is invalid and is not a compatibility lookup path.
3. **Active first** — when a number matches several Plans, archived Plans under `done/` are ignored; only active Plans are considered.

If two active Plans still match the same number, the command **fails loudly and lists the candidates** rather than guessing. Re-run with the Plan name; do not rename the Plan and do not create another one:

```bash
flow.sh plan status <plan-name>
```

> The Plan name derives the feature branch — renaming it later orphans the worktree and branch, and a duplicate Plan leaves one Issue with two progress records.

### Slug rules

- slug = **1-2 core nouns**, kebab-case, **≤ 20 chars**
- Drop verb phrases and articles; keep the noun core
- Truncate or rewrite when too long; never copy the issue title

| Verbose (forbidden) | Lean (target) |
|--------------|--------------|
| `implement-multi-space-chat-projector-sync` | `chat-projector-sync` |
| `add-skills-remove-command` | `skills-remove` |
| `support-handling-expired-tokens` | `token-expiry` |

### Names must be understandable

A legal name is not enough — the reader must grasp the work from the name alone. Lean and understandable are two separate checks:

- The name states **what the work does to its target**, not an abstract slogan. Prefer concrete nouns over vague ones: `platform-sdk-release`, not `platform-delivery`; `host-env-fix`, not `foundation-work`.
- Avoid words that carry no information (`misc`, `foundation`, `delivery`, `support`). If the name would still fit a completely different Plan, it is too vague.
- Rewrite a hard-to-understand name **before first submit**; after submit the branch-derived name is frozen, and the group `title` or Plan description carries the explanation instead.

### What is enforced

The name is not a convention you are trusted to follow — it derives the feature branch, so the CLI checks it:

| Where | Checks | Applies to |
|---|---|---|
| `plan new` | full contract: ASCII kebab-case, type from the standard set, slug ≤ 20 | every new name |
| `plan check` | the same, minus the slug cap | any Plan it is pointed at |
| `submit` / `approve` | via `plan check` | every Plan passing a lifecycle gate |

The slug is always given explicitly with `--slug` — never derived from a title, which is free-form and often long, and often not English at all. That is why `--type` and `--slug` are both required in every mode.

`fix-dsh-pr-102` is a legal name — `dsh-pr-102` is simply the slug. There is no scope slot, so nothing is "extra" in it.

### Existing Plans: no retroactive renaming

Plans created before this contract carry a scope-like segment and slugs over 20 chars. They are **not renamed, and not rejected**:

- `plan check` and the lifecycle commands enforce only the character set on them, not the slug length.
- Their feature branch is already derived from the current name; renaming mid-flight would orphan the worktree and the branch.
- Historical Plans in `done/` are history and are not touched at all.

Only creation is strict. This keeps the contract honest — one rule for what gets created — without turning a naming migration into a blocker on work already in progress.

### Plan directory rules

- New Plans must be created or located via `flow.sh plan ...`; never hand-write files
- `--project` is a required parameter
- All projects live under `.wopal-space/plans/<project>/`

## Branch naming rules

Feature branches derive from the Plan name and must be bounded — no unbounded concatenation:

```
<project>-<issue>-<type>-<slug-truncated>
```

Past 55 chars total, truncate the slug and append a 4-char hash:

```
<project>-<issue>-<type>-<slug-head>-<hash4>
```

Worktree directory = branch. The branch name carries "unique and mappable back to the Plan" — it is not a full-text copy of the Plan name.

## Branch ownership

| Stage | Branch | Plan status | Notes |
|------|---------|----------|------|
| `planning` | integration branch (main or space/<name>) | `planning` | Plan baseline committed on the integration branch |
| `approve --confirm` | integration branch → create work branch | `executing` | Freeze Delivery metadata, commit executing + Worktree metadata, then create the worktree |
| Implementation (executing) | feature branch | `executing` | Implementation happens in the feature branch's worktree |
| `complete` | feature branch | `verifying` | Plan-only commit of the active Plan (dirty implementation tree aborts) |
| User validation | feature branch | `verifying` | The user validates on the feature branch |
| `integrate --confirm` | work branch → integration branch | `verifying` | Default squash creates one formal commit using the frozen `Commit Subject`; records Verification/Integration Commit identities |
| `verify --confirm` | integration branch | `done` | Checks the recorded Delivery commit, then makes the Plan-only done commit |
| `archive` | integration branch | archived | Moved to done/, worktree cleaned up |

**Plan-only commit principle**: lifecycle scripts commit only Plan status changes, never implementation code. The controller creates each Task's implementation commit only after controller acceptance; delegated implementers do not commit. Scripts abort on a dirty implementation tree rather than committing implementation code themselves.
