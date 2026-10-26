---
name: df-implement-review
description: >
  Review delivered code changes against design, or audit a project for technical debt. Use when the user asks to review code changes, a commit, PR, or finished implementation, or asks to audit a repo and find dead code or bloat.
---

# df-implement-review — Implementation Review

## The review answers four questions

Every failure that slips past tests, lint, typecheck, and CI belongs to one of these four.

| | Question | Catches |
|---|----------|---------|
| Q1 | Does the change really deliver what it claims? | stubs, empty shells, unwired code, reduced scope |
| Q2 | Does the change break anything that already worked? | silent behavior changes, broken call sites, changed shared interfaces |
| Q3 | Are the new code paths correct under real inputs and states? | concurrency bugs, leaks, boundary errors, bad error handling, security holes |
| Q4 | Do the tests prove it, and did the change leave orphans? | fake tests, docs contradicting the design, orphans this diff created |

## The design is the yardstick

You review one thing: **did the implementation follow its design?** You do not review whether the design itself is good.

Find the governing design before you judge anything. The design can be a Plan task, a DESIGN section, an `AGENTS.md` constraint, or an explicit decision recorded in the conversation. Read it first, then read the diff against it. When no Plan exists, that does not mean no design exists — go find the design document for the touched area.

Three consequences follow, and they are the core of this skill:

1. **A tradeoff the design already accepted is not a defect.** Slow-but-correct, polling instead of events, a small retry window, a cache that can be stale for 60 seconds — if the design says so, the implementation matches it, and you do not reopen that decision. Test it against the design, not against an ideal architecture you have in mind.
2. **If you believe the design is wrong, say it once and stop.** Report it as `Design Feedback`: which design clause, why it is a problem, and that the fix is to change the design first. It does not block, does not count as Warning, and does not get decomposed into a list of implementation defects. Fixing a design problem belongs to the design owner (`df-proposal-review` reviews designs, not this skill).
3. **Every finding must cite its basis.** Each Blocker and Warning names the design clause, Plan task, or explicit statement it violates. A finding that cannot cite a basis is at most `Info` — and usually belongs in your own reasoning, not the report.

This is what keeps review cheap. A review that respects the design produces a short list of real deviations; a review that re-litigates the design produces an endless list of preferences dressed as requirements.

## Pick the mode

Decide once, at the start, from what the prompt carries:

- **Delivery review** — the prompt includes a Plan path, an evolution proposal, or explicit acceptance criteria. The change is one delivery inside a scheduled scope. Verify the change against those criteria, then run Q1–Q4.
- **Change review** — the prompt only carries a change: working-tree edits, a commit, a range, a file list. No Plan exists. Find the design documents that govern the touched area and use them as the Q1 spec; the change's own stated intent (commit message, background) only fills gaps the design leaves open.
- **Repo audit** — the prompt asks to analyze technical debt or audit a whole project/directory for dead code, unused dependencies, over-engineering, or cleanup candidates without naming a diff or Plan. Skip diff-based Q1–Q3 and run the whole-repo Q4 sweep (using the repo-audit scan in the rubric: unused deps, orphaned files/exports, stdlib/native replacements, single-use abstractions, plus lingering `TODO`/`FIXME`/`simplified:` debt markers, fake/skipped tests, and stale docs when doing a full tech-debt audit). Emit the ranked one-line list (`- \`<tag>\` <what to cut>. <replacement>. [path]`) ending with `net: -N lines, -M dependencies possible.` (or `Lean already. Ship.`).

In change review, do **not** invent product requirements. Business logic belongs to the change owner unless the prompt says `business_logic_review: requested`. Gaps that depend on product intent go under `Requirement Questions`.

If you cannot find any design document, Plan, or recorded decision for the touched area, say so explicitly in the report and limit the review to Q2 and Q3 real defects. In that situation you have no basis for Q1 completeness claims and none for improvement suggestions.

