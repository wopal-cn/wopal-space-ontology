# Proposal Review Rubric — Procedures by Mode

Detail behind the questions, per mode. Load this when a question needs its full method, the command cookbook, or a worked example.

**Purpose reminder**: this review answers "will this work if executed or adopted as written". Form is owned elsewhere — `flow.sh plan check` for dev-flow Plans, `wopal space evo check` for evolution proposals, `scripts/verify-docset.py` for the doc-master document set.

Contents:
1. [Reading the artifact](#1-reading-the-artifact)
2. [Plan mode — Q1](#2-plan-mode--q1-do-the-parts-fit-together)
3. [Plan mode — Q2](#3-plan-mode--q2-are-its-statements-about-the-repo-true)
4. [Plan mode — Q3](#4-plan-mode--q3-will-executing-it-deliver-the-goal)
5. [Plan mode — Q4 Lean](#5-plan-mode--q4-lean)
6. [Document mode — D1–D4](#6-document-mode--d1d4)
7. [Severity calibration](#7-severity-calibration)
8. [Worked examples](#8-worked-examples)

---

## 1. Reading the artifact

Read the whole artifact once, with line numbers, before running any command. Build the three lists as you read:

1. **Facts** — every concrete claim about the repo, the system, or other documents (counts, paths, line anchors, doc sections, IDs, commands, flags).
2. **Symbols** — Plan mode: every code-like backticked name, with the Task that uses it and the Task that creates it. Document mode: every named component, capability, or contract, with where the document gives it an owner.
3. **Files** — every file path mentioned anywhere, with where it was mentioned.

Then run commands. Do not alternate between reading and verifying — each return costs more than the command saved. Keep the artifact's declared execution mode in mind from the start (sequential waves tolerate same-wave file overlap; claimed parallel waves require file-disjointness).

---

## 2. Plan mode — Q1: Do the parts fit together?

Needs the artifact only. Run it right after reading — pure mechanics, and it catches the most common cross-task defect class.

### 2.1 Expected file scope (no audit)

The `## Affected Files` table is the expected footprint, not a contract; the implementing agent backfills actuals at Done. **Do not diff task-level file lists against the table.** Two things remain checkable:

1. **Stale operation premises**: a row declaring "create" for a file that exists, or "delete" for a file that is absent — the implementer hits a wrong turn on a false premise (WARNING).
2. **Parallel overlap**: files overlapping between waves under declared parallel execution (BLOCKER). Under declared sequential layers, overlap is the Plan's design — not a finding.

**Common false positive**: rows naming artifacts the code creates at runtime, not files the Plan writes — a generated artifact needs no producer.

### 2.2 Symbols have producers

1. Walk the Tasks in order. Collect code-like backticked names a task *uses*: function calls, upper-snake constants, exported types, fixtures, CLI flags, env vars.
2. Collect the names each task *declares*: "register X", "create Y", "export Z".
3. Match each used name to a producer: a producer exists, spelling matches exactly, the producer's Task precedes the consumer's.
4. When a task registers a *set* of names, verify every name used elsewhere appears in that set.

| Condition | Severity |
|---|---|
| Used name with no producer anywhere | BLOCKER |
| Producer name differs from the consumer's expected name | BLOCKER |
| Producer sits in a later wave than its consumer | BLOCKER |
| Producer exists but its export/registration site is unstated and matters to wiring | WARNING |

### 2.3 Every AC has an owner, in the right bucket

1. List every AC in `### Agent Verification`.
2. Collect the referenced set from every Task's `**Verification Intent**`.
3. Diff them. Unreferenced ACs have no owner. Cross-task ACs must be marked as such.
4. Check the bucket: tests, lint, typecheck, scriptable assertions belong in Agent Verification; only human observation belongs in User Validation.

**Plain-text AC before coding**: before implementation starts, an AC may state the pass/fail rule in plain text when the exact test command will be filled in during the RED stage. Never flag a plain-text rule just for lacking a shell command yet; flag only rules that cannot catch a broken implementation.

### 2.4 Order matches dependencies

- Declared wave/dependency order must match the dependency table: no consumer before its producer.
- Declared execution mode must match reality: sequential waves tolerate same-wave overlap; claimed parallel waves require disjoint files.
- No task depends on an artifact the Plan never schedules for creation.

---

## 3. Plan mode — Q2: Are its statements about the repo true?

The repo is the only authority. Check each claim mechanically — never wave one through because it looks right.

### 3.1 Command cookbook

| Claim class | Command | Notes |
|---|---|---|
| Counts ("36 capabilities") | count them in the source of truth | the count motivates work — get it right |
| Paths / filenames | `test -e`, `ls`, `rg --files` | |
| Line anchors ("`file.ts:619-669`") | `sed -n 'Np' file` at the target revision | see anchor-drift judgement |
| Document sections cited | `rg -n '^#{2,3} Section' doc.md` | the Plan's authority citation |
| Decision / issue IDs | `rg -n` the ID in its source of truth | |
| Commands and flags named in ACs | check the command exists and accepts the arguments | |
| Menu of "new" vs existing files | `test -e` | |

**Revision discipline**: state which revision every check ran against — Base Commit, worktree HEAD, or integration HEAD. When the artifact declares a worktree, probe at the worktree's HEAD, not the integration branch.

### 3.2 Anchor-drift judgement

Line anchors locate code; they are not contracts. Probe the anchor and read a few lines around it:

- Lands on the described construct, or nearby with the construct clearly identifiable → pass
- Lands on unrelated code, or the construct is elsewhere → WARNING
- Construct does not exist at the stated revision → BLOCKER if the premise leans on it, else WARNING

### 3.3 Agreement with authorities

1. From Technical Context and `Pre-read`, list the design docs, rule files, and interfaces the artifact names as its basis.
2. Confirm the cited sections exist and say what is claimed.
3. For each decision, find the governing statement in the authorities and compare.
4. Classify divergence: **Acknowledged** (stated and justified → not a finding), **Deferred** (explicitly out of scope with a reason → not a finding), **Silent** (→ finding).

Judgement note: not every document statement is binding — older docs may describe a superseded model. Establish which document is authoritative *for the model this artifact implements* before calling a conflict.

---

## 4. Plan mode — Q3: Will executing it deliver the goal?

Needs the artifact only (plus goal decomposition — zero repo commands).

### 4.1 Goal covered

Split `## Goal` into independently meaningful parts; find the Task(s) delivering each. A part with no task is an intention, not a plan (BLOCKER).

### 4.2 Decisions delivered

1. For each `D-xx`, find the task(s) implementing it.
2. Confirm the delivery matches the decision's scope.
3. Scan task text for shrink words: `v1`, `simplified`, `static for now`, `hardcoded`, `placeholder`, `basic version`, `minimal`, `stub`, `not wired to`, `for now`.
4. Adjudicate, two questions in order: does the shrink contradict the Goal or a `D-xx`? Does a `D-xx` or scope statement **sanction** it? A sanctioned shrink is phased delivery — not a finding.

**Why a silent shrink is BLOCKER**: a reduced deliverable that reaches `verify` has already spent the execution budget. Phased delivery is fine when the artifact *says* it is a phase.

### 4.3 ACs that can fail

For each AC: if the feature were broken, would this check catch it? An AC asserting file existence where behavior is the claim proves nothing; one that merely repeats the task title proves less. An AC that cannot catch a broken implementation is WARNING — `plan check` checks whether a command is filled in; you check whether the AC actually proves anything.

### 4.4 Handoff possible

For each Task: knowing only the artifact and the declared `Pre-read`, could a competent implementer start?

- Interfaces, types, and outputs of earlier Tasks are **named**, not implied ("uses the shape from Task 2" is weak; "calls `parseConfig(path)` returning a `ParsedConfig`" is ready).
- The Task's own output is defined well enough for the next Task to consume.
- `Pre-read` files exist.

Flag only where the missing information would cause a wrong turn.

---

## 5. Plan mode — Q4: Lean

For every new item the Plan creates — module, class, interface, config surface, dependency, extension point — climb the ladder. Stop at the first rung that holds; the item must land at that rung.

### The ladder

1. **Does it need to exist at all?** One-implementation interfaces, one-product factories, config for values that never change, extension points with no consumer, layers with one caller. Speculative need = cut it, name the trigger that would justify it later.
2. **Already in this repo?** The Plan builds what a few files over already ships. Probe with `rg <pattern>` before flagging — the finding must name the existing implementation (`file:line`), or it is at most Info.
3. **Stdlib does it?** The Plan adds a dependency whose job the standard library already does. Name the stdlib function in the finding.
4. **Native platform covers it?** Code or a dependency doing what the platform ships (CSS over a JS polyfill, a DB constraint over app-side checks, built-in CLI flags over hand-rolled parsing).
5. **Shortest direct form?** The same logic a shorter, more direct form delivers. Show the shorter form in the finding.
6. **Cleans up what it replaces?** When the Plan replaces an existing module, helper, or dependency, check whether a task deletes the obsolete code, its old tests, and the unused dependency entry. Leaving replaced code behind turns it into dead code immediately.

### Dependency admission

Any new third-party dependency in the Plan needs a stated reason the ladder cannot satisfy: why stdlib, native platform, and every already-installed dependency fall short. A Plan that adds a dependency with no reason → WARNING. A Plan adding a dependency while rungs 3–4 hold → WARNING, and the finding names what it should have used.

### Severity

| Condition | Severity |
|---|---|
| Speculative abstraction or extension point | WARNING |
| Re-implementation of existing repo infrastructure (named `file:line`) | WARNING |
| New dependency while stdlib / installed packages cover it | WARNING |
| Replacement that leaves the old code, old tests, or old dependency behind | WARNING |
| Same logic in a shorter form | INFO |
| Style or naming preference | not a finding |

Q4 never blocks: the fix is shrinking the Plan, and lean findings are judgement calls, not execution failures. Report the total as `net: -N lines, -M dependencies possible` in the report Summary; nothing to cut → `Lean already`.

### Evolution-proposal capability gate

On top of Q1–Q4, an ontology evolution proposal's deliverable must satisfy the platform's own capability standards:

- frontmatter `name` + `description`; triggering conditions live in the description
- body = workflow, output, notes; long content offloaded to `references/`
- scripts/ holds only deterministic, reusable logic
- no invented structure beyond the platform's asset anatomy

Violation → WARNING. This gate checks the *proposal's stated deliverable*; the implementation review (df-implement-review) re-checks the landed files.

---

## 6. Document mode — D1–D4

No tasks to schedule, so the questions reshape. Q4's name and severity cap carry over.

### D1 — Does the document cohere?

Read for: contradictions between sections; terms used before definition or used two ways; components, states, or contracts the document introduces without an owner; sections that depend on context the document never provides.

**Structure conformance**: when the document belongs to the `dev-doc-master` set, structural rules (header zones, bidirectional index, naming, field vocabulary) are governed by `dev-doc-master/references/consistency.md`. The mechanical part is already scanned by its quality gate (`scripts/verify-docset.py`) — run it when available and spend your review on what the script cannot see: whether the *content* honors the structure (a header pointing at a document that no longer governs this one, a companion misclassified as a sub-design).

| Condition | Severity |
|---|---|
| Internal contradiction on a load-bearing statement | BLOCKER |
| Undefined term with real ambiguity | WARNING |
| Component or state introduced without an owner | WARNING |
| Structure drift the gate script already catches | report only if the gate was not run |

### D2 — Are its statements about reality true?

Same mechanical probes as Q2 (command cookbook, revision discipline, anchor drift). Additional checks in document mode:

- **Sibling-document conflicts**: two documents describing the same system differently. Apply the authority rule from 3.3 first; a silent divergence is a finding.
- **Target-state writing** (doc-master set): "deprecated", "legacy", "moved from", "migration" narration is a finding — the reader learns the current structure, not the history.

| Condition | Severity |
|---|---|
| Claim the code contradicts on a load-bearing path | BLOCKER |
| Stale claim with no effect on decisions | WARNING |
| Process-state narration (doc-master set) | WARNING |
| Cosmetic drift | INFO |

### D3 — Is the goal sound?

- **Decidable goal**: an observer can tell whether the goal was met. "Make the system more robust" is not decidable; "submits with zero schema errors" is.
- **Stated boundary**: the document says what it does not cover, or points where the boundary lives. A missing boundary is a blank check the implementer will cash.
- **Requirement gaps**: a user problem stated with no requirement answering it. The consumer of this document fills the hole silently, with their own guess.
- **Silent decisions**: choices a reader must make are stated or flagged, not buried in prose.

| Condition | Severity |
|---|---|
| Goal that cannot be judged met or unmet | BLOCKER |
| Missing boundary on a load-bearing area | WARNING |
| Requirement gap (problem without an answer) | WARNING |
| Silent decision the reader must make | WARNING |

### D4 — Is it lean?

Every feature, section, and abstraction earns its place against the goal:

- features answering no stated problem
- extension points for phases that may never come
- boilerplate structure the template suggested but the content does not need
- configuration surfaces with no reader

Template conformance is not a goal — structure serves the document's content, not the other way around. Severity: same table as Q4 (WARNING cap, INFO for shorter forms), with `net: -N sections possible` in place of the line count where applicable.

### Writing style gate (both modes)

The artifact's language is part of its quality: plain, concrete, one idea per sentence, affirmative over negative, ownership over exclusion. This gate flags:

- jargon or invented abstractions a reader must decode twice
- machine-sounding prose (nominalization stacks, passive voice chains)
- negative definitions ("X does not do Y") where ownership ("Y is owned by Z") says it better

Severity: a paragraph a reader must decode twice → **WARNING**; isolated awkward phrasing → **INFO**. For skill deliverables in evolution proposals, the bar is explicit: description and body must be plain and precise enough that an agent knows what to do after one read.

---

## 7. Severity calibration

Four classes, defined by what the reader should do:

| Class | Meaning | Test to apply |
|---|---|---|
| **BLOCKER** | Executing or adopting as written will fail, violate a contract, or under-deliver the goal | "If this ships, is it broken or dishonest?" |
| **WARNING** | Execution succeeds but the artifact is unsafe, bloated, ambiguous, or unverified where it should be verified | "Will this cost rework, bloat, or hide a gap?" |
| **INFO** | Improvement worth knowing, no action required | "Would a reasonable author shrug?" |
| **Unverified** | Claim could not be settled from the workspace | "Could I not check this?" |

Deliberately absent: **size/count thresholds**. Task count, file count, wave count, document length are never defects. Context budget is managed per task; a large cohesive artifact is normal.

### Calibration drills

| Situation | Correct verdict |
|---|---|
| Task references a function no other task creates | BLOCKER (Q1) |
| Task registers 5 error codes, a later task uses a 6th | BLOCKER (Q1) |
| Anchor `file.ts:964` lands at 967 on the described function | no finding |
| Plan contradicts a design doc it also cites, without acknowledgement | WARNING (Q2) |
| Plan contradicts a design doc and states "this supersedes §X of doc Y" | no finding |
| Reduction to "v1" where `D-04` sanctions the static layer | no finding (Q3) |
| Reduction to "v1" where `D-04` says "config displays calculated costs" | BLOCKER (Q3) |
| Plan adds `fast-xml-parser` while stdlib ships no XML parser and none is installed | no finding (Q4 — rung 5 legitimately holds) |
| Plan adds a new utility module duplicating `src/lib/hash.ts:12` | WARNING (Q4 — rung 2) |
| Plan creates `AbstractStore` with a single `FileStore` implementation | WARNING (Q4 — rung 1) |
| Design doc's §2 says the scheduler owns retries; §5 hand-wires a retry loop in the worker | BLOCKER (D1 — load-bearing contradiction) |
| Design doc narrates "the old monolith path is deprecated" | WARNING (D2 — target-state violation) |
| Design doc's goal is "improve developer experience" with no observable outcome | BLOCKER (D3 — undecidable goal) |
| Proposal deliverable is a skill whose body buries triggering conditions in section 4 | WARNING (capability gate) |
| Proposal body uses "leverage synergistic alignment layers" | WARNING (style gate) |
| A concern you could not check for lack of a sandbox | `Unverified`, never a finding |

---

## 8. Worked examples

### Example A — Symbol with no producer (Q1, Plan mode)

Task 2 registers five error codes: `A_MISSING`, `A_INVALID`, `S_MISSING`, `S_INVALID`, `C_UNRESOLVED`. Task 4 describes a failure branch "fail fast with `TEMPLATE_MISSING`".

```yaml
check: Q1_symbols
severity: blocker
location: "{plan}.md:{line of Task 4 branch}"
reality: "registered set at {plan}.md:{line of Task 2}; TEMPLATE_MISSING absent"
impact: "Task 4's failure branch cannot be implemented as written; the implementer improvises a second registration site"
fix: "add TEMPLATE_MISSING to the registration task, or reference an existing code"
```

### Example B — False premise (Q2, Plan mode)

Technical Context asserts "the legacy schema path is gone, so initialization always fails". Task 4 removes the reader for that path; AC#7 asserts a repo-wide search returns zero hits.

At the stated revision, the reader still has one live call site the Plan never names.

```yaml
check: Q2_facts
severity: blocker
location: "{plan}.md:{line of the premise}"
reality: "{file}:{line} still imports and calls the old reader; the search list omits that call site"
revision: "{commit}"
impact: "the premise is false; the repo-wide AC cannot pass — discovered at verify time, after the budget is spent"
fix: "name the remaining call site in a task's scope, or add it to the removal task"
```

### Example C — Re-invented infrastructure (Q4, Plan mode)

Task 3 creates `src/lib/retry.ts` with a backoff-retry helper. `rg 'retry|backoff' src/` shows `src/lib/http.ts:88` already ships one, used by four call sites.

```yaml
check: Q4_ladder
severity: warning
location: "{plan}.md:{line of Task 3}"
reality: "src/lib/http.ts:88 already provides backoff retry; 4 existing call sites"
impact: "two retry implementations diverge on edge cases; the shorter diff reuses the existing helper"
fix: "reuse the existing helper; delete Task 3, or reduce it to extending the existing one"
```

### Example D — Undecidable goal (D3, Document mode)

A product DESIGN's Goal reads: "improve the developer experience of the CLI".

```yaml
check: D3_goal
severity: blocker
location: "{doc}.md:{line of Goal}"
reality: "no observable outcome anywhere in the document; an observer cannot tell whether this was met"
impact: "every implementation choice can claim success; the goal cannot fail, so it governs nothing"
fix: "state the outcome the change produces, e.g. 'first-run setup completes in under one minute with zero manual edits'"
```

### Example E — Correctly NOT reporting a finding

Six tasks, 11 Affected Files rows, four waves; a `D-10` states "single-Plan delivery, not split by task count; tasks are mutually dependent; context budget is managed per task". The Plan also adds a new dependency, with a paragraph naming the stdlib options it considered and why each falls short.

**Correct handling**: no finding on size (size is not a defect), and no finding on the dependency (rung admission was explicitly satisfied). Report both under Positive Findings if useful.
