---
description: Create or update product PRD documents
---

# Create or Update PRD

Create or update a product PRD document.

**Input**: `$ARGUMENTS`

**Parameter Notes**: Product name. When not provided, look up `docs/products/` to infer.

- Deprecated: project-level PRDs no longer exist independently; project-level information is maintained in DESIGN documents

---

## Core Principles

### Output Language

Write the generated or updated document in the user's preferred language unless the user explicitly requests another language.

### Document Paths

**Product PRD**: use the established naming convention when one exists. Default: `docs/products/<product-name>/PRD-<product-name>.md`. Acceptable variants: `PRD.md`, `PRD-*.md`. When updating, preserve the existing file path.

### Context Collection

Read enough context to avoid inventing requirements.

**Required**:

- Existing target PRD, if present
- Related DESIGN documents, if present
- Current conversation context: user needs, decisions, research conclusions, and unresolved questions

**When updating from implementation**: inspect code or project docs only to extract product facts, current capabilities, and actual boundaries. Do not turn implementation details into PRD content.

**WopalSpace-specific context**: when working inside WopalSpace, prefer canonical startup and structure files:

- `.wopal-space/STRUCTURE.md`
- `.wopal-space/REGULATIONS.md`

### Writing Rules

- PRD answers: what to build, for whom, why it matters, and what product outcomes it serves.
- PRD must not explain internal architecture, APIs, storage schemas, implementation steps, or coding conventions.
- Product PRD owns vision, users, product shape, capability boundaries, governance, and evolution.
- Capability Scope / Core Capability Boundaries sections must describe target-state capability boundaries only: owned target capabilities, excluded capabilities, and delegation boundaries.
- Capability Scope / Core Capability Boundaries sections must not include phase timing, current/future grouping, implementation status, delivery progress, module state, checkboxes, or "done / partial / pending" labels. Implementation status belongs in Phase, Plan, UAT, or Verification documents, not in PRD or DESIGN.
- Do not include standalone success-standard or validation-signal sections in PRDs. If validation signals are needed, place them in Plans, UAT, verification documents, or roadmap phase acceptance notes.
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

Use localized field labels if the document language is not English.

## Section 0: Change Log

Every PRD should include a concise Change Log section immediately after the document metadata and before section 1.

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

## Templates

- Product PRD: `.wopal/templates/prd.md`

---

## Update Mode

When updating an existing PRD:

1. Preserve the existing document path and title unless clearly wrong.
2. Update the `Updated` date.
3. Reconcile the document against:
   - user-confirmed requirements and conversation decisions
   - implemented code facts
   - related PRD/DESIGN documents
4. Add missing required sections when the existing structure is incomplete.
5. Remove or revise obsolete claims when evidence is clear.
6. Append one Change Log row in section 0 for the update.
7. Keep unresolved items explicit as "Needs confirmation" or equivalent in the document language.
8. Remove standalone success-standard or validation-signal sections from PRDs; do not replace them with renamed validation sections.

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

- [ ] Correct template selected: product
- [ ] Document language follows user preference
- [ ] Header includes current Updated date
- [ ] PRD stays product-level and avoids architecture/implementation details
- [ ] Capability Scope / Core Capability Boundaries contains target-state boundaries only, no phase timing or implementation status
- [ ] Implementation status is not in PRD or DESIGN; it is left to Phase, Plan, UAT, or Verification documents
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
4. Suggested next step: PRD done → `/cupdate-design` to translate product vision into system architecture
