# Command Reference

Landing proposals runs through the `wopal space evo` command family. Run
from the space root — an effective space is resolved from the working
directory, or targeted with `--space <name>`:

```bash
wopal space evo <command> [args]
```

Three rules every command obeys:

- **Refuse before writing.** Safety checks run before the first mutation, so a
  rejected command leaves the repository exactly as it found it.
- **Never stage wholesale.** On a checkout whose sparse range has drifted,
  `git add -A` records every out-of-range path as a deletion. Staging is always
  by name, and the range is widened before anything is staged.
- **Guards come from one table.** The stage precondition of every mutating
  command derives from a single guard table; a refusal names the current
  stage, the requirement, and the copyable next command.

## `wopal space evo new "<title>"`

Creates `docs/evolutions/<name>.md` at `Stage: draft` from
`templates/proposal.md` — the external skeleton with per-section authoring
comments — and prints the path. The skeleton is the ontology side's file; a
missing template is refused (the CLI keeps no inlined copy).

- `<name>` is derived from the title: lowercased, non-alphanumerics collapsed
  to hyphens, a leading `type(scope):` prefix dropped. The naming contract in
  `templates/proposal.md` governs the title: a lean `<type>-<slug>`, with a
  slug of 1–2 core nouns, kebab-case, ≤ 20 chars.
- Refuses if the target file already exists; refuses an empty title.
- Options: `--type <type>` (default `enhance`) sets the `Type` metadata field.
- A new proposal always lands in the space worktree, even when run from an
  isolated worktree. The file is not committed here — it rides the space
  branch when a stage write or `accept` records it.

The template is the single source of the proposal shape; the placeholder and
structure scans in `check` derive from the same file, so the two cannot drift
apart.

## `wopal space evo status [name]`

Without a name, lists the active proposals under `docs/evolutions/` (archived
ones excluded), name-sorted. With a name, prints the stage, the resolved file
path, the recorded mode, the isolation metadata, and the next command.
Accepts a bare proposal name, an explicit path, or the bare name of an
archived proposal (resolved against the dated `YYYYMMDD-` form). Read-only:
zero side effects.

```text
$ wopal space evo status refactor-ontology-maintenance

## Space Evo Status

- **Proposal**: docs/evolutions/refactor-ontology-maintenance.md
- **Stage**: implementing
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-refactor-ontology-maintenance
- **Branch**: ontology-refactor-ontology-maintenance
- **Base Commit**: 3413d885e87d38fe40217d8325e2c3b6fb0ae039
- **Next**: wopal space evo advance refactor-ontology-maintenance --to validating
```

Placeholder metadata (`(none)`) is never printed as data. At the
terminal stage it prints `none (terminal)` and the archive command.

## `wopal space evo advance <name> --to <state>`

Moves the proposal to `<state>` after validating the transition.

| From | Legal `--to` |
|------|--------------|
| `draft` | `accepted` |
| `accepted` | `implementing` |
| `implementing` | `validating` |
| `validating` | `archived` |
| `archived` | — (terminal) |

- Re-advancing to the current stage is legal and leaves the file unmodified.
- Any other target (skip, rewind, unknown state) exits non-zero, prints the
  legal successor to stderr, and leaves the file byte-for-byte unmodified.
- A proposal with no `- **Stage**:` field cannot be advanced; recreate it with
  `wopal space evo new`.
- A real transition writes `Stage` back and commits the proposal file by name
  on the space branch.

When the proposal is isolated and its recorded worktree exists, a real
transition also mirrors the same `Stage` into that copy — a field-level write,
committed in place (message `docs(evolutions): <slug> -> <to>`) — so the copy
stays clean and both sides agree. A failed mirror commit is reported loudly
with the boundary named: the space-side record already stands, and only the
copy's commit is pending. With the worktree missing (the validation view),
only the space-side record is written, and the command still succeeds.

## `wopal space evo accept <name> [--no-worktree]`

Accepts the proposal for implementation and records the mode. Requires the
proposal at `draft`, `accepted`, or `implementing` (the last one exists so a
worktree lost mid-implementation can be re-attached).

**The gate first.** `accept` is where the proposal is read and judged: it
refuses unreplaced placeholders and a missing structure contract (required
sections + the Task six elements) — a proposal that was never actually
written cannot be accepted into implementation.

**Isolated mode (default)** is transactional — every check runs before the
first write, in this order:

1. The space worktree's sparse state is coherent (a corrupted source spawns
   corrupted children; refuse before deriving anything).
2. The isolated worktree is derived from the space branch — or, when the
   branch exists but its worktree directory was lost, **re-attached** to the
   surviving branch (its commits are work, not garbage; recovery never
   suggests deleting it).
3. The isolation assertion: the worktree still sees every pattern the space
   has (a superset is fine), and its bits and range agree.
