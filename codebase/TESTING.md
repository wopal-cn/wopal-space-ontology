# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Primary Framework:**
- Vitest (TypeScript projects)

**Configuration File:**
- `projects/wopal-cli/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/'],
    },
  },
});
```

## Test File Organization

**Location Pattern:**
- Tests co-located in `tests/` directory at project root
- Not alongside source files

**Naming Convention:**
- `*.test.ts` suffix
- Example: `error-utils.test.ts`, `config.test.ts`, `client.test.ts`

**Directory Structure:**
```
projects/wopal-cli/
├── src/
│   └── lib/
│       ├── error-utils.ts
│       └── config.ts
└── tests/
    ├── error-utils.test.ts
    ├── config.test.ts
    ├── fae/
    │   ├── client.test.ts
    │   ├── event-monitor.test.ts
    │   └── task-manager.test.ts
    └── fixtures/
```

## Test Structure

### Suite Organization

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("module-name", () => {
  // Setup before each test
  beforeEach(() => {
    // Reset singletons, clear mocks, setup fixtures
  });

  // Cleanup after each test
  afterEach(() => {
    // Restore mocks, cleanup temp files
  });

  describe("grouped functionality", () => {
    it("should do something specific", () => {
      const result = someFunction();
      expect(result).toBe(expectedValue);
    });

    it("should handle error case", async () => {
      await expect(asyncFunction()).rejects.toThrow(ErrorType);
    });
  });
});
```

### Test Isolation

**Singleton Reset Pattern:**
```typescript
import { resetConfigForTest } from "../src/lib/config.js";

beforeEach(() => {
  resetConfigForTest();
  delete process.env.WOPAL_SKILLS_INBOX_DIR;
  // ... clear other env vars
});

afterEach(() => {
  resetConfigForTest();
});
```

**Environment Variable Cleanup:**
```typescript
const originalEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-test-"));
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await fs.remove(tempDir);
});
```

**Mock Restore:**
```typescript
afterEach(() => {
  vi.restoreAllMocks();
});
```

## Assertion Patterns

### Common Assertions

```typescript
// Equality
expect(result).toBe(expectedValue);
expect(result).toEqual({ key: "value" });

// Arrays
expect(result).toHaveLength(2);
expect(result[0].id).toBe("session-1");

// Objects
expect(error).toBeInstanceOf(CommandError);
expect(error.code).toBe("SKILL_NOT_FOUND");

// Promises
await expect(asyncFunction()).resolves.toBeUndefined();
await expect(asyncFunction()).rejects.toThrow(ErrorType);

// Strings
expect(error.toUserMessage()).toBe("Error: Something went wrong");
expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("limit=10"));

// Truthiness
expect(config.getActiveSpace()).toBeUndefined();
expect(Array.isArray(spaces)).toBe(true);
```

### Error Message Formatting

```typescript
expect(error.toUserMessage()).toBe(
  "Error: Something went wrong\n\nTry running init first",
);
```

## Mocking Patterns

### Function Mocking

```typescript
// Mock a function
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("process.exit");
});

// Clear mock between tests
beforeEach(() => {
  mockExit.mockClear();
});

afterAll(() => {
  mockExit.mockRestore();
});
```

### Global Fetch Mocking

```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

### Mock Response Patterns

```typescript
// Successful response
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: () => Promise.resolve({ id: "session-123" }),
});

// Error response
mockFetch.mockResolvedValueOnce({
  ok: false,
  status: 500,
});

// Network error
mockFetch.mockRejectedValueOnce(new Error("Network error"));

// Accessing call arguments
const lastCall = mockFetch.mock.calls.at(-1);
const body = JSON.parse(lastCall[1].body);
expect(body.arguments).toEqual(["test", "arg1"]);
```

### Partial Mock Objects

```typescript
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const client = createFaeClient(3000, mockLogger as any);
```

## Fixtures & Test Data

### Inline Fixtures

```typescript
const config: FaeConnectionConfig = {
  port: 3000,
  baseUrl: "http://127.0.0.1:3000",
  directory: "/project",
};
```

### Mock File System

```typescript
import fs from "fs-extra";
import path from "path";
import os from "os";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-env-test-"));
});

afterEach(async () => {
  await fs.remove(tempDir);
});

// Creating mock files
await fs.ensureDir(wopalHome);
await fs.writeFile(
  path.join(wopalHome, ".env"),
  "WOPAL_TEST_GLOBAL_VAR=global-value",
);
```

### HTTP Server Mocking

```typescript
import { createServer } from "http";

async function startWellKnownSkillServer(skillName: string): Promise<{
  source: string;
  host: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/skills/index.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ skills: [...] }));
    }
  });
  // ...
}
```

## Integration Testing Patterns

### CLI Invocation

```typescript
import { execFile, execSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "bin", "wopal");

// Execute CLI command
execFile(CLI_PATH, ["skills", "list", "--json"], (error, stdout) => {
  const result = JSON.parse(stdout);
  expect(result.success).toBe(true);
});
```

### Mock OpenClaw Setup

```typescript
async function setupMockOpenclaw(
  wopalHome: string,
  scanOutput: string,
  exitCode: number,
): Promise<void> {
  const openclawDir = path.join(wopalHome, "storage", "openclaw-security-monitor");
  const scriptsDir = path.join(openclawDir, "scripts");
  
  await fs.ensureDir(scriptsDir);
  
  const scanScript = `#!/bin/bash
set +e
SKILLS_DIR="placeholder"
OPENCLAW_DIR="placeholder"
${echoCommands}
exit ${exitCode}
`;
  
  await fs.writeFile(path.join(scriptsDir, "scan.sh"), scanScript, { mode: 0o755 });
}
```

## Test Commands

```bash
# Run all tests
pnpm test:run

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test

# Run specific test file
vitest run tests/error-utils.test.ts
```

## Coverage

**Provider:** v8

**Reporters:** text, json, html

**Excluded Paths:**
- `node_modules/`
- `tests/`

**View HTML Coverage:**
```bash
# Coverage output in tests/coverage/
```

## Testing Constraints

### Process Isolation

For subprocess tests, isolate environment:

```typescript
env: {
  WOPAL_HOME: tempDir,
  WOPAL_SETTINGS_PATH: path.join(tempDir, 'settings.jsonc'),
}
```

### Async Testing

```typescript
it("should load space .env and override global", async () => {
  // Async setup
  await fs.ensureDir(wopalHome);
  
  // Async action
  loadEnv(false, spaceDir);
  
  // Sync assertion (after await completes)
  expect(process.env.WOPAL_TEST_SKILLS_DIR).toBe("/space-a/skills");
});
```

## What NOT to Mock

From ellamaka AGENTS.md:
- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests

## Test Naming

- Use descriptive `describe` groups that match module/feature names
- Use `it` statements that read as sentences: "it should do X"
- Include expected behavior in test name

---

*Testing analysis: 2026-04-09*
