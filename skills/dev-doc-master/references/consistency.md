# Document-Set Consistency — Universal Rules

These rules apply to every document in the product documentation set: PRD, DESIGN (main and sub), Phase, and AGENTS.md. They exist so the document set stays coherent, avoids duplicated or contradictory claims, and keeps the maintenance cost low.

## No Chapter Numbering

Headings express structure through Markdown heading levels, not numbers. Write `## Capability Scope`, never `## 1. Capability Scope`. Chapter numbers force renumbering on every insert, move, or deletion; heading levels survive structural edits. Applies to every generated or updated document.

## Target-State Writing

Documents describe the target state only — what the system is, what exists, who owns it, what responsibility it carries. Process-state descriptions are forbidden: no "deprecated", "legacy", "moved from X", "old path", "migration", or "historical" notes. When a capability is owned elsewhere, state the ownership, not the move. A reader of a document learns the current structure and responsibilities, never the history of how it got there.

## Writing Style

Target-state content is only half the job; how it reads is the other half. These rules apply to every sentence in every document of the set.

### Natural Language

Write like a human explaining something clearly to a colleague. Read the sentence aloud — if it sounds like a machine produced it, rewrite it. Prefer plain verbs and concrete nouns over nominalizations and stacked qualifiers.

### One Idea Per Sentence

Keep sentences short and carry one thought each. When a sentence contains two independent claims, split it. Long compound sentences hide which part is the commitment and which is decoration.

### Affirmative Over Negative

State what a component does, what it owns, and who is responsible. Instead of "X does not handle Y" or "Y is not supported", write "Y is owned by X" or "Y belongs to a later phase". The reader should learn the structure, not reconstruct it from a list of absences.

### Ownership Over Exclusion

Draw boundaries through ownership rather than exclusion. "X is responsible for A; Y owns B" reads better than "X does not do B, and Y is not involved in A". Every boundary statement names the owner of each side.

## Relative Links Only

All document links are relative to the repository root or the document's directory. Absolute paths (e.g. `/Users/...`, `file:///...`) are forbidden because these documents are committed to git and shared across machines — an absolute path works only on the machine that wrote it. Use `./DESIGN.md`, `../DESIGN.md`, or `docs/products/<name>/DESIGN.md` style relative paths consistently within a document.

## Header = Mandatory, End = Reference

Every document has two link zones with distinct obligations:

- **Header** (metadata block after the title): carries only **mandatory** documents — the parent document and sibling documents that this document must follow. Examples: a PRD's `Related DESIGN`, a sub-DESIGN's `Parent: ./DESIGN.md`, a Phase's `Product PRD` + `Product DESIGN`, a product DESIGN's `Sibling DESIGNs`.
- **End** (`Reference Documents`): carries **reference-only** documents — material that informs the document without binding it. The narrower name matters: it tells an author that a document belongs here only when a reader would genuinely benefit from following it, not merely because it is adjacent.

A document is either a mandatory header link or a reference end link, never both. Never list a header document again in the end section, and never promote a reference document into the header as if it were binding.

### The Obligation Test

When a document's placement is unclear, ask whether the reader must follow it to evaluate this document.

- **Must follow it** → header. The document states a contract, constraint, or architecture this one is bound by. Long file paths, another repository, another team's ownership, and a different naming convention do not weaken the obligation.
- **Would benefit from it** → end section. The document supplies background, precedent, or external context that this one does not depend on.

The common failure is drift toward the end section: an author sees a document that feels "external" (it lives in another repository, or it was written before this one) and files it as reference. That silently demotes a binding contract to optional reading. The header is the reader's map of dependencies — a dependency filed as reference is a dependency the reader will miss.

## Language

Headings and header field names are English in every document, regardless of the document's language. The quality-gate script matches these literally, and a stable heading vocabulary keeps documents comparable across projects.

Body text and header field values follow the document's language. A Chinese document reads Chinese in the body and in field explanations; its headings stay English.

## Gap Detail Has One Home

Gap detail lives in the project `GAPS.md` and nowhere else. A Phase document lists the gaps its scope closes by identifier, title, priority, and design pointer — it does not restate Current / Target / Exit. Duplicated gap descriptions drift apart, and the reader then cannot tell which copy is authoritative.

The Phase document carries only what no single gap can carry: phase-level Completion Criteria, scope grouping, capability rows advanced, inherent capability-level ordering between scope areas, and residual risks. Concrete Plan state and Plan-level execution DAGs are owned by Plans and the Space Active Plan Graph respectively, never by the Phase.

## Process Documents vs Design Documents

