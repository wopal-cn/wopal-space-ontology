import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { readAndFormatRules, type DiscoveredRule } from "./formatter.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let rulesDir: string;

/**
 * Helper to convert file paths to DiscoveredRule objects for testing
 */
function toRules(paths: string[], baseDir: string): DiscoveredRule[] {
  return paths.map((filePath) => ({
    filePath,
    relativePath: path.relative(baseDir, filePath),
  }));
}

function setupTestDirs() {
  // Create a unique temporary directory for each test run
  testDir = mkdtempSync(path.join(os.tmpdir(), "wopal-rules-test-"));
  rulesDir = path.join(testDir, "rules");
  mkdirSync(rulesDir, { recursive: true });
}

function teardownTestDirs() {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("readAndFormatRules", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  // Basic functionality tests
  it("should return empty when no files provided", async () => {
    const result = await readAndFormatRules([]);
    expect(result.content).toBe("");
    expect(result.matchedRules).toHaveLength(0);
  });

  it("should skip rules without keywords", async () => {
    const rulePath = path.join(rulesDir, "nokeywords.md");
    writeFileSync(rulePath, "This rule has no keywords");

    const result = await readAndFormatRules(toRules([rulePath], rulesDir));
    expect(result.content).toBe("");
    expect(result.matchedRules).toHaveLength(0);
  });

  it("should skip rules when no user prompt provided", async () => {
    const rulePath = path.join(rulesDir, "keyword-rule.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "testing"
---
Testing best practices.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      undefined,
    );
    expect(result.content).toBe("");
    expect(result.matchedRules).toHaveLength(0);
  });

  // Keyword matching tests
  it("should include rule when user prompt matches keywords", async () => {
    const rulePath = path.join(rulesDir, "testing-rule.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "testing"
  - "jest"
---
Follow testing best practices.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "I need help testing this function",
    );

    expect(result.content).toContain("testing-rule.md");
    expect(result.content).toContain("Follow testing best practices");
    expect(result.matchedRules[0].reason).toContain("keyword:");
    expect(result.matchedRules[0].reason).toContain("testing");
  });

  it("should exclude rule when user prompt does not match keywords", async () => {
    const rulePath = path.join(rulesDir, "testing-rule.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "testing"
  - "jest"
---
Follow testing best practices.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "help me with the database",
    );

    expect(result.content).toBe("");
    expect(result.matchedRules).toHaveLength(0);
  });

  it("should handle case-insensitive keyword matching", async () => {
    const rulePath = path.join(rulesDir, "case-rule.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "Testing"
---
Testing rule.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "testing in lowercase",
    );

    expect(result.content).toContain("case-rule.md");
  });

  it("should match multiple rules with matching keywords", async () => {
    const rule1Path = path.join(rulesDir, "rule1.md");
    const rule2Path = path.join(rulesDir, "rule2.md");
    writeFileSync(
      rule1Path,
      `---
keywords:
  - "typescript"
---
TypeScript guidelines.`,
    );
    writeFileSync(
      rule2Path,
      `---
keywords:
  - "testing"
---
Testing guidelines.`,
    );

    const result = await readAndFormatRules(
      toRules([rule1Path, rule2Path], rulesDir),
      undefined,
      "help with typescript testing",
    );

    expect(result.content).toContain("rule1.md");
    expect(result.content).toContain("rule2.md");
    expect(result.matchedRules).toHaveLength(2);
  });

  it("should handle file read errors gracefully", async () => {
    const nonExistentFile = path.join(rulesDir, "nonexistent.md");
    const validFile = path.join(rulesDir, "valid.md");
    writeFileSync(
      validFile,
      `---
keywords:
  - "valid"
---
Valid content.`,
    );

    const result = await readAndFormatRules(
      toRules([nonExistentFile, validFile], rulesDir),
      undefined,
      "valid keyword",
    );

    // Should still include the valid file
    expect(result.content).toContain("valid.md");
    expect(result.matchedRules).toHaveLength(1);
  });

  // Agent scope filtering tests (Step 7-8)
  it("should match root-level rules for any agent", async () => {
    const rulePath = path.join(rulesDir, "typescript.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "typescript"
---
TypeScript rules.`,
    );

    // Test with different agent names
    const resultWopal = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      "wopal",
      "help with typescript",
    );
    expect(resultWopal.content).toContain("typescript.md");

    const resultFae = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      "fae",
      "help with typescript",
    );
    expect(resultFae.content).toContain("typescript.md");

    const resultUndefined = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "help with typescript",
    );
    expect(resultUndefined.content).toContain("typescript.md");
  });

  it("should only match agent-scoped rules for matching agent", async () => {
    // Create agent-scoped rules directory
    const faeRulesDir = path.join(rulesDir, "fae");
    mkdirSync(faeRulesDir, { recursive: true });

    const faeRulePath = path.join(faeRulesDir, "execution-rules.md");
    writeFileSync(
      faeRulePath,
      `---
keywords:
  - "execution"
---
Fae execution rules.`,
    );

    const rootRulePath = path.join(rulesDir, "common.md");
    writeFileSync(
      rootRulePath,
      `---
keywords:
  - "common"
---
Common rules.`,
    );

    // Fae agent should match both scoped and root rules
    const resultFae = await readAndFormatRules(
      toRules([faeRulePath, rootRulePath], rulesDir),
      "fae",
      "execution and common",
    );
    expect(resultFae.content).toContain("fae/execution-rules.md");
    expect(resultFae.content).toContain("common.md");
    expect(resultFae.matchedRules).toHaveLength(2);

    // Wopal agent should only match root rules
    const resultWopal = await readAndFormatRules(
      toRules([faeRulePath, rootRulePath], rulesDir),
      "wopal",
      "execution and common",
    );
    expect(resultWopal.content).not.toContain("fae/execution-rules.md");
    expect(resultWopal.content).toContain("common.md");
    expect(resultWopal.matchedRules).toHaveLength(1);

    // Undefined agent should only match root rules
    const resultUndefined = await readAndFormatRules(
      toRules([faeRulePath, rootRulePath], rulesDir),
      undefined,
      "execution and common",
    );
    expect(resultUndefined.content).not.toContain("fae/execution-rules.md");
    expect(resultUndefined.content).toContain("common.md");
    expect(resultUndefined.matchedRules).toHaveLength(1);
  });

  it("should not match agent-scoped rules when agent name differs", async () => {
    const faeRulesDir = path.join(rulesDir, "fae");
    mkdirSync(faeRulesDir, { recursive: true });

    const faeRulePath = path.join(faeRulesDir, "fae-only.md");
    writeFileSync(
      faeRulePath,
      `---
keywords:
  - "fae"
---
Fae-specific rules.`,
    );

    // Wopal agent with matching keyword should NOT match fae-scoped rule
    const result = await readAndFormatRules(
      toRules([faeRulePath], rulesDir),
      "wopal",
      "help fae with something",
    );

    expect(result.content).toBe("");
    expect(result.matchedRules).toHaveLength(0);
  });

  it("should handle deeply nested agent scopes", async () => {
    // Rules with subdirectories (e.g., "wopal/subdir/rules.md")
    const nestedDir = path.join(rulesDir, "wopal", "nested");
    mkdirSync(nestedDir, { recursive: true });

    const nestedRulePath = path.join(nestedDir, "deep-rule.md");
    writeFileSync(
      nestedRulePath,
      `---
keywords:
  - "deep"
---
Deep nested rule.`,
    );

    // Only wopal should match (scope is first path segment)
    const resultWopal = await readAndFormatRules(
      toRules([nestedRulePath], rulesDir),
      "wopal",
      "deep keyword",
    );
    expect(resultWopal.content).toContain("wopal/nested/deep-rule.md");

    const resultFae = await readAndFormatRules(
      toRules([nestedRulePath], rulesDir),
      "fae",
      "deep keyword",
    );
    expect(resultFae.content).toBe("");
  });

  // Regression tests
  it("should properly format rule output", async () => {
    const rulePath = path.join(rulesDir, "format-test.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "format"
---
# Rule Title
Content with multiple paragraphs.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "format test",
    );

    expect(result.content).toContain("Matched rules");
    expect(result.content).toContain("- **format-test.md**");
    expect(result.content).toContain("Rule Title");
  });

  it("should handle special characters in keywords", async () => {
    const rulePath = path.join(rulesDir, "special.md");
    writeFileSync(
      rulePath,
      `---
keywords:
  - ".ts"
---
TypeScript extension rule.`,
    );

    const result = await readAndFormatRules(
      toRules([rulePath], rulesDir),
      undefined,
      "file.test.ts",
    );

    expect(result.content).toContain("special.md");
    expect(result.content).toContain("TypeScript extension rule");
  });
});