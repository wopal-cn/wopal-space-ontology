---
name: ontology-evolution
description: >
  MUST use this skill for any work that may change or maintain reusable WopalSpace capabilities: user corrections, recurring friction, tool/environment failures, reusable lessons, evolution proposals, capability assets, space/ontology synchronization, assembly changes, or upstream contributions. Load it even when the user never says “ontology” or “evolution” if deciding whether a session lesson should become reusable capability or modifying ontology capability assets. Use `dev-flow` for code development under `projects/`.
---

# ontology-evolution

Turn real work friction into reliable signals, mature signals into lasting capability, and land improvements safely.

The main flow is **observe → diagnose → route → synthesize → propose → land**. This file keeps only decisions and the main workflow; load references on demand for landing, command, and maintenance detail.

## Core contract

- Find the existing capability owner first and prefer repairing it; create a new capability only when no existing owner fits naturally.
- A proposal is not implementation authorization. Every proposal waits for explicit user approval before landing.
- The user owns three terminal gates: **approval, validation, and delivery**.
- Wopal orchestrates and records; Fae implements; Rook reviews implementation; Maka observes, analyzes, and proposes.

## Roles

| Role | Owns | Does not own |
|------|------|--------------|
| **Maka** | Observe signals, accumulate evidence, synthesize mature issues, write proposals when requested | Write proposals during observation; edit capability assets; land changes |
| **Wopal** | Detect signals, keep the primary task moving, trigger synthesis; orchestrate landing after approval | Interrupt the primary task for Maka's intermediate analysis; implement in place of Fae |
| **Fae** | Modify capability assets in the assigned workspace and verify the implementation | Commit; edit proposals; advance stages |
| **Rook** | Review implementation before user validation | Fix findings |
| **User** | Approve proposals, choose and perform validation, decide integration and delivery | — |

---

# Continuous session evolution

## What is worth observing

Treat an event as an evolution signal only when it may mean **a capability should behave differently the next time a similar situation occurs**. Typical sources:

- The user corrects an Agent's judgment, behavior, workflow, or communication.
- The same detour, bad assumption, or repeated work recurs.
- A tool / environment failure exposes a stable wrong assumption.
- A known lesson still has no stable capability owner.
- A new approach clearly outperforms the current one and is worth reusing.

An ordinary project bug, one-off network failure, or task-specific business fact is not automatically an evolution signal just because something went wrong.

## How Wopal collaborates with Maka

When the runtime supports sub-agent collaboration:

1. **Start on demand and reuse.** Prefer one Maka child thread per logical session.
2. **Send only necessary evidence.** Give the problem, user correction, key context, failure result, or effective pattern; do not copy the full parent history by default.
3. **Keep the primary task moving.** After sending a signal, Wopal continues the current work, does not wait for Maka, and does not surface intermediate analysis to the user.
4. **Synthesize at closeout.** When the main task is complete, the session is winding down, or the user explicitly asks for an evolution summary, Wopal asks Maka to `synthesize`.

If no usable sub-agent collaboration exists, Wopal may perform the same synthesis once at closeout; do not add persistence machinery merely to imitate a background Maka.

## Maka's observation and synthesis modes

### Observation

Maka only diagnoses, classifies, and accumulates evidence; it does not create proposals:

| State | Meaning |
|-------|---------|
| `discard` | One-off, already covered correctly, or not reusable |
| `local` | Valuable, but only for the current project / space |
| `candidate` | May need a capability change, but evidence or ownership is not stable yet |
| `mature` | Evidence is strong enough to consider a capability change during synthesis |

`mature` does not mean “write a proposal now.” Observation exists to reduce noise, merge duplicates, and strengthen evidence.

### Synthesis

Only when Wopal explicitly requests `synthesize`, Maka:

1. Merges same-root / duplicate signals and drops weak evidence or issues already covered by existing capability.
2. Generalizes mature signals and checks for local or sensitive-detail contamination.
3. Finds the capability owner before deciding whether to repair or create capability.
4. Decides whether the change fits direct maintenance or needs a formal proposal, and gives that recommendation to the user; **never creates a proposal without explicit user confirmation**. Zero proposals is a valid result.

