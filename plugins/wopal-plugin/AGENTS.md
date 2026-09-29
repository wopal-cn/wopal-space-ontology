# wopal-plugin — Agent Development Rules

## 1. Project Positioning

Wopal's dedicated ellamaka runtime plugin — rule injection, task delegation, memory system, context management.

Canonical references:

- PRD: `.wopal/docs/PRD.md`
- DESIGN: `.wopal/docs/DESIGN.md`
- Parent Rules: `.wopal/AGENTS.md`

## 2. Architecture and Directories

| Module | Responsibility | Disable Switch |
|--------|---------------|----------------|
| Global (`index.ts`) | Load .env, consume engine-delivered config, register Hooks/Tools | None |
| Rules (`rules/`) | Rule discovery → condition matching → user message injection | `pluginConfig["wopal-plugin"].rules.enabled` — opt-in, default `false` |
| Memory (`memory/`) | LanceDB storage, semantic retrieval, memory injection | `pluginConfig["wopal-plugin"].memory.enabled` (master), `.memory.injection` (injection only) |
| Task (`tasks/`) | Non-blocking sub-sessions, state monitoring, bidirectional communication, concurrency control | None |
| Monitor (`monitor/`) | Periodic scheduling engine, unified strategy management | None |
| Context (`hooks/`, `context/`) | Session compaction and recovery, title generation, distillation | `pluginConfig["wopal-plugin"].context.enabled` — gates title/recovery/distillation; compaction always on |

| Directory | Responsibility |
|-----------|---------------|
| `src/hooks/` | Hook registration and injection logic; `system-transform.ts` is the sole system prompt modification entry |
| `src/tasks/` | Task management; `SimpleTaskManager` is the sole public entry |
| `src/memory/` | Memory persistence; `MemoryStore` (`store.ts`) is the sole persistence access entry |
| `src/monitor/` | `MonitorEngine` is the sole periodic scheduling engine |
| `src/tools/` | Plugin tool definitions; task tools use unified `wopal-task-*` prefix |
| `src/lifecycle/` | Generic process cleanup registry |
| `src/rules/` | Rule discovery, matching, formatting |
| `scripts/` | CLI tools, migrations, validation utilities |

Deployment: declared in `config/settings.jsonc` as the relative path `../plugins/wopal-plugin/src/index.ts`.

## 3. Development Commands

| Scenario | Command |
|----------|---------|
| Install dependencies | `bun install` |
| Type check | `bun run typecheck` |
| Auto-fix types | `bun run typecheck:fix` |
| Run tests | `bun run test:run` |
| Watch tests | `bun run test` |
| Build | `bun run build` |
| Lint | `bun run lint` |
| Format | `bun run format` / `bun run format:fix` |
| Format check | `bun run format:check` (not a hard gate) |

### Post-Change Verification Order

`bun run typecheck:fix` → `bun run typecheck` → `bun run test:run`.

Issues that `typecheck:fix` cannot resolve must be fixed manually; do not skip and commit. `build` is for artifact verification/release only, not routine validation.

### Verification Mechanisms

Runtime behavior that unit tests cannot exercise (plugin bootstrap, config loading from real files, resource construction, tool registration) is verified by launching ellamaka headless against the real space:

```bash
# From the space root; prints plugin logs to stderr and appends to the plugin log file.
ellamaka run "reply with exactly: OK" --print-logs --log-level DEBUG
```

Output lands in `<space>/.wopal-space/logs/wopal-plugin.log`. Boot markers to look for:

| Marker | Meaning |
|--------|---------|
| `Runtime context initialized` | Space root and `wopalHome` resolved |
| `Effective wopal config loaded` | Engine-delivered plugin config consumed; effective snapshot logged, secrets redacted |
| `Resources resolved` | Which of store / embedder / llm were constructed |
| `Plugin initialized` | Final tool list and `memory` flag |

