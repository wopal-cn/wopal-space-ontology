---
description: Create or update DESIGN documents for products and subsystems based on PRDs and implementation facts
---

# Create or Update DESIGN

## Usage

```bash
/create-design product <product-name>
/create-design subsystem <parent-product> <subsystem-name>
/create-design update product <product-name>
/create-design update subsystem <parent-product> <subsystem-name>
```

If the mode is omitted, infer it from the target document:

- Target file missing → create mode
- Target file exists → update mode

If arguments are incomplete, infer from conversation context when there is only one reasonable target. Otherwise ask the user.

## Output Language

Write the generated or updated document in the user's preferred language unless the user explicitly requests another language.

## Document Paths

### Product DESIGN

Use the established product document naming convention when one already exists.

Default path:

```text
docs/products/<product-name>/DESIGN-<product-name>.md
```

Acceptable existing variants include:

```text
docs/products/<product-name>/DESIGN.md
docs/products/<product-name>/DESIGN-*.md
```

When updating, preserve the existing file path.

### Subsystem DESIGN

Default path:

```text
docs/products/<subsystem-name>/DESIGN.md
```

When updating, preserve the existing file path.

## Preconditions

A DESIGN document should be grounded in a PRD.

Required context:

- Target PRD, if present
- Parent product PRD/DESIGN, for subsystem DESIGNs
- Existing target DESIGN, if updating
- Current conversation context: user decisions, research conclusions, and confirmed requirements
- Implemented code or project docs, when updating from actual implementation

If no PRD exists and the user is not explicitly asking for a design-first draft, ask whether to create the PRD first.

### WopalSpace-specific context

When working inside WopalSpace, prefer canonical startup and structure files:

- `.wopal-space/STRUCTURE.md`
- `.wopal-space/REGULATIONS.md`
- `docs/products/wopal-space/PRD-wopalspace.md`
- `docs/products/wopal-space/DESIGN-wopalspace.md`

## Core Rules

- DESIGN answers: how the system is structured, how parts interact, and why key choices were made.
- DESIGN may include target-state design when the direction is decided but not fully implemented.
- DESIGN must not duplicate PRD-level vision, target users, or product roadmap except as short references.
- DESIGN must not become an implementation checklist, coding standard, or command transcript.
- Product DESIGN owns system composition, architecture layers, subsystem contracts, runtime model, flows, governance, and key decisions.
- Subsystem DESIGN owns internal module architecture, technical stack choices, interfaces, data/state model, and PRD-phase-aligned implementation status.
- Existing accurate content should be preserved and tightened, not rewritten for novelty.
- Outdated content should be revised or removed when evidence is clear.
- Open uncertainties should be marked as needing confirmation, not silently decided.

## Writing Quality Bar

DESIGN documents must use design-language, not process-language.

Required qualities:

- Concise technical claims: every paragraph should define a structure, boundary, contract, state owner, technology choice, or runtime behavior.
- Design-state wording: describe target architecture and ownership, not temporary implementation location or task progress.
- Evidence-backed claims: when updating from code, translate code facts into design responsibilities and contracts.
- Boundary clarity: every integration or technology choice should say what the subsystem owns and what it must not own.
- Phase-aware status: implementation status should answer how PRD roadmap phases have landed, not merely list modules.

Forbidden writing:

- Template commentary such as "this section should..." or "the document needs...".
- Filler architecture prose that does not change the reader's understanding of the system.
- Decorative diagrams that are harder to read than a sentence or table.
- Implementation-state headings like "current location" as primary design structure.
- Related-document links to backlog plans, task plans, command transcripts, or other temporary execution artifacts unless the user explicitly asks for implementation traceability.

---

## Shared Document Header

Every DESIGN should start with a concise metadata block after the title:

```markdown
> **Status**: Active  
> **Updated**: YYYY-MM-DD  
> **Product Intent**: `<prd-path>`
```

For subsystem DESIGNs, include parent architecture context:

```markdown
> **Parent Architecture**: `<parent-design-path>`
```

Use localized field labels if the document language is not English.

## Section 0: Change Log

Every DESIGN should include a concise `Change Log` section immediately after the document metadata and before section 1.

```markdown
## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| YYYY-MM-DD | Created / Updated | One-line summary |
```

Rules:

- Record only meaningful design intent, architecture, boundary, contract, or status changes.
- Do not record typo fixes, formatting-only changes, or wording polish.
- On update, append one row summarizing the current update.
- Keep each summary to one line.
- Do not place Change Log at the end of the document.

---

## Product DESIGN Template

Use this template for top-level products or systems.

### 0. Change Log

Use the shared Change Log format.

### 1. Design Goals

Define what this design document establishes and which product goals it supports. Point to the PRD for product intent.

### 2. System Overview

Provide a high-level architecture view. Include a concise diagram when useful. Show the major runtime parts and how they relate.

### 3. Architecture Layers

Describe the main layers or domains in the system. For each layer, specify responsibility, ownership, and consumers.