4. Only then is the metadata (`Mode`, `Worktree`, `Branch`, `Base Commit`,
   `Stage: accepted`) written and committed.

A failure before step 4 removes only the artifacts that run created; a failure
at step 4 restores the proposal file byte-for-byte. `Base Commit` is the
worktree's actual fork point — the derive start commit, or the merge base for
an adopted or re-attached worktree.

In isolated mode, the command fields — `Mode`, `Worktree`, `Branch`, `Base
Commit`, `Stage` — are then mirrored into the isolation worktree's proposal
copy with field-level writes and committed in place; a copy whose fields
already agree produces no mirror commit (re-running `accept` stays
idempotent), and a copy missing a command field fails loudly — the copy's own
record content is never overwritten.

**Quick mode** (`--no-worktree`) records `Mode: quick` and creates nothing.
Use it for typo fixes, bug fixes in existing assets, and small changes the
user explicitly scoped — the space branch is itself the isolation boundary
against `local main`.

Re-running `accept` is safe: an existing worktree is adopted when it carries
the expected branch and fast-forwarded onto the space branch head (a worktree
with its own commits is left alone — the squash at integrate reconciles), and
its range is widened back over any pattern the space adopted in the meantime.

## `wopal space evo commit [<name>]`

Commits working changes at stage `implementing` or `validating`, and is the
command that keeps a corrupted sparse checkout from destroying the
capability pool.

**Proposal mode** — with `<name>`: the target comes from the proposal's
Metadata. An isolated proposal commits inside its recorded isolation
worktree; a quick proposal commits on the space branch. In the validation
view — after `switch`, `.wopal` on the recorded branch — the commit lands in
`.wopal` instead, still unregistered. `--paths` is optional (the default
collects the worktree's tracked changes plus the proposal file itself, and
the receipt lists every committed path); `-m` is optional (a default derives
from the proposal).

`--paths` entries are **relative to the committed-side worktree root** — the
isolation worktree for an isolated proposal, `.wopal` for quick and instant:

```bash
# isolated proposal: paths are relative to the isolation worktree root
wopal space evo commit try-me --paths skills/try-me/SKILL.md
```

A `.wopal/`-prefixed entry resolves under the worktree root, where it is
neither on disk nor tracked, and is refused with
`SPACE_EVO_COMMIT_TARGET_INVALID`.