Config-driven behavior is exercised with isolated fixtures under `.wopal-space/.tmp/` (never by editing the user's real `settings.local.jsonc`); `loadWopalConfig` accepts an injected `pluginConfig` slice / `inlineOptions` / `fallbackEnvironment` for this purpose.

`WOPAL_HOME` overrides the user-level config and storage root, which makes sandboxed runs possible.

## 4. Implementation Rules

### Logging

Use module-level loggers (`src/logger.ts`); `console.log` is forbidden.

| Logger | Scope |
|--------|-------|
| `coreLogger` | Bootstrap, lifecycle |
| `rulesLogger` | Rule discovery/matching/injection |
| `taskLogger` | Task delegation/monitoring/communication |
| `memoryLogger` | LanceDB/retrieval/injection |
| `contextLogger` | Session state/compaction/recovery/distillation |

- Log levels: trace(10) / debug(20) / info(30) / warn(40) / error(50) / fatal(60); default `info`
- **Log level usage rules**:
  - `info`: Core event completion — one info log per key event (e.g., distill done, confirm done, cancel). Do not add more
  - `debug`: Important data display — log key metrics/data points for operational visibility (e.g., message count, conversation length after extraction)
  - `trace`: Detailed debugging flow — step-by-step traces for troubleshooting (e.g., "already extracted", "too short, skip", "no memories extracted")
  - `warn`: Structured error output — must carry `{ err: error }`, never interpolate error.message
- Structured fields via `data` object, field names in snake_case; do not interpolate into message
- Error logs must carry `{ err: error }`; logging only `error.message` is forbidden
- sessionID format: `formatSessionID(sessionID, isTask)` → `<last10chars>(main|task)`
- Module-level loggers are process-wide singletons, but one process hosts several runtimes (one per space); their destination must NOT be frozen at import time — it follows the serving runtime
  - `createPluginRuntime` must call `bindLoggerRuntime(context, env, config)` while assembling a runtime; falling back to the process environment happens only when unbound
  - While bound, singleton call sites write to that runtime's `logDir`; unbound, they land in the global `<WOPAL_HOME>/logs` and a space instance logs to the wrong file
  - `src/logger-runtime-binding.test.ts` is the regression guard covering binding, fallback, and last-writer-wins routing

### Path Resolution

- `WOPAL_HOME` must be normalised through `resolveWopalHome()` (`src/paths.ts`) before it becomes a path; never feed it straight into `path.join`
  - the env value can be the literal, unexpanded `~/.wopal`; `join("~/.wopal", "logs")` yields a *relative* path that resolves against the process cwd and grows a junk `~/` directory inside the plugin package
  - normalisation expands a leading `~`, absolutises, and falls back to `<home>/.wopal` for empty values
- Test runs pin `WOPAL_HOME` to a temp directory (absolute) globally via `src/test-setup.ts`; a test that overrides it must restore that isolated value
- `src/test-isolation.test.ts` is the regression guard asserting writes land outside both the plugin cwd and the real `~/.wopal`

### Module Boundaries

- **tasks**: `SimpleTaskManager` periodic monitoring must register via `MonitorStrategy` into `MonitorEngine`
- **monitor**: New monitoring strategies implement `MonitorStrategy` and register with engine; creating independent scheduling chains in other modules is forbidden
- **memory**: `MemoryStore` is the sole persistence entry; records use `tags` field (not `concepts`)
- **context**: distillation follows `preview → confirm` two-step flow, skipping user review is forbidden

### Agent-Facing Tools

- `memory_manage`: pure memory operations — list/stats/search/add/update/delete/injected; registered when the memory store is available
- `context_manage`: session context — status/dump/compact, plus distillation actions distill/confirm/cancel; distillation requires the context capability (`context.enabled`)

### `promptAsync` Session Model Discipline

- Any `promptAsync` call that sends a message to a session must explicitly use the **target session's current trusted model** as `body.model`; never rely on the default model
- Sending to the main session → use the main session's current model; sending to a child session → use that child session's current model
- If the target session's current model is unknown, first resolve it from session state or the runtime API; only degrade safely when it still cannot be resolved, and log the reason at debug/warn level
- Never use the sender session, current executing agent, or default provider/model configuration as a substitute for the target session's model

### Adding New Features

- **New hook**: Create file in `hooks/`, register in `hooks/index.ts` `createAllHooks()`
- **New tool**: Create file in `tools/`, register in `tools/index.ts` `createWopalTools()`; task tools use `wopal_task_*` prefix
- **New memory category**: Add in `memory/categories.ts`; identifier in English, importance 0-1
- **New monitoring strategy**: Implement `MonitorStrategy` interface, register with `MonitorEngine`
- **New environment variable**: `WOPAL_` prefix + `UPPER_SNAKE_CASE`; must sync to the debug switch table. Feature switches belong in config, not env
- **New config node**: Add to `src/config/schema.ts` with an explicit default (delivered via `pluginConfig["wopal-plugin"]`); document it in section 8
- **New HookContext field**: Must be optional (`?: boolean`) for backward compatibility. Default `true` for capability gates that preserve existing behavior; default must be `false` for opt-in switches (e.g. `rulesInjectionEnabled`)

### Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Source files | `kebab-case.ts` | `idle-diagnostic.ts` |
| Test files | Same directory as source, `*.test.ts` | `task-launcher.test.ts` |
| Tool definitions | `wopal-task-*.ts` | `wopal-task-output.ts` |
| Hook functions | `create*` factory pattern | `createAllHooks()` |
| Loggers | Module-level singleton, import from `logger.ts` | `taskLogger`, `memoryLogger` |
| Environment variables | `WOPAL_` + `UPPER_SNAKE_CASE` | `WOPAL_PLUGIN_LOG_LEVEL` |

### Error Handling

- All async operations must try/catch; log with module logger at `error` level carrying `{ err: error }`, return safe fallback value
- Sub-session exceptions classified via `task-stop-classifier.ts`: `idle` / `stuck` / `error`
- LanceDB connection failure → degrade to empty Store; Embedding API failure → skip injection + warn log

### Type Safety

- Bare `as any` is forbidden; use type guards, `unknown` narrowing, or minimal interface definitions
- When SDK types are missing, add local declarations in `types.ts`; do not escape with `as any`
- `typecheck:fix` handles only mechanically fixable type issues; complex cases must be fixed manually
- Routine validation uses `bun run typecheck`; do not call `tsc` directly

### File Size

Source files ≤500 lines; split when exceeded. Split signals: >500 lines / function >50 lines / >2 responsibilities / >15 imports.

## 5. Testing

- Follow TDD: write a failing test first, then implement to make it pass
- New modules must have `*.test.ts` covering main paths and edge cases
- Code style: TypeScript ESM, `.js` extension imports; Vitest framework, tests co-located with source

## 6. Do Not

- Use `console.log` (use module-level loggers)
- Use npm / pnpm (Bun only) — the Bun toolchain is the single toolchain. No `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `package-lock.json` may ever exist in this plugin; the only lockfile is `bun.lock`. Native postinstall builds are declared via `trustedDependencies` in `package.json`, never via pnpm "onlyBuiltDependencies" or npm scripts
- Import contract or SDK types from `@opencode-ai/*` — fork contract types (`SystemPromptMetadata` etc.) come from `@wopal/ellamaka-plugin`, SDK consumers (`createOpencodeClient`, `Model`) come from `@wopal/ellamaka-sdk`; hand-copying fork types in `types.ts` is forbidden (a residual local definition duplicates the contract and drifts silently)
- Use `^` prefix for LanceDB — `@lancedb/lancedb` and `@lancedb/lancedb-darwin-x64` must have matching exact versions (currently `0.22.3`); ABI incompatibility crashes the memory system
- Directly concatenate injection content in `system-transform.ts`
- Cross-use loggers across modules

## 7. Debug Switches

| Variable | Default | Description |
|----------|---------|-------------|
| `WOPAL_PLUGIN_LOG_LEVEL` | `info` | Log threshold: trace/debug/info/warn/error/fatal (env override; config `pluginConfig["wopal-plugin"].logLevel` is the default source) |
| `WOPAL_PLUGIN_LOG_FILE` | `<cwd>/.wopal-space/logs/wopal-plugin.log` | Log file path (env override; config `pluginConfig["wopal-plugin"].logFile` is the default source) |
| `WOPAL_PLUGIN_LOG_MODULES` | (empty) | Module filter (comma-separated), empty=all. Options: core/rules/task/memory/context (env override; config `pluginConfig["wopal-plugin"].logModules` is the default source) |
| `ELLAMAKA_LOG_LEVEL` | (unset) | Host unified log level fallback (DEBUG/INFO/WARN/ERROR, normalized to lowercase). Effective only when neither `WOPAL_PLUGIN_LOG_LEVEL` nor config `logLevel` yields a valid level; read from the real process environment only, never from `.env` |

## 8. Config Nodes (`wopal.pluginConfig["wopal-plugin"]`)

Feature switches and connection settings live in the `wopal.pluginConfig["wopal-plugin"]` entry of the three-layer settings (`global` → `space-public` → `space-local`, later wins). The engine deep-merges the layers and delivers the effective entry through `PluginInput.pluginConfig`; the plugin consumes the in-memory slice and never reads settings files.

| Node | Fields | Notes |
|------|--------|-------|
| `rules` | `enabled` | Default `false`. Opt-in: rule discovery and injection run only when set to `true` |
| `memory` | `enabled`, `injection` | Default both `true`; `injection=false` stops auto-injection but keeps `memory_manage` and search |
| `context` | `enabled` | Default `true`; gates title generation, auto-recovery, and distillation; compaction always on |
| `llm` | `baseUrl`, `model`, `apiKey` | apiKey supports `$VAR`: resolved from `process.env` first, `.env` files as fallback; never store plaintext keys |
| `embedding` | `baseUrl`, `model`, `apiKey` | Same `$VAR` semantics as `llm` |
| `logLevel` / `logFile` / `logModules` | — | Config is the default source; `WOPAL_PLUGIN_LOG_*` env vars override |

Precedence: built-in defaults < inline mount options (compatibility layer) < engine-delivered `pluginConfig["wopal-plugin"]`. The plugin layers them and validates strictly — invalid entries fail startup. Layer merging and the shape of the outer `wopal.pluginConfig` table are engine-owned.

`.env` files hold only secrets referenced via `$VAR` (e.g. `WOPAL_LLM_API_KEY`) plus the log diagnostic overrides; feature switches never go in `.env`.
