---
description: Guide product phase discussions and produce phase definition and tracking documents
---

# Create or Update Roadmap

Starting from the product DESIGN §5 Evolution Roadmap, guide the user through per-phase discussion of goals, current state, scope, targets and gaps (with design updates), and holistic review to surface and resolve residual risks.

**Input**: `$1` `$2`

**Parameter Notes**: `<name> [phase-id]`. When not provided, infer the product name from `docs/products/`; confirm with the user if unclear. `phase-id` is optional; when omitted, default to the current Active phase.

---

## Core Principles

- The core responsibility is helping the user clarify phase goals, analyze current state, define scope, analyze gaps and their design solutions, and surface and resolve residual risks through review.
- Discussion uses the product DESIGN §5 Evolution Roadmap as the skeleton and the product PRD as the vision baseline.
- The Phase document is written continuously during discussion — each step's output is written directly into the living document.
- The Phase document uses the `.wopal/templates/phase.md` template.
- Phase documents provide reliable input for the next step: splitting into Plans.
- During goal and design solution discussion, user-confirmed decisions must be promptly updated in the corresponding PRD and product or project DESIGN documents, following product DESIGN and project DESIGN templates and `/cupdate-design` standards.
- Present the plan and obtain explicit user confirmation before any write operation.

## Step 1: Identify the Current Phase

Read the product DESIGN §5 and product PRD. List all phases and their current status (Active / Completed / Planned).

Guide the user to select the phase to discuss. Default to the current Active phase; the user may specify a completed phase for retrospective adjustment or a planned phase for early discussion.

**Output**: Selected phase ID, title, and existing Goal description from the product DESIGN

## Step 2: Discuss Phase Goal

Discuss the product capability goal for this phase with the user, anchoring on the product PRD vision and product DESIGN architecture contracts.

- Present the existing Goal description from the product DESIGN and ask whether to keep or adjust it.
- The goal must be a verifiable product capability statement, ≥20 characters. Placeholders are forbidden.
- Allow goal refinement during discussion until consensus is reached.

**Output**: Confirmed phase Goal — write §0 of the Phase document; update the product PRD and product DESIGN as needed

## Step 3: Analyze Current State

Conduct a deep analysis of the current state for each project or subsystem relevant to this phase goal. Use concise narrative prose to describe the gap between the current state and the phase goal. Cover both existing capabilities and what is missing.

**Output**: Current state narrative per project — write §1 of the Phase document

## Step 4: Discuss Phase Scope

Clarify the product capability boundaries for this phase:

- **Scope**: a concise summary list of the product capabilities to be delivered. One line per scope area with Owner, so humans and agents can grasp the full scope at a glance.
- **Out of Scope**: capabilities or projects explicitly excluded from this phase.

**Output**: Scope summary list + Out of Scope list — write §2 and §3 of the Phase document

## Step 5: Discuss Targets, Gaps, and Design (Critical)

For each scope area from Step 4, conduct detailed gap analysis. Each gap must have a design solution. During discussion:

1. Describe the Current state of this capability.
2. Define the Target state — what success looks like after the gap is closed.
3. Research, analyze, discuss, and confirm the Design solution with the user.
4. Define Exit criteria — independently verifiable delivery facts, each in `- [ ]` checkbox format.

Document update discipline:

- User-confirmed design decisions must be promptly updated in the corresponding project DESIGN documents, with PRD and product DESIGN updated as needed.
- Design document updates follow product DESIGN and project DESIGN templates (`cupdate-design` standards).
- PRD document updates follow the PRD template (`cupdate-prd` standards).
- Phase document updates follow the phase template (this command's standards).

Gap formatting rules:

- Each scope area is an `###` heading with its Owner.
- Gaps within an area are grouped under `#### Gaps`, with each gap as a `#####` heading.
- A gap without a design solution does not belong here — it is a residual risk and will be handled in Step 6.
- Exit criteria describe delivery facts, not implementation steps.

**Output**: §4 Targets and Gaps — write continuously as each gap is discussed; update associated design documents concurrently

## Step 6: Review and Surface Residual Risks

Holistically review the phase goal, scope, gaps, and their designs for completeness:

1. Are all scope areas covered by gaps? Any missing gap analysis?
2. Does every gap have a complete design solution? What is still open?
3. Are there cross-project coordination issues, external dependencies, or architectural uncertainties that the current designs do not address?

Surface all residual risks and write them to §6 Risks with an explicit explanation of why each risk lacks a design solution.

Guide the user to discuss solutions for each residual risk. Iterate until:
- All residual risks have been resolved (design solution found, moved back to §4), OR
- The user explicitly accepts the remaining risks as unresolvable within this phase.

**Output**: §6 Risks — resolved risks moved to §4 with their design solutions

---

## Quality Gate

Before writing the document, verify this quality checklist. All items must pass.

### Phase Document Quality Checklist

- [ ] Uses the `.wopal/templates/phase.md` template structure
- [ ] File placed in the `phases/` directory sibling to the product DESIGN
- [ ] File naming: `{product}-{phase-id}-{slug}.md` — slug derived from title: lowercase → remove non-alphanumeric → replace spaces with `-` → strip trailing status markers with regex `[-—].*$` → trim leading/trailing hyphens → truncate ≤40 characters
- [ ] §1 Current State uses narrative prose showing the gap to the phase goal
- [ ] §2 Scope is a one-glance summary list
- [ ] §4 each scope area has ≥1 gap; each gap has `Current / Target / Design / Exit`
- [ ] Every gap has a design solution with a design document reference
- [ ] §6 Risks only contains items that genuinely lack a design solution; each has an explicit "Why no design solution" explanation
- [ ] §7 References does not repeat documents already in the Phase document header
- [ ] Associated design documents have been updated per cupdate-design standards

## Guide Plan Decomposition

Once the Phase document is ready, guide the user to create Plans for each scope area, following dev-flow skill standards to advance the follow-up process.

---

## Completion Standard

Discussion is complete when all of the following are satisfied:

1. Phase goal is clarified and design decisions needed to achieve it are agreed upon
2. Current state analysis clearly presents the gap to the phase goal
3. Scope is defined as a concise summary list with Owner per area
4. Each scope area has detailed gap analysis with Current/Target/Design/Exit
5. Every gap has a design solution; residual gaps without solutions are documented in §6 Risks with explicit user acceptance or a path to resolution
6. Associated design documents have been updated per cupdate-design standards
7. Quality gate has passed

The phase outputs and updated documents (Phase document, product DESIGN, project DESIGNs) are solidified in a single commit.

---

## Response After Completion

Respond in the user's preferred language with:

1. Phase document path
2. Key summary: Goal, Scope areas, Gap count, Residual risk count
3. List of design documents updated during this session
4. Quality gate result: all passed
5. Suggested next step: create Plans for each scope area's gaps