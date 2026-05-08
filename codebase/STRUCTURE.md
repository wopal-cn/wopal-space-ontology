# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```
wopal-workspace/
├── projects/ontology/           # Source layer (read-write)
│   ├── agents/                  # Agent prompts & agent-specific resources
│   │   ├── fae/                # Fae agent专属
│   │   │   ├── commands/
│   │   │   ├── rules/
│   │   │   └── skills/
│   │   └── wopal/              # Wopal agent专属
│   │       ├── agents/         # System prompts (wopal-cn.md, wopal.md)
│   │       ├── commands/       # Wopal commands (distill.md, evolve.md, etc.)
│   │       ├── rules/          # Wopal rules (mem-rule.md, spec.md)
│   │       └── skills/         # Wopal skills (dev-flow, fae-collab, etc.)
│   ├── commands/               # Universal commands
│   ├── rules/                  # Universal rules (astro.md, python.md, typescript.md)
│   ├── skills/                 # Universal skills (fc-local, youtube-master, backup/)
│   ├── plugins/                # OpenCode plugins
│   │   └── wopal-plugin/       # Main Wopal plugin (TypeScript)
│   │       ├── src/            # Plugin source
│   │       ├── dist/           # Compiled output
│   │       └── node_modules/   # Dependencies
│   └── ref/                    # Reference templates
├── .wopal/                      # Deployment layer (read-only mirror)
├── .agents/                     # Runtime layer (symlinks to .wopal)
├── scripts/                     # Utility scripts (sync-to-wopal.py, etc.)
├── docs/                        # Space-level documentation
├── labs/                        # External reference repos
└── external/                    # External dependencies (read-only)
```

## Directory Purposes

**`projects/ontology/`:**
- Purpose: Source of truth for all agent capabilities
- Contains: Agents, skills, commands, rules, plugins, ref templates
- Key files: `AGENTS.md` (ontology spec)

**`projects/ontology/agents/wopal/`:**
- Purpose: Wopal-specific agent configuration
- Contains: System prompts, commands, rules, skills
- Key files: `agents/wopal-cn.md`, `agents/wopal.md`

**`projects/ontology/agents/fae/`:**
- Purpose: Fae-specific agent configuration
- Contains: Commands, rules, skills
- Key files: `agents/fae-cn.md`, `agents/fae.md`

**`projects/ontology/plugins/wopal-plugin/`:**
- Purpose: Wopal's OpenCode runtime plugin
- Contains: TypeScript source (`src/`), compiled (`dist/`), tests
- Key files: `src/index.ts`, `src/runtime.ts`, `src/simple-task-manager.ts`

**`projects/ontology/skills/`:**
- Purpose: Universal skills (shared across all agents)
- Contains: `fc-local/`, `youtube-master/`, `backup/`, `download/`
- Key files: `SKILL.md` in each skill folder

**`.wopal/`:**
- Purpose: Deployment target for sync operations
- Contains: Mirror of ontology resources
- Note: Do not edit directly

**`.agents/`:**
- Purpose: Runtime symlinks consumed by OpenCode
- Contains: Symlinks to `.wopal/`
- Note: Do not edit directly

## Key File Locations

**Entry Points:**
- Plugin: `projects/ontology/plugins/wopal-plugin/src/index.ts`
- Wopal System Prompt: `projects/ontology/agents/wopal/agents/wopal-cn.md`
- Fae System Prompt: `projects/ontology/agents/wopal/agents/fae-cn.md`
- Dev-Flow Skill: `projects/ontology/agents/wopal/skills/dev-flow/SKILL.md`

**Configuration:**
- OpenCode config: `opencode.jsonc`
- Workspace spec: `.workspace.md`
- Space宪法: `AGENTS.md`
- Sync script: `scripts/sync-to-wopal.py`

**Core Logic:**
- Wopal Plugin Runtime: `projects/ontology/plugins/wopal-plugin/src/runtime.ts`
- Task Manager: `projects/ontology/plugins/wopal-plugin/src/simple-task-manager.ts`
- Memory Store: `projects/ontology/plugins/wopal-plugin/src/memory/store.ts`
- Distill Engine: `projects/ontology/plugins/wopal-plugin/src/memory/distill.ts`

**Testing:**
- Wopal Plugin Tests: `projects/ontology/plugins/wopal-plugin/src/*.test.ts`

## Naming Conventions

**Files:**
- Skill directories: `kebab-case` (e.g., `dev-flow`, `fae-collab`, `skill-master`)
- Plugin source files: `kebab-case` (e.g., `simple-task-manager.ts`, `idle-diagnostic.ts`)
- Commands/Rules: `kebab-case` (e.g., `context-continue.md`, `mem-rule.md`)
- Agent prompts: `kebab-case` (e.g., `wopal-cn.md`, `fae.md`)

**Directories:**
- Skills: `kebab-case`
- Plugins: `kebab-case` (e.g., `wopal-plugin`)
- Agents: `lowercase` (e.g., `wopal`, `fae`)

**Classes:**
- PascalCase (e.g., `SimpleTaskManager`, `DistillEngine`, `MemoryStore`)

**Functions/Variables:**
- camelCase (e.g., `createDebugLog`, `ensureMemorySystem`)

## Where to Add New Code

**New Skill:**
- Primary code: `projects/ontology/skills/<skill-name>/SKILL.md`
- Agent-specific: `projects/ontology/agents/wopal/skills/<skill-name>/`
- Tests: Co-located `*.test.ts` files

**New Command:**
- Universal: `projects/ontology/commands/<command-name>.md`
- Wopal-specific: `projects/ontology/agents/wopal/commands/<command-name>.md`
- Fae-specific: `projects/ontology/agents/fae/commands/<command-name>.md`

**New Rule:**
- Universal: `projects/ontology/rules/<rule-name>.md`
- Wopal-specific: `projects/ontology/agents/wopal/rules/<rule-name>.md`

**New Plugin Tool:**
- Implementation: `projects/ontology/plugins/wopal-plugin/src/tools/<tool-name>.ts`
- Type definitions: `projects/ontology/plugins/wopal-plugin/src/types.ts`

**New Plugin Module:**
- Core logic: `projects/ontology/plugins/wopal-plugin/src/<module-name>.ts`
- Tests: `projects/ontology/plugins/wopal-plugin/src/<module-name>.test.ts`

## Special Directories

**`.wopal/`:**
- Purpose: Deployment mirror of `projects/ontology/`
- Generated: Yes (by `sync-to-wopal.py`)
- Committed: No

**`.agents/`:**
- Purpose: Runtime symlinks for OpenCode
- Generated: Yes (by sync or install process)
- Committed: No

**`projects/ontology/plugins/wopal-plugin/node_modules/`:**
- Purpose: Bun dependencies for plugin
- Generated: Yes (by `bun install`)
- Committed: No (in `.gitignore`)

**`projects/ontology/plugins/wopal-plugin/dist/`:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by `bun run build`)
- Committed: Yes (for deployment)

**`external/`:**
- Purpose: External cross-domain dependencies
- Generated: No
- Committed: No (read-only reference)

---

*Structure analysis: 2026-04-09*