If the prompt omits context entirely, review only the working-tree changes under the stated project path and say so in the report.

Input fields the prompt may carry: `review_type: implementation`, `project_path`, `change_scope: working_tree`, `commit: <hash>`, `commit_range: <A>..<B>`, `background`, Plan or proposal path, `design_docs: <path>`, `business_logic_review: requested`.

## What the mechanical gates own

Tests, lint, typecheck, and CI already decided the change compiles, passes, and is formatted. Re-checking any of that is waste. There is exactly one test question you may ask: **does the test actually prove what it claims to protect** (Q4) — never "do the tests pass".

Your scope is what the gates cannot see: the change is real, complete, and reachable; it did not silently break existing behavior; it is correct under the scenarios its users will hit.

If the change is sound, say so briefly and stop. This review is invoked deliberately, not for ceremony.

## How to work: read once, three lists, then probe

Efficiency is part of review quality — a review that burns time returns noise. Two phases:

**Phase 1 — one read, three lists.** Read the diff (`git diff`, `git show <hash>`, or `git diff <A>..<B>`) and the changed files once. While reading, fill three lists:

1. **Claims** — every deliverable or acceptance criterion the change must satisfy (Plan tasks, design clauses, `AGENTS.md` constraints, or recorded decisions).
2. **Contract surface** — every exported symbol, signature, schema, shared type, or config the diff modifies, plus every function whose logic changed but signature didn't.
3. **Flags** — anything suspicious to verify in the sweeps: possible stub, wiring gap, suspicious test, orphaned code.

**Phase 2 — probe from the lists, never re-read.** Each question consumes the lists with targeted commands (`rg`, `git diff`, `sed -n`). Do not re-scan files you already read. Do not read files outside the change unless a claim or contract edge points there. Mechanical sweeps (stub patterns, skipped tests, dangerous APIs) run as one batch — see the probe bundle in the rubric.

## Q1 — Does the change really deliver what it claims?

Highest-priority check. Most "done but not done" changes die here.

- **Stub sweep.** Scan changed files for placeholder patterns: comment stubs (`TODO: implement`), placeholder text ("coming soon", "TBD"), empty returns (`return null`, `return {}`), log-only handlers, hardcoded fake values, empty event handlers, model shells missing the fields the claim needs. Full catalogue: rubric §2.
- **Wiring check.** For every new artifact: imported where used, actually referenced, reachable from an entry point. Component → data source consumed. Query result → returned, not discarded. New route → registered.
- **Scope both ways.** Declared scope vs delivered scope (`git diff --name-status`): promised but absent, present but undeclared, unannounced deletions.
- **Design conformance.** Check the change against the written constraints for the touched area — architecture boundaries, module ownership, API contracts stated as "must", and the behavior the design promises. A delivery that works but violates a stated constraint has not delivered the design. A delivery that adds a mechanism the design never asked for is scope creep, not improvement; report it only when it changes behavior the design pinned down.

Severity: stub occupying a claimed behavior, claimed artifact missing, violation of an explicit Plan truth or design constraint → **BLOCKER**; real but unreachable → **WARNING** (BLOCKER if reachability itself is the claim); undeclared deletion → **WARNING**. Reductions sanctioned by an explicit decision are decisions, not defects. Where the design is silent, the implementation's choice stands — see `Design Feedback` for the case where you think that silence is a mistake.

## Q2 — Does the change break anything that already worked?

The check the mechanical gates miss most. What slips through: **silent behavior changes** — same signature, green suite, different semantics — and breaks in behavior no test covers.

- **Extract the contract surface** from Phase-1 list 2. Include functions whose *logic* changed even though the signature didn't — those are the dangerous ones.
- **Find all consumers.** `rg <symbol>` across the project, **including files outside the diff**. For each consumer ask: does the change break an assumption this caller holds? Changed nullability? Sync made async? Ordering changed? Error contract changed?
- **Check test infrastructure.** If the diff changes a shared fixture, mock, or helper, do existing tests using it now assert something weaker or different?

