# WopalSpace ontology — Agent Development Rules

## 1. Project Positioning

WopalSpace's soul, regulations, and capability gene toolkit. `agents/`, `rules/`, `skills/`, `commands/`, `plugins/`, `templates/`, `scripts/` are maintained and distributed here.

This project is primarily declarative ontology files; only the plugin and some skill/scripts are code. Root rules use a project-specific structure and do not enforce the generic AGENTS template.

Canonical references:

- DESIGN: `docs/projects/wopal-space-ontology/DESIGN.md`
- Business Rules: `.wopal/rules/business-rules.md`
- Parent Rules: `.wopal-space/REGULATIONS.md`
- Plugin Rules: `.wopal/plugins/wopal-plugin/AGENTS.md`

## 2. Architecture and Directories

Execution chain: modify ontology source → if load-path-related, user restarts ellamaka → verify at ellamaka runtime.

Localization review directory: `docs/projects/wopal-space-ontology/LANG/<locale>/...`. `<locale>` uses IETF BCP 47 / RFC 5646 tags, e.g. `zh-CN`, `en-US`. Never hardcode `zh-CN`.

| Directory | Responsibility |
|---|---|
| `agents/` | Agent soul and permission configuration |
| `rules/` | Rule definitions; shared rules and agent-specific rules |
| `skills/` | Skill definitions; scripts live in each skill's `scripts/` |
| `commands/` | Command definitions; `commands/wopal/` holds Wopal-specific commands |
| `plugins/wopal-plugin/` | ellamaka plugin; see sub-module AGENTS for internal architecture and code rules |
| `templates/` | Space init templates and document templates |
| `prompts/` | Agent prompt templates |
| `scripts/` | Ontology maintenance, git hooks, and auxiliary automation scripts |
| `config/` | Space-level ellamaka configuration layer |

## 3. Development Rules

### i18n / Multilingual

Applies to semantic content in: `agents/`, `rules/`, `commands/`, `templates/`, `prompts/`, `skills/`.

- The formal English version is the runtime source, located under `.wopal/` in the corresponding directory.
- If the user's preferred language is not English, first generate or update the user's preferred-language review version, then sync to the formal English version after approval.
- `<locale>` uses IETF BCP 47 / RFC 5646 language tags, e.g. `zh-CN`, `en-US`. Never hardcode a specific locale.
- Review-version titles and body use the target language; mixing Chinese and English titles is forbidden.
- After review approval, update the English runtime source under `.wopal/`. Both versions must stay semantically aligned.
- For `agents/`, `rules/`, `commands/`, `templates/`, and `prompts/`, keep review versions under `docs/projects/wopal-space-ontology/LANG/<locale>/<type>/`.
- For `skills/`, keep the preferred-language review version in the same skill directory as `SKILL.<locale>.md` (for example `SKILL.zh-CN.md`), then sync the approved content to `SKILL.md`.
- If the user's preferred language is English, update the formal English file directly and do not create English locale variants such as `SKILL.en-US.md`.

### 3.1 Skill

- To create or modify a skill: load the `skill-creator` skill first.
- If the user's preferred language is not English, draft or update `SKILL.<locale>.md` in the same skill directory first, then translate and sync the approved content to `SKILL.md`.
- frontmatter must have `name` and `description`.
- `description` drives triggering: state what it does and when to trigger; triggering conditions go in frontmatter, not the body.
- The body only covers workflow, output, and notes; long content offloads to `references/`.
- `scripts/` holds only deterministic, reusable logic.

### 3.2 Soul Prompts: `agents/`

- Soul prompts only cover: role positioning, decision principles, output style, and permission.
- Workflow, skill routing, tool APIs, delegation timing, and command steps do not go in soul prompts; those go into skills, commands, or rules respectively.
- `permission` goes in frontmatter. Study ellamaka source and references for the configuration approach; solidify into the `ellamaka-config` skill.

### 3.3 Commands: `commands/`

- Shared commands go in `commands/*.md`; Wopal-specific commands go in `commands/wopal/*.md`.
- Write uniformly per `.wopal/templates/command.md`.
- frontmatter: `description` required (≤50 chars); sub-task commands: `subtask: true`.
- Use `$ARGUMENTS` or `$1...$N` for parameters; the highest `$N` consumes remaining arguments (rest semantics).

### 3.4 Rules: `rules/`

- Shared rules go in `rules/*.md`; agent-specific rules go in `rules/<agent>/`.
- frontmatter must have `trigger`, `description`, and `keywords`.
- `trigger` declares the matching mode (e.g. `model_decision`); `keywords` declare triggering keywords.
- The body only contains agent-executable constraints, not product intent or implementation details.

### 3.5 Workflows: `wsf/`

- Workflow definitions go in `wsf/workflows/*.md`; workflow templates go in `wsf/templates/`.
- `wsf/` is for internal consumption by the WSF skill family.
- This module is produced by the space-flow project. See `wsf-file-manifest.json` for the full workflow asset inventory.
- This module may be modified directly only at the user's explicit request; otherwise it should be deployed via the space-flow project.

### 3.6 Plugin

- Plugin internal architecture, logging, type safety, error handling, development, and testing rules: **follow** `.wopal/plugins/wopal-plugin/AGENTS.md`.

## 4. Testing & Verification

- After any content change in this project, remind the user to restart ellamaka for verification. Do not commit frequently before verification passes.

## 5. User-Supplied Rules

- Never hardcode the review path as `zh-CN`.
- Never hardcode paths or information highly specific to this space or particular tasks in skills or soul prompts, as it harms generality.
