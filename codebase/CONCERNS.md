# Codebase Concerns

**Analysis Date:** 2026-04-09

## Tech Debt

### File Size Violations

**Multiple files exceed the 300-line core logic limit:**

| File | Current Lines | Limit | Violation |
|------|--------------|-------|-----------|
| `src/runtime.ts` | 959 | 300 | +659 lines |
| `src/simple-task-manager.ts` | 616 | 300 | +316 lines |
| `src/utils.ts` | 607 | 300 | +307 lines |
| `src/memory/distill.ts` | 854 | 300 | +554 lines |
| `src/index.test.ts` | 3155 | 150 | +3005 lines |

**Files:** `projects/ontology/plugins/wopal-plugin/src/runtime.ts`, `projects/ontology/plugins/wopal-plugin/src/simple-task-manager.ts`, `projects/ontology/plugins/wopal-plugin/src/utils.ts`, `projects/ontology/plugins/wopal-plugin/src/memory/distill.ts`, `projects/ontology/plugins/wopal-plugin/src/index.test.ts`

**Impact:** These files are difficult to maintain, test, and understand. High risk of introducing bugs when modifying oversized files.

**Fix approach:**
- `runtime.ts` → split into `hooks/event-handler.ts`, `hooks/system-transform.ts`, `hooks/message-transform.ts`
- `simple-task-manager.ts` → split into `tasks/manager.ts`, `tasks/launcher.ts`, `tasks/monitor.ts`
- `utils.ts` → split into `rules/discoverer.ts`, `rules/matcher.ts`, `rules/formatter.ts`
- `memory/distill.ts` → evaluate internal modularity, consider splitting by concern
- `index.test.ts` → split into topic-specific test files (runtime.events.test.ts, runtime.memory.test.ts already exist)

### Directory Structure Violations

**CLI scripts in root directory instead of `scripts/`:**
- `projects/ontology/plugins/wopal-plugin/import-memory-md.ts`
- `projects/ontology/plugins/wopal-plugin/check-memories.ts`
- `projects/ontology/plugins/wopal-plugin/clean-memories.ts`
- `projects/ontology/plugins/wopal-plugin/manage-memories.ts`
- `projects/ontology/plugins/wopal-plugin/migrate-embeddings.ts`
- `projects/ontology/plugins/wopal-plugin/test-retrieval.ts`
- `projects/ontology/plugins/wopal-plugin/test-retriever-live.ts`
- `projects/ontology/plugins/wopal-plugin/validate-rules-plugin.ts`

**Impact:** Violates stated project conventions. Makes it unclear which scripts are tools vs tests.

**Fix approach:** Move to `scripts/` and `test/` directories per AGENTS.md specification.

### Redundant Lock Files

**Both `bun.lock` and `pnpm-lock.yaml` present:**
- `projects/ontology/plugins/wopal-plugin/bun.lock`
- `projects/ontology/plugins/wopal-plugin/pnpm-lock.yaml`

**Impact:** Causes confusion, potential for split dependencies. Bun doesn't need pnpm lockfile.

**Fix approach:** Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Project must use Bun exclusively.

---

## Known Issues

### Git Status Issues

**Unpushed commits in ontology:**
- 4 commits ahead of origin/main
- Modified unstaged file: `agents/wopal/skills/dev-flow/lib/check-doc.sh`

**Files:** `projects/ontology/`

**Impact:** Local changes not reflected in remote. Risk of divergence if other sessions push to main.

**Fix approach:** Push pending commits when ready. Review check-doc.sh changes before committing.

### sync-to-wopal.py Hardcoded Solution

**Location:** `scripts/sync-to-wopal.py:365`

```python
TODO: 此为临时硬编码方案，将来脚本重写或废弃时应考虑更通用的"一对多部署"机制。
```

**Impact:** Fae agent files copied with hardcoded filenames (`fae.md`, `fae-cn.md`). Adding new agent files requires modifying the script.

**Fix approach:** Design generic "one-to-many" deployment mechanism for future script rewrite.

---

## Security Considerations

### Environment Variable Loading

**File:** `projects/ontology/plugins/wopal-plugin/src/index.ts:23-43`

```typescript
function loadWopalEnv(rootDir: string): void {
  const envPath = join(rootDir, ".env");
  // ...loads WOPAL_* vars into process.env
}
```

**Risk:** Loading `.env` files silently ignores errors. While appropriate for optional config, could mask permission issues or malformed files.

**Current mitigation:** Errors are silently ignored; non-fatal operation continues.

**Recommendations:** Add debug logging when `.env` file is missing vs unreadable. Consider failing loudly during development.

### API Key Handling

**Dependencies using environment variables:**
- `src/memory/embedder.ts` - requires `WOPAL_EMBEDDING_BASE_URL`, `WOPAL_EMBEDDING_API_KEY`, `WOPAL_EMBEDDING_MODEL`
- `src/memory/llm-client.ts` - requires LLM API configuration

**Risk:** API keys may end up in logs if debug logging is verbose.

**Current mitigation:** None observed - relies on external services not logging request contents.

**Recommendations:** Ensure debug logging sanitizes API-related values from logs.

---

## Performance Bottlenecks

### LanceDB Native Binary

**Dependency:** `@lancedb/lancedb-darwin-x64` - ~95MB native binary

**File:** `projects/ontology/plugins/wopal-plugin/node_modules/@lancedb/lancedb-darwin-x64/lancedb.darwin-x64.node`

**Impact:** Large memory footprint for local vector database. Cold start time may be significant.

**Current mitigation:** LanceDB is lazily initialized via `ensureMemorySystem()`.

**Scaling path:** Consider embedded mode vs server mode for larger deployments. Consider whether LanceDB is necessary for current scale.

### Concurrency Limits

