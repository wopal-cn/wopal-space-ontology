import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSessionStateSnapshot, _upsertSessionState } from "../test-helpers.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;
let savedInjectionEnv: Record<string, string | undefined>;

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

// Save and clear injection toggle env vars so tests aren't affected by external config
function saveAndClearInjectionEnv() {
  savedInjectionEnv = {
    WOPAL_RULES_INJECTION_ENABLED: process.env.WOPAL_RULES_INJECTION_ENABLED,
    WOPAL_MEMORY_INJECTION_ENABLED: process.env.WOPAL_MEMORY_INJECTION_ENABLED,
  };
  delete process.env.WOPAL_RULES_INJECTION_ENABLED;
  delete process.env.WOPAL_MEMORY_INJECTION_ENABLED;
}

function restoreInjectionEnv() {
  if (savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_RULES_INJECTION_ENABLED = savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED;
  }
  if (savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_MEMORY_INJECTION_ENABLED = savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED;
  }
}

describe("message-hooks", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("updates lastUserPrompt from chat.message", async () => {
    const { default: pluginDef } = await import("../index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    const hook = hooks["chat.message"] as any;
    expect(hook).toBeTypeOf("function");

    await hook(
      { sessionID: "ses_test" },
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "please add tests" }],
      },
    );

    const snapshot = getSessionStateSnapshot("ses_test");
    expect(snapshot?.lastUserPrompt).toBe("please add tests");
  });

  it("seeds session state on messages.transform", async () => {
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

      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;

      await messagesTransform(
        {},
        {
          messages: [
            {
              role: "user",
              info: { sessionID: "ses_seed", role: "user" },
              parts: [{ type: "text", text: "write a button component" }],
            },
          ],
        },
      );

      const snapshot = getSessionStateSnapshot("ses_seed");
      expect(snapshot?.seededFromHistory).toBe(true);
      expect(snapshot?.seedCount).toBe(1);
      expect(snapshot?.lastUserPrompt).toBe("write a button component");
    } finally {
      process.env.HOME = originalHome;
    }
  });
});