---
name: WopalSpace Ontology AGENT RULES
description: WopalSpace soul, regulations, and capability gene toolkit — agents, rules, skills, commands, plugins, templates, and scripts
---

# Agent Development Rules

## Canonical References

- DESIGN: `.wopal/docs/DESIGN.md`
- Parent Rules: `.wopal-space/REGULATIONS.md`
- Plugin Rules: `.wopal/plugins/wopal-plugin/AGENTS.md`

## Architecture and Directories

| Directory | Responsibility |
|---|---|
| `agents/` | Agent soul and permission configuration |
| `rules/` | Rule definitions; shared rules and agent-specific rules |
| `skills/` | Skill definitions; scripts live in each skill's `scripts/` |
| `commands/` | Command definitions; `commands/wopal/` holds Wopal-specific commands |
| `plugins/wopal-plugin/` | ellamaka plugin; see sub-module AGENTS for internal architecture and code rules |
| `assembly/` | Assembly definitions: archetypes, space schemas, render templates |
| `scripts/` | Ontology maintenance, git hooks, and auxiliary automation scripts |
| `config/` | Space-level ellamaka configuration layer |

## Development Commands

| Scenario | Command | When |
|---|---|---|
| Plugin build & test | See `.wopal/plugins/wopal-plugin/AGENTS.md` | After any plugin code change |
| Content change verification | Remind user to restart ellamaka | Any change involving load paths |

## Implementation Rules

### i18n / Multilingual

Applies to semantic content in: `agents/`, `rules/`, `commands/`, `assembly/templates/`, `skills/`.

- The formal English version is the runtime source, located under `.wopal/` in the corresponding directory.
- If the user's preferred language is not English, first generate or update the user's preferred-language review version, then sync to the formal English version after approval.
- `<locale>` uses IETF BCP 47 / RFC 5646 language tags. Never hardcode a specific locale.
- Review-version titles and body use the target language; mixing Chinese and English titles is forbidden.
- Localized template review versions must preserve the formal template's English section headings; translate only body text, placeholder guidance, and table content.
- After review approval, update the English runtime source under `.wopal/`. Both versions must stay semantically aligned.
- For `agents/`, `rules/`, `commands/`, and `assembly/templates/`, keep review versions under `.wopal/docs/LANG/<locale>/<type>/`.
- For `skills/`, keep the preferred-language review version in the same skill directory as `SKILL.<locale>.md`, then sync to `SKILL.md` after approval.
- If the user's preferred language is English, update the formal English file directly. Do not create English locale variants.

### Skill

- To create or modify a skill: load the `skill-creator` skill first.
- Bilingual consistency is mandatory: if the user's preferred language is not English, draft or update `SKILL.<locale>.md` in the same directory first, then translate and sync to official `SKILL.md` after approval.
- frontmatter must have `name` and `description`.
- `description` drives triggering and must stay lean: state only the usage scenarios and triggering conditions (when to invoke this skill); strictly exclude body workflow details, implementation steps, and rule specifications.
- The body only covers workflow, output, and notes; long content offloads to `references/`.
- `scripts/` holds only deterministic, reusable logic.

### Soul Prompts: `agents/`

- Soul prompts only cover: role positioning, decision principles, output style, and permission.
- Workflow, skill routing, tool APIs, delegation timing, and command steps do not go in soul prompts; those go into skills, commands, or rules respectively.
- `permission` goes in frontmatter. Study ellamaka source and references for the configuration approach; solidify into the `ellamaka-config` skill.

### Commands: `commands/`

- Shared commands go in `commands/*.md`; Wopal-specific commands go in `commands/wopal/*.md`.
- Write uniformly per `.wopal/assembly/templates/command.md`.
- frontmatter: `description` required (≤50 chars); sub-task commands: `subtask: true`.
- Use `$ARGUMENTS` or `$1...$N` for parameters; the highest `$N` consumes remaining arguments (rest semantics).

### Rules: `rules/`

- Shared rules go in `rules/*.md`; agent-specific rules go in `rules/<agent>/`.
- frontmatter must have `trigger`, `description`, and `keywords`.
- `trigger` declares the matching mode (e.g. `model_decision`); `keywords` declare triggering keywords.
- The body only contains agent-executable constraints, not product intent or implementation details.

### Plugin

- Plugin internal architecture, logging, type safety, error handling, development, and testing rules: **follow** `.wopal/plugins/wopal-plugin/AGENTS.md`.

## Testing

- Plugin code follows TDD: write a failing test first, then implement code to make it pass.
- After any declarative content change, remind the user to restart ellamaka for verification. Do not commit frequently before verification passes.

## Code Review Rules

Keep this heading verbatim — Codex Code Review looks for it.

Generic review method lives in `df-implement-review` (code changes) and
`df-proposal-review` (Plans, designs, and evolution proposals). This section adds repository-specific checks; it does
not replace CI, tests, or product intent.

Report a defect only when this diff introduces it and the finding names a
concrete trigger, the affected behavior, and evidence in the changed code.
Omit pre-existing problems, style preferences, and anything CI already enforces.

### Capability references resolve

- Every skill, agent, rule, command, and template referenced by an applicable
  `assembly/archetypes/*.yaml`, an agent's `permission:` block, or a skill must
  exist in the same tree.
- Adding or removing a capability requires updating the archetypes that consume
  it, plus the README entries that actually enumerate it.
- Safe path: keep the old entry until every consumer moves, or land the rename
  and all consumer updates together. A space-local or single-type change may
  update only its own manifest or register an `include`
  (`docs/DESIGN-assembly.md`).
- Why it matters: an unresolved reference makes space assembly fail closed
  (`docs/DESIGN-assembly.md`), so one stale name blocks every coding space.

### Declarative content is reviewed by reading it

`agents/`, `rules/`, `skills/`, `commands/`, and `assembly/templates/` have no
automated coverage:

- frontmatter carries the required fields, and trigger conditions are stated in
  `description`;
- every referenced file, skill, and command exists;
- the English runtime source and the preferred-language review version stay
  semantically aligned, and review paths never hardcode a locale.

### Delegation contracts agree

A skill loaded by a delegated agent must not contradict the controlling
workflow about who commits, who ticks Plan progress, or who writes AC commands
back. Safe path: state the owner explicitly in the skill, and scope the rule to
the workflow that actually owns that state.

### Soul prompts stay narrow

A workflow step, skill route, tool API, or delegation timing inside `agents/` is
a finding; those belong in skills, commands, or rules (see §4).

### Generality

Paths, project names, or customer names specific to one space must not appear in
`skills/` or `agents/`. Safe path: express the invariant in terms of the space
type or a parameter.

### Plugin code

Review `plugins/wopal-plugin/` against its own `AGENTS.md` (runtime path
`.wopal/plugins/wopal-plugin/AGENTS.md`), including its TDD rule.

### Out of scope

- compilation, formatting, and lint that CI already enforces;
- personal style preferences;
- product intent and business rules, which belong to the user.

## User-Supplied Rules

- Never hardcode the review path as `zh-CN`.
- Never hardcode paths or information highly specific to this space or particular tasks in skills or soul prompts, as it harms generality.