Scale rule: many consumers → `rg -l`, read a representative sample, state what you did not cover.

Severity: diff-outside call site broken with a concrete scenario → **BLOCKER**; semantic change that may be intentional → **WARNING**, but first check whether the design already sanctioned it — a sanctioned change is not a finding; consumers not fully checked → `UNCOVERED STEPS`, never fake coverage.

## Q3 — Are the new code paths correct under real inputs and states?

Walk the changed hunks against the defect catalogue (rubric §4) instead of trusting intuition: concurrency and shared state, resource lifecycle, boundaries and numerics, async gaps, swallowed errors, unsafe casts, security (unparameterized queries, `innerHTML`, missing auth on new routes, secrets in code).

Report only findings with a concrete failure scenario — "in situation Z this returns Y". Vague worries are not findings; ground them or drop them.

A tradeoff the design accepted is not a defect even when it creates a real limitation. Slow polling, a stale cache window, a fallback that retries once, a deliberate serialization — if the design says it, the finding does not exist. If you believe the design picked wrong, that is `Design Feedback`, not a Q3 defect.

Severity: defect with a concrete scenario and a behavior the design did not sanction, exploitable security hole → **BLOCKER**; plausible risk with a scenario, missing validation on a public surface → **WARNING**.

## Q4 — Do the tests prove it, and did the change leave orphans?

Three parts (in **Repo audit** mode, run only the third part across the whole project, ranked biggest cut first).

**Test effectiveness.** Map each behavior the design promises to its covering tests, then read what they actually assert. Broken patterns: skipped tests, circular proofs, placeholder assertions, existence-only assertions. The bar: **would this test fail if the behavior broke?** Skipped/circular/placeholder for a behavior the design requires → **BLOCKER**; a behavior the design explicitly promises with no test at all → **WARNING**. An untested code path that the design never mentions is not a finding — implementation freedom is not a coverage gap.

**Documentation drift.** For every changed external contract (API, schema, CLI flag, config key) or changed behavior the design pins down, find where docs describe it and check whether the change updated them. Docs that now contradict the design (not merely the code) → **WARNING** (REVISE — the fix is updating docs); violating a stated docs-sync rule → **BLOCKER**. Pure internal refactors trigger nothing.

**Debt — the orphan sweep.** One line per finding: location, what to cut. **A finding without a replacement is a complaint, not a finding.** In a change review this check is limited to orphans the diff itself creates:

| Tag | What it catches | Replacement |
|---|---|---|
| `delete:` | code, files, exports, or dependencies the diff orphaned by switching callers; dead code the diff introduced | nothing |
| `shrink:` | duplication the diff added when an existing helper or the same shorter form would do | name the existing helper or the shorter form |

`stdlib:`, `native:`, and `yagni:` belong to repo audit. In a change review they are re-litigating someone's design choice unless the design named the constraint, so leave them out.

**Orphan check on diffs**: whenever a diff removes an `import` or call to an internal function, module, or package, run `rg` across the repo to check whether that target now has **zero production references**. Leaving an orphaned function, file, test, or `package.json` dependency behind after replacing its caller → **WARNING** (REVISE).

Never flag: the smallest check that would fail if the logic broke (a smoke test, one assert) — that is the lean minimum, not bloat. Never simplify away input validation at trust boundaries, error handling that prevents data loss, or security measures. Correctness first, then leanness — never trade one for the other.

Severity: a module, function, or dependency the diff orphaned, duplication the diff introduced against an existing helper named by `file:line` → **WARNING** (REVISE); everything else → **INFO**.

Report the lean sweep only in **Repo audit** mode, ending `net: -N lines, -M dependencies possible` or `Lean already. Ship.`. A change review does not owe the reader a line-count target; hunting for deletions during a change review is how a small fix turns into an unrequested refactor.

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

