---
description: Create or update AGENTS.md technical implementation rules for a project or directory
---

# Create or Update Agent Rules

## Usage

```bash
/cupdate-agent-rules [target-path] [rules-context]
```

| Argument | Required | Description |
|---|---|---|
| `target-path` | No | Project root or subdirectory. If omitted, infer from conversation context. |
| `rules-context` | No | Project-specific technical rules the user wants added. |

Examples:

```bash
/cupdate-agent-rules
/cupdate-agent-rules projects/wopal-cli
/cupdate-agent-rules projects/wopal-cli "keep CLI UI/UX rules and add helpText constraints"
/cupdate-agent-rules projects/wopal-cli/src/lib/fae "emphasize SSE reconnect and task state rules"
```

## Document Paths

- Project-level: `<project>/AGENTS.md`
- Directory-level: `<target-directory>/AGENTS.md`
- If the user's preferred language is not English, first create `AGENTS.<locale>.md` in the same directory for review; after confirmation, update `AGENTS.md`

## Purpose

`AGENTS.md` is a development rules document for coding agents.

It answers only three questions:

1. What this project is.
2. Where the code structure lives.
3. Which project-specific technical rules must be followed during development, testing, and verification.

It is not a README, not a DESIGN document, and not a business rules document.

## Preconditions

Before generating, prefer reading:

- Target `AGENTS.md`
- Nearest parent `AGENTS.md`
- Related PRD
- Related DESIGN
- Related `BUSINESS_RULES.md`
- Project package / build / test / typecheck / lint configuration
- Key source files in the target scope
- `rules-context` when provided

If the target path is ambiguous, ask the user first. If the conversation safely implies a single target, use it.

Common WopalSpace document locations:

```text
docs/products/<product>/PRD.md
docs/products/<product>/PRD-*.md
docs/products/<product>/DESIGN.md
docs/products/<product>/DESIGN-*.md
docs/products/<product>/BUSINESS_RULES.md
<project>/AGENTS.md
```

## Core Rules

- Project-level documents define the project boundary. Directory-level documents define only the rules directly owned by that directory and must not duplicate the whole project spec.
- The body must contain only project-specific technical implementation rules. Product intent, design detail, and business behavior should be referenced through canonical documents.
- From PRD, extract a one-sentence project positioning and only the scope constraints that affect implementation.
- From DESIGN, extract the compact execution chain, directory/module responsibilities, technology choices, and interface / state / configuration / output / error-handling contracts.
- BUSINESS_RULES.md must only be linked as a canonical reference. Extracting any rule from it into the AGENTS.md body is forbidden.
- From code and config, extract build, test, typecheck, lint, and format commands, basic development commands, framework/library constraints already in use, and local implementation conventions.
- Declare the technology stack once in the architecture section only; do not repeat it in implementation rules.
- `rules-context` contains project-specific technical rules explicitly requested by the user and must be merged directly into the appropriate section. If content clearly belongs to PRD, business rules, or a temporary plan, do not put it in `AGENTS.md`; explain that in the completion response.

## Output Language and File Naming

- If the user's preferred language is not English, first generate the user's preferred language version for review. After user confirmation, translate and update the formal English version.
- Name the user's preferred language version as `AGENTS.<locale>.md`, for example `AGENTS.zh-CN.md`.
- `<locale>` must use an IETF BCP 47 / RFC 5646 tag.
- The formal English version keeps the unmodified filename: `AGENTS.md`.
- If the user's preferred language is English, create or update `AGENTS.md` directly. Do not generate English variants such as `AGENTS.en-US.md`.

## Writing Quality Bar

- `AGENTS.md` must stay under 300 lines. If it would exceed 300 lines, compress content, replace detail with references, or split rules into a closer subdirectory `AGENTS.md`.
- Preserve basic development and testing commands, plus any applicable verification requirements.
- Keep only implementation, testing, and verification rules.
- Prefer references over repeated explanation.
- Use direct, imperative rules.
- Use current implementation facts, not roadmap speculation.
- Make boundaries explicit: what this scope owns and what it must not change.
- In user-preferred language versions, all section titles must use the target language; formal English versions keep English titles.
- The Do Not section must only contain project-specific development prohibitions; do not include meta-maintenance rules such as "do not duplicate PRD content."

