# GAPS Reference — Project Gap Tracking Authoring

Create or update a project-level `GAPS.md`: the record of divergence between a project's design target state and its implementation. Template: `templates/gaps.md`.

## What a GAPS Document Is

A GAPS document records where a project's implementation has not yet caught up with its design. It exists to feed planning: a reader opens it to learn what is still missing, how far the design and the code have drifted apart, and which gaps are worth closing next.

It is a **process document**, not a design document. It measures divergence from the design; it never inherits a design contract and never restates design content. When every gap it tracks is closed, the document is deleted entirely — a project with no gaps has no `GAPS.md`.

The document has three surfaces:

- **A header** declaring the design it measures against (`Design Source`).
- **Topic groups** (`##`) holding the gap entries, one topic per architectural area or document concern.
- **Gap entries** (`###`), each carrying `Current` / `Target` / `Design` / `Exit`.

## What Counts as a Gap

A gap is a statement about the **design**, not about the code's quality. Three situations qualify:

1. **The design requires something the implementation does not have.** The carrier is absent entirely.
2. **The design changed and the implementation has not followed.** The carrier exists but implements a superseded contract.
3. **The design declares the area experimental.** An experimental mechanism is a design that has not closed — the shape is sketched but not settled. Recording it as a gap is what puts it on the roadmap to convergence; without an entry it stays experimental indefinitely, because nothing owns the work of settling it.

The third case is easy to overlook because the design text is present and reads as intentional. It is intentional — the design names a direction. It is still unfinished, and an unfinished design is exactly what a gap tracker exists to surface.

### What Is Not a Gap

An implementation defect is not a gap. When the design is clear, the feature is implemented, and the implementation has a bug, a missing branch, or a rough edge, the distance being measured is between the code and its own intent — not between the design and the code. That belongs in an **Issue**, tracked through the issue workflow, where it reaches an engineer with the context to fix it.

The test is one question: **is the design satisfied in outline?** If the design's contract is present in the implementation and the problem is that it behaves incorrectly or incompletely in some path, it is an issue. If the contract itself is absent, or present in a superseded shape, or still experimental, it is a gap.

The distinction matters because the two routes end differently. A gap closes when a Plan implements the missing contract; an issue closes when a defect is fixed. Filing a defect as a gap produces a Plan whose scope is one bug, and a tracker that fills with entries no design analysis can resolve. Filing an unimplemented contract as an issue loses it among defects, where no phase planning will find it.

## Naming and Location

The file is named `GAPS.md` and lives in the project's `docs/` directory, beside the `DESIGN.md` it measures against.

```
projects/<project>/docs/
├── DESIGN.md
├── DESIGN-<topic>.md
└── GAPS.md
```

There is exactly one `GAPS.md` per project. Topics are grouped inside it under `##` headings — not split into separate files. When a document set grows large enough that one project's gaps no longer fit one readable file, that is a signal the project should be split, not that gaps should be scattered.

The ontology worktree places its `GAPS.md` at `.wopal/docs/GAPS.md`, following the same rule: beside its `DESIGN.md`.

## Granularity and Project Boundary

A gap, a Plan, and a task inside that Plan are three views of the same thing: a unit of work that can be delivered and verified on its own. They therefore share one boundary rule.

**One gap is one build block.** A gap covers a single functional module that closes as a unit — the same unit a Plan would carry as one task. Splitting one module's work across several gaps produces entries that can only be completed together, so each depends on the others and none is plannable alone. Merging unrelated modules into one gap produces an entry no single Plan can close.

The test: **could this be handed to one implementer as one piece of work, and verified by one set of Exit criteria?** If yes, it is one gap. If part of it could land while the rest waits on different work, it is two.

Gaps in the same project whose fixes touch the same code path are usually one gap. Sharing a source file is not by itself a reason to merge — a project's command surface may live in one file while its commands remain independent deliverables — but sharing the code path that must change is.

**A gap never spans projects.** The boundary is hard. When a target requires changes in more than one repository, that is not one gap with shared ownership; it is one gap per project, each carrying what its own repository must deliver. Neither half can be closed by the other, and a gap that names two owners stalls.

