---
description: Create or update a project-level README.md for human readers
---

# Create or Update README

## Usage

```bash
/cupdate-readme [project-path]
```

Arguments:

| Argument | Required | Description |
|---|---|---|
| `project-path` | No | Project root where `README.md` should be created or updated. If omitted, infer from conversation context. |

Examples:

```bash
/cupdate-readme
/cupdate-readme projects/wopal-cli
```

## Purpose

`README.md` is a human-facing project entry document.

It should explain what the project is, how to install or run it, what it can do, and where to find durable technical references. It must not become an Agent rule file, implementation checklist, or design specification.

## Scope

This command supports project-level README files only.

Do not create subdirectory README files with this command. If the provided path is inside a project, infer the project root when safe; otherwise ask the user.

## Required Context

Read enough project context to produce an accurate README.

Required when available:

- Existing project `README.md`
- Related PRD
- Related DESIGN
- Project package/build/run configuration
- Main entry files or CLI command definitions
- License file or package metadata

Do not link backlog plans, task plans, command transcripts, or temporary implementation artifacts by default.

## Writing Quality Bar

README.md must be concise and user-oriented.

Required qualities:

- Explain the project's value in one clear opening paragraph.
- Provide accurate install/run/development commands.
- Describe user-visible capabilities, not internal implementation details.
- Link durable technical docs instead of duplicating them.
- Keep the document understandable without requiring monorepo context unless the project itself depends on that context.

Forbidden content:

- Agent implementation rules
- Deep architecture explanations copied from DESIGN
- PRD roadmap duplication
- Internal task lists or TODOs
- Backlog/plan links unless explicitly requested
- Unverified commands or guessed package managers

## Recommended Structure

Use this structure unless the existing README has a stronger established convention.

````markdown
# <Project Name>

<One-paragraph human-facing description.>

## Quick Start

```bash
<install command>
<run command>
```

## Core Capabilities

- <capability>
- <capability>

## Development

```bash
<test command>
<build command>
```

## Technical References

| Document | Description |
|---|---|
| `AGENTS.md` | Agent development rules |
| `<PRD path>` | Product intent |
| `<DESIGN path>` | Architecture and technical design |

## License

<license>
````

## Update Mode

When updating an existing README:

1. Preserve accurate user-facing content.
2. Remove stale commands, obsolete links, and implementation-only details.
3. Verify commands from package/config files before writing them.
4. Keep design and product details as links, not copied sections.
5. Keep Agent-specific implementation rules in `AGENTS.md`, not README.md.

## Quality Checklist

- [ ] Target project root is explicit or safely inferred
- [ ] README is project-level, not directory-level
- [ ] Install/run/development commands are verified from project files
- [ ] Capabilities are user-facing
- [ ] Durable references are linked
- [ ] No Agent rule content
- [ ] No backlog/task/plan links unless explicitly requested

## Response After Completion

Respond in the user's language with:

1. File path updated
2. Summary of changes
3. Commands verified or missing
4. Any assumptions or missing durable references