### 4. Core Subsystems

Define each core subsystem's role, boundary, and interaction contract. Link subsystem PRD/DESIGN documents when available.

### 5. Runtime Model

Describe runtime structure, state locations, data ownership, configuration layers, lifecycle behavior, and persistence boundaries.

### 6. End-to-End Flows

Describe the critical flows across subsystems. Use numbered flows or sequence-style descriptions. Focus on system behavior, not implementation tasks.

### 7. Ownership and Governance

Define which component owns each file, state area, configuration, rule, or lifecycle responsibility. Include protection and update rules where relevant.

### 8. Key Decisions

Record important technical and architectural decisions with rationale.

```markdown
| Decision | Choice | Rationale |
|---|---|---|
```

### 9. Related Documents

Link only durable product/design references: PRD, subsystem documents, business rules, architecture references, research summaries, and project specs. Do not include backlog plans, task plans, execution plans, command logs, or temporary implementation artifacts unless the user explicitly requests traceability.

---

## Subsystem DESIGN Template

Use this template for subsystems that serve a parent product or system.

### 0. Change Log

Use the shared Change Log format.

### 1. Subsystem Role

State where the subsystem fits, what it owns, and what it explicitly delegates to other subsystems. Keep this section concise and technical: role position, responsibility boundary, and target responsibility only. Do not repeat PRD prose or use decorative diagrams unless they clarify a real runtime relationship.

### 2. Design Principles

List the principles that guide technical choices inside this subsystem. Keep them specific enough to resolve design tradeoffs.

### 3. Module Architecture

Describe internal modules and their responsibilities in design-state language. Avoid implementation-state labels such as "current location". Code paths may appear as implementation carriers, but the primary columns should be design module, responsibility, and owning/target component.

### 4. Technical Stack Choices

Document the subsystem's technical stack and integration choices: runtime, framework, build/package tools, filesystem/state handling, external binaries, security scanners, protocol/client choices, output model, and configuration format. For each choice, explain why it fits the subsystem and what boundary it must not cross.

### 5. Interfaces and Contracts

Define external surfaces: CLI commands, APIs, events, file formats, schemas, protocols, or integration contracts. Keep this at specification level, not code walkthrough level.

### 6. Data and State Model

Describe owned state, persistence, configuration, caches, generated files, and migration or idempotency rules.

### 7. Implementation Status

Summarize current implementation against the related PRD roadmap or phases, not as a flat module inventory. For each phase, state the PRD target, what has landed, what remains, and what is deferred. Use implementation evidence, but write the section as product-design progress rather than a code checklist.

### 8. Related Documents

Link only durable product/design references: parent PRD/DESIGN, subsystem PRD, business rules, architecture references, and project specs. Do not include backlog plans, task plans, execution plans, command logs, or temporary implementation artifacts unless the user explicitly requests traceability.

---

## Update Mode

When updating an existing DESIGN:

1. Preserve the existing document path and title unless clearly wrong.
2. Update the `Updated` date.
3. Reconcile the document against:
   - user-confirmed requirements and conversation decisions
   - implemented code facts
   - related PRD/DESIGN documents
   - known roadmap artifacts and implementation evidence
4. Add missing required sections when the existing structure is incomplete.
5. Remove or revise obsolete architecture, boundary, interface, or status claims when evidence is clear.
6. Append one Change Log row in section 0 for the update.
7. Keep unresolved items explicit as "Needs confirmation" or equivalent in the document language.

Do not paste code-level implementation details into DESIGN. Convert code facts into architecture, contracts, state ownership, boundaries, or implementation status.

## Quality Checklist

- [ ] Correct template selected: product or subsystem
- [ ] Document language follows user preference
- [ ] Header includes current Updated date
- [ ] DESIGN is grounded in the PRD
- [ ] DESIGN uses concise technical design-language, not template/process commentary
- [ ] Product DESIGN explains cross-subsystem architecture and ownership
- [ ] Subsystem role is concise, technical, and boundary-focused
- [ ] Subsystem module architecture uses design-state language, not implementation-location language
- [ ] Subsystem DESIGN explains internal modules, technical stack choices, contracts, state, and PRD-phase-aligned implementation status
- [ ] Technical stack choices include rationale and ownership boundaries
- [ ] Implementation status is aligned to PRD phases or roadmap, not a flat module table
- [ ] Related documents exclude backlog plans and temporary implementation artifacts by default
- [ ] DESIGN avoids PRD-level vision/user/roadmap duplication
- [ ] DESIGN avoids task-level implementation instructions
- [ ] Existing accurate content preserved
- [ ] Obsolete content revised or removed
- [ ] Change Log updated for meaningful create/update changes
- [ ] Related documents linked

## Response After Completion

After creating or updating the DESIGN, respond in the user's language with:

1. File path
2. Create/update summary
3. Meaningful added, revised, removed/deprecated, and needs-confirmation items
4. Suggested next step, usually implementation planning or project spec update
