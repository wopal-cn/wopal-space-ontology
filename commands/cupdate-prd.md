---
description: Create or update PRD documents for products and subsystems
---

# Create or Update PRD

## Usage

```bash
/create-prd product <product-name>
/create-prd subsystem <parent-product> <subsystem-name>
/create-prd update product <product-name>
/create-prd update subsystem <parent-product> <subsystem-name>
```

If the mode is omitted, infer it from the target document:

- Target file missing → create mode
- Target file exists → update mode

If arguments are incomplete, infer from conversation context when there is only one reasonable target. Otherwise ask the user.

## Output Language

Write the generated or updated document in the user's preferred language unless the user explicitly requests another language.

## Document Paths

### Product PRD

Use the established product document naming convention when one already exists.

Default path:

```text
docs/products/<product-name>/PRD-<product-name>.md
```

Acceptable existing variants include:

```text
docs/products/<product-name>/PRD.md
docs/products/<product-name>/PRD-*.md
```

When updating, preserve the existing file path.

### Subsystem PRD

Default path:

```text
docs/products/<subsystem-name>/PRD.md
```

When updating, preserve the existing file path.

## Context Collection

Read enough context to avoid inventing requirements.

### Required

- Existing target PRD, if present
- Parent product PRD, for subsystem PRDs
- Related DESIGN documents, if present
- Current conversation context: user needs, decisions, research conclusions, and unresolved questions

### When updating from implementation

Inspect the current implemented code or project docs only to extract product facts, current capabilities, and actual boundaries. Do not turn implementation details into PRD content.

### WopalSpace-specific context

When working inside WopalSpace, prefer canonical startup and structure files:

- `.wopal-space/STRUCTURE.md`
- `.wopal-space/REGULATIONS.md`
- `docs/products/wopal-space/PRD-wopalspace.md`
- `docs/products/wopal-space/DESIGN-wopalspace.md`

## Core Rules

- PRD answers: what to build, for whom, why it matters, and what product outcomes it serves.
- PRD must not explain internal architecture, APIs, storage schemas, implementation steps, or coding conventions.
- Product PRD owns vision, users, product shape, capability boundaries, governance, and evolution.
- Subsystem PRD owns role, boundaries, responsibilities, capability scope, and evolution within a parent product.
- Subsystem PRD must not duplicate the parent product's full vision or target-user analysis.
- Capability Scope / Core Capability Boundaries sections must describe target-state capability boundaries only: owned target capabilities, excluded capabilities, and delegation boundaries.
- Capability Scope / Core Capability Boundaries sections must not include phase timing, current/future grouping, implementation status, delivery progress, module state, checkboxes, or "done / partial / pending" labels.
- Implementation status belongs only in Evolution Roadmap / Implementation Roadmap sections, where phases may be marked as completed, current, planned, or deprecated.
- Do not include standalone success-standard or validation-signal sections in PRDs. If validation signals are needed, place them in Plans, UAT, verification documents, or roadmap phase acceptance notes, not in the PRD template.
- PRD body must use product language, not documentation-authoring language. Do not explain what a section is for, how the document is organized, or how the template should be used.
- Avoid abstract classification or defensive phrasing that does not communicate product value, such as "this is not X but Y", "exposes an interface", "has grown into", or "this section describes".
- Each paragraph and table row should communicate a product fact: user problem, product role, user benefit, owned capability, excluded boundary, product entry, or roadmap outcome.
- Preserve the required PRD structure, but rewrite weak wording inside sections instead of changing the structure to avoid the wording problem.
- Existing accurate content should be preserved and tightened, not rewritten for novelty.
- Outdated content should be revised or removed when evidence is clear.
- Open uncertainties should be marked as needing confirmation, not silently decided.

---

## Shared Document Header

Every PRD should start with a concise metadata block after the title:

```markdown
> **Status**: Active  
> **Updated**: YYYY-MM-DD  
> **Related DESIGN**: `<path-if-known>`
```

For subsystem PRDs, include parent product context:

```markdown
> **Parent Product**: `<parent-product-prd-path>`
```

Use localized field labels if the document language is not English.

## Section 0: Change Log

Every PRD should include a concise `Change Log` section immediately after the document metadata and before section 1.

```markdown
## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| YYYY-MM-DD | Created / Updated | One-line summary |
```

Rules:

- Record only meaningful document intent, scope, structure, or product requirement changes.
- Do not record typo fixes, formatting-only changes, or wording polish.
- On update, append one row summarizing the current update.
- Keep each summary to one line.
- Do not place Change Log at the end of the document.

---

## Product PRD Template

Use this template for top-level products.

### 0. Change Log

Use the shared Change Log format.

### 1. Vision and Positioning

Explain why the product exists, what problem it solves, and what unique position it takes. Keep it product-level; do not describe implementation.

### 2. Mission and Philosophy

State the mission in one sentence. Add 3-5 guiding principles that should shape product decisions.

### 3. Target Users

Describe user types, core needs, and pain points. Use a table when multiple user groups matter.

### 4. Product Shape

