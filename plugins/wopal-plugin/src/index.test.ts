import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSeedCount, setSessionStateLimit, getSessionStateIDs, upsertSessionState } from "./test-helpers.js";

let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;
let savedInjectionEnv: Record<string, string | undefined>;

function setupTestDirs() {
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

describe("OpenCodeRulesPlugin", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("should export a default plugin function", async () => {
    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    expect(typeof plugin).toBe("function");
  });

  it("should return transform hooks even when no rules exist", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = path.join(testDir, "empty-home");
    mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
      recursive: true,
    });

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: path.join(testDir, "empty-project"),
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      const hooks = await plugin(mockInput);
      expect("experimental.chat.messages.transform" in hooks).toBe(true);
      expect("experimental.chat.system.transform" in hooks).toBe(true);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("should inject rules into user message via messages.transform hook", async () => {
    writeFileSync(
      path.join(globalRulesDir, "rule.md"),
      `---
keywords:
  - "hello"
---

# Test Rule
Do this always`,
    );

    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);

    try {
      const hooks = await plugin({
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      });

      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const result = await messagesTransform(
        {},
        {
          messages: [
            {
              role: "user",
              info: { sessionID: "test-ses", role: "user" },
              parts: [{ type: "text", text: "hello world" }],
            },
          ],
        },
      );

      const userMsg = result.messages[0];
      const syntheticParts = (userMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
      expect(rulesText).toContain("Test Rule");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("seeds session state once from messages.transform and does not rescan", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    try {
      const transform = hooks["experimental.chat.messages.transform"] as any;
      const messages = {
        messages: [
          {
            info: { role: "assistant" },
            parts: [
              {
                sessionID: "ses_seed",
                type: "tool-invocation",
                toolInvocation: { toolName: "read", args: { filePath: "src/a.ts" } },
              },
            ],
          },
        ],
      };

      await transform({}, messages);
      await transform({}, messages);

      expect(getSeedCount("ses_seed")).toBe(1);
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

describe("SessionState", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    teardownTestDirs();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("prunes session state when over limit", async () => {
    setSessionStateLimit(2);
    upsertSessionState("ses_1", (s) => void (s.lastUpdated = 1));
    upsertSessionState("ses_2", (s) => void (s.lastUpdated = 2));
    upsertSessionState("ses_3", (s) => void (s.lastUpdated = 3));

    const ids = getSessionStateIDs();
    expect(ids).toHaveLength(2);
    expect(ids).toContain("ses_2");
    expect(ids).toContain("ses_3");
  });

  it("registers memory command/tool hardening hooks", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      const { default: pluginDef } = await import("./index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const hooks = await plugin({
        client: { tool: { ids: vi.fn(async () => ({ data: [] })) } } as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      expect(typeof hooks["command.execute.before"]).toBe("function");
      expect(typeof hooks["tool.execute.after"]).toBe("function");
      expect(typeof hooks["tool.definition"]).toBe("function");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("hardens /memory command prompt before execution", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      const { default: pluginDef } = await import("./index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const hooks = await plugin({
        client: { tool: { ids: vi.fn(async () => ({ data: [] })) } } as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      const hook = hooks["command.execute.before"] as any;
      const output = {
        parts: [{ type: "text", text: "# /memory — 记忆管理命令\n原始内容" }],
      };

      await hook({ command: "memory", sessionID: "ses_mem", arguments: "" }, output);

      expect(output.parts[0].text).toContain("这是一个立即执行命令");
      expect(output.parts[0].text).toContain("必须把工具返回的完整文本逐字写入回复");
      expect(output.parts[0].text).toContain("原始内容");
    } finally {
      process.env.HOME = originalHome;
    }
  });
});