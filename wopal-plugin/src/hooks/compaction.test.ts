import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, upsertSessionState } from "../test-helpers.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

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

describe("compaction", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
  });

  it("marks session as compacting during compaction", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockClient = { tool: { ids: vi.fn(async () => ({ data: [] })) } };
      const hooks = await plugin({
        client: mockClient as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      // Seed session state
      upsertSessionState("ses_c", (s) => {
        s.seededFromHistory = true;
      });

      // Act: call the compacting hook
      const compacting = hooks["experimental.session.compacting"] as any;
      expect(compacting).toBeDefined();

      const output = { context: [] as string[] };
      await compacting({ sessionID: "ses_c" }, output);

      // Assert: session is marked as compacting
      const { getSessionStateSnapshot } = await import("../test-helpers.js");
      const state = getSessionStateSnapshot("ses_c");
      expect(state?.isCompacting).toBe(true);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("skips full rule injection when session is compacting", async () => {
    // Arrange
    writeFileSync(
      path.join(globalRulesDir, "always.md"),
      `---
keywords:
  - "always"
---
# Always
Always apply this`,
    );

    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockClient = { tool: { ids: vi.fn(async () => ({ data: [] })) } };
      const hooks = await plugin({
        client: mockClient as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      // Set compacting flag
      upsertSessionState(
        "ses_compact",
        (s) => void (s.isCompacting = true),
      );

      // Act
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        {
          sessionID: "ses_compact",
          model: { providerID: "test", modelID: "test" },
        },
        { system: ["Base prompt."] },
      );

      // Assert - rules should NOT be injected (system.transform no longer injects rules anyway)
      expect(result.system).toEqual(["Base prompt."]);
    } finally {
      process.env.HOME = originalHome;
    }
  });
});