**The record rides the commit.** The proposal's `Done` record — task output,
files touched, the completion box — is edited by the orchestrator in the
workspace copy of the proposal (the isolation worktree's copy in isolated
mode, `.wopal`'s in quick mode) and committed together with the task's code:
one commit per finished task, on the working branch.

The review gate, the validation view (`switch`), and the `integrate`
confirmation gate belong to the landing flow delivered by wopal-cli (#240);
that flow is stated once in `SKILL.md` — this reference covers command
behavior only.

Omitting the name switches to **instant mode** (below).

Checks, in order, before anything is staged:

| Check | Refusal reason |
|-------|----------------|
| Stage is `implementing` or `validating` | The guard table: committing is allowed only in the implementing or validating window. |
| `core.sparseCheckout` is enabled | A checkout with the range switched off cannot tell an intentional off-disk entry from a deleted one. `disable` writes `false` rather than unsetting the key, so the value is checked, not just its presence. |
| The pattern list is non-empty | An empty range cannot be verified. |
| Nothing is mid-merge | An unresolved merge state cannot be committed coherently. |
| No entry sits outside the range without a skip-worktree bit | The range and the bits disagree. Harmless-looking on its own — `git add -A` still stages nothing while the range is on — but combined with a switched-off range these entries become recorded deletions. |
| No in-range path carries a stray skip-worktree bit | The index and the range disagree; the remedy is `git sparse-checkout reapply`, not a commit. |

Measured, on a temp repository reproducing the layout:

| range | bit | on disk | `git status` | `git add -A` |
|-------|-----|---------|--------------|--------------|
| on | set | no | clean | clean |
| on | clear | no | ` D` | stages nothing (git refuses) |
| off | clear | no | ` D` | **stages the deletion** |

Then it widens the range to cover every changed path **before** staging, and
stages named paths only — never `-A`. Named paths are classified on the way
in: a protected definition's deletion is restored in place and never
committed; a new or modified path inside a held asset is an ordinary shared
content change, staged as-is; a new path outside every held asset root is a
new whole asset and must be declared by an `Assembly Intent` row; a whole
declared asset's deletion is a shared deletion validated by the candidate-tree
gate. No deletion auto-generates a local unload — `exclude` is written only by
the explicit `space capability remove --local` channel.

A new **whole asset** needs an `Assembly Intent` row (`type-default` /
`space-local`) in the proposal — the row drives the registration; internal
changes to an existing asset produce no selection.

**When the space-side registration happens depends on the mode.** A quick or
instant commit classifies and registers on the space branch as it writes, so
the registration exists as soon as that commit lands. An **isolated** commit
only widens the isolation worktree's own range — it never touches the space's
registration; `integrate` is where the space-side registration is written,
atomically with the squash.

Once registered, a space-local asset sits in the space root state as an
`include` mount — a mount choice: its content still travels up with `sync` as
shared content. Disk-only untracked content is held as `private` and never
syncs: the upload gate rejects any space-unique commit that touches a
`private`-registered capability root, and the refusal names the remedy
(withdraw the commit, or drop the registration with
`capability remove --local`). Content that should reach the pool must arrive
as pool content rather than as a space-private path: `space capability add`
**without** `--local` is the shared channel, but it only accepts a capability
the pool **already owns** — a pool-absent name is refused before the manifest
is touched — and it edits the archetype manifest and re-materializes
**without creating a Git commit**, so committing that manifest change is a
separate, explicit step.

### Why widening is not `--sparse`

`git add --sparse` forces an out-of-range entry into the index but does **not**
widen the range. The next range recompute (`reapply`, or the CLI's
`applySparsePatterns`) then sweeps the file off disk, leaving a committed file
that is invisible to the runtime. Widening first puts the path genuinely inside
the assembly range, where it survives recomputation.

A sparse pattern must carry **exactly one** trailing slash. Git accepts a
doubled one — `"/skills/x//"` parses without complaint but matches nothing, so
the failure surfaces later and misleadingly, as `git add` refusing the path with
`path exists outside your sparse-checkout definition`. A directory pattern that
looks right and matches nothing is the tell.

### Instant mode: defect repair

Without a proposal name, `commit` is the repair path for existing,
already-agreed behavior that is wrong — no proposal, no worktree, no stage;
the commit is the record.

- Requires `-m <message>` and exactly one of `--paths <path>...` / `--all`.
  The explicit list is the only thing standing between a stray file and the
  space branch; `--all` stages every tracked change (untracked new files are
  not auto-included). A `--paths` entry must be on disk or tracked (a
  deleted tracked path is valid; an unknown path is refused loudly).
- Commits **directly on the space branch** (which must be checked out — it
  is itself the isolation boundary against `local main`).
- The same safety contract as the proposal path applies: refuse on an
  incoherent sparse state, widen the range before staging, stage by name.
  The fast path skips process, never safety.
- No proposal artifact is created or modified; no stage moves.

Instant mode is the designed repair path: a separate `fix` command was
retired on purpose and must not be reintroduced (no alias, no shim); its
local-unload duty (`exclude` registration) now lives with
`capability remove --local`.

Use it when behavior that was already agreed is broken. Anything that
changes agreed behavior — a new capability, a contract change — is an
evolution and follows the proposal lifecycle instead.

## `wopal space evo integrate [name]`

Squashes the isolated work into the space branch inside `.wopal` at stage
`validating`, and is the only integration path that leaves the space
worktree coherent. **Gated on `--confirm`.** Integration runs only on the
user's explicit go — after they confirmed validation passed, or as their
explicit integrate-first choice made before it; without it the command refuses
with zero side effects. The name may be omitted when the space has
exactly one in-flight isolated proposal; zero or several report the
candidates and refuse.

Refusals, all before any mutation:

- Stage is not `validating`, `--confirm` is missing, or `Mode` is not
  `isolated`.
- The recorded worktree, **when present**, sits on a foreign branch.
- The isolation assertion fails on the worktree, when present (re-run as
  defense in depth — accept checked once, drift happens).
- The recorded worktree, when present, is dirty; or the space worktree is
  incoherent / has staged entries.

The recorded worktree is optional: when it is missing — the validation view
after `wopal space evo switch` — the recorded branch ref is the identity, and
integration runs against it directly; no worktree is created or rebuilt.

Then, in order: the space range is widened to match the feature branch **and
the content it carries**, the squash is staged, and — before anything is
committed — the **corpus assertion** runs: every staged path must fall inside
the final range. A path that would land outside it is the silent-poison shape
(committed, listed, invisible to the runtime, and no later guard can see it);
the integration is rolled back and refused with the offending paths named.
Widening sources can miss (a raw `git add --sparse` path the worktree's range
never declared); the assertion cannot.

After the squash commits, the range is recomputed so newly covered paths are
materialized on disk, and the feature branch is **realigned to the squash** —
its post-condition is that the branch carries no commit the space branch
lacks, so later stage records and any post-integrate rework no longer make
the branch read as unintegrated work. `Final Commit` is recorded in the
space-branch copy of the proposal, and later proposal records mirror into
the worktree on top of the realigned branch. Running integrate again with
nothing outstanding prints `no-op` and exits 0.

Why not `git push .` or `git update-ref`: pushing to a branch checked out in
`.wopal` is refused by git, and moving the ref directly leaves `.wopal` in the
same inconsistent `D`/`M` state as the 2026-09-20 incident.

## `wopal space evo switch <name>`

Enters or leaves the isolated validation view — one command, both
directions, moving branch occupancy only; no worktree is created or rebuilt
in either direction.

- Direction is derived, not passed: **back** when the space worktree is
  already on the recorded branch, **enter** otherwise.
- Enter removes the recorded isolation worktree when present — its commits
  stay on the branch — widens the space worktree's sparse range over the
  branch changes, and checks the isolated branch out there; a missing
  worktree is a legal state and is never rebuilt.
- Back checks the space worktree out on the registered space branch; it
  never re-creates the worktree and never restores the range.
- Requires Stage: `validating`, a recorded isolated branch that still
  exists, and a clean space worktree.

After validation passes and the user has confirmed, run
`wopal space evo integrate <name> --confirm` — integration runs against the
branch ref directly, no worktree needed.

## `wopal space evo check <name|path>`

Reports problems with the proposal and the space worktree's sparse shape as
a classified list, exiting non-zero when anything is wrong. Read-only: zero
side effects.

| Group | Checks |
|-------|--------|
| `metadata:` | `Stage` present and known; `Type`, `Project Path`, `Created` present; `Created` is an ISO date; `Mode` valid once the proposal leaves `draft` |
| `content:` | No unreplaced `<...>` placeholders once the proposal leaves `draft` (code spans excluded) |
| `structure:` | The proposal format contract — required sections and the Task six elements; **notes** in `draft`, problems from `accepted` onward. Also: the space worktree sits on a `space/*` branch |
| `sparse:` | The `commit` preflight, applied to the space worktree's sparse shape |
| `isolation:` | The derived worktree still sees every pattern the space has, and its bits are coherent |
| `note:` | Non-fatal observations: content not integrated yet, a branch with nothing committed, placeholders expected in a draft, an archived proposal whose isolation branch outlived its cleanup, and **corpus lint** — archived files that lack the `YYYYMMDD-` prefix |

An archived proposal whose worktree was removed (the normal end state of
`archive`) is **not** a problem: the terminal state expects the cleanup to
have happened. A branch that survives there is reported as a note — the
content is integrated, only the artifact removal is incomplete.

The integration notice compares **content in one direction**: what the branch
holds that the space branch's history does not. Commits the branch has that
the space branch does not are not themselves a problem — a squash-integrated
branch legitimately stays non-ancestor — and paths where only the space
branch advanced (stage records, rework, another proposal's integration)
carry nothing to lose. For every differing path the branch's blob is checked
against the objects reachable from `HEAD`; a blob found there is integrated.

## `wopal space evo archive <name> [--keep-worktree]`

Moves a proposal at stage `archived` into `docs/evolutions/archived/` under
its **dated name** — `YYYYMMDD-<name>.md` (a pure function of date + name;
refuses to overwrite an existing target). Bare names still resolve against
the dated form.

Transactional preflight, all before the first mutation: the space worktree is
sparse-coherent and on the registered space branch; the recorded isolation
worktree must be clean **only when it would be removed** (its removal would
destroy uncommitted work); and — when isolation cleanup would run — the feature
branch holds no content that the space branch's history lacks (deleting a
branch that still carries unintegrated work destroys it). Unrelated uncommitted
work in the space worktree does not block the archive: the record commit and
its rollback stage by name, so unrelated paths never ride along and are left
exactly as they were (modified stays modified, staged stays staged, untracked
stays untracked), reported only as a non-fatal warning. When the proposal file
itself carries uncommitted bytes, those working-tree bytes are the archive
record. Integration leaves the branch realigned to its squash, so the normal
end state passes this guard by construction; a branch integrated before that
post-condition existed is still measured by content, not by commit ancestry.

The mutation sequence: move → record the move on the space branch (the
undated deletion is staged alongside the dated addition) → mirror into the
worktree. Cleanup runs **last**, only in isolated mode and only without
`--keep-worktree`: the recorded worktree is removed and the feature branch
deleted (`-D`, safe because the content guard proved it integrated). Quick
mode touches no isolation artifacts. Cleanup failure is loud but does not
undo the archive: the residue is reported for manual removal.

## Stage is written only by commands

`Stage` is written only through `advance` and `accept`. Do not hand-edit the
field: a proposal whose field cannot be found cannot be advanced, and a
hand-edited stage bypasses the transition guarantee the state machine exists
to provide.

## Delivery is not a command here

`space evo` has no delivery command. `space sync` and `ontology contribute`
are the user's terminal decision (`docs/DESIGN-evolution.md`, Delivery
Terminal) and are invoked one at a time, at the user's word.