The document set contains two kinds of documents, and they relate to the design differently:

- **Design documents** (PRD, DESIGN, Phase) *inherit*: they declare the parent documents they must follow, and their header carries those mandatory parents.
- **Process documents** (GAPS) *measure divergence from*: they name the design they track, without becoming part of its lineage.

The distinction matters for the header. A design document uses lineage fields (`Parent Architecture`, `Parent Product`, `Product Intent`). A process document uses `Design Source` — it points at the design it measures, and it does not claim to follow an architecture contract. Writing `Parent Architecture` on a GAPS document misstates the relationship and implies an obligation the document does not carry.

Because a gap measures the distance between a settled target and the current reality, `Design Source` points at a formal document. A draft is promoted to `Active` before it is analysed; see the document lifecycle section.

Process documents also carry a lifecycle note. A GAPS document states that it is removed once its gaps close, because a reader who mistakes it for permanent documentation will maintain it as such and let stale entries accumulate.

## Main Document Lists Its Sub-Documents

A suffix-free main document is the single entry point to its document tree. Its header must enumerate every `DESIGN-<topic>.md` / `PRD-<topic>.md` sub-document under it (a `Sub-DESIGNs` / `Sub-PRDs` field). Each sub-document header points back via `Parent: ./DESIGN.md`. This bidirectional index must match the actual files on disk — when a sub-document is added or removed, both sides are updated. Sub-documents listed in the header are structure declarations, not references, so they never appear in the end section.

## Sub-DESIGN Enumeration Is a Filesystem Fact

The header's sub-document list is a filesystem fact, not a summary. Before writing the header, list every `DESIGN-<topic>.md` in the same directory with `ls`. The header must enumerate exactly those files — nothing more, nothing less. After writing, re-run the same listing and diff against the header. A header that misses a file breaks the bidirectional index; a header that lists a nonexistent file is a dead link. This check is part of the mandatory quality gate.

## Companion Documents vs Sub-DESIGNs

A documentation set contains two distinct kinds of supporting files:

- **Sub-DESIGNs** (`DESIGN-<topic>.md`): architecture documents that decompose a main DESIGN chapter. They follow the naming convention, carry a `Parent` link, and are enumerated in the main header's `Sub-DESIGNs` field.
- **Companion documents** (e.g. `BRANDING.md`, `API-CONTRACT.md`): single-source-of-truth documents that belong to the set but are not architecture decompositions. They do not use the `DESIGN-<topic>.md` naming pattern, do not carry a `Parent` link, and are declared in the main header's `Companion Documents` field or in the document-relationship table.

Both directions of misclassification are errors. Promoting a companion document into the sub-design enumeration invents a structure that does not exist. Leaving a real sub-design under an ad-hoc name hides a branch of the document tree from every reader who trusts the main header as the map — the document exists, but nothing points at it.

### Classification Is by Content, Not by Name

A file's name records how it was first created, not what it became. Classify by asking what the document does:

1. **Does the main DESIGN treat it as an elaboration of one of its own sections?** The decisive signal is a delegating reference in the main document — a sentence of the form "the full protocol lives in X", "details are in X", "the release contract is in X". If the main document hands part of its own architecture to another file, that file is a sub-design, whatever it is called.
2. **Is it the sole authoritative source for one architectural concern** (a contract, a protocol, a layering model, a subsystem) rather than a cross-cutting reference table (brand constants, business rule numbering)? The former is a sub-design; the latter is a companion.

Size corroborates the answer. A supporting document that approaches the main DESIGN's own length, or that would exceed the chapter split guideline (`design.md`, roughly 150 lines) on its own, is carrying architecture — it belongs in the sub-design enumeration.

A classified sub-design is renamed to `DESIGN-<topic>.md`, given `Parent: ./DESIGN.md`, and enumerated in the main header. The rename is part of the classification, not a separate cosmetic step: the naming convention is how a reader recognizes the document's role at a glance.

## Document Lifecycle: Draft and Formal

Every design document is either a **draft** or a **formal** document. The distinction is not a matter of taste; it decides whether the document can be measured against reality.

| Status | Class | Meaning |
|---|---|---|
| `Draft` | draft | the design is still being worked out; its target state may change |
| `Proposed` | draft | the design is written but not yet settled |
| `Active` | formal | the design is settled and binding |

**Only formal documents take part in GAPS analysis.** A draft describes a target state that is still moving. Measuring implementation against it produces gaps that the next revision invalidates, so the tracker fills with noise and the team learns to ignore it. The rule follows directly from what a gap means: a gap is the distance between a settled target and the current reality, and a draft has no settled target to measure.