**Configuration:** `DEFAULT_CONCURRENCY_LIMIT = 5` in `simple-task-manager.ts`

**File:** `projects/ontology/plugins/wopal-plugin/src/simple-task-manager.ts:19`

**Impact:** Limits parallel task execution. Could bottleneck high-throughput scenarios.

**Fix approach:** Make configurable via environment variable.

### Token Budget for Memory Injection

**Hardcoded:** `TOKEN_BUDGET = 1500` in `memory/injector.ts`

**File:** `projects/ontology/plugins/wopal-plugin/src/memory/injector.ts:57`

**Impact:** Limits how many memories can be injected. May cause relevant memories to be excluded.

**Fix approach:** Make configurable, or implement priority-based truncation.

---

## Fragile Areas

### Complex Session State Management

**Files:** `src/session-messages.ts`, `src/session-cursor.ts`, `src/session-store.ts`

**Why fragile:** Message extraction relies on specific OpenCode message structure. Schema changes in OpenCode could break parsing.

**Safe modification:** Add defensive checks for missing fields. Test against real session outputs.

**Test coverage:** Session messages have good test coverage (18 tests), but integration with real OpenCode sessions may reveal edge cases.

### Tool Result Extraction

**Files:** `src/tools/wopal-output.ts`, `src/session-messages.ts`

**Why fragile:** Extracts structured data (progress, errors, loops) from unstructured message history. Regex patterns and message structure assumptions may break.

**Safe modification:** Add null checks and fallback defaults. Log when extraction fails.

### Error Classification

**File:** `src/error-classifier.ts`

**Why fragile:** Categorizes errors into `timeout`, `crash`, `network`, `cancelled`, `unknown`. Classification logic may miss edge cases.

**Safe modification:** Add logging for "unknown" classifications to identify patterns.

### OpenCode SDK Coupling

**Files:** Multiple files depend on `@opencode-ai/sdk` types and clients

**Why fragile:** Plugin tightly coupled to OpenCode internal APIs (v1 client, v2 client, event schemas). SDK version changes could break plugin.

**Safe modification:** Abstract OpenCode interactions behind interfaces. Maintain compatibility shims.

---

## Dependencies at Risk

### @opencode-ai/sdk

**Package:** `@opencode-ai/sdk` version `^1.3.13`
**Package:** `@opencode-ai/plugin` version `^1.3.13`

**Risk:** Internal SDK with potential breaking changes. Plugin relies on internal fetch routing.

**Evidence:** `index.ts:98` uses internal client structure:
```typescript
const internalFetch = (pluginInput.client as any)?._client?.getConfig?.()?.fetch ?? globalThis.fetch;
```

**Impact:** SDK changes could break task delegation and message passing.

**Migration plan:** Consider abstracting SDK usage behind interface. Monitor SDK releases for breaking changes.

### OpenAI SDK

**Package:** `openai` version `^6.33.0`

**Risk:** External API dependency. API changes could break embedding and LLM calls.

**Impact:** Memory distillation and embedding generation fail if API changes.

**Migration plan:** Already using OpenAI-compatible interface - could switch providers (Ollama, local models) if needed.

---

## Test Coverage Gaps

### Untested Files

The following source files lack dedicated test files:
- `src/tools/wopal-task.ts`
- `src/tools/wopal-cancel.ts`
- `src/tools/distill-formatters.ts`
- `src/memory/embedder.ts` - only integration tested via `memory/store.test.ts`
- `src/memory/retriever.ts`
- `src/memory/injector.ts`
- `src/idle-diagnostic.ts` - has tests but complex diagnostic logic may have gaps

### Large Integration Test

**File:** `src/index.test.ts` (3155 lines)

**Risk:** This test file is extremely large and may be difficult to maintain. However, all 386 tests pass.

**What's tested:** Full plugin integration including hooks, tools, and event handling.

**Gaps:** Unit-level testing of some edge cases may be missing.

---

## Missing Critical Features

### No Health Checks

**Observation:** No explicit health check or readiness probe for the memory system (LanceDB, embedding service).

**Impact:** Plugin may attempt operations against unavailable services.

**Recommendation:** Add health check tool or hook.

### No Graceful Degradation for Memory System

**Observation:** If `ensureMemorySystem()` fails, `memory` is `null`. Some tools (like `memory_manage`) still register but may fail unexpectedly.

**File:** `projects/ontology/plugins/wopal-plugin/src/index.ts:113`

**Impact:** Users may invoke memory tools without knowing the system is unavailable.

**Recommendation:** Explicitly disable memory tools when system unavailable, or clearly document capability limitations.

---

## Recommendations Summary

| Priority | Issue | Files | Fix Approach |
|----------|-------|-------|--------------|
| **P0** | Unpushed commits | `projects/ontology/` | Push 4 commits to origin |
| **P1** | File size violations | runtime.ts, simple-task-manager.ts, utils.ts | Split per AGENTS.md specification |
| **P1** | CLI scripts in root | `plugins/wopal-plugin/*.ts` | Move to `scripts/` and `test/` |
| **P1** | Redundant lock files | pnpm-lock.yaml | Delete, keep only bun.lock |
| **P2** | sync-to-wopal.py hardcoded | `scripts/sync-to-wopal.py:365` | Plan generic "一对多" mechanism |
| **P2** | LanceDB bundle size | `@lancedb/lancedb-darwin-x64` | Evaluate if necessary for current scale |
| **P2** | Test coverage gaps | Multiple untested files | Add unit tests for tools and memory subsystem |
| **P3** | OpenCode SDK coupling | Multiple files | Abstract behind interfaces |
| **P3** | Memory system graceful degradation | `index.ts` | Disable tools explicitly when unavailable |

---

*Concerns audit: 2026-04-09*