## Capability routing

| Problem essence | Preferred owner |
|-----------------|-----------------|
| An Agent's role, responsibilities, decision principles, or long-lived default behavior is wrong | Agent prompt |
| A behavior constraint applies only in a matching scenario | Rule |
| The problem is how work is performed: workflow, steps, verification, or tool use | Skill |
| A fixed human-to-Agent work entry or instruction contract needs to change | Command |
| A real tool, runtime state, automation, or system integration is missing | Plugin / runtime owner |
| The capability is fine, but a space type should or should not receive it | Assembly / archetype |
| The knowledge is specific to the current project or space | Project `AGENTS.md` / space memory |

When ownership overlaps, the boundary is unclear, or a formal proposal is about to be written, read [`references/capability-routing.md`](references/capability-routing.md). Read the relevant DESIGN only when the issue challenges the capability model, loading lifecycle, or architectural ownership.

---

# Writing an evolution proposal

The point of a proposal is not to archive what happened; it is to make the same kind of situation go better next time.

## Decide whether a proposal is needed first

A formal proposal is for evolution that needs its own design, implementation, review, or validation boundary. It is not the default entry for every ontology edit. Before creating one, explicitly ask the person who raised the problem whether they want a proposal; do not create one automatically merely because the target is a reusable capability.

Prefer direct maintenance when all of the following describe the work:

- the capability owner is clear; for a new capability, its kind, purpose, and complete-asset boundary are also clear, with no ownership split;
- the expected change touches fewer than 10 files;
- no dedicated automated test, human validation, or multi-stage validation flow is needed;
- the change does not alter a cross-capability contract, assembly model, loading lifecycle, or high-risk migration boundary.

Make this kind of change directly on the registered `space/<name>` branch and commit it by name through instant mode. Do not create a proposal, working branch, or extra worktree.

**Adding a complete Skill / Rule / Command is not, by itself, a Proposal trigger.** If ownership, purpose, scope, and assembly intent are clear and the low-risk conditions above hold, maintain it directly. Recommend a formal proposal only when the change itself needs a separate design boundary, such as a cross-capability contract change, assembly-model or loading-lifecycle change, high-risk migration, dedicated testing, or multi-stage validation. Run `wopal space evo new` only after the user confirms that choice.

When the boundary is unclear, ask whether the user wants a proposal instead of silently choosing the heavier workflow.

## Generalize first

- Remove absolute paths, project / product / customer names, session ids, timestamps, commit hashes, and other local detail.
- Keep evidence and constraints that actually determine capability behavior.
- Test: a reader who has never seen this space can still understand and apply the change.

## Decide content ownership and assembly scope separately

First decide where the content itself belongs:

- Facts, preferences, or lessons that only belong to the current project / space → project `AGENTS.md` or Space memory.
- Formal Agent / Skill / Rule / Command / Plugin content that should be retained and reused → the Ontology capability pool.

Untracked capability files are only a transient working-tree state. Once a complete capability is meant to be kept, widen the sparse range safely and commit it to the registered Space branch.

Then decide how a formal capability is assembled:

- **Type-default assembly**: add it to `assembly/archetypes/<type>.yaml`; spaces of that type get it by default.
- **Space-local assembly**: the type does not include it, but this space needs it → `space-meta.include`.
- **Space-local exclusion**: the type includes it, but this space does not want it → `space-meta.exclude`.

Entering the capability pool does not imply that a capability must enter a type archetype. Assembly scope is a separate decision.

## Write it

Only enter this section after the user has explicitly confirmed that a proposal is wanted.

Use `wopal space evo new "<title>"` to create `docs/evolutions/<name>.md` from `templates/proposal.md`, then fill the template completely.

