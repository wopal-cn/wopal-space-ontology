---
description: Create or update project AGENTS.md
---

# Create or Update Agent Rules

Create or update project-level or directory-level `AGENTS.md`.

**Input**:

- `$1` (target path or project name, optional)
- `$2` (rules-context, optional, rest semantics)

Examples:

```bash
/cupdate-agent-rules
/cupdate-agent-rules projects/wopal-cli
/cupdate-agent-rules wopal-cli
/cupdate-agent-rules projects/wopal-cli "keep CLI UI/UX rules and add helpText constraints"
/cupdate-agent-rules projects/wopal-cli/src/lib/fae "emphasize SSE reconnect and task state rules"
```

- If `$1` is omitted, infer from conversation context
- If `$1` is a project name rather than a path, first infer the target project path from the space structure
- If inference yields a single candidate project, show the inferred target and confirm with the user before writing
- If there are multiple candidates or inference is not safe, ask the user

---

## Core Principles

### Document Paths

- Project-level: `<project>/AGENTS.md`
- Directory-level: `<target-directory>/AGENTS.md`
- If the user's preferred language is not English, first create `AGENTS.<locale>.md` in the same directory for review; after confirmation, update `AGENTS.md`

### Purpose

`AGENTS.md` is a development rules document for coding agents.

It answers only three questions:

1. What this project is.
2. Where the code structure lives.
3. Which project-specific technical rules must be followed during development, testing, and verification.

It is not a README, not a DESIGN document, and not a business rules document.

### Preconditions

Before generating, prefer reading:

- Target `AGENTS.md`
- Nearest parent `AGENTS.md`
- `.wopal-space/STRUCTURE.md`
- Related PRD
- Related DESIGN
- Related `BUSINESS_RULES.md`
- Project package / build / test / typecheck / lint configuration
- Key source files in the target scope
- `rules-context` when provided

Common WopalSpace document locations:

```text
docs/products/<product>/PRD.md
docs/products/<product>/PRD-*.md
docs/products/<product>/DESIGN.md
docs/products/<product>/DESIGN-*.md
docs/products/<product>/BUSINESS_RULES.md
<project>/AGENTS.md
```

Project inference rules:

- If `$1` is an explicit path, use it directly
- If `$1` is a project name, first locate candidate projects from the project structure in `.wopal-space/STRUCTURE.md`
- If exactly one project matches, ask the user to confirm that inferred path
- If there are multiple exact or near matches, list the candidates and let the user choose

### Output Language and File Naming

- If the user's preferred language is not English, first generate the user's preferred language version for review. After user confirmation, translate and update the formal English version.
- Name the user's preferred language version as `AGENTS.<locale>.md`, for example `AGENTS.zh-CN.md`.
- `<locale>` must use an IETF BCP 47 / RFC 5646 tag.
- The formal English version keeps the unmodified filename: `AGENTS.md`.
- If the user's preferred language is English, create or update `AGENTS.md` directly. Do not generate English variants such as `AGENTS.en-US.md`.

### Core Rules

- Project-level documents define the project boundary. Directory-level documents define only the rules directly owned by that directory and must not duplicate the whole project spec.
- The body must contain only project-specific technical implementation rules. Product intent, design detail, and business behavior should be referenced through canonical documents.
- From PRD, extract a one-sentence project positioning and only the scope constraints that affect implementation.
- From DESIGN, extract the compact execution chain, directory / module responsibilities, technology choices, and interface / state / configuration / output / error-handling contracts.
- `BUSINESS_RULES.md` must only be linked as a canonical reference. Extracting any rule from it into the `AGENTS.md` body is forbidden.
- From code / config, extract build, test, typecheck, lint, and format commands, basic development commands, framework / library constraints already in use, and local implementation conventions.
- Declare the technology stack once in the architecture section only; do not repeat it in implementation rules.
- `rules-context` contains project-specific technical rules explicitly requested by the user and must be merged directly into the appropriate section. If content clearly belongs to PRD, business rules, or a temporary plan, do not put it in `AGENTS.md`; explain that in the completion response.

### Writing Quality Bar

- `AGENTS.md` must stay under 300 lines. If it would exceed 300 lines, compress content, replace detail with references, or split rules into a closer subdirectory `AGENTS.md`.
- Preserve basic development / testing commands and any applicable verification requirements.
- Keep only implementation, testing, and verification rules.
- Prefer references over repeated explanation.
- Use direct, imperative rules.
- Use current implementation facts, not roadmap speculation.
- Make boundaries explicit: what this scope owns and what it must not change.
- In user-preferred language versions, all section titles must use the target language; formal English versions keep English titles.
- The Do Not section must contain only project-specific development prohibitions; do not add maintenance filler such as "do not duplicate PRD content".

Forbidden:

- README-style project introduction
- Low-information sections such as "This file applies to..."
- PRD vision, user narrative, or roadmap
- Business rule restatements
- Large copied DESIGN prose
- Architecture diagrams, directory encyclopedias, or API / command catalogs
- Links to temporary implementation artifacts such as backlog items, task plans, or command logs unless the user explicitly asks for them

---

## Templates

- AGENTS: `.wopal/templates/agents.md`

---

## Update Mode

When updating an existing `AGENTS.md`:

1. Preserve accurate project-specific development / testing rules.
2. Remove stale, duplicated, verbose, and generic space-level rules.
3. Replace copied PRD / DESIGN prose with references plus concise technical constraints; delete any rules copied from `BUSINESS_RULES.md`.
4. Add any missing one-sentence project positioning, compact architecture, directory responsibilities, and development / testing commands.
5. Merge `rules-context` directly into the right section. If any part is out of scope, explain why it was not added in the completion response.
6. Keep the document under 300 lines.
7. ⚠️ **Rules & specifications are immutable after initial creation.** When updating an existing `AGENTS.md`, never directly add, modify, or delete any existing rule / specification content. You may only recommend changes; all additions, modifications, and deletions require explicit user approval before execution.

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

Before confirmation, do not write, overwrite, or reorder the formal English `AGENTS.md`.

If a user-preferred language version was generated first, then after confirmation:

1. Update the user-preferred language version first.
2. Translate and update the formal English version.
3. Keep the formal English version semantically aligned with the confirmed version.

## Quality Checklist

- [ ] Target path is explicit or safely inferred
- [ ] Target and parent `AGENTS.md` files were considered when present
- [ ] PRD, DESIGN, and `BUSINESS_RULES.md` were referenced when present
- [ ] `AGENTS.md` stays under 300 lines
- [ ] Basic development / testing commands are preserved
- [ ] Rules focus on implementation, testing, and verification
- [ ] If the user's preferred language is not English, the user-preferred language version was generated first
- [ ] Canonical documents are referenced instead of copied
- [ ] No rules were extracted from `BUSINESS_RULES.md` into the body
- [ ] Testing section includes a TDD requirement
- [ ] User-preferred language version titles use the target language
- [ ] The Do Not section contains only project-specific prohibitions, with no maintenance filler
- [ ] The full optimization plan was shown and confirmed before writing
- [ ] The formal English version was updated after confirmation when applicable

## Response After Completion

Respond in the user's language with:

1. Updated file path
2. Scope covered
3. Key added / changed rules
4. Any ignored `rules-context` content and why
5. Any missing canonical references or assumptions
