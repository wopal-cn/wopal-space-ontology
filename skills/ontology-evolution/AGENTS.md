---
name: ontology-evolution
description: Ontology capability evolution — continuous observation, synthesis, proposals, and landing (state machine, sparse isolation, user-owned delivery)
---

# Agent Development Rules

## 1. Canonical References

- Parent Rules: `.wopal/AGENTS.md`
- Skill entry: `SKILL.md`
- Command contract: `references/commands.md`
- Design source of truth: `docs/DESIGN-evolution.md`

## 2. Architecture and Directories

The skill ships collaboration/routing guidance, references, and the proposal
template only. The mechanism — state-machine commands, sparse safety,
isolation — is implemented by the wopal CLI (`wopal space evo`); the skill
keeps no script layer of its own.

| Directory | Responsibility |
|---|---|
| `templates/proposal.md` | The proposal skeleton with authoring comments; the single source of the proposal format |
| `references/` | Command reference, capability-routing guidance, and background |

Sparse state is normally written **only** through the `wopal space` command
family. In the space sparse worktree, direct `git add -A` or broad checkout /
sparse rewrites can desynchronize the range and index. The only compatibility
exception is explicit new-capability adoption when the installed CLI cannot yet
express the target contract; follow the bounded fallback in
`references/maintenance.md`, widen only the exact asset path, stage by name,
and verify sparse patterns plus status before and after. Upstream contributions
use native Git in a separate, fully checked-out contribution worktree; follow
`references/contribution.md`.

## 3. Implementation Rules

### State Machine

`draft -> accepted -> implementing -> validating -> archived`

The vocabulary deliberately shares no words with `dev-flow`'s
(`planning / reviewing / approved / executing / verifying / done`). Changing a
state name is a contract change: it must be updated here, in
`docs/DESIGN-evolution.md`, and in `references/commands.md` together.

`Stage` is written only by the `wopal space evo` commands — never hand-edit
the field; a proposal whose field cannot be found cannot be advanced. Command
preconditions and refusal semantics are implemented by the wopal CLI.

### Record Ownership

The Done record of a task — its completion checkbox, task output and files
touched — has a single author: the 主控 (orchestrator). The record is written
in the proposal copy on the working branch (the isolation worktree in
isolated mode, the space worktree in quick mode), after the task passed
verification and before its commit. Implementation agents do not edit any
part of the proposal file.

### Commit Granularity

Implementation does not commit. Each completed task lands as exactly one
commit on the working branch — that task's content together with its
proposal record. The landing workflow lives in `references/landing.md`; exact
command behavior lives in `references/commands.md`.

### Direct Maintenance vs Formal Evolution

A defect — existing, already-agreed behavior that is wrong — is repaired
directly with `wopal space evo commit` in **instant mode** (no proposal name),
committed on the space branch. The same direct path also applies to a bounded,
clearly owned capability maintenance change that needs no dedicated validation
boundary; creating one complete Skill, Rule, or Command does not by itself
require a proposal. The safety contract (sparse preflight, widen-then-stage,
named staging) still applies. Instant mode is the designed direct path — there
is no separate `fix` command; do not add one, an alias, or a shim.

Use the proposal lifecycle when the change needs a separate design or validation
boundary, such as a cross-capability contract, assembly-model or loading-lifecycle
change, high-risk migration, or staged testing/review. If the user explicitly
requests a formal proposal, honor that choice.

### No Automatic Delivery

`space sync` and native Git/GitHub PR publication are the user's separate
terminal decisions (`docs/DESIGN-evolution.md`, Delivery Terminal). Execute
only the synchronization/publication the user authorized. Never add remotes,
push, merge, or delete on your own initiative. Contribution naming, worktree
retention, and safe closeout are owned by `references/contribution.md`.

## 4. User-Supplied Rules

(None)
