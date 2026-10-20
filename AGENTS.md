---
name: WopalSpace Ontology AGENT RULES
description: WopalSpace soul, regulations, and capability gene toolkit — agents, rules, skills, commands, plugins, templates, and scripts
---

# Agent Development Rules

## 1. Canonical References

- DESIGN: `.wopal/docs/DESIGN.md`
- Parent Rules: `.wopal-space/REGULATIONS.md`
- Plugin Rules: `.wopal/plugins/wopal-plugin/AGENTS.md`

## 2. Architecture and Directories

Execution chain: modify ontology source → if load-path-related, user restarts ellamaka → verify at ellamaka runtime.

Localization review directory: `.wopal/docs/LANG/<locale>/...`. `<locale>` uses IETF BCP 47 / RFC 5647 tags, e.g. `zh-CN`, `en-US`. Never hardcode `zh-CN`.

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

## 3. Development Commands

| Scenario | Command | When |
|---|---|---|
| Plugin build & test | See `.wopal/plugins/wopal-plugin/AGENTS.md` | After any plugin code change |
| Content change verification | Remind user to restart ellamaka | Any change involving load paths |

## 4. Implementation Rules

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
- If the user's preferred language is not English, draft or update `SKILL.<locale>.md` first, then translate and sync to `SKILL.md` after approval.
- frontmatter must have `name` and `description`.
- `description` drives triggering: state what it does and when to trigger; triggering conditions go in frontmatter, not the body.
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

### Dev-flow Worktree Lifecycle

The dev-flow skill's worktree Plan lifecycle follows the **Plan branch ownership** contract:

- `planning`, and the approved `executing` baseline, live on the integration branch (main or space/<name>)
- `approve --confirm` first commits `executing` + worktree metadata on the integration branch, then creates the worktree
- `complete` commits a Plan-only commit (`verifying`) on the feature branch, and exits with an error on a dirty work tree
- User validation happens on the feature branch
- `verify-switch --merge` integrates the feature branch into main only after explicit user confirmation
- `verify --confirm` commits a Plan-only commit (`done`) on the integration branch
- `archive` moves the accepted Plan to `done/` on the integration branch and cleans up the worktree

**Plan-only commit principle**: lifecycle scripts commit Plan status changes only, never implementation code. Delegated implementers do not commit; the controller creates a Task's implementation commit only after inspecting the result and confirming Task Verify passes.

**Plan path and progress ownership**: Plan files live in the space repository under `.wopal-space/plans/<project>/`; no Plan copy exists in the worktree. Subagent prompts must reference the Plan by its absolute path in the space repository, but implementers treat it as read-only and never tick progress. AC commands, Done evidence, and actually touched files are written back by the controller only after Task acceptance.

Authoritative details live in `skills/dev-flow/SKILL.md` under "Executing: implementation, acceptance, review, Agent Verification" and "Branch and worktree boundaries", plus "Implementation handoff" in `references/plan-guide.md`.

### Plugin

- Plugin internal architecture, logging, type safety, error handling, development, and testing rules: **follow** `.wopal/plugins/wopal-plugin/AGENTS.md`.

### Code Review

Generic review methods are documented in `df-implement-review` (code changes) and `df-proposal-review` (plans and evolution proposals); this section lists only project-specific checkpoints.

- **Declarative content** (`agents/`, `rules/`, `skills/`, `commands/`, `assembly/templates/`) lacks automated test coverage, so reviews must inspect files directly:
  - frontmatter fields are complete, and trigger conditions are stated in `description`.
  - Referenced files, skills, and commands actually exist.
  - The formal English version and preferred-language review version stay semantically aligned; review paths must never hardcode a specific language tag.
- **Soul prompts** (`agents/`): workflows, skill routing, tool APIs, or delegation timing inside soul prompts are findings.
- **Generality**: paths, project names, or customer names specific to this space appearing in skills or soul prompts are findings.
- **Assembly manifests** (`assembly/archetypes/*.yaml`): every capability listed in a manifest must genuinely exist in this repository's capability pool; listing an entry missing from the pool is a finding.
- **Plugin code** (`plugins/wopal-plugin/`): review against `.wopal/plugins/wopal-plugin/AGENTS.md`.
- **Comments not to raise**: items owned by CI (compilation, formatting, lint); personal taste; product intent (business rules belong to the user).

### dsh-adapter Invariants

- **Event-log folds are LAST-wins**: per-message sandbox overrides append `sandbox/mode` unconditionally, including values equal to the space default — "restore default" requires an explicit event; skipping same-as-default appends leaves a prior override in force. Only a missing `extra.sandboxMode` means "keep current fold" (see poc DESIGN-dsh-poc §4.5).
- **Permission frontmatter carries no wildcards**: agent `permission:` blocks must not declare `"*": allow`-style entries (engine defaults already provide them). Evaluation is LAST-wins over deep-merged multi-copy frontmatter, so a wildcard can silently override an explicit `ask` depending on key order (see poc DESIGN-dsh-poc §6.8). After any permission change, verify merged rule order via `GET /agent` on a live instance.
- **Projected tool schemas must stay faithful to the container declaration**: the JSON Schema→zod conversion preserves `oneOf`/`anyOf` (null branch → nullable), `enum`, `const`, and every property `description`, degrading to `z.unknown()` only for genuinely unsupported nodes. dsh re-validates every call against its own schema, so a constraint the model cannot see is one it will guess wrong and dsh will then reject (`insert_line` projected as `any` → the model sends strings → `oneOf branch (matched 0)`). Fidelity belongs in the converter, not in per-tool patches — the provider re-reads live container schemas per request, so one converter fix covers every projected tool and every future parameter. Verify against the installed dsh runtime schemas of all projected tools (schema checks plus accept/reject parity with `validateJsonSchemaValue`), never against hand-written samples.

## 5. Testing

- Plugin code follows TDD: write a failing test first, then implement code to make it pass.
- After any declarative content change, remind the user to restart ellamaka for verification. Do not commit frequently before verification passes.

## 6. User-Supplied Rules

- Never hardcode the review path as `zh-CN`.
- Never hardcode paths or information highly specific to this space or particular tasks in skills or soul prompts, as it harms generality.