This applies exactly as it does to Plans and tasks: a Plan belongs to one project, and a task inside it belongs to that Plan. A gap that would need two repositories to close has crossed a boundary the work cannot cross — split it at the project line, then order the halves by their real dependency.

## Numbering

Gap identifiers are `<PREFIX>-G<n>`: a three-letter project prefix, a literal `-G`, and a sequential number. Examples: `CLI-G1`, `ONT-G3`, `ELL-G1`.

**Prefix.** The prefix is the owning project's three-letter abbreviation, and one document uses exactly one prefix. The prefix rule exists to answer a single question — which project closes this gap — so it stays at the project level and never encodes an area, topic, or document concern. `CLI-G<n>` belongs to wopal-cli, `ELL-G<n>` to ellamaka, `ONT-G<n>` to the ontology repository.

**Ownership follows the fix.** A gap belongs to the project whose code must change to close it — the boundary rule in Granularity and Project Boundary, applied to the identifier. One document uses one prefix, so the prefix encodes that owner and nothing else.

**Sequence.** Numbers run in one sequence per document and increment by one. A new gap takes the next free number regardless of which topic group it lands in.

**Immutability.** Once assigned, an identifier is never reused and never renumbered. A closed gap leaves its number retired, so references in plans, issues, and commits stay resolvable forever. A gap that supersedes a closed one takes a new number.

The numbering record is the document's own git history. A retired number is visible in the commit that removed the entry; there is no separate ledger to maintain, and no `Numbering` section in the document body.

**Renumbering an existing document.** When a document's prefixes predate this rule — area prefixes such as `ASSEMBLY-G1` in a single-project file, or the same prefix shared across two projects — normalize them in one pass: pick the owning project's abbreviation, apply it to every entry, and rewrite the sequence so numbers run in one order. The Phase document's gap inventory and any active Plan referencing the old identifiers are updated in the same change.

## Header

The header carries the design truth the gaps are measured against:

```
> **Status**: Active
> **Updated**: YYYY-MM-DD
> **Design Source**: `./DESIGN.md` (the design this document measures against)
> **Companion**: <one line describing what this document tracks>
```

`Design Source` names the authoritative design document this project's gaps are measured against. Use `Design Source`, not `Parent Architecture` — a GAPS document does not inherit an architecture contract, it measures divergence from one. When the project has a document set, point at the main DESIGN; the sub-designs are reachable through its `Sub-DESIGNs` field.

The source design must be **formal** (`Active`). A gap is the distance between a settled target and the current reality, so measuring against a draft produces gaps that the next design revision invalidates. When the design is still `Draft` or `Proposed`, promote it to `Active` first, then open the gap. See the document lifecycle rules in `consistency.md`.

`Updated` is refreshed on every edit.

## Gap Entries

Each gap is a `###` section with a stable title and four labelled parts. The labels are English — they are structured field names, and the quality gate matches them literally.

```markdown
### CLI-G3: `space sync` missing, legacy commands not removed (P0)

**Current**: A user can only push revisions in one direction, and there is no way to preview
what a sync would do before running it. Two older commands cover fragments of this job
and are still what users reach for.

**Target**: One `space sync` command moves work both ways — staging the space's own changes
upward first, then pulling the latest downward — with a preview before anything is applied.
The two older commands are gone, so there is one obvious command to run.

**Design**: `./DESIGN.md` (Space Lifecycle).

**Exit**:
- [ ] Running `space sync` without confirming shows a preview and changes nothing
- [ ] Running it on a space with uncommitted edits stops and says so
- [ ] The two older commands no longer exist
```

The gap is written for a reader who does not have the code open. It describes **what a user can observe and what they will be able to do** — not the shape of the implementation.

**Current** states the situation as it presents itself to a user of the product: what they cannot do, what they have to work around, what behaves inconsistently. It is grounded in verified reality, so every claim traces back to a real observation — but the evidence shapes the claim, it does not become the claim. If a paragraph reads as a summary of source files (`function X at path Y is called by Z`), it has been written for the wrong reader: rewrite it as the user-visible consequence. Naming a command or an option is fine, because users interact with those by name; naming internal modules, functions, or file paths is not.