Forbidden:

- README-style project introduction
- Low-information sections such as "This file applies to..."
- PRD vision, user narrative, or roadmap
- Business rule restatements
- Large copied DESIGN prose
- Architecture diagrams, directory encyclopedias, or API / command catalogs
- Links to backlog items, task plans, or command transcripts unless the user explicitly asks for them

## AGENTS Template

Section order is fixed. Sections 1-2 and 5-6 are mandatory. Section 3 provides a development, build, and test command quick reference. Section 4 covers implementation rules; if the project has CLI / UI / output constraints, include them as a sub-group here. Section 5 is a standalone testing section with a TDD requirement.

```markdown
# <Project or Directory> — Agent Development Rules

## 1. Project Positioning

<One-sentence project description extracted from PRD.>

Canonical references:

- PRD: `<path-or-N/A>`
- DESIGN: `<path-or-N/A>`
- Business Rules: `<path-or-N/A>`
- Parent Rules: `<path-or-N/A>`

## 2. Architecture and Directories

<Compact execution chain.>

| Directory | Responsibility |
|---|---|

## 3. Development Commands

| Scenario | Command | When |
|---|---|---|

## 4. Implementation Rules

- <technical implementation rule>
- <project-specific UI/UX or output rule if applicable>

## 5. Testing

- Follow TDD: write a failing test first, then implement to make it pass.

## 6. Do Not

- <project-specific forbidden action>
```

## Update Mode

When updating an existing `AGENTS.md`:

1. Preserve accurate project-specific development and testing rules.
2. Remove stale, duplicated, verbose, or generic space-level rules.
3. Replace copied PRD / DESIGN prose with references plus concise technical constraints; delete any rules copied from BUSINESS_RULES.md.
4. Add any missing project positioning, compact architecture, directory responsibilities, and development/testing commands.
5. Merge `rules-context` directly into the right section. If any part is out of scope, explain why it was not added in the completion response.
6. Keep the document under 300 lines.

## Confirmation Policy

Before writing or overwriting `AGENTS.md`, present the full optimization plan and get explicit user confirmation.

The plan must include:

1. Target file path
2. Canonical documents to reference
3. One-sentence project positioning
4. Summary of rules to preserve, add, remove, or compress
5. Architecture / directory summary plan
6. Development, testing, and verification requirements
7. Where `rules-context` will be merged
8. Compression or split strategy if the result may exceed 300 lines

Before user confirmation, do not write, overwrite, or reorder the formal English `AGENTS.md`.

If a user-preferred language version was generated first, then after confirmation:

1. Update the user-preferred language version first.
2. Translate and update the formal English version.
3. Keep the formal English version semantically aligned with the confirmed version.

## Quality Checklist

- [ ] Target path is explicit or safely inferred
- [ ] Target and parent `AGENTS.md` files were considered when present
- [ ] PRD, DESIGN, and `BUSINESS_RULES.md` were referenced when present
- [ ] `AGENTS.md` stays under 300 lines
- [ ] Basic development and testing commands are preserved
- [ ] Rules focus on implementation, testing, and verification
- [ ] If the user's preferred language is not English, the user-preferred language version was generated first
- [ ] Canonical documents are referenced instead of copied
- [ ] No rules were extracted from BUSINESS_RULES.md into the body
- [ ] Testing section includes a TDD requirement
- [ ] User-preferred language version titles use the target language
- [ ] Do Not section contains only project-specific prohibitions, no meta-maintenance rules
- [ ] The full optimization plan was shown and confirmed before writing
- [ ] The formal English version was updated after confirmation when applicable

## Response After Completion

Respond in the user's language with:

1. Updated file path
2. Scope covered
3. Key rules added or changed
4. Any ignored `rules-context` content and why
5. Any missing canonical references or assumptions