**A draft becomes formal before its gaps are analysed.** Moving a document from `Draft` or `Proposed` to `Active` states that its target shape is settled — the design decisions are made, the boundaries are drawn, the contracts are defined. Only then does the project `GAPS.md` list gaps against it.

`Design Source` in a `GAPS.md` therefore points at a formal document. When the source design is still a draft, analysis waits for the promotion rather than tracking a moving target.

A design document has no completed state. A design states what the system is; implementation progress belongs to Plans and `GAPS.md`. When the design changes, the document is revised in place and stays `Active`. The design's own status describes whether its target shape is settled, never how much of it has been built.

## Header Field Set

Every document header uses fields drawn from one fixed vocabulary. Field names are English, always, and a document uses only the fields that apply to it — but it never invents a field name outside this set.

| Field | Applies to | Meaning |
|---|---|---|
| `Status` | every document | lifecycle status: `Draft`, `Proposed`, `Active` |
| `Updated` | every document | last update date, `YYYY-MM-DD`, refreshed on every edit |
| `Parent Architecture` | project DESIGN, sub-DESIGN | the architecture document this one follows; `N/A` at the top of a product |
| `Parent Product` | project DESIGN, sub-DESIGN | the product PRD this one follows; `N/A` when none |
| `Parent` | sub-document (PRD / DESIGN / Phase) | the direct parent document in its own tree, e.g. `./DESIGN.md` |
| `Product Intent` | product DESIGN | the PRD this DESIGN follows |
| `Sibling DESIGNs` | product DESIGN | the project DESIGNs of this product's core subsystems; their contracts bind this design |
| `Sub-DESIGNs` | main DESIGN | exact enumeration of every `DESIGN-<topic>.md` under it |
| `Sub-PRDs` | main PRD | exact enumeration of every `PRD-<topic>.md` under it |
| `Companion Documents` | main DESIGN / PRD | companion truth sources (BRANDING, API-CONTRACT) |
| `Design Source` | GAPS | the formal design document this gap tracker measures against |
| `Product PRD` | Phase | the PRD this Phase follows |
| `Product DESIGN` | Phase | the DESIGN contract this Phase follows |
| `Phase ID` | Phase | the phase identifier |
| `Product` | Phase | the product this phase belongs to |
| `Scope` | any document | one line narrowing what the document covers, when the title alone is ambiguous |
| `Companion` | GAPS | one line describing what the document tracks |

Two rules follow from this table:

- A document does not use a field that does not apply to it. A Phase document has no `Sub-DESIGNs`; a GAPS document has no `Parent Product`.
- A document does not invent a field. If a fact does not fit the vocabulary, it belongs in the body, not in the header.

`Parent` and `Parent Architecture` are separate obligations and may both appear: `Parent` points at the immediate document in the current tree (`./DESIGN.md`), `Parent Architecture` points at the product-level architecture above the whole project. They are never merged into one line.

## Metadata Field Semantics

Header metadata fields have fixed meanings:

| Field | Where | Meaning |
|---|---|---|
| `Status` | all | document lifecycle status (`Draft` / `Proposed` / `Active`) |
| `Updated` | all | last update date, YYYY-MM-DD, refreshed on every edit |
| `Parent` | sub-documents | the direct parent document, `./DESIGN.md` for project sub-docs |
| `Parent Architecture` | sub-documents | product-level architecture document this doc must follow, when it exists |
| `Sub-DESIGNs` | main documents | exact enumeration of all `DESIGN-<topic>.md` under it |
| `Companion Documents` | main documents | companion truth-source documents (BRANDING, API-CONTRACT) |
| `Reference Documents` | end section | reference-only material, never in the header |

A sub-document header uses `Parent` for its project parent, not `Parent Architecture`. `Parent Architecture` is reserved for product-level documents above the project DESIGN. When both exist, they are separate lines with distinct targets.

## Mandatory Quality Gate

Every document-set update ends with an automated scan that must pass before the work is reported complete:

1. Enumerate `DESIGN-*.md` on disk and diff against the main header's `Sub-DESIGNs` — bidirectional, exact match.
2. Verify every sub-document header has `Parent: ./DESIGN.md`.
3. Scan for absolute paths (`file:///`, `/Users/...`) — zero tolerance.
4. Verify relative links resolve to existing files — both Markdown link targets and backticked `./`- or `../`-prefixed paths in header fields.
5. Confirm the end section (`Reference Documents`) contains no sub-DESIGNs and no header documents.
6. Scan for process-state vocabulary (已废弃, 已放弃, 迁移, 不再执行, 历史机制, deprecated, legacy, moved from).
7. Confirm every touched document has a refreshed `Updated` date.
8. For process documents (`GAPS.md`): confirm the header uses `Design Source` rather than a lineage field, and that header and end links are disjoint.

