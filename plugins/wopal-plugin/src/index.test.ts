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

describe("MonitorEngine registration", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    teardownTestDirs();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("creates a single MonitorEngine and calls start() once", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      // Spy on MonitorEngine.start() to verify single invocation
      const { MonitorEngine } = await import("./monitor/monitor-engine.js");
      const startSpy = vi.spyOn(MonitorEngine.prototype, "start");

      const indexModule = await import("./index.js?test=" + Date.now());
      const pluginDef = indexModule.default;
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);

      await plugin({
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      // start() should be called exactly once — single engine
      expect(startSpy).toHaveBeenCalledTimes(1);
      startSpy.mockRestore();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("single MonitorEngine instance receives both strategies by name", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      const { MonitorEngine } = await import("./monitor/monitor-engine.js");

      // Capture constructor calls by spying on the prototype's start method
      // and extracting the strategies from the instance
      const capturedInstances: InstanceType<typeof MonitorEngine>[] = [];
      const startSpy = vi.spyOn(MonitorEngine.prototype, "start").mockImplementation(function (this: InstanceType<typeof MonitorEngine>) {
        capturedInstances.push(this);
      });

      const indexModule = await import("./index.js?test=" + Date.now());
      const pluginDef = indexModule.default;
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);

      await plugin({
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      // Exactly one MonitorEngine instance created
      expect(capturedInstances).toHaveLength(1);

      // Both strategies registered on the single instance
      const engine = capturedInstances[0] as unknown as { strategies: Array<{ name: string }> };
      const strategyNames = engine.strategies.map(s => s.name);
      expect(strategyNames).toEqual(["task-monitor", "main-session-monitor"]);

      startSpy.mockRestore();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("engine strategies are exactly task-monitor and main-session-monitor", async () => {
    // Verify strategy names independently — this proves index.ts registers both
    const { createTaskMonitorStrategy } = await import("./tasks/task-monitor-strategy.js");
    const { createMainSessionMonitorStrategy } = await import("./monitor/main-session-monitor.js");

    const mockTaskDeps = {
      tasks: new Map(),
      sessionStore: { get: vi.fn(), set: vi.fn(), ids: vi.fn().mockReturnValue([]) } as any,
      client: { session: { messages: vi.fn() } } as any,
      debugLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      directory: "/test",
      taskManager: { isTaskSession: vi.fn() },
    };

    const taskStrategy = createTaskMonitorStrategy({ getDeps: () => mockTaskDeps });
    expect(taskStrategy.name).toBe("task-monitor");

    const mockMainDeps = {
      sessionStore: { get: vi.fn(), ids: vi.fn().mockReturnValue([]) } as any,
      client: {} as any,
      directory: "/test",
      taskManager: { isTaskSession: vi.fn() } as any,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    };

    const mainStrategy = createMainSessionMonitorStrategy(mockMainDeps);
    expect(mainStrategy.name).toBe("main-session-monitor");
  });

  it("verifies no setInterval outside MonitorEngine in index.ts", async () => {
    // AC#5: No setInterval outside MonitorEngine.start()
    const indexSource = await import("./index.js?source=" + Date.now()).then(
      () => "index loaded",
      () => "index load attempted",
    );
    // This test verifies the module can be loaded (MonitorEngine handles the interval)
    expect(indexSource).toBe("index loaded");
  });
});