---
name: df-implement-review
description: >
  Review delivered code changes, or audit an existing project for technical debt
  and bloat — decide whether a change really delivers what it claims, breaks
  existing callers, works under real inputs, and leaves no dead code or
  unnecessary complexity behind. Use when the user asks to review, check, or
  verify code changes, a commit, a pull request, or a finished implementation
  (e.g. "review this change", "check whether this implementation is correct",
  "review my PR"), or asks to analyze a project's technical debt, audit a
  codebase, or find dead code, unused dependencies, over-engineering, and
  cleanup candidates (e.g. "analyze technical debt in this project", "audit this
  repo", "find dead code and bloat", "what can we delete or simplify"). Also the
  gate for landed ontology evolution proposals before user validation. Do not
  use for reviewing a Plan or design doc before execution (use
  `df-proposal-review`), for re-running tests or lint, for running builds, or
  for fixing code.
---

# df-implement-review — Implementation Review

## The review answers four questions

Every failure that slips past tests, lint, typecheck, and CI belongs to one of these four.

| | Question | Catches |
|---|----------|---------|
| Q1 | Does the change really deliver what it claims? | stubs, empty shells, unwired code, reduced scope |
| Q2 | Does the change break anything that already worked? | silent behavior changes, broken call sites, changed shared interfaces |
| Q3 | Are the new code paths correct under real inputs and states? | concurrency bugs, leaks, boundary errors, bad error handling, security holes |
| Q4 | Do the tests prove it, and what bloat or orphans remain? | fake tests, stale docs, dead code, orphaned files/deps, unnecessary abstractions |

## Pick the mode

Decide once, at the start, from what the prompt carries:

- **Delivery review** — the prompt includes a Plan path, an evolution proposal, or explicit acceptance criteria. The change is one delivery inside a scheduled scope. Verify the change against those criteria, then run Q1–Q4.
- **Change review** — the prompt only carries a change: working-tree edits, a commit, a range, a file list. No Plan exists. Run Q1–Q4 using the change's own stated intent (commit message, background in the prompt) as the Q1 spec.
- **Repo audit** — the prompt asks to analyze technical debt or audit a whole project/directory for dead code, unused dependencies, over-engineering, or cleanup candidates without naming a diff or Plan. Skip diff-based Q1–Q3 and run the whole-repo Q4 sweep (using the repo-audit scan in the rubric: unused deps, orphaned files/exports, stdlib/native replacements, single-use abstractions, plus lingering `TODO`/`FIXME` debt markers, fake/skipped tests, and stale docs when doing a full tech-debt audit). Emit the ranked one-line list (`- \`<tag>\` <what to cut>. <replacement>. [path]`) ending with `net: -N lines, -M dependencies possible.` (or `Lean already. Ship.`).

In change review, do **not** invent product requirements. Business logic belongs to the change owner unless the prompt says `business_logic_review: requested`. Gaps that depend on product intent go under `Requirement Questions`.

If the prompt omits context entirely, review only the working-tree changes under the stated project path and say so in the report.

Input fields the prompt may carry: `review_type: implementation`, `project_path`, `change_scope: working_tree`, `commit: <hash>`, `commit_range: <A>..<B>`, `background`, Plan or proposal path, `design_docs: <path>`, `business_logic_review: requested`.

## What the mechanical gates own

Tests, lint, typecheck, and CI already decided the change compiles, passes, and is formatted. Re-checking any of that is waste. There is exactly one test question you may ask: **does the test actually prove what it claims to protect** (Q4) — never "do the tests pass".

Your scope is what the gates cannot see: the change is real, complete, and reachable; it did not silently break existing behavior; it is correct under the scenarios its users will hit.

If the change is sound, say so briefly and stop. This review is invoked deliberately, not for ceremony.

## How to work: read once, three lists, then probe

Efficiency is part of review quality — a review that burns time returns noise. Two phases:

**Phase 1 — one read, three lists.** Read the diff (`git diff`, `git show <hash>`, or `git diff <A>..<B>`) and the changed files once. While reading, fill three lists:

1. **Claims** — every deliverable or acceptance criterion the change must satisfy (Plan or proposal truths, or the change's own stated intent).
2. **Contract surface** — every exported symbol, signature, schema, shared type, or config the diff modifies, plus every function whose logic changed but signature didn't.
3. **Flags** — anything suspicious to verify in the sweeps: possible stub, wiring gap, suspicious test, bloat candidate.

**Phase 2 — probe from the lists, never re-read.** Each question consumes the lists with targeted commands (`rg`, `git diff`, `sed -n`). Do not re-scan files you already read. Do not read files outside the change unless a claim or contract edge points there. Mechanical sweeps (stub patterns, skipped tests, dangerous APIs) run as one batch — see the probe bundle in the rubric.

## Q1 — Does the change really deliver what it claims?

Highest-priority check. Most "done but not done" changes die here.

- **Stub sweep.** Scan changed files for placeholder patterns: comment stubs (`TODO: implement`), placeholder text ("coming soon", "TBD"), empty returns (`return null`, `return {}`), log-only handlers, hardcoded fake values, empty event handlers, model shells missing the fields the claim needs. Full catalogue: rubric §2.
- **Wiring check.** For every new artifact: imported where used, actually referenced, reachable from an entry point. Component → data source consumed. Query result → returned, not discarded. New route → registered.
- **Scope both ways.** Declared scope vs delivered scope (`git diff --name-status`): promised but absent, present but undeclared, unannounced deletions.
- **Design conformance.** In delivery review: check against written constraints for the touched area — architecture boundaries, module ownership, API contracts stated as "must". A delivery that works but violates a stated constraint has not delivered the design.

Severity: stub occupying a claimed behavior, claimed artifact missing, violation of an explicit Plan truth or design constraint → **BLOCKER**; real but unreachable → **WARNING** (BLOCKER if reachability itself is the claim); undeclared deletion → **WARNING**. Reductions sanctioned by an explicit decision are decisions, not defects.

## Q2 — Does the change break anything that already worked?

The check the mechanical gates miss most. What slips through: **silent behavior changes** — same signature, green suite, different semantics — and breaks in behavior no test covers.

- **Extract the contract surface** from Phase-1 list 2. Include functions whose *logic* changed even though the signature didn't — those are the dangerous ones.
- **Find all consumers.** `rg <symbol>` across the project, **including files outside the diff**. For each consumer ask: does the change break an assumption this caller holds? Changed nullability? Sync made async? Ordering changed? Error contract changed?
- **Check test infrastructure.** If the diff changes a shared fixture, mock, or helper, do existing tests using it now assert something weaker or different?

Scale rule: many consumers → `rg -l`, read a representative sample, state what you did not cover.

Severity: diff-outside call site broken with a concrete scenario → **BLOCKER**; semantic change that may be intentional → **WARNING** (or `Serious Logic Risks` when severe); consumers not fully checked → `UNCOVERED STEPS`, never fake coverage.

## Q3 — Are the new code paths correct under real inputs and states?

Walk the changed hunks against the defect catalogue (rubric §4) instead of trusting intuition: concurrency and shared state, resource lifecycle, boundaries and numerics, async gaps, swallowed errors, unsafe casts, security (unparameterized queries, `innerHTML`, missing auth on new routes, secrets in code).

Report only findings with a concrete failure scenario — "in situation Z this returns Y". Vague worries are not findings; ground them or drop them.

Severity: defect with a concrete scenario, exploitable security hole → **BLOCKER**; plausible risk with a scenario, missing validation on a public surface → **WARNING**.

## Q4 — Do the tests prove it, and what bloat or orphans remain?

Three parts (in **Repo audit** mode, run only the third part across the whole project, ranked biggest cut first).

**Test effectiveness.** Map each claimed behavior to its covering tests, then read what they actually assert. Broken patterns: skipped tests, circular proofs, placeholder assertions, existence-only assertions, untested key branches. The bar: **would this test fail if the behavior broke?** Skipped/circular/placeholder for a claimed behavior → **BLOCKER**; untested changed branch → **WARNING**.

**Documentation drift.** For every changed external contract (API, schema, CLI flag, config key), find where docs describe it and check whether the change updated them. Stale docs → **WARNING** (REVISE — the fix is updating docs); violating a stated docs-sync rule → **BLOCKER**. Pure internal refactors trigger nothing.

**Debt — the lean & orphan sweep.** Hunt bloat and orphaned code with the five tags. One line per finding: location, what to cut, what replaces it. **A finding without a replacement is a complaint, not a finding.**

| Tag | What it catches | Replacement |
|---|---|---|
| `delete:` | dead code, files/exports/deps orphaned when a caller switched to a new implementation, unused flexibility, zero-reference dependencies | nothing |
| `stdlib:` | hand-rolled code the standard library already ships | name the function (verify runtime version supports it) |
| `native:` | code or deps doing what the platform ships for free | name the feature (verify target OS/platform supports it) |
| `yagni:` | one-implementation interfaces, factories with one product, config nobody sets, thin wrappers with one caller | inline until a second need exists |
| `shrink:` | duplicated logic across files, or the same logic in fewer, clearer lines | show the shared helper or shorter form |

**Orphan check on diffs**: whenever a diff removes an `import` or call to an internal function, module, or package, run `rg` across the repo to check whether that target now has **zero production references**. Leaving an orphaned function, file, test, or `package.json` dependency behind after replacing its caller → **WARNING** (REVISE).

Never flag: the smallest check that would fail if the logic broke (a smoke test, one assert) — that is the lean minimum, not bloat. Never simplify away input validation at trust boundaries, error handling that prevents data loss, or security measures. Correctness first, then leanness — never trade one for the other.

Severity: re-implemented existing infrastructure (the repo already ships it, `file:line` named), a new heavyweight dependency added without need, or an orphaned module/function/dependency left behind by the diff → **WARNING** (REVISE); everything else lean → **INFO**.

End of report: `net: -N lines, -M dependencies possible`. Nothing to cut → `Lean already. Ship.`

## Delivery review of ontology evolution proposals

When the prompt carries an evolution proposal path, the change lands capability assets (skills, rules, agents, commands). Add one gate to Q1, on top of the usual checks:

**Capability standards gate.** The landed files must satisfy the platform's own asset standards: frontmatter `name` + `description`; triggering conditions live in the description, not buried in the body; body = workflow, output, notes; long content offloaded to `references/`; `scripts/` holds only deterministic, reusable logic; no invented structure. The description and body must be plain and precise enough that an agent knows what to do after one read — dense jargon and machine prose are findings, same as anywhere else.

Severity: deliverable violates a stated standard → **WARNING** (REVISE); the description cannot trigger or the body cannot be followed → **WARNING** at minimum, **BLOCKER** when the asset cannot work as landed (missing frontmatter, broken references to files that do not exist).

This gate complements the proposal review (df-proposal-review), which checked the *stated* deliverable; this review checks the *landed* files.

## Scale: Quick vs Full review

- **Quick** — the diff is small (roughly ≤ 50 lines, one file, local change): run all four questions with a few probes each, skipping rubric lookups; build one todo item; emit the short report form.
- **Full** — everything else: one todo item per question, rubric open when a question hits unfamiliar territory, full report.

Never skip Q2 even on small diffs — a 10-line signature change can break a hundred call sites.

## False-positive calibration

Review noise is flagging things that aren't defects. Do not flag: what the gates already own; product preferences (use `Requirement Questions`); style nits without a maintenance consequence; "I would have designed it differently"; unverifiable worries without a scenario; scope you were not asked to review; sanctioned reductions; the lean minimum (one smoke test, one assert). Every finding must cite a location and the evidence that supports it — otherwise it is at most Info.

## Yardstick for severe logic risks

A plausible severe logic risk (irreversible destruction, major data corruption, user harm) with concrete `file:line` evidence that could still be requirement-driven: report it under `Serious Logic Risks (Discuss with User)`. It does not change the verdict unless the prompt requested business-logic validation or an explicit truth is contradicted.

## Budget — at most 2 reviews per change

Each change (or each Plan) is reviewed at most **twice**: the initial review plus at most one re-review; the re-review report is final.

1. **First review must be exhaustive**: run all four questions and report every finding in one report, including borderline ones. Withholding findings is defective service.
2. **Re-review = verify fixes + full re-sweep**: anything found this round is final — there is no further round to raise what was missed.

## Verdict and report

```
PASS   — no Blocker, no Warning
REVISE — no Blocker, at least one Warning
BLOCK  — at least one Blocker
```

`Needs Human`, `Serious Logic Risks`, and `Requirement Questions` never change the verdict by default. All four questions must be attempted before any verdict; a Blocker is a severity, not permission to skip the rest. Out of budget, emit the report with an explicit `UNCOVERED STEPS` section.

**Full report:**

```markdown
# Implementation Review — {scope label}

## Summary
- Review type: Implementation (Delivery | Change)
- Verdict: PASS | REVISE | BLOCK
- Counts: Blocker N / Warning N / Info N / Needs-human N
- Reviewed: {Plan/proposal path / commit / commit range / working tree}
- Lean count: {net: -N lines, -M dependencies possible | Lean already}

## Blocker
### B-01: {title}
- Location: `{file}:{line}`
- Evidence: {code snippet or command output}
- Impact: {what fails, under which scenario}
- Fix direction: {what to change — concrete, not "improve it"}

## Warning
{same format as Blocker; Impact may be omitted}

## Info
{one line each}

## Serious Logic Risks (Discuss with User)
{only severe risks that may be requirement-driven}

## Requirement Questions
{only ambiguity or product choices code alone cannot judge}

## Needs Human
- {item} — why only human observation can settle it

## Positive Findings
- {verified item: state how it was verified}

## UNCOVERED STEPS
{only when steps could not be completed}
```

**Quick report:** `Summary` (same fields) + one merged `Findings` list (B/W/I labelled) + `Positive Findings`.

**Repo audit report:** ranked one-line list (`- \`<tag>\` <what to cut>. <replacement>. [path]`), biggest cut first, ending with `net: -<N> lines, -<M> deps possible.` (or `Lean already. Ship.`).

A `PASS` requires the `Positive Findings` section to state what was checked and how — a bare PASS asks the reader to take the verdict on faith.

## After the verdict

- **REVISE / BLOCK**: the fix must be re-reviewed before the result counts as clean. Reuse the same review session (reply), so prior findings and their resolutions stay in context.
- **PASS**: an input to whoever requested the review, not an automatic gate. It does not authorize merge or completion, and it does not replace the mechanical gates.
- Reviewing does not authorize editing. Findings go back to the implementer.

## References

Load the rubric when a question needs its detailed method, a pattern catalogue, or a worked example:

- `references/review-rubric.md` — phase-1 list building, stub patterns with probes, Q2 contract-surface procedure, Q3 defect catalogue, Q4 lean tags with the probe bundle, severity calibration, worked examples
