import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import {
  discoverRuleFiles,
  parseRuleMetadata,
  clearRuleCache,
  type DiscoveredRule,
} from "./discoverer.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

/**
 * Helper to convert file paths to DiscoveredRule objects for testing
 */
function toRules(
  paths: string[],
  agentScope?: string,
): DiscoveredRule[] {
  return paths.map((filePath) => ({
    filePath,
    relativePath: path.basename(filePath),
    agentScope,
  }));
}

function setupTestDirs() {
  // Create a unique temporary directory for each test run
  testDir = mkdtempSync(path.join(os.tmpdir(), "wopal-rules-test-"));
  globalRulesDir = path.join(testDir, ".wopal", "rules");
  projectRulesDir = path.join(testDir, "project", ".wopal", "rules");
  mkdirSync(globalRulesDir, { recursive: true });
  mkdirSync(projectRulesDir, { recursive: true });
}

function teardownTestDirs() {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("parseRuleMetadata", () => {
  it("should parse keywords from YAML metadata", () => {
    // Arrange
    const content = `---
keywords:
  - "testing"
  - "unit test"
---

Follow testing best practices.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeDefined();
    expect(metadata?.keywords).toEqual(["testing", "unit test"]);
  });

  it("should return undefined for files without metadata", () => {
    // Arrange
    const content = "This rule should always apply.";

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeUndefined();
  });

  it("should extract rule content without metadata", () => {
    // Arrange
    const content = `---
keywords:
  - "test"
---

Rule content here`;

    // Act
    const metadata = parseRuleMetadata(content);
    const ruleContent = content.replace(/^---[\s\S]*?---\n/, "");

    // Assert
    expect(metadata?.keywords).toBeDefined();
    expect(ruleContent).toBe("\nRule content here");
  });

  it("should handle multiple keywords in metadata", () => {
    // Arrange
    const content = `---
keywords:
  - "typescript"
  - "ts"
  - ".ts"
---

Rule content`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata?.keywords).toEqual(["typescript", "ts", ".ts"]);
  });
});

describe("discoverRuleFiles", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
  });

  describe("global rules discovery", () => {
    it("should discover markdown files from ~/.wopal/rules/", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule1.md"), "# Rule 1");
      writeFileSync(path.join(globalRulesDir, "rule2.md"), "# Rule 2");

      // Mock HOME
      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "rule1.md"),
          ),
        ).toBe(true);
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "rule2.md"),
          ),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should use XDG_CONFIG_HOME/wopal/rules as fallback", async () => {
      // Arrange
      const xdgDir = path.join(testDir, "xdg-config");
      mkdirSync(xdgDir, { recursive: true });
      const xdgRulesDir = path.join(xdgDir, "wopal", "rules");
      mkdirSync(xdgRulesDir, { recursive: true });
      writeFileSync(path.join(xdgRulesDir, "rule.md"), "# Rule");

      // Mock environment
      const originalXDG = process.env.XDG_CONFIG_HOME;
      const originalHome = process.env.HOME;
      process.env.XDG_CONFIG_HOME = xdgDir;
      process.env.HOME = path.join(testDir, "empty-home");
      mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
        recursive: true,
      });

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(xdgRulesDir, "rule.md")),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalXDG;
        process.env.HOME = originalHome;
      }
    });

    it("should handle missing global rules directory gracefully", async () => {
      // Arrange
      const originalHome = process.env.HOME;
      process.env.HOME = path.join(testDir, "no-rules-home");
      mkdirSync(path.join(testDir, "no-rules-home"), { recursive: true });

      try {
        // Act & Assert - should not throw
        const files = await discoverRuleFiles();
        expect(files).toEqual([]);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should include both .md and .mdc files", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule");
      writeFileSync(
        path.join(globalRulesDir, "rule.mdc"),
        "# Rule with metadata",
      );
      writeFileSync(path.join(globalRulesDir, "rule.txt"), "Not markdown");
      writeFileSync(path.join(globalRulesDir, "rule.json"), "{}");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files).toHaveLength(2);
        expect(files.some((f) => f.filePath.endsWith(".md"))).toBe(true);
        expect(files.some((f) => f.filePath.endsWith(".mdc"))).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should exclude hidden files", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule");
      writeFileSync(path.join(globalRulesDir, ".hidden.md"), "# Hidden");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files.every((f) => !f.filePath.includes(".hidden.md"))).toBe(
          true,
        );
      } finally {
        process.env.HOME = originalHome;
      }
    });
  });

  describe("project rules discovery", () => {
    it("should discover markdown files from .wopal/rules directory", async () => {
      // Arrange
      const projectDir = path.join(testDir, "project");
      mkdirSync(projectDir, { recursive: true });
      const projRulesDir = path.join(projectDir, ".wopal", "rules");
      mkdirSync(projRulesDir, { recursive: true });
      writeFileSync(path.join(projRulesDir, "local-rule.md"), "# Local Rule");

      // Mock HOME to avoid finding test global rules
      const originalHome = process.env.HOME;
      process.env.HOME = path.join(testDir, "empty-home");
      mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
        recursive: true,
      });

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        expect(
          files.some(
            (f) => f.filePath === path.join(projRulesDir, "local-rule.md"),
          ),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should handle missing .wopal directory gracefully", async () => {
      // Arrange
      const projectDir = path.join(testDir, "empty-project");
      mkdirSync(projectDir, { recursive: true });

      const originalHome = process.env.HOME;
      process.env.HOME = path.join(testDir, "empty-home");
      mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
        recursive: true,
      });

      try {
        // Act & Assert - should not throw
        const files = await discoverRuleFiles(projectDir);
        // Should return empty since global rules dir is also empty
        expect(files).toEqual([]);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should discover rules from both global and project directories", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "global.md"), "# Global");

      const projectDir = path.join(testDir, "project");
      mkdirSync(projectDir, { recursive: true });
      const projRulesDir = path.join(projectDir, ".wopal", "rules");
      mkdirSync(projRulesDir, { recursive: true });
      writeFileSync(path.join(projRulesDir, "local.md"), "# Local");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        expect(files).toHaveLength(2);
        expect(files.some((f) => f.filePath.includes("global.md"))).toBe(true);
        expect(files.some((f) => f.filePath.includes("local.md"))).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });
  });

  describe("subdirectory scanning", () => {
    it("should discover rules in nested subdirectories", async () => {
      // Arrange
      const nestedDir = path.join(globalRulesDir, "typescript");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "react.md"), "# React Rules");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "react.md")),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should discover rules in deeply nested subdirectories (multiple levels)", async () => {
      // Arrange
      const deepDir = path.join(
        globalRulesDir,
        "lang",
        "typescript",
        "framework",
      );
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(path.join(deepDir, "nextjs.md"), "# Next.js Rules");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(deepDir, "nextjs.md")),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should exclude hidden subdirectories", async () => {
      // Arrange
      const hiddenDir = path.join(globalRulesDir, ".hidden");
      mkdirSync(hiddenDir, { recursive: true });
      writeFileSync(path.join(hiddenDir, "secret.md"), "# Secret Rule");
      writeFileSync(path.join(globalRulesDir, "visible.md"), "# Visible Rule");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files.every((f) => !f.filePath.includes(".hidden"))).toBe(true);
        expect(files.every((f) => !f.filePath.includes("secret.md"))).toBe(
          true,
        );
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "visible.md"),
          ),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should discover rules from mixed flat and nested structures", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "root.md"), "# Root Rule");
      const nestedDir = path.join(globalRulesDir, "nested");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "child.md"), "# Child Rule");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files).toHaveLength(2);
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "root.md"),
          ),
        ).toBe(true);
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "child.md")),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should discover rules in project subdirectories", async () => {
      // Arrange
      const projectDir = path.join(testDir, "project");
      const projRulesDir = path.join(projectDir, ".wopal", "rules");
      const nestedDir = path.join(projRulesDir, "frontend");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "react.md"), "# React Rules");

      const originalHome = process.env.HOME;
      process.env.HOME = path.join(testDir, "empty-home");
      mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
        recursive: true,
      });

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "react.md")),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
      }
    });
  });

  describe("agentScope inference", () => {
    it("should infer agentScope from single-level subdirectory", async () => {
      // Arrange
      const faeDir = path.join(globalRulesDir, "fae");
      mkdirSync(faeDir, { recursive: true });
      writeFileSync(path.join(faeDir, "execution.md"), "# Fae Execution Rules");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        const faeRule = files.find(
          (f) => f.filePath === path.join(faeDir, "execution.md"),
        );
        expect(faeRule).toBeDefined();
        expect(faeRule?.agentScope).toBe("fae");
        expect(faeRule?.relativePath).toBe("fae/execution.md");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should return undefined agentScope for root-level files", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "typescript.md"), "# TypeScript");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        const tsRule = files.find(
          (f) => f.filePath === path.join(globalRulesDir, "typescript.md"),
        );
        expect(tsRule).toBeDefined();
        expect(tsRule?.agentScope).toBeUndefined();
        expect(tsRule?.relativePath).toBe("typescript.md");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should return undefined agentScope for deeply nested files", async () => {
      // Arrange
      const deepDir = path.join(globalRulesDir, "lang", "ts");
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(path.join(deepDir, "strict.md"), "# Strict TS");

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        const deepRule = files.find(
          (f) => f.filePath === path.join(deepDir, "strict.md"),
        );
        expect(deepRule).toBeDefined();
        expect(deepRule?.agentScope).toBeUndefined();
        expect(deepRule?.relativePath).toBe("lang/ts/strict.md");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should infer agentScope from project-level subdirectory", async () => {
      // Arrange
      const projectDir = path.join(testDir, "project");
      const projRulesDir = path.join(projectDir, ".wopal", "rules");
      const wopalDir = path.join(projRulesDir, "wopal");
      mkdirSync(wopalDir, { recursive: true });
      writeFileSync(path.join(wopalDir, "workflow.md"), "# Wopal Workflow");

      const originalHome = process.env.HOME;
      process.env.HOME = path.join(testDir, "empty-home");
      mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
        recursive: true,
      });

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        const wopalRule = files.find(
          (f) => f.filePath === path.join(wopalDir, "workflow.md"),
        );
        expect(wopalRule).toBeDefined();
        expect(wopalRule?.agentScope).toBe("wopal");
        expect(wopalRule?.relativePath).toBe("wopal/workflow.md");
      } finally {
        process.env.HOME = originalHome;
      }
    });
  });
});

describe("YAML Parsing Edge Cases", () => {
  beforeEach(() => {
    setupTestDirs();
    clearRuleCache();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  it("should handle empty frontmatter", () => {
    const content = "---\n---\nRule content here";
    const metadata = parseRuleMetadata(content);
    expect(metadata).toBeUndefined();
  });

  it("should handle frontmatter with only whitespace", () => {
    const content = "---\n   \n---\nRule content here";
    const metadata = parseRuleMetadata(content);
    expect(metadata).toBeUndefined();
  });

  it("should handle complex YAML structures", () => {
    const content = `---
keywords:
  - refactoring
  - cleanup
  - code review
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    expect(metadata?.keywords).toEqual([
      "refactoring",
      "cleanup",
      "code review",
    ]);
  });

  it("should handle inline array syntax in YAML", () => {
    // Note: inline array syntax is valid YAML
    const content = `---
keywords: ["typescript", "ts"]
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    expect(metadata?.keywords).toEqual(["typescript", "ts"]);
  });

  it("should ignore non-string array elements", () => {
    const content = `---
keywords:
  - test
  - 123
  - true
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    // Only string elements should be included
    expect(metadata?.keywords).toEqual(["test"]);
  });
});

describe("Cache Functionality", () => {
  beforeEach(() => {
    setupTestDirs();
    clearRuleCache();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  it("should use cached content on second read", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "cached-rule.md");
    writeFileSync(rulePath, "# Cached Rule\n\nThis should be cached.");

    // Import getCachedRule for cache testing
    const { getCachedRule } = await import("./discoverer.js");

    // Act - read the file twice
    const result1 = await getCachedRule(rulePath);
    const result2 = await getCachedRule(rulePath);

    // Assert - both should have the same content
    expect(result1?.strippedContent).toContain("Cached Rule");
    expect(result2?.strippedContent).toContain("Cached Rule");
    expect(result1?.strippedContent).toBe(result2?.strippedContent);
    expect(result1?.mtime).toBe(result2?.mtime);
  });

  it("should invalidate cache when file is modified", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "mutable-rule.md");
    writeFileSync(rulePath, "# Original Content");

    const { getCachedRule } = await import("./discoverer.js");

    // Act - read the file
    const result1 = await getCachedRule(rulePath);
    expect(result1?.strippedContent).toContain("Original Content");

    // Wait a bit to ensure mtime changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Modify the file
    writeFileSync(rulePath, "# Modified Content");

    // Read again
    const result2 = await getCachedRule(rulePath);

    // Assert - should get the new content
    expect(result2?.strippedContent).toContain("Modified Content");
    expect(result2?.strippedContent).not.toContain("Original Content");
  });

  it("should handle clearRuleCache correctly", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "clear-test.md");
    writeFileSync(rulePath, "# Test Content");

    const { getCachedRule } = await import("./discoverer.js");

    // Act - read, clear cache, read again
    await getCachedRule(rulePath);
    clearRuleCache();

    // File should be re-read from disk
    const result = await getCachedRule(rulePath);
    expect(result?.strippedContent).toContain("Test Content");
  });
});