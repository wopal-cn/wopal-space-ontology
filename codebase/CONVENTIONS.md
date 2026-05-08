# Coding Conventions

**Analysis Date:** 2026-04-09

## Languages & Tools

**Primary Language:**
- TypeScript (wopal-cli, ellamaka)

**Secondary Languages:**
- Python (scripts/sync-to-wopal.py, scripts/merge-skills.py)

**Package Managers:**
- pnpm (wopal-cli)
- bun (ellamaka, scripts)

## TypeScript Conventions

### Code Style

**Formatting:**
- Tool: Prettier
- 2 spaces indentation
- Single quotes for strings
- Semicolons at end of statements
- ES modules (`import`/`export`)
- TypeScript strict mode

**Naming Conventions:**
| Type | Style | Example |
|------|-------|---------|
| Variables/Functions | camelCase | `getConfig()`, `skillName` |
| Classes/Interfaces/Types | PascalCase | `ConfigService`, `CommandError` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_PORT` |
| Private members | `private` keyword or `_leading_underscore` | `private config`, `_internalCache` |

### Import Organization

**Order:**
1. Node.js built-in modules (`import { homedir } from "os"`)
2. Third-party packages (`import { describe, it, expect } from "vitest"`)
3. Local modules (`import { getConfig } from "./config.js"`)

**Rules:**
- Use named imports over default imports
- Always include `.js` extension in imports (for ES modules)

### Type Definitions

- Avoid `any` type
- Use `interface` for object types
- Use `type` for unions, mappings, and complex types
- Use `Optional<T>` syntax or `T | undefined` for nullable types
- Rely on type inference when possible

**Example:**
```typescript
export interface SpaceConfig {
  path: string;
  skillsInboxDir?: string;
  skillsDir?: string;
  [key: string]: unknown;
}

export type JsonResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
};
```

### Error Handling

**Pattern: CommandError class**
- Location: `projects/wopal-cli/src/lib/error-utils.ts`
- Structure: `{ code: string, message: string, suggestion?: string }`

```typescript
export class CommandError extends Error {
  public readonly code: string;
  public readonly suggestion?: string;

  constructor(options: CommandErrorOptions) {
    super(options.message);
    this.name = "CommandError";
    this.code = options.code;
    this.suggestion = options.suggestion;
  }

  toUserMessage(): string {
    let output = `Error: ${this.message}`;
    if (this.suggestion) {
      output += `\n\n${this.suggestion}`;
    }
    return output;
  }
}

// Factory functions for specific errors
export function createSkillNotFoundError(skillName: string): CommandError {
  return new CommandError({
    code: "SKILL_NOT_FOUND",
    message: `Skill '${skillName}' not found`,
    suggestion: "Use 'wopal list' to see installed skills",
  });
}
```

**Error Handler:**
```typescript
export function handleCommandError(error: unknown): never {
  if (error instanceof CommandError) {
    console.error(error.toUserMessage());
    process.exit(1);
  }
  // ... handle other error types
}
```

### Logging

**Pattern: Logger class with singleton**
- Location: `projects/wopal-cli/src/lib/logger.ts`
- Debug mode controls console output
- Always logs to file

```typescript
const logger = getLogger(context.debug);
logger.debug("msg", { data });  // Only with --debug
logger.info("msg");
logger.warn("msg");
logger.error("msg", { error });
```

**Sensitive Data:**
- Automatic redaction for keys matching: `token`, `api_key`, `secret`, `password`, `credential`, `authorization`, `private_key`

**Forbidden:** `console.log()`, `console.error()`, `console.warn()` except in:
- CLI output services (use `OutputService`)
- Error handlers (logger.error instead)

### Module Design

- Each file exports one main thing
- Use `index.ts` for public API exports
- Barrel pattern for library exports

```typescript
// src/lib/config.ts
export class ConfigService { ... }
export function getConfig(): ConfigService { ... }
export function resetConfigForTest(): void { ... }
export function invalidateConfigInstance(): void { ... }
```

### Function Design

- Prefer small, focused functions
- Use async/await over Promise chains
- Avoid `try`/`catch` where possible
- Prefer early returns over else statements

```typescript
// Good - early return
function loadEnv(debug: boolean, spacePath?: string): void {
  if (this.envLoaded) return;
  loadEnv(this.debug, spacePath);
  this.envLoaded = true;
}

