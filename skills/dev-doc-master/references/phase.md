# Phase Reference — Phase Authoring

Guide product phase discussions and produce phase definition and tracking documents. Template: `templates/phase.md`.

## Overview

A phase is cut from the product DESIGN's Capability Roadmap: a batch of capability steps that can be verified together. The map answers where each capability dimension stands; the phase document answers what this batch delivers. Starting from the project-level GAPS, guide the user through per-phase discussion of goal, scope, the gap inventory, and completion criteria.

**Input**: `<name> [phase-id]`. When not provided, infer the product name from `docs/products/`; confirm if unclear. `phase-id` defaults to the current Active phase.

## Core Principles

- A phase advances capability dimensions, not activities. Its Goal names the capability the phase delivers; it does not name a list of tasks.
- The phase document is an **index and a tracking surface**, not a second gap tracker. Gap detail lives in the project `GAPS.md`; the phase lists which gaps it closes by identifier, title, priority, and design pointer.
- The phase document carries no capability-roadmap trace. The Goal states what capability the phase delivers, in product language; the Capability Roadmap in the product DESIGN already answers where each dimension stands. A duplicated trace costs maintenance and drifts from the map it copies.
- Phases are registered, not predicted. Register a phase when a line of evolution starts to converge — do not pre-declare future phases to fill out a roadmap.
- The phase document is an **index and a tracking surface**, not a second gap tracker. Gap detail lives in the project `GAPS.md`; the phase lists which gaps it closes by identifier, title, priority, and design pointer.
- The phase document does not track execution status. Plan state is owned only by dev-flow Plan files; current implementation relationships among active Plans are owned only by the Space Active Plan Graph. The Phase copies neither fact.
- The `Related Plans` table uses the 4-column form `| Plan | Range | Gaps | Project |`. Each row label carries stable Plan linkage: `P-A: title · feature-plan-name`. It records phase scope, gap, and project traceability only. Rows whose Plan has not yet been created omit the `· plan` suffix; append it when the Plan is registered.
- When scope areas have inherent **capability-line dependencies**, the phase may declare an internal `Execution Order` to guide Plan decomposition. Plan-level dependencies, blockers, and "what runs next" belong only to the Active Plan Graph and are never duplicated in the Phase.
- The phase document describes the target state only. It carries no completion log, no "what was already done" narrative, and no reference to work that preceded the phase. A phase that is complete moves to `phases/done/`; that move is the record.
- The Phase document is written continuously during discussion — each step's output is written directly into the living document.
- Phase documents provide reliable input for the next step: splitting into Plans.
- User-confirmed design decisions are promptly updated in the corresponding PRD and DESIGN documents per the design reference.
- Present the plan and obtain explicit user confirmation before any write.

## Workflow

1. **Identify the phase**: read the product DESIGN Capability Roadmap and the project GAPS. List registered phases and statuses; default to Active. If the phase is not yet registered, register it in the map first.
2. **Discuss phase goal**: a verifiable product capability statement. Write Goal.
3. **Discuss scope**: Scope = one-line-per-area summary with Owner. Write it.
4. **Build the gap inventory** (critical): for each scope area, select the gaps from the project `GAPS.md` that this phase closes. Record identifier, title, priority, and the design document each gap points at. Do not restate Current / Target / Exit — those stay in `GAPS.md`. A gap with no design solution does not enter the inventory; it becomes a risk.
5. **Define completion criteria**: the delivery facts that span multiple gaps and belong to no single one. These are the phase's own exit criteria; individual gap exit criteria stay in `GAPS.md`.
6. **State capability-line ordering**: only when scope areas themselves have inherent capability dependencies, write the order and reasons. Omit it when independent. Do not place Plan names, Plan states, or current implementation sequencing here; those belong to the Active Plan Graph.
7. **Review and surface residual risks**: holistic review; write risks to the Risks section with explicit "why no design solution" explanation. Iterate until resolved or user accepts remaining risks.

## Document-Update Discipline

- User-confirmed design decisions → update corresponding project DESIGNs, PRD, product DESIGN as needed (per design reference).
- Phase document follows the phase template.
- When the phase covers a capability line not yet in the Capability Roadmap, register it there first.
- When a gap listed in the inventory is closed, remove it from the project `GAPS.md`; the inventory entry then drops from the phase. A phase completes when its gap inventory is empty and its completion criteria are met.

**Document-set consistency**: the Phase update is never isolated. After the Phase settles, review the whole set — PRD, product DESIGN, project DESIGNs, sub-DESIGNs — and align every affected document. The Capability Roadmap entry for the phase and the PRD story must not contradict the settled Phase.

## File Naming and Location

- Active and planned phases live in the `phases/` directory sibling to the product DESIGN.
- Completed phases move to `phases/done/`. A phase is complete when its gap inventory is empty and its completion criteria are met. Moving it keeps `phases/` a view of what is still in flight.
- Naming: `{product}-{phase-id}-{slug}.md` — slug from title: lowercase → remove non-alphanumeric → spaces to `-` → strip trailing status markers (`[-—].*$`) → trim hyphens → truncate ≤40 characters.
- The Capability Roadmap's phase entries link to the phase document wherever it lives, `phases/` or `phases/done/`.

## Quality Checklist

- [ ] Uses the phase template structure
- [ ] Active phase in `phases/`, completed phase in `phases/done/`; naming per spec
- [ ] Goal states the product capability the phase delivers; no placeholder
- [ ] No capability-roadmap trace section — the phase document does not restate the map
- [ ] No `Out of Scope` section — a phase states what it delivers
- [ ] Scope is a one-glance summary list with Owner per area
- [ ] Gap Inventory: each scope area has ≥1 gap; each entry carries identifier, title, priority, and design pointer
- [ ] Every gap listed exists in a project `GAPS.md`; no Current / Target / Exit restated here
- [ ] Completion Criteria carries only cross-gap delivery facts
- [ ] `Execution Order` present only for inherent capability-line dependencies; it contains no Plan-level DAG, Plan status, or scheduling sequence
- [ ] No completion log, no "already done" narrative, no reference to work preceding the phase
- [ ] Related Plans table uses the 4-column form (`Plan | Range | Gaps | Project`) and every registered row label carries the ` · plan-name` suffix; it copies no Plan status
- [ ] Risks only contains items without a design solution, each with explicit why
- [ ] References does not repeat header documents
- [ ] Associated design documents updated per design reference
- [ ] Whole document set reviewed and aligned (PRD, DESIGNs, sub-DESIGNs)

## Guide Plan Decomposition

Once the Phase document is ready, guide the user to create Plans for each scope area following dev-flow standards. A Plan declares its Product/Phase in Metadata; the Phase `Related Plans` table records only scope/gap/project traceability. When a Plan is created for a slot, append ` · <plan-name>` to the row label as stable linkage. Read Plan state from the Plan and current inter-Plan implementation relationships from the Active Plan Graph.

## Response After Completion

Respond in the user's language with: phase document path; key summary (Goal, Scope areas, Gap count, Completion criteria count, Execution Order present or omitted); design documents updated; quality gate result; suggested next step (create Plans per scope area).