Define the product's major parts or experience surfaces. Explain what each part means to users.

### 5. Core Capability Boundaries

Group capabilities by product domain. Clarify target-state owned capabilities, explicit out-of-scope areas, and delegation boundaries. Do not include phase timing, current/future grouping, implementation status, or delivery progress here.

### 6. Key User Scenarios

Write 3-5 scenario-level narratives. Each scenario should explain the user's goal and the product's support, not command syntax or implementation details.

### 7. Governance Principles

Document product-level rules that protect user trust, safety, maintainability, or long-term evolution.

### 8. Evolution Roadmap

Describe product phases from current state to target state. Mark each phase as completed, current, planned, or deprecated when known. Focus on product outcomes and capability maturity, not task lists.

### 9. Related Documents

Link the DESIGN document, subsystem PRDs/DESIGNs, business rules, plans, research, and project specs.

---

## Subsystem PRD Template

Use this template for subsystems that serve a parent product.

### 0. Change Log

Use the shared Change Log format.

### 1. Role and Boundary

State what the subsystem is, where it fits in the parent product, and what it explicitly does not own.

### 2. Responsibility Goals

Explain the outcomes this subsystem must deliver for the parent product. Keep goals user- or product-facing.

### 3. Capability Scope

List target-state capability groups owned by the subsystem. Describe boundaries only: owned target capabilities, explicit out-of-scope areas, and delegation boundaries. Do not include phase timing, current/future grouping, implementation status, or delivery progress here.

### 4. Product Interfaces

Describe the user-facing or cross-subsystem surfaces this subsystem exposes, without implementation-level API details.

### 5. Evolution Roadmap

Describe how the subsystem matures across parent-product phases. Mark each phase as completed, current, planned, or deprecated when known. Avoid duplicating the full parent roadmap.

### 6. Related Documents

Link the parent PRD, parent DESIGN, subsystem DESIGN, business rules, plans, research, and project specs.

---

## Update Mode

When updating an existing PRD:

1. Preserve the existing document path and title unless clearly wrong.
2. Update the `Updated` date.
3. Reconcile the document against:
   - user-confirmed requirements and conversation decisions
   - implemented code facts
   - related PRD/DESIGN documents
   - known roadmap or plan artifacts
4. Add missing required sections when the existing structure is incomplete.
5. Remove or revise obsolete claims when evidence is clear.
6. Append one Change Log row in section 0 for the update.
7. Keep unresolved items explicit as "Needs confirmation" or equivalent in the document language.
8. Move phase timing, current/future grouping, and implementation status out of Capability Scope / Core Capability Boundaries and into Evolution Roadmap / Implementation Roadmap.
9. Remove standalone success-standard or validation-signal sections from PRDs; do not replace them with renamed validation sections.

Do not add implementation internals merely because they exist in code. Convert implementation facts into product capabilities and boundaries.

## Writing Quality Bar

PRD text must read like a product document, not a template explanation, architecture note, or implementation commentary.

Preferred patterns:

- "Users can ..." / "Wopal can ..." / "The CLI provides ..."
- "This capability reduces ..." / "This protects ..." / "This keeps ..."
- "CLI owns ..." / "CLI does not own ..."
- "Phase N delivers ..."

Reject and rewrite patterns:

- Section commentary: "This section describes ...", "This chapter only ...", "Put X in section Y".
- Template commentary: "According to the template ...", "The document should ...".
- Vague evolution language: "has grown into ...", "becomes a scalable entry".
- Abstract contrast without product value: "not an API platform", "not X but Y".
- Architecture-only labels that do not say what the user gains: "exposes product interfaces", "acts as an abstraction layer".

When a sentence fails the bar, rewrite it into a concrete product statement before finalizing the PRD.

## Quality Checklist

- [ ] Correct template selected: product or subsystem
- [ ] Document language follows user preference
- [ ] Header includes current Updated date
- [ ] PRD stays product-level and avoids architecture/implementation details
- [ ] Product PRD does not collapse into subsystem details
- [ ] Subsystem PRD does not duplicate parent-product vision
- [ ] Capability Scope / Core Capability Boundaries contains target-state boundaries only, not phase timing or implementation status
- [ ] Implementation status appears only in Evolution Roadmap / Implementation Roadmap
- [ ] No standalone success-standard or validation-signal section appears in the PRD
- [ ] Required PRD structure is preserved while section wording is improved
- [ ] PRD body contains no template commentary, section instructions, or documentation-authoring language
- [ ] PRD body avoids vague evolution language and abstract contrasts that do not communicate product value
- [ ] Every paragraph and table row communicates a concrete product fact or boundary
- [ ] Existing accurate content preserved
- [ ] Obsolete content revised or removed
- [ ] Change Log updated for meaningful create/update changes
- [ ] Related documents linked

## Response After Completion

After creating or updating the PRD, respond in the user's language with:

1. File path
2. Create/update summary
3. Meaningful added, revised, removed/deprecated, and needs-confirmation items
4. Suggested next step, usually `/create-design`
