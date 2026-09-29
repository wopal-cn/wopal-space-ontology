---
name: ontology-evolution
description: Ontology capability evolution — writing evolution proposals and landing them (state machine, sparse isolation, user-owned delivery)
---

# Agent Development Rules

## 1. Canonical References

- Parent Rules: `.wopal/AGENTS.md`
- Skill entry: `SKILL.md`
- Command contract: `references/commands.md`
- Design source of truth: `docs/DESIGN-evolution.md`

## 2. Architecture and Directories

The skill ships documents and the proposal template only. The mechanism —
state-machine commands, sparse safety, isolation — is implemented by the
wopal CLI (`wopal space evo`); the skill keeps no script layer of its own.

| Directory | Responsibility |
|---|---|
| `templates/proposal.md` | The proposal skeleton with authoring comments; the single source of the proposal format |
| `references/` | Command reference and background |

Sparse state is written **only** through the `wopal space` command family. A
direct `git add -A`, `git checkout`, or `git sparse-checkout` call is how the
range and the index drift apart unnoticed.

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
proposal record. The command-level mechanics live in `SKILL.md`.

### Defect Repairs Are Immediate

A defect — existing, already-agreed behavior that is wrong — is repaired
directly with `wopal space evo commit` in **instant mode** (no proposal name),
committed on the space branch. It does not go through the proposal lifecycle:
the review a proposal exists to provide is already settled for behavior that
was agreed. The safety contract (sparse preflight, widen-then-stage, named
staging) still applies. Instant mode is the designed repair path — there is no
separate `fix` command; do not add one, an alias, or a shim. Anything that changes agreed behavior is an evolution and
uses the proposal lifecycle.

### No Automatic Delivery

`space sync` and `ontology contribute` are the user's terminal decision
(`docs/DESIGN-evolution.md`, Delivery Terminal). No part of this skill may
invoke a delivery CLI, add a remote, or push — the absence of an automatic
upstream path is by design, not by omission.

## 4. User-Supplied Rules

(None)