// Good - no unnecessary destructuring
const journal = await Bun.file(path.join(dir, "journal.json")).json();
```

### JSDoc Comments

- Document public functions and classes
- Explain why, not what
- Use Chinese comments for project-specific code

```typescript
/**
 * Phase 2: Load environment variables
 * Called in cli.ts preAction hook after target space is determined
 */
public loadEnvForSpace(spacePath?: string): void { ... }
```

---

## Python Conventions

### Code Style

**Formatting:**
- Tool: Follow PEP 8
- 4 spaces indentation (no tabs)
- Line length: 100 characters
- Single quotes (use double quotes if needed)
- UTF-8 file encoding

**File Header:**
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Module description."""

import ...
from dataclasses import dataclass
```

### Naming Conventions

| Type | Style | Example |
|------|-------|---------|
| Variables/Functions | snake_case | `get_user_by_id()`, `skill_name` |
| Classes | PascalCase | `UserSession`, `Mapping` |
| Constants | UPPER_CASE | `MAX_RETRY_COUNT` |
| Private | _leading_underscore | `_internal_cache` |

### Import Organization

1. Standard library
2. Third-party libraries
3. Local imports

### Type Hints

- Use `typing` module: `Dict`, `List`, `Optional`, `Any`
- `@dataclass` decorator for data models

```python
from typing import Optional
from dataclasses import dataclass, field

@dataclass
class Mapping:
    source: str
    target: str
```

### Logging

```python
import logging
logger = logging.getLogger(__name__)
logger.info("User logged in", extra={"user_id": user_id})
```

### Error Handling

- Use specific exception types
- Avoid bare `except:` clauses
- Log errors with context

```python
try:
    result = risky_operation()
except ValueError as e:
    logger.error("Parameter error", extra={"error": str(e)})
    raise
except Exception as e:
    logger.exception("Unknown error")
    raise
```

### Docstrings

- Google style docstrings
- Chinese comments for project-specific logic

```python
def find_workspace_root() -> Path:
    """Find workspace root (directory containing AGENTS.md)."""
    start = Path(__file__).resolve().parent
    for p in [start] + list(start.parents):
        if (p / "AGENTS.md").exists():
            return p
    raise RuntimeError("Cannot find workspace root (missing AGENTS.md)")
```

---

## CLI Conventions

### Output Patterns

**OutputService API:**
- Location: `projects/wopal-cli/src/lib/output-service.ts`
- All CLI output through this service

| Method | Purpose |
|--------|---------|
| `print(msg)` | Text output with optional header |
| `json(data)` | `{ success: true, data }` response |
| `jsonError(code, msg)` | `{ success: false, error }` response |
| `error(msg, suggestion?)` | Error output |
| `table(data, columns)` | Tabular output |

**JSON Response Format:**
```typescript
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "suggestion": "..." } }
```

### Help Text

- Use `buildHelpText()` utility
- Examples must be real, executable commands
- Notes for key constraints and defaults

```typescript
cmd.addHelpText(
  "after",
  buildHelpText({
    examples: ["wopal skills install owner/repo@skill  # From GitHub"],
    notes: ["Remote install runs download → scan → install automatically"],
  }),
);
```

### Subcommand Definition Pattern

```typescript
const mySubcommand: SubCommandDefinition = {
  name: "my-cmd <arg>",
  description: "Description",
  options: [{ flags: "--json", description: "JSON output" }],
  action: async (args, options, context) => {
    if (options.json) {
      context.output.json({ data });
    } else {
      context.output.print("Result");
    }
  },
};
```

---

## Architecture Patterns

### Singleton Reset Pattern

For test isolation, singletons must have reset functions:

```typescript
// Config service
let _configInstance: ConfigService | null = null;
export function getConfig(): ConfigService { ... }
export function resetConfigForTest(): void { _configInstance = null; }

// Logger
let _loggerInstance: Logger | null = null;
export function getLogger(): Logger { ... }
export function resetLoggerInstance(): void { _loggerInstance = null; }
```

### Environment Variable Cleanup

```typescript
beforeEach(() => {
  resetConfigForTest();
  delete process.env.WOPAL_SKILLS_INBOX_DIR;
  delete process.env.WOPAL_SKILLS_DIR;
  delete process.env.WOPAL_GLOBAL_SKILLS_DIR;
  delete process.env.WOPAL_HOME;
  delete process.env.WOPAL_SETTINGS_PATH;
});

afterEach(() => {
  resetConfigForTest();
});
```

---

*Convention analysis: 2026-04-09*
