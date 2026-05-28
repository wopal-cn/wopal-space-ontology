---
description: Create or update product phase roadmap documents
---

# Create or Update Roadmap

Discuss and generate compliant phase documents from a product DESIGN or project DESIGN Evolution Roadmap section. Confirm each phase interactively before writing. After writing, validate with the dev-flow `roadmap` command. On pass, guide the user to use `decompose` to create Issues.

**Input**: `$1` `$2`

**Parameter Notes**: `<name> [type: product|project]`. When not provided, look up `docs/products/` and `docs/projects/` plus context to infer. Confirm if unclear.

**Two modes**:

| | Product DESIGN mode | Project DESIGN mode |
|---|---|---|
| Phase semantics | Product-level milestones, involving multiple projects | Project maturity stages, focused on a single project's role |
| Involved Projects | List all projects participating in this phase | Usually only this project; may have tool or infra dependencies |
| Goal description | Product capability to be delivered in this phase | Role-based delivery target for this project in this phase |
| Issue decomposition | Cross-project: one Issue per Involved Project | Within-project: Issues scoped to this project |

The mode is auto-selected based on the input DESIGN type.

---

## Core Principles

### Output Language

Generated phase documents use the user's preferred language unless the user explicitly requests otherwise.

### Document Paths

- Phase documents are placed in a `phases/` directory sibling to the DESIGN file
- File naming: `{product}-{phase-id}-{slug}.md`
  - `product`: product name inferred from DESIGN or context, lowercase
  - `phase-id`: `p0`, `p1`, `p2` ... (lowercase)
  - `slug`: generated from phase title, **must strip trailing status markers** (patterns like `— .*`, `- .*`), keeping only the actual title text

Examples:
```
# Product DESIGN:
docs/products/wopal-space/phases/wopal-space-p0-core-foundation.md
# Project DESIGN:
docs/projects/wopal-cli/phases/wopal-cli-p1-one-click-distribution.md
```

Preserve existing paths for legacy documents.

### Preconditions

**Required context**:
- Target DESIGN file (product DESIGN or project DESIGN)
- Parent product PRD / DESIGN (when source is a project DESIGN)
- Existing phase documents (when updating)
- Current conversation context: user needs, decisions, confirmed issues
- `.wopal-space/STRUCTURE.md`

### Core Rules

- Phase documents answer: what product capability this phase delivers, which projects are involved, and what the completion criteria are.
- Phase documents must not duplicate the DESIGN's full product vision or user analysis.
- Phase documents must not contain implementation steps, technical design details, or code listings — those belong in Plans.
- Existing accurate content should be preserved and tightened, not rewritten for novelty.
- Outdated information should be updated or removed when evidence is clear.
- Open uncertainties should be marked as needing confirmation, not silently decided.

### Writing Quality Bar

Each phase document must be a reliable input for decompose, meaning:
- The Goal must be a verifiable product capability statement, not "continuation of Phase N work"
- Involved Projects must specify each project's role in this phase (core delivery / tooling / enablement)
- Exit Criteria must be falsifiable check items (`- [ ]` checkbox format), verifiable through code review or testing
- Scope/Out of Scope boundaries must be clear, leaving no ambiguity for decomposition

**Forbidden**:
- Using `_(none)_`, `_(to be defined)_`, or similar placeholders as final content
- Reusing the same Goal description across phases (each phase has an independent product objective)
- Filling Scope with implementation status ("completed", "in progress") — this belongs in the DESIGN's Evolution Roadmap

---

## Templates

Select the template based on the DESIGN type:

- **Product DESIGN mode** → `.wopal/templates/phase-product.md` (cross-project perspective, multiple Involved Projects)
- **Project DESIGN mode** → `.wopal/templates/phase-project.md` (single-project perspective, one core project + dependencies)

---

## Step 1: Parse DESIGN, Identify Phase List

Read the DESIGN, locate the `# Evolution Roadmap` section (product DESIGN = §9, project DESIGN = §8).

**Extra step for project DESIGN mode**: also read the parent product DESIGN's Evolution Roadmap (§9) and existing product phase documents to understand this project's role and positioning within each product phase. Ensure the project phase Goal aligns with the product phase's expectations for this project.

Extract the phase list from `## Phase N:` or `### Phase N:` headings.

For each phase, extract from the DESIGN:
- Phase ID (number)
- Title (strip trailing status markers like `— completed`, `- current phase`)
- Goal description paragraph
- Capability direction list
- Existing references (e.g., `> Phase doc: [phases/...]`)

**Output**: Phase list (ID, title, DESIGN excerpt, existing document path)

---

## Step 2: Interactive Discussion Per Phase

For each phase, present existing information from the DESIGN and guide the user to fill in missing fields.

**Discussion structure** (per phase):

```
### Phase {id}: {title}
DESIGN excerpt: {Goal and capability description extracted from DESIGN}
Existing document: {path or not yet created}

Product DESIGN mode — confirm/supplement:
1. Goal — What product capability should this phase deliver? (cross-project perspective)
2. Scope / Out of Scope — Product-level boundaries
3. Involved Projects — Which projects participate? What role does each play?
4. Exit Criteria — How to verify the product capability is delivered? (at least 2 falsifiable conditions)
5. Risks — Cross-project dependencies and coordination risks

Project DESIGN mode — confirm/supplement (show parent product phase context):
1. Product phase — Which product phase does this project phase correspond to? What does the product phase expect from this project?
2. Goal — What role-based delivery target should this project achieve in this phase? (single-project perspective, aligned with product expectations)
3. Scope / Out of Scope — This project's phase boundaries
4. Involved Projects — Other projects this project depends on (tooling/infra), usually just this project
5. Exit Criteria — How to verify this project's phase goal is achieved? (at least 2 falsifiable conditions)
6. Risks — Internal technical risks and external dependencies
```

