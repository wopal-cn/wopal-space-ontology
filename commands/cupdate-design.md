---
description: Create or update product or project DESIGN document
---

# Create or Update DESIGN

Product DESIGN is the overall architecture design, derived from PRD, describing cross-project system composition and contracts. Project DESIGN is the subsystem design, derived from parent product PRD/DESIGN, describing a single project's internal architecture.

**Input**: `$1` `$2`
**Parameter Notes**: `<name> [product|project]`. When not provided, infer from `docs/products/` and `projects/*/docs/` directory matching; confirm with user if unclear.

## Core Principles

### Responsibility Boundaries

| | Product DESIGN | Project DESIGN |
|---|---|---|
| Answers | How the system is organized, how modules interact, why key choices are made | This project's internal architecture, tech stack, interfaces, capability scope, evolution roadmap |
| Does not repeat | PRD's vision, users, product roadmap | Parent PRD/DESIGN's full vision and architecture |
| Does not become | Implementation checklist, coding standards, command logs | Same |

### Evolution Roadmap Format

Product DESIGN §5 and Project DESIGN §8 use the same format:

```markdown
### Phase N: Title

> Phase doc: [phases/<name>-pN-<slug>.md]

- **Goal**: Phase target (one line, ≥20 chars)

- [x] D-01: <design decision, done>
- [ ] D-02: <design decision, pending>
```

- D-NN numbering restarts per phase. `[x]` = done, `[ ]` = pending
- Product DESIGN Goal: product capability target
- Project DESIGN Goal: derived from parent product phase doc's Involved Projects — what this project delivers in this phase
- Standalone project mode (Header `Parent Product: N/A`): Goal describes the project's own phase target

### Writing Rules

- Design language, not process language: structure, boundaries, contracts, ownership, technical choices, runtime behavior
- No template instructions, architectural fluff, or decorative diagrams. Do not use implementation-state labels such as "current location" as primary structure
- Preserve accurate existing content; revise or delete outdated content when evidence supports it; mark unresolved items as "待确认" (to be confirmed)
- Project DESIGN §2 Capability Scope inherits the parent PRD's product definition for this module; in standalone mode, define it independently

### Standalone Project Mode

When a project has no associated product (Header `Parent Product: N/A`):
- §1 Project Role: describe the project's own positioning and reason for existing
- §2 Capability Scope: define capability boundaries independently
- §8 Goal: describe phase targets directly, without referencing an external phase doc

## Step 1: Gather Context

**Creation**:
- Product DESIGN: read the product PRD
- Project DESIGN: read the parent product PRD + parent product DESIGN. Enter standalone project mode when no parent product exists
- For WopalSpace: reference `.wopal-space/STRUCTURE.md` and `.wopal-space/REGULATIONS.md`

**Update**:
- Read the existing DESIGN, user decisions from the current conversation, and implementation facts (code/docs)
- For Project DESIGN: also read associated phase docs, update §8 D-NN states based on Plan completion

**Output**: Context inventory + items needing confirmation.

## Step 2: Write / Update

**Creation**: Write section by section following the template (product: `design-product.md`, project: `design-project.md`).

**Update**:
1. Preserve existing paths and titles (unless clearly incorrect)
2. Update the `Updated` date
3. Align with user decisions, implementation facts, and PRD/DESIGN; update §8 D-NN states
4. Fill in missing sections
5. Remove or revise outdated architecture, boundaries, interfaces, or state declarations
6. Append a Change Log entry (only for design intent, architecture, boundary, or contract changes; not for formatting adjustments)
7. Mark unresolved items as "待确认"

**Header requirements**: Product DESIGN includes `Product Intent`; Project DESIGN includes `Parent Architecture` + `Parent Product` (or `N/A`).

**Output**: Complete DESIGN content (confirm with user before writing).

## Step 3: Quality Check

- [ ] Correct template selected (product/project)
- [ ] Evolution Roadmap uses `### Phase N:` heading + `[x]`/`[ ]` D-NN format
- [ ] Project DESIGN: §2 Capability Scope aligns with parent PRD (or independently defined in standalone mode)
- [ ] Project DESIGN: §8 Goal aligns with parent product phase doc (or is a direct phase target in standalone mode)
- [ ] Design language (structure/boundaries/contracts/ownership); no template instructions, implementation checklists, or architectural fluff
- [ ] Tech stack choices include rationale and ownership boundaries
- [ ] Accurate existing content preserved; outdated content revised or deleted
- [ ] Change Log updated; related documents linked

## Completion Response

1. File path
2. Creation / update summary
3. Additions, revisions, removals/deprecations, items needing confirmation
4. Suggested next step: `/cupdate-roadmap`. For projects that have completed initialization, `/cupdate-agent-rules` can generate or update development rules.
