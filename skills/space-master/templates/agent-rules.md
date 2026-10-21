---
name: <Project or Module(dir)> AGENT RULES
description: <One-line stable description of the current project or directory module responsibility>
---

# Agent Development Rules

## Canonical References

Canonical references:

<!-- List only documents that actually exist and are directly relevant to this scope. Do not write N/A placeholders. -->
- PRD: `<path-when-relevant>`
- DESIGN: `<path-when-relevant>`
- Business Rules: `<path-when-relevant>`
- Referral Rules: `<path-when-relevant>`

## Architecture and Directories

<Brief current architecture description; may include a concise runtime flow>

| Directory | Responsibility |
|---|---|
| | |

<!-- The directory table lists only paths that currently exist. Durable target-structure constraints belong in Implementation Rules, not as current directory facts. -->

## Development Commands (build format test)

| Scenario | Command | When |
|---|---|------|

## Implementation Rules

- <technical implementation rule>
- <project-specific UI/UX or output rule if applicable>

## Testing

- <For testable pure logic, follow TDD: write a failing test first, then implement code to make it pass>
- <state which project logic must be covered by automated tests and which host APIs, external systems, or real runtime boundaries require manual verification>

## Code Review Rules

<!-- Keep this heading verbatim in English — review tooling locates this
     section by the heading. Never translate, rename, or remove it. -->

<!-- Direction-level skeleton only. Each project fills in its own
     project-specific checkpoints below; never bake any single project's
     rules into this template. -->

Generic review method lives in the review skills this space assembles
(reference the code-change review skill and the plan/proposal review
skill that actually exist here).

Report a defect only when the diff introduces it and the finding names a
concrete trigger, the affected behavior, and evidence in the changed code.
Omit pre-existing problems, style preferences, and anything CI already
enforces.

### <Project-specific review checkpoints>

- <repository-specific checks that complement, not replace, CI and tests>

## User-Supplied Rules

- <user-supplied rules; commands must not modify this section>
- <when updating: original rules that do not fit the sections above should be preserved here verbatim>