**Interaction rules**:
- If the DESIGN already contains clear information, show the excerpt and ask "keep as is?"
- Missing fields must be confirmed one by one; placeholder values are not allowed
- The user may provide all fields at once or field by field — adapt based on context
- If the user skips a phase or asks to "handle later", mark it as skipped without blocking other phases

**Output**: Complete information for each phase (Goal, Scope, Out of Scope, Involved Projects, Exit Criteria, Risks)

---

## Step 3: Generate Phase Documents, Present Change Plan

Generate document content for each discussed and completed phase (following the appropriate template from the Templates section above).

**Generation rules**:
- Status: completed → `Completed`, current phase → `Active`, others → `Planned`
- Slug generation: title → lowercase → remove non-alphanumeric → replace spaces with `-` → trim leading/trailing hyphens → truncate ≤40 chars
- **Slug must strip trailing status markers**: use regex `[-—].*$` to remove status markers from the title before slugifying
- Involved Projects table: each row includes project / role / notes
- Exit Criteria: `- [ ]` format, each independently verifiable

**Present before writing**:
1. List of files to create/update with paths
2. Full content or key field summary for each phase document
3. If updating existing documents, show before/after changes for title/Goal/Scope/Projects/Criteria

Wait for user confirmation before writing any files.

---

## Step 4: Write and Back-Reference DESIGN

After user confirmation:

1. Create the `phases/` directory (if it doesn't exist)
2. Write phase documents following the naming convention
3. Insert a reference line below the corresponding `### Phase N:` heading in the DESIGN:
   ```
   > Phase doc: [phases/{filename}.md](phases/{filename}.md)
   ```
   Skip if the reference already exists.

---

## Step 5: dev-flow Validation

After writing phase documents, run the dev-flow `roadmap` command for format and content validation:

```bash
flow.sh roadmap <design-path> --check
```

**Validation checks** (implemented by the roadmap command):
- Phase document existence (does each phase in the DESIGN have a corresponding document)
- Metadata completeness (Phase ID, Product, Status)
- Required fields: Goal is non-empty and not a placeholder, Involved Projects has at least one project, Exit Criteria has at least one verifiable condition
- File slug does not contain status markers
- DESIGN reference completeness (each phase heading must have a phase doc reference after it)

**Validation fails** → output specific issues, guide the agent back to Step 2 to fill in missing fields.

**Validation passes** → proceed to Step 6.

---

## Step 6: Guide Issue Decomposition

After validation passes, guide the user to use the dev-flow `decompose` command to create Issues.

**Product DESIGN mode** (cross-project decomposition):
```bash
# Creates one Issue per Involved Project
flow.sh decompose --from phases/<phase-doc>.md --product <name> [--dry-run]
```

**Project DESIGN mode** (within-project decomposition):
```bash
# Creates Issues for this single project
flow.sh decompose --from phases/<phase-doc>.md --project <name> [--dry-run]
```

**Guidance**:
> Phase documents are ready. For product mode, use `flow.sh decompose --from phases/<file>.md` to create Issues per project. For project mode, create Issues directly for the current project. Consider using `--dry-run` first.

Do not auto-execute decompose — Issue creation is an independent user decision.

---

## Update Mode

When updating existing phase documents:

1. Preserve existing document paths
2. Update the `Updated` date
3. Reconcile against the DESIGN, conversation context, and implementation facts
4. Add missing fields
5. Remove or correct outdated information
6. Update Status (as applicable)

---

## Confirmation Policy

Before writing any files, present the complete plan and obtain explicit user confirmation.

The plan should include:
1. List of files to create/update with paths
2. Key field summary for each phase (Goal, Involved Projects, Exit Criteria)
3. Reference lines to be written back into the DESIGN
4. Any phases skipped and reasons

Do not write, overwrite, or reorganize any files before user confirmation.

---

## Quality Checklist

- [ ] DESIGN path is correct, phase list is fully extracted
- [ ] Each phase is thoroughly discussed; Goal / Scope / Projects / Exit Criteria are all non-placeholder
- [ ] Goal is a verifiable product capability statement
- [ ] Involved Projects table has a clear role for each row (core delivery / tooling / enablement)
- [ ] Each Exit Criteria item is independently verifiable (checkbox format)
- [ ] Slug has status markers stripped
- [ ] Document status is consistent with the DESIGN's Evolution Roadmap (Completed / Active / Planned)
- [ ] DESIGN reference lines have been written back
- [ ] `flow.sh roadmap --check` passes
- [ ] Plan was presented and confirmed before writing
- [ ] User was guided to use `decompose --from` (not auto-executed)

---

## Response After Completion

After completion, respond in the user's preferred language with:

1. List of created/updated phase documents
2. Key decision summary for each phase (Goal, Involved Projects, Exit Criteria highlights)
3. Any skipped phases and reasons
4. `roadmap --check` validation results
5. Next step guidance: `flow.sh decompose --from phases/<file>.md` (use `--product` for product mode, `--project` for project mode)