- Write in the user's preferred language; preserve the template headings and field labels.
- Preserve the primary target capability's canonical name; prefer a short, recognizable 2–3 segment `<capability>-<topic>` slug.
- Anchor every material claim in evidence; mark unverified statements as unverified.
- Keep one coherent change per proposal; few and strong beats many and weak.

Once written, the proposal waits for the user to read it. Landing begins only after approval.

---

# Landing an approved proposal

The state machine is fixed:

```text
draft → accepted → implementing → validating → archived
```

Its vocabulary is deliberately different from `dev-flow`; do not mix or “unify” them. Review is not a stage: it is a mandatory gate inside `implementing`, before the user is invited to validate.

## Main flow

1. The **user approves** the proposal.
2. **Wopal** runs `accept`, then enters `implementing`.
3. **Fae** implements; it does not commit or edit the proposal.
4. **Wopal** verifies each task, backfills the record, and lands that task's asset changes and record in one commit.
5. **Rook** performs implementation review; findings are reworked and re-reviewed while still in `implementing`.
6. After review passes, **Wopal** enters `validating` and lets the user choose validation form; recommend branch switch first, use integrate-first only on explicit user choice.
7. The **user** validates and confirms the result; integration happens only after an explicit go.
8. **Wopal** archives; `space sync`, upstream PR publication, and deletion remain separate user decisions.

Before landing, read [`references/landing.md`](references/landing.md). For concrete command arguments, refusal conditions, or sparse-worktree mechanics, then read [`references/commands.md`](references/commands.md).

## Defect repair vs evolution

- **Defect**: agreed behavior is implemented incorrectly → use `wopal space evo commit` in instant mode; no proposal.
- **Direct capability maintenance**: a bounded, clearly owned change with no dedicated test/validation flow may land directly; creating one complete Skill / Rule / Command does not automatically escalate it to a Proposal.
- **Formal evolution**: cross-capability contracts, assembly-model or loading-lifecycle changes, high-risk migrations, or changes that need dedicated testing / staged validation → recommend the proposal lifecycle, but create the proposal only after explicit user confirmation.
- When the distinction is unclear, ask whether the user wants a proposal. Do not silently escalate to a formal proposal or bypass a formal flow the user requested.

---

# Maintaining ontology and space capabilities

This skill also owns the maintenance entrypoint for ontology / space status, synchronization, capability assembly, and upstream contribution.

- For `space status/sync`, `ontology status/sync`, capability add/remove, or untracked-path protection, read [`references/maintenance.md`](references/maintenance.md).
- Before creating, revising, retrying, or closing an upstream PR, also read [`references/contribution.md`](references/contribution.md).
- Synchronization authorization does not authorize PR publication, merge, or deletion; each remains a separate user decision.
- A merged contribution with a retained contribution worktree or branch is unfinished closeout work: surface the residue in the same interaction and obtain the user's cleanup decision before concluding. If the current instruction already authorizes cleanup for that PR, proceed without asking again; ordinary sync still never implies deletion.

---

# Boundaries

- **Maka writes proposals only.** Its write scope is `docs/evolutions/`; it never edits capability assets.
- **Wopal orchestrates, Fae implements, Rook gates.** Nothing uploads or publishes automatically.
- `/wopal:evolve` and `/wopal:distill` belong to the memory-evolution loop; if distilled memory calls for ontology change, it still enters this workflow.
- `wopal/ontology-maintain` is only a thin trigger for this skill; it does not define another protocol.
- Implement capabilities in the assembled `.wopal` worktree or derived isolation; upstream publication uses a separate contribution worktree.

# References

- Capability ownership and routing boundaries: `references/capability-routing.md`
- Proposal landing workflow: `references/landing.md`
- `wopal space evo` command contract: `references/commands.md`
- Ontology / space maintenance: `references/maintenance.md`
- Upstream PR creation, revision, and closeout: `references/contribution.md`
- Proposal template: `templates/proposal.md`
- State-machine design: `docs/DESIGN-evolution.md`
- Assembly / sparse-isolation background: `docs/DESIGN-distribution.md`
