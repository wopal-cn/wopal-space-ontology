---
name: df-proposal-review
description: >
  Review a proposal before execution. Use when the user asks to review, check, or verify a Plan, evolution proposal, or design document (PRD, DESIGN), e.g. "review this plan", "check proposal", "review design doc".
---

# df-proposal-review — Proposal Review

**You judge one thing: if someone follows this proposal as written, will the work succeed, deliver the goal, and do it the lean way?**

Three artifacts share this skill because they are the same act at different sizes: a design document proposes what to build, a Plan proposes how to execute it, an evolution proposal proposes how to change a capability. All three are read before work starts, and all three die the same death — executed literally, they fail or over-deliver.

## Pick the mode

Decide once, from the artifact itself:

- **Plan mode** — the artifact schedules work: tasks, dependencies, acceptance criteria. This covers dev-flow Plans and ontology evolution proposals.
- **Document mode** — the artifact states intent: goals, boundaries, requirements, architecture. No tasks yet. This covers PRDs, DESIGNs, sub-DESIGNs, and any design doc.

If the artifact has both faces (a design doc with a task list), run both modes.

## What the script owns

In Plan mode, `flow.sh plan check` already gates form: field presence, placeholder text, TDD↔Behavior pairing, checkbox shape, AC command presence, status validity. An evolution proposal has its own gate: `wopal space evo check`. Re-checking any of that is waste and produces noise. Your scope is what a regex cannot compute — whether the parts fit together, fit reality, and add up to the goal.

If the proposal is fine, say so quickly and stop. This review is invoked deliberately, not for ceremony.

## How to work: read once, three lists, then verify

Efficiency is part of review quality — a review that burns time returns noise. Work in two passes.

**Pass 1 — read the artifact once, with line numbers.** While reading, fill three lists you will work from later:

1. **Facts** — every concrete claim about the repo, the system, or other documents: counts, paths, line ranges, doc sections, IDs, commands, flags.
2. **Symbols** — every code-like name in backticks (Plan mode) or every named component/capability (Document mode), with where it is created and where it is used.
3. **Files** — every path mentioned anywhere, and where it was mentioned.

**Pass 2 — answer the questions from the lists.** Plan mode: Q1 and Q3 need nothing but the artifact; only Q2 touches the repo — batch its commands and run them together. Document mode: consistency and goal checks run from the artifact, then reality checks against code and sibling documents. Do not re-read the artifact between checks — each return costs more than it saves.

Verify, don't survey: `test -e` for paths, `sed -n 'Np'` for line anchors, `rg -n` for sections and symbols. Never read a whole design doc to confirm one section. A normal proposal settles in roughly 15–25 commands.

Claims you cannot settle go under `Unverified` — never inflated into findings.

## Plan mode: the four questions

| | Question | Catches |
|---|---|---|
| Q1 | Do the parts fit together? | files nobody produces, symbols nobody creates, ACs nobody owns, order contradicting dependencies |
| Q2 | Are its statements about the repo true? | stale paths, wrong anchors, false counts, silent clashes with design docs, commands that can't run |
| Q3 | Will executing it deliver the goal? | goal parts without tasks, decisions quietly shrunk, ACs that prove nothing |
| Q4 | Is this the lean way to deliver it? | speculative abstractions, reinvented infrastructure, unneeded dependencies |

Q1–Q3 decide whether the Plan works. Q4 decides whether it works without bloat — a Plan can pass all three and still be the wrong shape. Q4 never blocks by itself: lean findings cap at WARNING.

### Q1 — Do the parts fit together?

1. **Behaviors are owned.** Every Agent Verification entry is referenced by some Task's `Verification Intent`, or explicitly marked cross-task. Also check placement: anything mechanically checkable (tests, lint, typecheck) belongs in Agent Verification, not User Validation.
2. **Symbols have producers.** Every code-like name a task uses is created by an earlier task, spelled exactly the same. A task that "registers five error codes" and a later task that "fails fast with `TEMPLATE_MISSING`" break at that seam. This is the highest-yield check in the review.
3. **Behavior specs are real.** Each Behavior in a TDD task can be turned into a failing test without guessing. "Works correctly" is unspecified behavior.
4. **Order matches dependencies.** Every consumer comes after its producer. Overlap between tasks is a conflict only under declared parallel execution.

**Files are expected scope, not a contract.** The `Affected Files` table is the expected file list; do not audit task-level lists against it. Flag only a stale operation premise ("create" a file that already exists) or file overlap under declared parallel execution.

Severity: symbol with no producer, misspelled producer, producer in a later wave, or parallel file overlap → **BLOCKER**. AC owned by nobody, untestable Behavior, automatable check in User Validation, stale file premise → **WARNING**.

### Q2 — Are its statements about the repo true?

