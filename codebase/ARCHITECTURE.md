# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Layered Agent System with Plugin-based Runtime Extension

**Key Characteristics:**
- **Three-layer deployment**: Source (`projects/ontology/`) → Deployment (`.wopal/`) → Runtime (`.agents/`)
- **Skill-first architecture**: Capabilities delivered as versioned, composable skill units
- **Plugin-based extension**: OpenCode runtime extended via TypeScript plugins
- **Agent specialization**: Wopal (thinking/planning) and Fae (execution) with shared and agent-specific resources

## Layers

**Source Layer (`projects/ontology/`):**
- Purpose: Read-write development center for all agent capabilities
- Location: `projects/ontology/`
- Contains: Agents, skills, commands, rules, plugins
- Depends on: External skills (downloadable), OpenCode SDK
- Used by: `sync-to-wopal.py` script

**Deployment Layer (`.wopal/`):**
- Purpose: Read-only mirror of source for runtime consumption
- Location: `.wopal/`
- Contains: Copied/symlinked resources from source
- Depends on: Source layer (populated by sync script)
- Used by: `.agents/` symlinks

**Runtime Layer (`.agents/`):**
- Purpose: Active runtime environment for OpenCode
- Location: `.agents/`
- Contains: Symlinks to `.wopal/` resources
- Depends on: `.wopal/` deployment layer
- Used by: OpenCode engine directly

## Data Flow

**Resource Deployment Flow:**
```
projects/ontology/ → sync-to-wopal.py → .wopal/ → .agents/ (symlink)
```

**Plugin Initialization Flow:**
```
index.ts → OpenCodeRulesRuntime → hooks (system-transform, message-transform)
                                      ↓
                              Memory System (lazy init)
                                      ↓
                              Tools registered → OpenCode
```

**Memory/Distillation Flow:**
```
User Message → distill_session → DistillEngine → MemoryStore (LanceDB)
                                        ↓
User Message → buildEnrichedQuery ← SessionContext ← context_manage
                        ↓
              Memory Retriever → Injector → System Prompt
```

**Task Delegation Flow:**
```
wopal_task → SimpleTaskManager → Sub-session launch
                                        ↓
                              session.idle event → diagnostics
                                        ↓
                              wopal_output / wopal_reply / wopal_cancel
```

## Key Abstractions

**Skill:**
- Purpose: Versioned, reusable agent capability unit
- Examples: `dev-flow`, `fae-collab`, `skill-master`
- Pattern: `SKILL.md` + `scripts/` + `references/` + `assets/`

**Command:**
- Purpose: User-invokable slash commands (`/xxx`)
- Examples: `commit.md`, `distill.md`, `evolve.md`
- Pattern: Markdown file with trigger + instructions

**Rule:**
- Purpose: Context injection for constraints/guidelines
- Examples: `mem-rule.md`, `spec.md`, `typescript.md`
- Pattern: Markdown file discovered and injected by plugin

**Plugin (wopal-plugin):**
- Purpose: Runtime TypeScript extensions for OpenCode
- Location: `plugins/wopal-plugin/src/`
- Core files: `index.ts`, `runtime.ts`, `simple-task-manager.ts`
- Sub-modules: `memory/`, `tools/`, `diagnostics/`

## Entry Points

**OpenCode Plugin Entry:**
- Location: `plugins/wopal-plugin/src/index.ts`
- Triggers: OpenCode loads plugin at startup
- Responsibilities: Initialize runtime, register tools, setup hooks

**Wopal Agent System Prompt:**
- Location: `agents/wopal/agents/wopal-cn.md` (Chinese), `wopal.md` (English)
- Triggers: Every Wopal session start
- Responsibilities: Define agent personality, behavior phases, values

**Dev-Flow Skill Entry:**
- Location: `agents/wopal/skills/dev-flow/SKILL.md`
- Triggers: Issue-driven development tasks
- Responsibilities: Issue → Plan → Execute → Verify workflow

**Sync Script Entry:**
- Location: `scripts/sync-to-wopal.py`
- Triggers: Manual execution after source changes
- Responsibilities: Copy agents/commands/rules/plugins to `.wopal/`

## Error Handling

**Strategy:** Layered diagnostics with automatic notification

**Patterns:**
- **Idle Detection**: `idle-diagnostic.ts` detects unresponsive sessions
- **Stuck Detection**: `stuck-detector.ts` identifies infinite loops
- **Error Classification**: `error-classifier.ts` categorizes failures
- **Permission Proxy**: `permission-proxy.ts` auto-grants TUI permissions
- **Question Relay**: `question-relay.ts` forwards sub-agent questions to parent

## Cross-Cutting Concerns

**Logging:** `debug.ts` with module-filtered `createDebugLog()` / `createWarnLog()`

**Validation:** `validate-rules-plugin.ts` for rule file validation

**Session State:** `session-store.ts` + `session-store-instance.ts` for multi-session tracking

**Memory Persistence:** LanceDB via `@lancedb/lancedb` for semantic memory storage

**Embedding:** OpenAI via `@lancedb/lancedb` embedding function for semantic search

---

*Architecture analysis: 2026-04-09*