**Target** comes from the design document and stays faithful to it. It describes the delivered experience — what a user will be able to do once the gap closes, phrased so that someone who has never read the design can picture the outcome. If the design and the implementation disagree about what *should* be, that is a design question — resolve it in DESIGN first, then record the gap.

**Design** points at the document that carries the solution, by its own name. The reader follows it for the full contract; the gap entry does not restate it.

**Exit** lists the criteria that close the gap, as checkboxes. Each describes an **observable outcome** — something a person can run, watch, or check, and then agree on whether it happened. "The command no longer has a hand-written JSON branch" is not an Exit criterion; it states a code shape, and only an author reading the source can confirm it. "The command's error response matches what `capability list` advertises" is, because it names an observation. Delivery facts, not implementation steps, and each independently verifiable. The checkboxes are the closing criteria, not a progress tracker: the gap is removed once all of them are met and its Plan reaches `done`. They are not hand-maintained in place.

Priority is recorded in the entry title as `(P0)` / `(P1)`, so that a reader scanning headings sees the ordering without opening each gap.

## Grouping

Group gap entries under `##` headings by topic — the dimensions along which a reader would look for gaps, such as an architectural area (`## Assembly Model`) or a document concern (`## Capability System`). Each `##` group is navigation, not classification: it exists so a reader can find the relevant gaps without reading the whole document.

The document goes straight from its header to the first topic group. Prose sections explaining what the document is or how to number it belong in this reference, not in the document body.

## End Section

The document closes with a `## Reference Documents` section carrying reference-only material:

- The project's own design documents not already named in `Design Source`.
- Related documents that inform but do not bind.

Header links and end links are disjoint. A document named in the header never appears again in the end section — listing it twice implies an obligation the reader cannot interpret.

## Relationship to the Capability Roadmap and Phases

A project's GAPS.md is the **single source of truth** for gap detail. The product DESIGN's Capability Roadmap describes product-level capability direction; a Phase document lists the gaps its scope closes, by identifier, title, priority, and design pointer, without restating their descriptions.

This split exists because duplicated gap descriptions drift. The Phase points at gaps; the project document defines them. Inherent phase-level ordering between capability lines may remain in the Phase; current execution dependencies and ordering between concrete Plans belong to the Space Active Plan Graph, not to GAPS or the Phase.

## Gap Discovery

Finding gaps is a bounded search, not an impression. The failure mode is a sample: the author reads a design, spots a few things the code lacks, and reports those. That produces a number with no denominator — neither the author nor the reader can tell whether it is 4 of 4 or 4 of 40.

Gaps are discovered by bounded enumeration. The bound comes from a **change of record**, not from reading around.

### Anchor the Range in a Change of Record

A gap exists between a design and an implementation. When a design has been reworked, that rework is a discrete, diffable event — use it as the search boundary.

1. **Find the pivot commit.** The commit where the design's model changed, not where it was merely formatted. A pivot rewrites the design's semantics: a model is replaced, a mechanism swapped, a structural layer removed. Doc renames, header normalization, and heading reshuffles are formatting and move nothing.
2. **Diff the design across the pivot.** `git diff <pivot>^ <head> -- <docs>` yields the exact set of design claims that changed. This is the enumeration: every semantically changed design statement is a candidate to check against the implementation.
3. **Group the diff into change themes.** Collapse the raw diff into a handful of named themes (a model swap, a new mechanism, a command-surface change, a capability-ownership move). Themes are the checklist units — they survive across many small commits and keep the audit tractable.

When no rework has occurred and the design is simply older than the code, anchor instead on the design document itself: enumerate its statements section by section.

### Verify Each Theme Against the Implementation

For every theme, locate the actual carrier in each affected project and record judgement with evidence:

| Judgement | Meaning | Required evidence |
|---|---|---|
| Landed | the implementation matches the design claim | file:line of the carrier |
| Partial | the carrier exists but does not fulfill the claim | file:line plus the specific shortfall |
| Missing | no carrier exists | the search performed (what was grepped, in what scope) |
| Doc drift | implementation is right, the design text is stale | design file:line that contradicts reality |

A judgement without a `file:line` is an impression, not a finding. `Missing` in particular requires stating the search, because absence of evidence is only meaningful when the search scope is known.

### Sweep in Both Directions

