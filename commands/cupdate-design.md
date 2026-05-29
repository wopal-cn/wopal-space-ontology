---
description: Create or update a product DESIGN or project DESIGN
---

# Create or Update DESIGN

Guide users through discussion to clarify product system architecture (product DESIGN) or project internal design (project DESIGN). The core responsibility is helping users define design boundaries and reach design decisions until conditions are met for the next work phase.

Simple projects may skip product DESIGN and follow the simplified flow: project DESIGN (with self-defined product-level design) → Plan.

**Input**: `$1` `$2`

**Parameter Notes**: `<name> [product|project]`. When not provided, infer from `docs/products/` and `projects/*/docs/` directory matching; confirm with the user if unclear.

---

## Core Principles

### Two Design Flows

| Flow | Use Case | Chain |
|---|---|---|
| Standard | Multi-project product requiring cross-project architecture coordination | PRD → Product DESIGN → Roadmap → Project DESIGN → Plan |
| Simplified | Standalone project with no associated product | Project DESIGN (with product-level design) → Plan |

In the standard flow, the product DESIGN is used for phase decomposition and architecture contract definition; the project DESIGN focuses on single-project internal architecture. In the simplified flow, the project DESIGN also assumes product-level design responsibility (Header `Parent Product: N/A`).

### Discussion Rules

- The command's core role is guiding users to discuss and clarify design decisions. Product DESIGN uses the `design-product.md` template; project DESIGN uses the `design-project.md` template.
- Product DESIGN discussion focus: system layering and subsystem boundaries, runtime model, end-to-end flows, phase decomposition (at minimum, clarify the current phase's overall goal; detail is deferred to `/cupdate-roadmap`).
- Project DESIGN discussion focus: project role and boundaries, capability scope, module architecture, technology choices, interface contracts, data model.
- DESIGN keeps only architecture, boundaries, contracts, runtime model, and evolution skeleton. It does not keep implementation status, delivery progress, acceptance results, or task lists.
- Product DESIGN's Evolution Roadmap is a phase skeleton: each Phase keeps only the title, Goal, and Phase document link. Completed/landed/remaining work belongs in Phase, Plan, UAT, or Verification documents.
- Preserve accurate existing content. Revise or remove outdated information when evidence is sufficient. Mark unresolved items as needing confirmation.
- Present the full content and obtain explicit user confirmation before any write operation.

## Step 1: Gather Context

**Standard flow**:
- Product DESIGN: read the product PRD
- Project DESIGN: read the parent product PRD + parent product DESIGN

**Simplified flow** (Header `Parent Product: N/A`):
- Read the project's own code and documents for existing design decisions

**Update**:
- Read the existing DESIGN, user decisions from the current conversation, and implementation facts from code and documents

**Output**: Context inventory, items needing confirmation

## Step 2: Guide Design Discussion

Guide the user through each template section in order.

**Product DESIGN discussion points**:
1. System layering and architecture overview
2. Core subsystem roles, boundaries, and interaction contracts
3. Runtime model (state locations, configuration layers, lifecycle)
4. Key end-to-end flows
5. Phase decomposition: break the product vision into a deliverable phase skeleton, keeping only Phase titles, Goals, and Phase document links

**Project DESIGN discussion points**:
1. Project positioning and responsibility boundary within the parent product (simplified flow: self-defined positioning and value proposition)
2. Target capability scope and explicitly excluded areas
3. Key architecture decisions and rationale
4. Internal module decomposition and ownership
5. Technology stack choices and rationale
6. External interfaces and integration contracts. If the project includes frontend UI: tech stack selection, design tokens, component conventions, page structure
7. Data and state model

**Output**: Discussion conclusions for each section

## Step 3: Write DESIGN

Produce the DESIGN document from the discussion conclusions using the template. When updating an existing document:

1. Preserve existing paths and titles
2. Update the `Updated` date
3. Align discussion conclusions with existing content
4. Fill in missing sections
5. Revise or remove outdated content, deleting implementation status and delivery progress from DESIGN
6. Append a Change Log entry (record design intent, architecture, boundary, or contract changes)
7. Mark unresolved items as needing confirmation

Present the full content and wait for user confirmation before writing.

**Output**: Complete DESIGN content, awaiting confirmation

## Step 4: Verify

After writing, run the quality gate. The command is truly complete only when the quality gate passes; if it fails, return to Step 2 or Step 3 and revise.

### General Quality Checklist

- [ ] Correct template selected: product DESIGN or project DESIGN
- [ ] Document language follows user preference
- [ ] Header includes current `Updated` date
- [ ] Change Log has a meaningful creation/update entry
- [ ] Durable related documents are linked; backlog, temporary plans, and command logs are not linked
- [ ] Accurate existing content is preserved; obsolete content is explicitly revised or removed
- [ ] Unconfirmed items are explicitly marked as needing confirmation
- [ ] Body uses design language and contains no template commentary, process explanation, task list, or command transcript
- [ ] DESIGN contains no implementation status, delivery progress, acceptance results, checkbox-style tasks, or "completed / pending" module status

### Product DESIGN Quality Checklist

- [ ] Grounded in the target PRD
- [ ] Explains cross-project system composition, architecture layers, project responsibilities, and interaction contracts
- [ ] Runtime Model clarifies state locations, data ownership, configuration layers, lifecycle, and persistence boundaries
- [ ] End-to-End Flows cover critical cross-project paths and focus on system behavior rather than implementation steps
- [ ] Evolution Roadmap keeps only the phase skeleton: `### Phase N: Title`, `Goal`, and `Phase doc`
- [ ] Does not duplicate the PRD's vision, target users, product narrative, or full roadmap

### Project DESIGN Quality Checklist

- [ ] Standard flow is grounded in the parent product PRD and product DESIGN; simplified flow explicitly uses `Parent Product: N/A`
- [ ] Project Role concisely explains project positioning, responsibility boundaries, and non-responsibilities
- [ ] Capability Scope describes only target-state capability boundaries, with no phase timing, implementation status, or delivery progress
- [ ] Module Architecture uses design-state language to explain module responsibilities and carriers; temporary implementation locations are not the primary structure
- [ ] Technical Stack Choices include rationale and explicit boundaries
- [ ] Interfaces and Contracts describe external surfaces, consumers, input/output conventions, file formats, configuration, or template contracts
- [ ] Data and State Model clarifies project-owned state, location, owner, and rules

---

## Discussion Completion Standard

The research discussion can end, and Step 3 writing plus Step 4 verification can begin, when the following conditions are met:

- Product DESIGN: system architecture boundaries are clear, the current phase's overall goal is defined, and the work is ready for `/cupdate-roadmap` phase refinement
- Project DESIGN (standard flow): internal architecture decisions are clear, ready for `/cupdate-agent-rules` or Plan creation
- Project DESIGN (simplified flow): design decisions are sufficiently clear to proceed directly to Plan
- Any remaining key questions are explicitly listed and do not block the current DESIGN's architecture expression

---

## Response After Completion

Respond in the user's preferred language with:

1. File path
2. Creation/update summary (additions, revisions, removals/deprecations, items needing confirmation)
3. Suggested next step: product DESIGN → `/cupdate-roadmap`; standard project DESIGN → `/cupdate-agent-rules`; simplified project DESIGN → create Plan
4. Verification result: Step 4 quality gate passed; if any item fails, revise first and do not output the completion response
