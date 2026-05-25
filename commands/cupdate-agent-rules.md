---
description: Create or update concise AGENTS.md technical implementation rules for a project or directory
---

# Create or Update Agent Rules

## Usage

```bash
/cupdate-agent-rules [target-path]
```

Arguments:

| Argument | Required | Description |
|---|---|---|
| `target-path` | No | Project root or subdirectory where `AGENTS.md` should be created or updated. If omitted, infer from conversation context. |

Examples:

```bash
/cupdate-agent-rules
/cupdate-agent-rules projects/wopal-cli
/cupdate-agent-rules projects/wopal-cli/src/lib/fae
```

## Purpose

`AGENTS.md` is a concise technical implementation rule file for coding agents.

It exists to ensure code implementation, testing, and verification work stays technically consistent with the project's DESIGN and existing codebase. It is not a README, not a design document, not a business-rule document, and not a full project encyclopedia.

PRD and Business Rules should be linked as canonical references, but their content should not dominate AGENTS.md. Business behavior belongs in `BUSINESS_RULES.md`; AGENTS.md should only mention business rules when they create a concrete technical constraint such as confirmation gates, persistence guarantees, idempotency requirements, or forbidden writes.

## Target Scope

This command supports both:

- Project-level rules: create or update `<project>/AGENTS.md`
- Directory-level rules: create or update `<target-directory>/AGENTS.md`

If the target path is a subdirectory, write rules only for that directory's implementation boundary. Do not duplicate whole-project rules unless they are directly relevant to work inside that directory.

## Required Context

Read enough context to produce accurate rules. Prefer durable source documents and current code facts.

Required when available:

- Existing target `AGENTS.md`
- Nearest parent `AGENTS.md`
- Related DESIGN
- Related `BUSINESS_RULES.md`
- Related PRD
- Project package/build/test configuration
- Relevant source files in the target scope

For WopalSpace product docs, common locations include:

```text
docs/products/<product>/PRD.md
docs/products/<product>/PRD-*.md
docs/products/<product>/DESIGN.md
docs/products/<product>/DESIGN-*.md
docs/products/<product>/BUSINESS_RULES.md
<project>/AGENTS.md
```

Do not link backlog plans, task plans, command transcripts, or temporary implementation artifacts by default.

## Extraction Rules

Extract only rules that an implementation agent must know before editing code.

From DESIGN, extract:

- Architecture boundaries
- Module ownership
- Technical stack choices that constrain implementation
- Interface, state, configuration, output, and error-handling contracts
- Explicit non-ownership boundaries

From PRD, extract only technical scope constraints:

- Capability boundaries that prevent implementation scope creep
- Output or UX requirements that constrain technical behavior
- Product constraints that directly affect code paths, APIs, persistence, or validation

From Business Rules, do not restate business behavior. Extract only technical enforcement constraints:

- Confirmation gates
- Safety, persistence, idempotency, or data-handling requirements
- Forbidden writes, overwrites, state transitions, or bypasses

From code/config, extract:

- Build, test, typecheck, lint, and format commands
- Framework/library constraints already used by the project
- Local conventions that affect implementation consistency

## Writing Quality Bar

AGENTS.md must be highly concise.

Required qualities:

- The document should not exceed 300 lines. If it would exceed 300 lines, compress content, replace details with references, or split scope-specific rules into a closer subdirectory `AGENTS.md`.
- Keep only rules that affect implementation, testing, or verification.
- Prefer references over repeated explanations.
- Write imperative constraints agents can follow.
- Use current-state implementation facts, not roadmap speculation.
- Make boundaries explicit: what this scope owns, and what it must not change.
- Include only verification commands that actually apply to the target scope.
- Keep PRD and Business Rules content lightweight; use links for canonical product/business details.

Forbidden content:

- README-style project introduction
- PRD vision or user narrative
- Business rule restatements that belong in `BUSINESS_RULES.md`
- DESIGN prose copied wholesale
- Architecture diagrams unless absolutely necessary
- Long directory encyclopedias
- API catalogs or command catalogs that belong in docs
- Vague guidance such as "follow best practices"
- Temporary plan/backlog links unless explicitly requested

## Recommended Structure

Use this structure unless the existing AGENTS.md has a stronger established convention.

```markdown
# <Project or Directory> — Agent Development Rules

## Scope

This file applies to `<target-path>`.

Canonical references:

- PRD: `<path-or-N/A>`
- DESIGN: `<path-or-N/A>`
- Business Rules: `<path-or-N/A>`
- Parent Rules: `<path-or-N/A>`

## Must Follow

- <technical implementation rule>
- <technical implementation rule>
- <technical implementation rule>

## Architecture Boundaries

- <owned responsibility>
- <non-owned responsibility>
- <integration boundary>

## Testing and Verification

- <command or verification requirement>
- <command or verification requirement>

## Do Not

- <forbidden action>
- <forbidden action>
```

## Update Mode

When updating an existing `AGENTS.md`:

1. Preserve accurate existing rules.
2. Remove stale, verbose, or duplicated content.
3. Replace copied PRD/DESIGN/Business Rules prose with references plus concise technical constraints.
4. Add missing canonical references.
5. Keep the document under 300 lines so agents can read it before implementation.

## Confirmation Policy

If the target path is ambiguous or multiple directories would require different rule scopes, ask the user which target to use before writing.

If the command can infer a single target from the conversation, proceed with that target.

Before formally writing or overwriting `AGENTS.md`, present the full optimization plan to the user and obtain explicit confirmation. The plan must include:

1. Target file path and scope.
2. Canonical documents to reference.
3. Summary of rules to preserve, add, remove, or compress.
4. Testing and verification requirements.
5. Whether the result is expected to exceed 300 lines; if yes, explain the compression or split strategy.

Do not write, overwrite, or reorder `AGENTS.md` before receiving user confirmation.

## Quality Checklist

- [ ] Target path is explicit or safely inferred
- [ ] Existing target and parent AGENTS.md were considered when present
- [ ] DESIGN, PRD, and Business Rules are referenced when available
- [ ] AGENTS.md is under 300 lines
- [ ] Rules are concise and focused on technical implementation, testing, and verification
- [ ] DESIGN/PRD content is referenced, not copied
- [ ] Business Rules are referenced, not restated, except for concrete technical enforcement constraints
- [ ] Architecture boundaries are explicit
- [ ] Testing and verification requirements are actionable
- [ ] Full optimization plan was presented and confirmed by the user before writing
- [ ] No README-style introduction
- [ ] No backlog/task/plan links unless explicitly requested

## Response After Completion

Respond in the user's language with:

1. File path updated
2. Scope covered
3. Key rules added or changed
4. Any missing canonical references or assumptions