Review noise is flagging things that aren't defects. Do not flag: what the gates already own; product preferences (use `Requirement Questions`); style nits without a maintenance consequence; "I would have designed it differently"; unverifiable worries without a scenario; scope you were not asked to review; sanctioned reductions; the lean minimum (one smoke test, one assert). Every Blocker and Warning must cite a location, the evidence, and the design basis it violates — a finding without a design basis is at most `Info`, and a preference with no basis is not a finding at all.

## Design Feedback

When the design itself looks wrong, report it once, then stop:

```
## Design Feedback
- {design clause and path} — {why it is a problem} — fix the design first, then re-review the implementation.
```

Rules that keep this from becoming a second review:

- It does not block. It never counts as Blocker or Warning and never changes the verdict.
- At most two items. Three or more means you are redesigning the feature, which is not this review's job.
- State it as a design problem, not as a list of downstream implementation defects. Decomposing one design choice into five "risks" is how a review invents scope.
- When the design is merely silent rather than wrong, the implementation stands. Silence is not a defect, and a reviewer filling silence with requirements is inventing them.

## Yardstick for severe logic risks

`Serious Logic Risks` exists for exactly one case: a concrete `file:line` scenario of irreversible destruction, major data corruption, or user harm **that also contradicts an explicit design clause**. This is a stricter bar than Q3's — the harm is severe, and the design did not accept it. A severe outcome the design explicitly accepted belongs in `Design Feedback`, not here.

## Review efficiency — target 2 rounds per change

Aim to converge review within **two rounds** (initial review + one re-review):

1. **First review must be exhaustive within the design.** Run all four questions, and report every finding that cites a design basis in one report. Findings you can ground must not be withheld. Findings you cannot ground do not belong in the report at all — "borderline" is not a license to include preferences.
2. **Re-review focuses on fix verification.** Verify reported fixes and inspect the blast radius of changes against the design. Avoid introducing ungrounded preferences or expanding scope late.

The review skill reports defects objectively without artificial stopping points. Iteration budgets, stopping gates, and escalation to the user belong to the controlling workflow (such as `dev-flow`).

## Verdict and report

```
PASS   — no Blocker, no Warning
REVISE — no Blocker, at least one Warning
BLOCK  — at least one Blocker
```

`Design Feedback`, `Needs Human`, `Serious Logic Risks`, and `Requirement Questions` never change the verdict. All four questions must be attempted before any verdict; a Blocker is a severity, not permission to skip the rest. Out of budget, emit the report with an explicit `UNCOVERED STEPS` section.

**Full report:**

```markdown
# Implementation Review — {scope label}

## Summary
- Review type: Implementation (Delivery | Change | Repo audit)
- Verdict: PASS | REVISE | BLOCK
- Counts: Blocker N / Warning N / Info N / Design-feedback N / Needs-human N
- Reviewed: {Plan path / commit / commit range / working tree}
- Design basis: {Plan task / DESIGN.md section / AGENTS.md rule / recorded decision | none found}
- Lean count: {repo audit only: net: -N lines, -M dependencies possible | Lean already}

## Blocker
### B-01: {title}
- Location: `{file}:{line}`
- Basis: {design clause, Plan task, or explicit statement it violates}
- Evidence: {code snippet or command output}
- Impact: {what fails, under which scenario}
- Fix direction: {what to change — concrete, not "improve it"}

## Warning
{same format as Blocker; Impact may be omitted}

## Info
{one line each}

## Design Feedback
{at most two items; design problem, not implementation defects; does not affect the verdict}

## Serious Logic Risks (Discuss with User)
{only severe + irreversible + contradicts an explicit design clause}

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

- `references/review-rubric.md` — phase-1 list building, stub patterns with probes, Q2 contract-surface procedure, Q3 defect catalogue, Q4 orphan tags with the probe bundle, severity calibration, worked examples
