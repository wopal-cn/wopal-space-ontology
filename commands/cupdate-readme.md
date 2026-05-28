---
description: Create or update project README.md
---

# Create or Update README

**Input**: `$ARGUMENTS`

**Parameter Notes**: Project name. When not provided, look up the project list under `projects/` plus context to infer. Confirm if unclear.

Examples:

```bash
/cupdate-readme
/cupdate-readme projects/wopal-cli
```

## Document Paths

- Project-level: `<project>/README.md`
- If the user's preferred language is not English, first create `README.<locale>.md` in the same directory for review; after confirmation, update `README.md`

## Purpose

`README.md` is a human-facing project entry document.

It should explain what the project is, how to install and run it, what it can do, and where to find durable references. It is not an Agent rule file, not an implementation checklist, and not a design specification.

## Preconditions

Before generating, prefer reading:

- Existing project `README.md`
- Related PRD
- Related DESIGN
- Project `package.json` / build / run configuration
- Main entry files or CLI command definitions
- License file or package metadata

## Core Rules

- Write for human readers in a user-friendly tone.
- Place quick-start and core capabilities first, development commands and reference links later.
- List modules and core entry commands; do not enumerate every subcommand. Point to `--help` for complete usage.
- Do not dive into internal implementation details or Agent-specific implementation rules.
- Technology stack and project structure belong in DESIGN / AGENTS.md; do not duplicate them in README.
- All commands must be verified from package / config files. Never guess.

## Output Language and File Naming

- If the user's preferred language is not English, first generate the user's preferred language version for review. After user confirmation, translate and update the formal English version.
- Name the user's preferred language version as `README.<locale>.md`, for example `README.zh-CN.md`.
- `<locale>` must use an IETF BCP 47 / RFC 5646 tag.
- The formal English version keeps the unmodified filename: `README.md`.
- If the user's preferred language is English, create or update `README.md` directly. Do not generate English variants such as `README.en-US.md`.

## Writing Quality Bar

- Explain the project's value in one clear opening paragraph.
- Quick start: list executable install and run commands.
- Core capabilities: describe by module without implementation detail.
- Development commands: concise command table, sources verified.
- Technical references: link durable documents without duplicating their content.
- User-preferred language versions must use target-language titles.

Forbidden:

- Agent implementation rules
- Deep architecture explanations
- PRD roadmap duplication
- Internal task lists or TODOs
- Unverified commands or guessed package managers
- Backlog / task plan / command transcript links by default

## README Template

```markdown
# <Project Name>

<One-paragraph human-facing description.>

## Quick Start

```bash
<install command>
<run command>
```

## Core Capabilities

| Module | Entry Commands | Purpose |
|---|---|---|

## Development

| Scenario | Command |
|---|---|

## Technical References

| Document | Description |
|---|---|

## License

<license>
```

## Update Mode

When updating an existing README:

1. Preserve accurate user-facing content.
2. Remove stale commands and obsolete links.
3. Add or correct the module and core command list.
4. Link design and product details; do not duplicate sections.

## Confirmation Policy

Before writing or overwriting `README.md`, present the full optimization plan and get explicit user confirmation.

The plan must include:

1. Target file path
2. One-sentence project description
3. Module / core command overview
4. Sections to add, modify, or remove
5. Canonical documents to reference

Before user confirmation, do not write, overwrite, or reorder the formal English `README.md`.

If a user-preferred language version was generated first, then after confirmation:

1. Update the user-preferred language version first.
2. Translate and update the formal English version.
3. Keep the formal English version semantically aligned with the confirmed version.

## Quality Checklist

- [ ] Target project root is explicit or safely inferred
- [ ] README is project-level, not directory-level
- [ ] Lists modules and core entry commands, not every subcommand
- [ ] Install / run / development commands are verified from project files
- [ ] Capabilities are user-facing
- [ ] Technology stack and project structure are not duplicated
- [ ] Durable references are linked
- [ ] No Agent rule content
- [ ] If the user's preferred language is not English, the user-preferred language version was generated first
- [ ] User-preferred language version titles use the target language
- [ ] The full optimization plan was shown and confirmed before writing
- [ ] The formal English version was updated after confirmation when applicable

## Response After Completion

Respond in the user's language with:

1. Updated file path
2. Summary of changes
3. Commands verified or missing
4. Any assumptions or missing durable references