The repo is the only authority. Settle each fact claim mechanically; never wave one through because it "looks right".

| Claim | Check |
|---|---|
| "36 capabilities" | count them in the source of truth |
| "`src/x.ts` exists" | `test -e` |
| "`file.ts:619-669`" | `sed -n '619p'` — small drift is fine, landing on the wrong construct is not |
| "§3 of DESIGN.md says X" | `rg -n '^#{2,3} '` |
| "D-12" / "issue #45" | find the ID in its source of truth |
| "run `flow.sh verify`" | does the command exist, does it take that flag |
| "create file F" / "delete file F" | `test -e` |

**State the revision you checked against** — Base Commit, worktree HEAD, or integration HEAD. A finding without a revision rots the moment anyone commits. If the artifact declares a worktree, probe at the worktree's HEAD.

Then check agreement with the authorities it cites (design docs, `AGENTS.md`, existing interfaces): find what the authority says and compare. Divergence the artifact acknowledges or justifies is a decision; silent divergence is a broken contract. When two documents conflict, establish which one is authoritative for the model this artifact implements before calling it.

Severity: a false premise the work leans on, a silent divergence from a safety constraint, an AC command that cannot run → **BLOCKER**. Silent doc divergence with no effect on the work → **WARNING**; minor wording or line-number drift → **INFO**.

### Q3 — Will executing it deliver the goal?

The expensive failure: passes every check and still under-delivers.

1. **Goal covered.** Split the Goal into its parts; each part needs a task.
2. **Decisions delivered.** For each `D-xx`, the tasks deliver what it states — not a shadow of it. Watch for shrink words ("v1", "simplified", "hardcoded", "for now"), then adjudicate: does the shrink contradict the Goal, and is it explicitly sanctioned? Only a silent shrink is a finding.
3. **ACs that can fail.** If the feature were broken, would the criterion catch it? An AC that passes either way is decoration, not verification.
4. **Handoff possible.** Could the implementer start from this artifact alone? Interfaces and outputs of earlier tasks are named, not implied. Flag only where missing information would cause a wrong turn.

Severity: goal part with no task, decision quietly reduced → **BLOCKER**. AC that can't fail, task not startable from the artifact alone → **WARNING**. Shrink sanctioned by the artifact's own words → not a finding.

### Q4 — Lean: is this the lean way to deliver it?

Climb the ladder for every new item the Plan creates. Stop at the first rung that holds; the item must land at that rung:

1. **Does it need to exist at all?** An interface with one implementation, a factory with one product, a config for a value that never changes, an extension point with no consumer — skip speculative needs, in one line.
2. **Already in this repo?** The Plan creates a helper, module, or pattern that already lives a few files over. Check with `rg`, not assumption.
3. **Stdlib does it?** A new dependency whose job the standard library already does.
4. **Native platform covers it?** Code or a dependency doing what the platform or runtime already provides.
5. **Shortest direct form?** Same logic that a shorter, more direct design delivers.
6. **Cleans up what it replaces?** When the Plan replaces an old module, helper, or dependency, it must also schedule deleting the obsolete code, its old tests, and the unused dependency so no dead code is left behind.

Severity — Q4 never blocks: speculative abstraction, reinvented infrastructure, unneeded new dependency, or replacement that leaves the old code behind → **WARNING** (the fix is trimming or completing the Plan). Same logic in a shorter form → **INFO**. Nothing to cut → say `Lean already` and move on.

For ontology evolution proposals, add one gate on top of Q1–Q4: the landed result must satisfy the platform's own capability standards — frontmatter `name` + `description`, triggering conditions in the description, body = workflow + output + notes, long content offloaded to `references/`, no invented structure. A proposal whose deliverable violates them → **WARNING**.

## Document mode: the four questions

Document mode has no tasks to schedule, so the questions reshape. Q4 keeps its name and its severity cap.

| | Question | Catches |
|---|---|---|
| D1 | Does the document cohere? | sections that contradict each other, undefined terms, states without owners |
| D2 | Are its statements about reality true? | stale paths, claims the code contradicts, silent clashes with sibling documents |
| D3 | Is the goal sound? | unmeasurable goals, boundary gaps, requirements nobody owns, silent decisions |
| D4 | Is it lean? | features nobody asked for, structure copied from a template instead of earned |

### D1 — Does the document cohere?

Contradictions between sections; terms used before they are defined or used two ways; components or states whose ownership is unstated. Also structure conformance: when the document belongs to the `dev-doc-master` set, its structural rules (header zones, bidirectional index, naming) are governed by `dev-doc-master/references/consistency.md` — and the mechanical part of that is already scanned by its quality gate script (`scripts/verify-docset.py`). Run it when available; spend your review on what the script cannot see.