Design-to-code finds unimplemented claims. Code-to-design finds the opposite: assets, commands, and modules that exist with no design statement behind them. Both are gaps of a kind — one is missing work, the other is missing authority. Run both and record both.

### Reconcile Against the Existing Gap Set

New findings must be checked against the gaps already recorded before a new identifier is minted. An implementation shortfall is very often already covered — read the candidate gap's `Exit` criteria and ask whether they already close the finding.

This step prevents duplicate tracking, and it also prevents the opposite error: declaring "uncovered" without reading. A finding is only uncovered after the full `Exit` list of every related gap has been read. A `Target` that mentions the area is not coverage; a concrete `Exit` criterion is.

### Convergence

The audit is complete when every theme has a judgement, every judgement carries evidence, and every finding is either mapped to an existing gap or recorded as new. That is the denominator: themes enumerated = themes judged = findings accounted for.

Report the audit as the theme table plus the reconciliation result. A reader who trusts the report can re-run the diff and reach the same theme list — that is what makes the result checkable rather than asserted.

## Gap Lifecycle

A gap has two states: **open** (it exists in `GAPS.md`) and **closed** (it is gone). There is no third state, and no status field — the presence or absence of the entry is the status.

A gap closes when its `Exit` criteria are met and the Plan that carried it reaches `done`. The `Exit` criteria are the gap's own verification statements; they are verified during Plan execution.

Closing procedure:

1. Confirm the gap's `Exit` criteria are all met, with the Plan in `done`.
2. Remove the gap entry from `GAPS.md`.
3. Leave the identifier retired — the number is never reused.
4. The Phase document's gap inventory entry drops when the gap disappears from `GAPS.md`.

Do not add a `Status` field, an "in progress" marker, or a "completed" note. A Plan's own state already tells a reader that a gap is being worked on; a second status in GAPS duplicates that and drifts out of sync.

## Quality Checklist

- [ ] File is `GAPS.md` in the project's `docs/`, beside the `DESIGN.md` it measures
- [ ] Header uses `Design Source`, not `Parent Architecture`
- [ ] `Design Source` points at a formal document (`Active`), never a draft
- [ ] `Updated` date is current
- [ ] Every identifier follows `<PREFIX>-G<n>`; the prefix is the owning project's three-letter abbreviation, and the document uses exactly one prefix
- [ ] No number is reused or renumbered
- [ ] Every gap closes within a single project; work spanning multiple projects is split into one gap per project
- [ ] Every gap is one build block — deliverable and verifiable as one unit, matching the granularity of a Plan task; no gap requires another gap to complete
- [ ] No `About This Document` or `Numbering` prose section in the body — the document goes straight from the header to its topic groups
- [ ] Every gap has the four labelled parts: `Current` / `Target` / `Design` / `Exit`
- [ ] Every `Current` describes a user-observable situation; internal modules, functions and file paths do not appear in it
- [ ] Every `Target` traces back to a statement in the design document and is phrased as a delivered experience
- [ ] Every `Exit` describes an observable outcome, not a code shape — a reader can confirm it without reading the source
- [ ] Every `Design` names the document carrying the solution
- [ ] Every `Exit` is a checkbox list of verifiable closing criteria
- [ ] Priority marked in each entry title
- [ ] End section is reference-only and does not repeat header documents
- [ ] No design decisions recorded as gaps — those belong in DESIGN
- [ ] No implementation defects recorded as gaps — a satisfied contract with a bug is an issue
- [ ] Every experimental design area is recorded, so it has an owner to carry it to convergence
- [ ] No status field or "in progress" marker on any gap — presence or absence is the status
- [ ] Every gap was found by the bounded enumeration in Gap Discovery, not by impression — the search range is stated and diffable
- [ ] Every finding was reconciled against existing gaps' full `Exit` lists before a new identifier was minted

## Update Mode

1. Refresh `Updated`.
2. Add new gaps with the next free number in their prefix.
3. Revise gap entries as the implementation moves.
4. When a gap closes, remove its entry per Gap Lifecycle. Leave no "completed" markers — a gap that no longer exists is simply gone, and the number stays retired.
5. Re-check the document-set: a design change may close or open gaps elsewhere in the set.
