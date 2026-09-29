---
name: ontology-evolution
description: |
  Ontology capability evolution workflow. Covers both halves of the work: writing evolution proposals out of lived experience — session errors, user corrections, lessons and fixes recalled from memory — and landing an approved proposal into the ontology safely (isolated implementation, validation, archive). Proposals are usually drafted by Maka, whose core mission is that analysis; Wopal may write them too, and Wopal orchestrates the landing process. Fae lands the change, Rook audits it; approval, validation, and delivery belong to the user.

  MUST load when:
  - Distilling a session's lessons, errors, or user corrections into lasting capability
  - Deciding where a piece of knowledge belongs (space memory vs type assembly vs central pool)
  - Producing an evolution proposal for user approval
  - Auditing a candidate capability for project-specific contamination before it enters the pool
  - Advancing an evolution proposal through its stage machine, or checking an evolution's status
  - Implementing a change to the ontology's own capabilities (skills, rules, agents, commands, plugins, assembly)
  - Creating, updating, distributing, or contributing ontology capability assets in a space
  - Any "evolution proposal / 进化提案 / evolution stage / capability evolution" request

  Object test: ontology capability assets (this space's own skills, rules, agents, commands, plugins, assembly, docs/evolutions) -> this skill. Code repositories under `projects/` -> dev-flow, never this one.
---
# ontology-evolution

Turn lived experience into lasting capability — and land that improvement without corrupting the ontology.

Everything meets at one artifact: **the evolution proposal** — a file under `docs/evolutions/` that states what should change, why, and how it will be verified. Writing proposals and landing them are the two parts of this workflow; landing always waits on explicit user approval.

## Who does what

| Role | Does | Never does |
|------|------|------------|
| **Maka** | Core mission: analyzes session errors, user corrections, and lessons/fixes remembered from memory; writes and refines evolution proposals under `docs/evolutions/` | Touch a capability asset, run the landing workflow |
| **Wopal (the orchestrator)** | May also write proposals. Orchestrates the landing end to end: accepts a proposal on the user's approval, plans and delegates the work, verifies each task and backfills its record, commits per task, drives the stage transitions and the user gates, through to archive | Implement assets by hand |
| **Fae** | Lands the change — edits the capability assets inside the isolation worktree | Commit; edit the proposal; move the proposal's stage |
| **Rook** | Reviews the deliverable — the implementation review — before the user is invited to validate | Fix anything |
| **User** | Approves a proposal before landing starts; picks the validation form and validates; holds the integration gate; decides delivery | — |

A proposal is never its own implementation authorization: every proposal, from whoever, waits for the user's approval. Past that gate, safety comes from mechanics — isolation, named staging, visibility checks — not from trust.

---

# Writing a proposal

The point is not to archive what happened; it is to change the capability so the same situation goes better next time.

## Sources worth watching

| Signal | Looks like | Usually means |
|--------|------------|---------------|
| Session error | A failure exposes a wrong assumption | A guardrail is missing |
| Repeated correction | The user corrects the same behavior more than once | A rule is missing or unclear |
| Remembered lesson | Memory holds a lesson, workaround, or fix that no capability carries yet | It deserves to live in an asset |
| Wasted effort | The same helper or approach gets rebuilt | A capability should be extracted |
| Effective pattern | Something worked notably well | Worth preserving so it recurs |

Routine completion is not a lesson. Look for the moment where the behavior should have been different.

## Strip the specifics first

- Absolute paths, project / product / client names, business terms that only matter here → generic wording or nothing
- Session ids, timestamps, commit hashes → gone

The test: a reader who has never seen this space can still understand and apply the lesson.

## Decide where it belongs

| Tier | Destination | Fits when |
|------|-------------|-----------|
| **Space-private** | `.wopal-space/memory/` or the project's `AGENTS.md` | It only holds in this space / this project |
| **Type-specific** | `config/types/<type>.yaml` assembly, or type-scoped assets | It holds for every space of this type, not for others |
| **Public core** | The central pool (`agents/`, `skills/`, `rules/`) | It is true for any space of any type |

Ask in order: does it hold in a different space? For a different project of the same type? For any space at all? A "maybe" is not a "yes" — when unsure, place it lower. A local lesson can be promoted later; a polluted pool is hard to clean.

## Write it

`wopal space evo new "<title>"` creates `docs/evolutions/<name>.md` from `templates/proposal.md` at `Stage: draft`. The template is the single source of the proposal's shape — fill every section; unreplaced placeholders are refused at `accept`.

- Write the proposal document in the user's preferred language; the template's headings and field labels stay as they are.
- Anchor every claim in evidence: a session fact, an error, a user correction, a code location (`file:line`). Mark unverified statements as unverified.
- Few and strong beats many and weak. One analysis may yield several candidates — one proposal per coherent change.

## Handoff

A proposal on disk is waiting for the user to read it; its author may keep refining it while it stays a proposal. The user's approval starts the landing stage, which Wopal orchestrates.

---

# Landing an approved proposal

The wopal CLI enforces the landing discipline — refusal before the first write, named staging, isolation and visibility checks. What follows records what the CLI cannot enforce: the roles, the user decision points, and the validation philosophy. All landing operations run through the `wopal space evo` command family.

## State machine

```
draft → accepted → implementing → validating → archived
```

| Stage | Meaning |
|-------|---------|
| `draft` | Proposal is on disk under `docs/evolutions/`, waiting for the user to read it |
| `accepted` | User approved; the mode is recorded (isolated derives its worktree; quick creates nothing) |
| `implementing` | The change is being landed: one commit per completed task on the working branch, and the mandatory implementation review runs here |
| `validating` | User-observation period: the change is observed in the validation view (or, on the user's explicit choice, after an early integration); rework lands on the working branch |
| `archived` | User confirmed; the proposal is filed away |

The machine advances one edge at a time; its legal forward edges are `draft → accepted`, `accepted → implementing`, `implementing → validating`, and `validating → archived`. Review does not occupy a stage: it is a mandatory review gate inside `implementing` — it runs after every task has landed its per-task commit and passed Wopal's verification, and before the user is invited to validate. It cannot be skipped; the budget is 2 rounds, and the first round must list every finding in one pass. There is no backward edge — rework on a landed change is a new commit, not a stage rewind.

**The stage vocabulary is deliberately disjoint from dev-flow's** (`planning / reviewing / approved / executing / verifying / done`). Mixing the two vocabularies is how an agent mistakes one workflow for the other — never "unify" them.

## Who runs what

The matrix is the single source of truth for who executes each landing action; the runbook below only narrates the order.

| Action | Executor | Trigger / condition |
|--------|----------|---------------------|
| `new` — create the proposal skeleton | the proposal author (Maka, or Wopal when he drafts one) | a distilled lesson calls for a change; nothing has been implemented yet |
| `accept` — gate the proposal, record the mode, derive the worktree | Wopal | the user has read and approved the proposal |
| `advance` — move one stage edge | Wopal | the edge is due: `accepted → implementing` after accept, `implementing → validating` after the review passes, `validating → archived` after the user confirmed and integration completed |
| `commit` — land one task's work | Wopal | a task passed Wopal's verification and its record is backfilled (one commit per task) |
| `integrate` — squash the isolated work onto the space branch | Wopal | the user explicitly confirmed validation passed, or explicitly chose integrate-first |
| `archive` — file the proposal away, clean up isolation | Wopal | the user confirmed; the stage is `archived` |
| Record backfill | Wopal (sole author) | after each task's verification, before that task's commit |
| Implementation review | Rook | all tasks implemented and Wopal's verification passed, before the user is invited to validate; mandatory review gate, 2-round budget |
| Integration gate | the user | gives the go for `integrate` after validation (or as the explicit integrate-first choice) |

## Record protocol

The record is the proposal's own bookkeeping: the task's completion checkbox, what the task produced, and the files it actually touched. It lives in the proposal's `Done` section, and four rules keep it trustworthy:

- **Sole author: Wopal.** Wopal writes every record. The implementation agent never edits the proposal file — not the record, not any other part of it. Implementation edits capability assets; the proposal is Wopal's ledger.
- **One copy, located by mode.** Isolated: the proposal copy inside the isolation worktree (in the validation view, the same branch copy in the `.wopal` checkout). Quick: the proposal copy in the space worktree (`.wopal`). There is exactly one record copy in play per mode — never keep a second one elsewhere.
- **Timing: after verification, before the commit.** When a task's implementation passes Wopal's verification, Wopal backfills that task's record, and the record rides that task's commit.
- **In isolated mode, never record on the space side.** Do not edit — and above all, do not commit — records against the space-branch copy. Three durable reasons:
  1. A space-side record cannot roll back with the work branch: if the isolated work is dropped or redone, the record stays behind and claims a completion that never landed.
  2. An uncommitted space-side record edits the proposal file itself — the very path the squash carries — and integration will not write over a concurrent edit there: the overlap can block or conflict with the land.
  3. Both sides editing the same file makes the same lines diverge; the squash at `integrate` then hits a conflict exactly where the record lives.

### One commit per task

- Implementation does not commit.
- Wopal makes exactly one commit per completed and verified task — that task's code plus the proposal update (the record) in a single per-task commit. It lands on the working branch: the feature branch in isolated mode, the space branch in quick mode.
- The command runs from the space root: `wopal space evo commit <name> -m "<message>"`.
- Under parallelism, `--paths` names this task's files plus the proposal file; serial or exclusive work may omit it (see Parallel implementation).

## Parallel implementation

One isolation worktree can carry several tasks at once (a wave of implementers), so the commit rules tighten:

- **The `--paths` default.** Omitting `--paths` collects the worktree's tracked changes plus the proposal file itself, and the receipt lists every committed path. Serial or exclusive work can rely on that default.
- **Three cases need explicit `--paths`:**
  1. **New files.** Untracked new files are not in the default collection — name them, or they do not ride the commit.
  2. **A subset under parallelism.** When other tasks have in-flight changes in the same worktree, omitting `--paths` would sweep them in; name this task's files plus the proposal file.
  3. **Instant mode.** It carries no default at all: `-m` plus exactly one of `--paths <p>...` / `--all` is required.
- **Concurrent refusals are retried unchanged.** If a commit is refused because of a concurrent operation (a busy index, a race), re-run the same command as-is; do not rework the state around it.
- **Never dispose of another task's work.** Leave foreign files and workspace state exactly as they are.
- **Workspace protection.** In the shared worktree, never run `git reset`, `git checkout`, `git restore`, `git clean`, or `git stash` — any of them can silently throw away a neighboring task's uncommitted work. On anything abnormal — conflicts, unfamiliar dirt, someone else's edits — stop and report.

## Validation and the integration gate

Review passed — now the user decides how to validate. Ask first, and recommend the branch switch first: it needs no integration before the decision, and the runtime loads the feature branch directly.

**Preferred — branch switch.** From the space root:

```bash
wopal space evo switch <name>    # enter — .wopal checks out the feature branch
# restart ellamaka and observe
wopal space evo switch <name>    # back — .wopal returns to the space branch
```

Entering moves the `.wopal` checkout onto the recorded feature branch — the isolation worktree steps aside (its commits stay on the branch) and the sparse range widens over the branch's changes — so the next ellamaka start loads exactly the branch content. The same command switches back (`direction=back`); it never rebuilds the worktree. Repairs found while observing are committed right there — in the view, `wopal space evo commit <name>` lands in `.wopal`, still on the feature branch, still unregistered — and the observation repeats.

**Alternative — integrate first, validate after.** Only when the user explicitly chooses this order: after the review passed and the stage is `validating`, Wopal runs `integrate --confirm` early — the integration is then complete. The user observes on the space branch; rework is a new space-branch commit — instant mode, never a second squash — and the runbook's later integrate step is skipped.

**The gate.** `wopal space evo integrate <name> --confirm` encodes the user's explicit go — after they confirmed validation passed, or as their explicit integrate-first choice made before it. Without `--confirm` the CLI refuses with zero side effects, and confirming does not move the stage by itself. After the squash comes `advance --to archived`, then `archive`.

## Commands

Run from the space root: `wopal space evo <command> [args]`.

| Command | Does |
|---------|------|
| `wopal space evo new "<title>"` | Creates `docs/evolutions/<name>.md` from `templates/proposal.md` at `Stage: draft`; the template's naming contract governs the title |
| `wopal space evo status [name]` | Lists the active proposals, or shows one proposal's stage and recorded metadata |
| `wopal space evo check <name\|path>` | Diagnoses the proposal (metadata, placeholders, structure) and the space worktree's sparse shape |
| `wopal space evo advance <name> --to <state>` | Advances the state machine; refuses illegal transitions, and mirrors the `Stage` field into the isolation copy |
| `wopal space evo accept <name> [--no-worktree]` | Gates the proposal (placeholders + structure), then derives or re-attaches the isolated worktree transactionally |
| `wopal space evo commit [<name>]` | Commits one task's work — widens the sparse range first, stages by name. Valid while `implementing` (per-task commits) and `validating` (rework); in the validation view it commits in `.wopal` itself. Without a name: instant mode, the defect-repair path |
| `wopal space evo switch <name>` | Enters or leaves the validation view — moves the `.wopal` checkout between the space branch and the recorded feature branch; at `validating` only; one command, both directions; never rebuilds the worktree |
| `wopal space evo integrate [name] --confirm` | Squashes the isolated work into the space branch — only at `validating`, and only with `--confirm` (the integration gate: the user's explicit go — validation confirmed, or the explicit integrate-first choice); refuses content that would land invisible |
| `wopal space evo archive <name> [--keep-worktree]` | Moves an `archived` proposal to `docs/evolutions/archived/YYYYMMDD-<name>.md`, cleans up isolation artifacts |

Guarantees of the command family (enforced by the CLI, not by prose):

- **Stage is written only by commands.** Never hand-edit `- **Stage**:`; a proposal whose field cannot be found cannot be advanced.
- **Refusal precedes any write.** A rejected command leaves the repository exactly as it found it.
- **Nothing is staged wholesale.** Staging is by name and the sparse range widens first; no command runs `git add -A`.
- **Re-running is safe.** Re-advancing is a no-op; re-accept adopts or re-attaches instead of fighting existing state.

Command-level detail — including the shared `commit`/`integrate` preflight — lives in `references/commands.md`.

## Isolation discipline

Default implementation mode: **derive a worktree from `.wopal`**. The derived worktree inherits the space's sparse assembly patterns, so its visible boundary equals the capability set the space is entitled to — and the host repository never switches branches.

Seven constraints:

1. **Isolate by default.** The worktree derives from `.wopal`; `accept` verifies the derivation is a faithful sparse copy of the space.
2. **The host repository never switches branches.** The central repository behind `.wopal` carries the base capabilities other spaces depend on and stays on `main`; only the `.wopal` checkout moves, and only between the space branch and a recorded feature branch for validation (`switch`).
3. **Merge on the space branch.** The squash happens inside `.wopal`, on the space branch, once per proposal, and only after the user's confirmation (or their explicit choice of integrate-first).
4. **Assemble before staging.** New capability directories join the space range first (the range widens before anything is staged), and `integrate` refuses any path that would land invisible — a committed file the runtime cannot see (the visibility check; "corpus assertion" in the CLI contract).
5. **Never clear the skip-worktree bits in bulk.** They are derived state of the assembly range; adjust the visible scope only by widening assembly, and let the preflight verify the range instead of trusting discipline.
6. **Validation means restarting and observing.** Anything on the load path is judged by what the user sees after restarting ellamaka; a green test is not a substitute.
7. **Delivery is the user's terminal decision.** `space sync` and `ontology contribute` run one at a time, at the user's word. The skill contains no automatic upstream path — by design, not by omission.

### Quick mode

Typo fixes, bug fixes in existing assets, and small changes the user explicitly scopes may be landed directly on the `.wopal` space branch — the branch is itself the isolation boundary against `local main`. The mode's concrete differences from the default flow are listed once under the runbook (Quick mode differences). When the judgment is unclear, use isolated mode. Widening scope is the user's decision, not an agent's convenience.

### Defect repair is immediate

A **defect** — existing, agreed behavior that is wrong — is repaired right away, without a proposal. The review a proposal exists to provide is already settled for agreed behavior; the record that matters is the commit.

The path is `wopal space evo commit` in **instant mode** — no proposal name, with `-m <message>` and exactly one of `--paths <p>...` / `--all`:

- Commits directly on the space branch — the isolation boundary against `local main`, same as quick mode.
- The safety contract still applies: refuse on an incoherent sparse state, widen the range first, stage by name. The fast path skips process, never safety.
- No proposal artifact is created and no stage moves.

There is no separate `fix` command — that is the design, not a gap; do not add one, an alias, or a shim. Local unload (exclude) registration duty belongs to `capability remove --local`.

A defect **fixes** agreed behavior; anything that **changes** behavior — a new capability, a contract change, a workflow step that should behave differently — is an evolution and follows the proposal lifecycle. When you cannot tell which you have, ask. Choosing the fast path for a change that deserved review is worse than a slow path for a fix.

## Runbook

The sequence, in order. The default flow: implementation does not commit → Wopal verifies and backfills the record → one per-task commit (code + proposal update) → Rook's implementation review → user validation → user confirmation → `integrate` → archive. (The integrate-first choice, step 9, runs `integrate` before validation instead.) Every step names its executor.

1. **Proposal author** — write the proposal: `wopal space evo new "<title>"` creates the skeleton; fill every section.
2. **User** — read the proposal and approve it; nothing lands before that.
3. **Wopal** — accept: `wopal space evo accept <name>` (the gate runs first; isolated mode derives the worktree and records the mode).
4. **Wopal** — open the stage: `wopal space evo advance <name> --to implementing`.
5. **Fae** — implement the tasks inside the isolation worktree. No commits, no proposal edits.
6. **Wopal** — per task: verify the implementation, backfill the record, then commit once — the task's code plus the proposal update in a single per-task commit: `wopal space evo commit <name> -m "<message>"` (spell out `--paths` in parallel work). Repeat until every task is in.
7. **Rook** — the implementation review: a mandatory review gate, budget 2 rounds, first round lists every finding; it cannot be skipped. Findings are fixed by rework commits while the stage is still `implementing`, then re-reviewed.
8. **Wopal** — review passed: `wopal space evo advance <name> --to validating`.
9. **Wopal** — ask the user how to validate, recommending the branch switch first, then prepare the chosen form:
   - branch switch: `wopal space evo switch <name>` enters the view (`direction=enter`); continue with steps 10, 11, 13.
   - integrate-first (only on the user's explicit choice): `wopal space evo integrate <name> --confirm` runs now — the integration is complete; the user observes on the space branch, and steps 11 and 13 are skipped (continue at step 12).
10. **User** — restart ellamaka and observe. On findings: Wopal commits repairs where the work is observed (in the view, or on the space branch after an early integration) and the observation repeats; on pass, move on.
11. **Wopal** — branch-switch form only: leave the view — `wopal space evo switch <name>` back (`.wopal` returns to the space branch).
12. **User** — confirm that validation passed.
13. **Wopal** — branch-switch form only (the integrate-first form integrated at step 9): the integration gate is open — `wopal space evo integrate <name> --confirm`.
14. **Wopal** — `wopal space evo advance <name> --to archived`, then `wopal space evo archive <name>` (dated name + isolation cleanup).
15. **User** — delivery decisions (`space sync` / `ontology contribute`), one at a time, at the user's word.

### Quick mode differences

- Accept uses `wopal space evo accept <name> --no-worktree` — the mode is recorded, nothing is created.
- There is no isolation worktree and no feature branch: each per-task commit lands directly on the space branch (`wopal space evo commit <name>`), registered atomically as it commits.
- There is no `switch`: validation happens on the space branch itself (restart ellamaka and observe).
- There is no `integrate`: skip it — the work is already on the space branch.
- Everything else — records, one commit per task, the review gate, the user confirmation, the archive — is unchanged.

## Command usage

Run directory: every command below runs from **the space root** — the directory that holds `.wopal/`; the space resolves from the working directory, or pass `--space <name>`. A `--paths` entry is relative to the committed-side worktree root (isolated: the isolation worktree; quick / instant: `.wopal`) — never prefix it with `.wopal/`.

### Step by step

1. **Accept** (space root):
   ```bash
   wopal space evo accept enhance-example
   ```
   Expected: the gate passes; the mode, worktree, and branch are recorded on the proposal at `Stage: accepted`.
2. **Open the implementation stage** (space root):
   ```bash
   wopal space evo advance enhance-example --to implementing
   ```
   Expected: `Stage` is `implementing`; the record copy exists in the isolation worktree.
3. **Commit per task** (space root; repeat once per completed, verified task):
   ```bash
   wopal space evo commit enhance-example -m "feat: land task 1" --paths skills/example/SKILL.md docs/evolutions/enhance-example.md
   ```
   Expected: one commit on the feature branch carrying the task's files plus the proposal update; the receipt lists every committed path.
4. **Implementation review** — no command; Rook reads the committed deliverable.
5. **Enter the validation view** (space root; after the review passes and the user picked the branch switch):
   ```bash
   wopal space evo advance enhance-example --to validating
   wopal space evo switch enhance-example
   ```
   Expected: `direction=enter`; `.wopal` now carries the feature branch; restart ellamaka to observe.
6. **Leave the view** (space root):
   ```bash
   wopal space evo switch enhance-example
   ```
   Expected: `direction=back`; `.wopal` returns to the space branch; no worktree is rebuilt.
7. **Integrate** (space root; only on the user's explicit go — validation confirmed, or the explicit integrate-first choice):
   ```bash
   wopal space evo integrate enhance-example --confirm
   ```
   Expected: the feature branch is squashed onto the space branch; `Final Commit` is recorded; the branch is realigned to the squash.
8. **Archive** (space root):
   ```bash
   wopal space evo advance enhance-example --to archived
   wopal space evo archive enhance-example
   ```
   Expected: the proposal moves to `docs/evolutions/archived/YYYYMMDD-enhance-example.md`; the isolation worktree and branch are cleaned up.

### The complete run

```bash
# everything runs from the space root
wopal space evo accept enhance-example
wopal space evo advance enhance-example --to implementing
# -- task 1 done and verified; record backfilled --
wopal space evo commit enhance-example -m "feat: land task 1"
# -- task 2 done and verified; record backfilled --
wopal space evo commit enhance-example -m "feat: land task 2"
# -- Rook's implementation review passed; the user picked the branch switch --
wopal space evo advance enhance-example --to validating
wopal space evo switch enhance-example     # enter; restart ellamaka and observe
wopal space evo switch enhance-example     # back, after the user reports
# -- the user confirmed validation passed --
wopal space evo integrate enhance-example --confirm
wopal space evo advance enhance-example --to archived
wopal space evo archive enhance-example
```

---

# Maintenance

Beyond the evolution lifecycle, this skill owns the ontology's maintenance surface: instance updates, space alignment, and capability assembly.

## Command surface

| Command | Direction | Responsibility |
|---------|-----------|----------------|
| `wopal space status` | — | Read-only: space branch vs `local main` (to contribute / behind), remote delta, assembly state and sparse consistency, local selections (include / exclude / private) plus unregistered untracked files |
| `wopal space sync [--confirm]` | both | Align with `local main`: integrate space-unique evolution upward (isolated worktree, stops on conflict), then fast-forward down |
| `wopal space capability add/remove <kind>:<name> [--local]` | manifest / local | Shared channel: edit the archetype manifest and re-materialize; accepts only a capability the pool already owns (a pool-absent name is refused before the manifest is touched) and creates **no Git commit** — committing the manifest is a separate, explicit step. `--local`: mount or unload the complete asset as this space's local selection (include / exclude / private); when the state changes, the CLI commits the space root repository with a path-limited commit — a state record, not content. Content still travels up only through the user's own `space sync` / `ontology contribute` decisions, separate from that state commit |
| `wopal ontology capability list` | — | Read-only: what the pool owns — the pick-list for `space capability add` |
| `wopal ontology update [--confirm]` | downstream | `upstream/main` → `local main` |
| `wopal ontology contribute --message <msg> [--include/--exclude <glob>] [--confirm]` | upstream | `local main` → upstream PR (fork mode; squash-merge in an isolated worktree; `--resume` / `--abort` for a conflict) |

## Reading status

`wopal ontology status` reports both flows: **Downstream** (`upstream → origin → local main`) and **Upstream** (`local main → origin → upstream`), the latter as the pending file set.

`wopal space status` reports the space link: **to contribute** vs **behind local main**, the assembly state, and the **local selections** — `include` (an extra mount: shared content only this space mounts) / `exclude` (a locally deactivated type default) / `private` (privately held untracked content) — plus unregistered untracked files. Private content is protected: the upload gate below refuses any sync carrying a commit that touches a private-registered capability root.

## Channels and the upload gate

`space capability` has two channels. Without `--local`, the change edits the assembly manifest and re-materializes — but creates no commit by itself, and only accepts a capability the pool already owns, so committing the manifest is a separate step. With `--local`, it writes only the space's local selection (`include` / `exclude` / `private`) and adjusts the sparse range; when the state changes, the CLI commits the space root repository with a path-limited commit — a state record, not content. Uploads are decided separately: only the user's own `space sync` / `ontology contribute` steps send anything up. `add --local` on a locally disabled (excluded) capability is also the recovery exit.

Before integrating upward, `space sync` checks the **upload gate**: no space-unique commit may touch a private-registered capability root (`include` / `exclude` are mount choices and never block shared content). A hit refuses the sync and names the remedy — withdraw the commit, or drop the registration. The gate backstops a manual `git add`/`commit` of private content: local isolation does not depend on the operator remembering.

## Execution stance

The CLI defaults to dry-run preview; `--confirm` executes. The settled stance: the agent acts on the user's intent directly and passes `--confirm` — no extra approval gate is layered on top; `--dry-run` is a diagnostic, not a precondition. Safety comes from mechanics: isolated integration, fast-forward only, stop-on-conflict, worktree checks — the worst case is a change not happening, not a broken worktree. `ontology contribute` is the single exception: each contribution is the user's call, one at a time.

## Contribution scope and themed PRs

Scope is determined with the user, from evidence:

1. Enumerate every pending path first (`git diff --name-status <base>...<target>`), grouped by directory / feature area, each group labelled shared or type-specific — show the full inventory before asking anything.
2. Classify structurally, not by feel: shared = meaningful to every space type; type-specific = meaningful to one type only. When unsure, check the pool (`ontology capability list`) and the ontology design instead of guessing.
3. The user circles the scope: which groups travel upstream, which are excluded, which stay space-only.
4. Space-only assets never appear in any contribution.

One PR per topic: `--include` / `--exclude` carve a coherent contribution out of the pending set, and `--message` states what the change delivers (result state), not the mechanical action. Split unrelated work; never bundle it.

---

# Boundaries

- **A proposal waits for the user.** Whoever wrote it, it lands only after the user approves — an author never silently implements their own proposal.
- **Maka writes only.** Maka's edit scope is `docs/evolutions/`; touching a capability asset is a CRITICAL FAILURE. Speculation presented as fact is worse than no proposal.
- **Landing: Wopal orchestrates, Fae lands, Rook gates.** The workflow never ships upstream on its own.
- **`/wopal:evolve` and `/wopal:distill`** belong to the memory-evolution loop (diaries → long-term memory files / the memory database), not to this workflow. If distilled experience calls for an ontology change, it still goes through this skill's proposal lifecycle.
- **`wopal/ontology-maintain`** is a thin trigger: it loads this skill with a focus argument and carries no protocol of its own — the Maintenance protocols above are the protocol.
- **The skill carries the rules; wopal-cli does the work.** The skill ships only documents and the proposal template — no scripts. Every maintenance and landing step runs through wopal-cli commands (command details in the Maintenance and Landing sections above).
- **Assembly overlay**: assets are assembled per space via the overlay mechanism (`docs/DESIGN-distribution.md`); the skill operates on the assembled worktree (`.wopal`), never on the central pool directly.

---

# References

- State machine and delivery terminal: `docs/DESIGN-evolution.md` (Capability Evolution Workflow)
- Command contract and stage semantics: `references/commands.md`
- Proposal skeleton: `templates/proposal.md`
- Sparse isolation background: `docs/DESIGN-distribution.md`
- Development conventions for this skill: `AGENTS.md`
