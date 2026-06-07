import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { resetSessionState } from "../test-helpers.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

function setupTestDirs() {
  // Create a unique temporary directory for each test run
  testDir = mkdtempSync(path.join(os.tmpdir(), "opencode-rules-test-"));
  globalRulesDir = path.join(testDir, ".config", "opencode", "rules");
  projectRulesDir = path.join(testDir, "project", ".opencode", "rules");
  mkdirSync(globalRulesDir, { recursive: true });
  mkdirSync(projectRulesDir, { recursive: true });
}

function teardownTestDirs() {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("command-hooks", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
  });

  it("registers memory command/tool hardening hooks", async () => {
    const { default: pluginDef } = await import("../index.js");
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
  });

  it("hardens /memory command prompt before execution", async () => {
    const { default: pluginDef } = await import("../index.js");
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
  });

  it("does not harden memory_manage tool definition (happens in tool definition itself)", async () => {
    const { default: pluginDef } = await import("../index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: { tool: { ids: vi.fn(async () => ({ data: [] })) } } as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    const hook = hooks["tool.definition"] as any;
    const output = { description: "old", parameters: {} };

    await hook({ toolID: "memory_manage" }, output);

    // onToolDefinition 不再 harden description，工具定义本身已包含展示义务区分
    expect(output.description).toBe("old");
  });
});