Run `scripts/verify-docset.py <docs-dir>` where available; otherwise run the equivalent grep checks by hand. The scan result is part of the completion report.

## Document-Set Consistency on Every Update

Updating one document is never isolated. A change to any document can invalidate claims in its parents, children, or siblings. Before finalizing any update:

1. Identify the affected set: parents (what this document follows), children (sub-documents), and siblings (documents sharing the same parent or describing the same phase/project).
2. Check each affected document for stale claims that contradict the change; revise or remove them when evidence is clear.
3. Align the bidirectional index and header links.
4. Align Phase Goals with the DESIGN Capability Roadmap; align DESIGN architecture with the PRD vision.

The completion response must state which related documents were checked, which were aligned, and which still need a follow-up update.

## Change Flow Per Document Type

| Document changed | Must check |
|---|---|
| PRD | DESIGN (product + project), Phase documents, sub-PRDs |
| Main DESIGN | Sub-DESIGNs, product PRD, Phase documents |
| Sub-DESIGN | Main DESIGN chapter that decomposed into it, PRD, Phase |
| Phase / Roadmap | PRD, product DESIGN, project DESIGNs, sub-DESIGNs |
| AGENTS.md | Project DESIGN, PRD, actual code |

## Document Roles: What Belongs Where

Every fact in a project has exactly one home. When an author is unsure which
document should carry something, the answer follows from the document's role,
not from where the content currently sits or how big the file is.

| Document | Carries | Does not carry |
|---|---|---|
| PRD | Product intent, user problems, value proposition, scope | Architecture, module layout, technology choices |
| DESIGN (product) | System layering, subsystem boundaries, runtime model, end-to-end flows, capability roadmap | Per-project internals, deployment mechanics, implementation status |
| DESIGN (project) | Project role and boundaries, capability scope, module architecture, technology choices, interface contracts, data and state model | Another project's internals, delivery progress, task lists |
| DESIGN (sub) | One architectural concern delegated by the main DESIGN — a contract, a protocol, a layering model, a subsystem | Concerns the main DESIGN keeps; cross-cutting reference tables |
| Phase / Roadmap | Phase goal, scope grouping, gaps closed by id, phase-level completion criteria, capability-level ordering, residual risks | Gap detail (`GAPS.md`), implementation steps/state (Plans), Plan-level execution relationships (Active Plan Graph) |
| AGENTS.md | Rules an agent follows while working: commands, conventions, boundaries, verification requirements | Architecture narrative, contract definitions, design rationale |

Two consequences follow.

**Design content belongs in design documents; operating rules belong in the
project spec.** A deployment mechanism — the image layout, the file
organization, the rollback procedure — is design content and lives in the
project DESIGN (or its distribution sub-DESIGN). The rule that an agent must
run the build gate before deploying is a working rule and lives in `AGENTS.md`.
The same fact often has both faces: the DESIGN states what the deploy pipeline
*is*, and `AGENTS.md` states what an agent must *do* about it. Write both, each
in its own home, rather than duplicating one into the other.

**A document is classified by what it does, never by how it was named.**
Renaming is part of classification, not a separate cosmetic step: a supporting
document that turns out to carry one of the main DESIGN's own concerns is
renamed to `DESIGN-<topic>.md`, given a `Parent` link, and enumerated in the
main header. A document originally written under an ad-hoc name is still a
sub-design if it carries architecture.

## Scope Discipline for an Alignment Pass

An alignment pass brings a document set into conformity with these rules. It is
not a rewrite of the product.

- **Fix what the rules govern.** Metadata vocabulary, classification, link
  integrity, chapter numbering, target-state language, and document-set
  consistency.
- **Do not invent decisions.** Where the documents describe a product state
  that has not been settled, record what the documents say and let the owner
  settle it. An alignment pass that quietly picks a new paradigm has exceeded
  its mandate.
- **Resolve ambiguity from the code and the sibling documents first.** A
  question answerable by reading the repository — which routes are gated, where
  content actually lives, what a script's output path is — is answered by
  reading, not by asking. Reserve questions for decisions only the owner can
  make.
- **Report the drift you find rather than silently normalizing it.** When the
  documents and the code disagree about something the alignment pass should not
  decide alone, fix what is clearly stale and report the rest.