Severity: internal contradiction on a core statement → **BLOCKER**; undefined term with real ambiguity, missing ownership for a component the doc introduces → **WARNING**.

### D2 — Are its statements about reality true?

Same mechanical probe as Q2: every claim about the code, the system, or another document gets settled against reality. Sibling-document conflicts follow the authority rule from Q2. Documents in the `dev-doc-master` set also describe **current design only, not change history** — "deprecated", "legacy", "moved from", "migration" narration is a finding, because a reader needs to understand how the system works now, not its history.

Severity: claim the code contradicts on a critical path → **BLOCKER**; stale claim with no effect on decisions → **WARNING**; minor wording or line-number drift → **INFO**.

### D3 — Is the goal sound?

The document's Goal must be decidable: an observer can tell whether it was met. Boundary: the document states what it does not cover, or points where the boundary lives. Requirement gaps: a user problem stated with no requirement answering it is a hole, not a detail — the consumer of this document will fill it silently. Silent decisions: choices a reader must make are stated or flagged, not buried.

Severity: goal that cannot be judged met or unmet → **BLOCKER**; missing boundary, unanswered requirement → **WARNING**.

### D4 — Is it lean?

Every feature, section, and abstraction earns its place against the goal. A feature nobody's problem needs, an extension point for a phase that may never come, boilerplate structure the template suggested but the goal doesn't need — cut it. Template conformance is not a goal: structure exists to serve the document's own content.

Severity: same ladder as Q4 — **WARNING** cap, **INFO** for shorter-form suggestions.

### Writing style gate (both modes)

The artifact's language is part of its quality: plain, concrete, one idea per sentence, affirmative over negative, ownership over exclusion. Dense jargon, invented abstractions, and machine-sounding prose are findings — a proposal only works if the reader understands it in one pass. Flag with the offending line and a plain rewrite direction. Severity: a paragraph a reader must decode twice → **WARNING**; isolated awkward phrasing → **INFO**.

This gate also applies to the skill itself: when the deliverable of an ontology evolution proposal is a skill, its description and body must be plain and precise enough that an agent knows what to do after one read.

## Review efficiency — target 2 rounds per proposal

Aim to converge review within **two rounds** (initial review + one re-review):

1. **First review must be exhaustive**: report every finding in one report, including borderline ones. Withholding findings is defective service.
2. **Re-review focuses on fix verification**: verify reported fixes and check directly touched areas. Avoid inventing ungrounded preferences late.

The review skill reports defects objectively without artificial stopping points. Iteration budgets, stopping gates, and escalation to the user belong to the controlling workflow (such as `dev-flow`).

## Verdict and report

```
PASS   — no Blocker, no Warning
REVISE — no Blocker, at least one Warning
BLOCK  — at least one Blocker
```

`Unverified` never changes the verdict.

At review start, build one todo item per question and mark them off as you go. All four must be attempted before any verdict. Out of budget, do not fake completion: emit the report with an explicit `UNCOVERED CHECKS` section naming what was not done and why.

```markdown
# Proposal Review — {proposal name}

## Summary
- Review type: Proposal (Plan mode | Document mode)
- Verdict: PASS | REVISE | BLOCK
- Counts: Blocker N / Warning N / Info N / Unverified N
- Verified against: {Base Commit | worktree HEAD | integration HEAD}
- Lean count: {net: -N lines, -M dependencies possible | Lean already}

## Blocker
### B-01: {issue title}
- Location: `{artifact}:{line}`
- Reality: `{file}:{line}` or `{command output}` — {why this contradicts the artifact}
- Impact: {how execution fails}
- Fix direction: {what to add or change}

## Warning
{same format; Impact may be omitted}

## Info
{one line each}

## Unverified
- {claim} — reason not verified: {reason}

## Requirement Questions
{only when the requirement itself is ambiguous and cannot be settled from the artifact and the code}

## Positive Findings
- {verified item: state how it was verified, so the reader can trust the conclusion}

## UNCOVERED CHECKS
{only when a check could not be completed}
```

`PASS` requires a short `Positive Findings` section — what was checked and how. A bare PASS asks the reader to take the verdict on faith.

## After the verdict

- **`REVISE` / `BLOCK`**: the revised artifact must be re-reviewed before it counts as clean — a fix applied without re-verification is not a fix. Reuse the same review session (reply), so prior findings stay in context.
- **`PASS`**: input to whoever requested the review, not an automatic gate. It does not authorize `approve`, does not replace `plan check` or `evo check`, and does not change an execution status mid-flight.
- Reviewing does not authorize editing. Findings go back to the owner.

## References

Load the rubric when a question needs its full procedure, the severity table, or a worked example:

- `references/review-rubric.md` — three-list building, per-mode procedures, command cookbook, severity calibration, worked examples
