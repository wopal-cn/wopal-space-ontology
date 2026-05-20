import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSeedCount, upsertSessionState, getSessionStateSnapshot } from "../test-helpers.js"

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
    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    expect(typeof plugin).toBe("function");
  });

  it("should return transform hooks even when no rules exist", async () => {
    // Arrange - mock HOME to empty directory
    const originalHome = process.env.HOME;
    process.env.HOME = path.join(testDir, "empty-home");
    mkdirSync(path.join(testDir, "empty-home", ".wopal", "rules"), {
      recursive: true,
    });

    const { default: pluginDef } = await import("../index.js");
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
      // Act
      const hooks = await plugin(mockInput);

      // Assert - hooks are returned even when no rules exist
      // They handle the empty case gracefully
      expect("experimental.chat.messages.transform" in hooks).toBe(true);
      expect("experimental.chat.system.transform" in hooks).toBe(true);
      expect(typeof hooks["experimental.chat.messages.transform"]).toBe(
        "function",
      );
      expect(typeof hooks["experimental.chat.system.transform"]).toBe(
        "function",
      );
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("should inject rules into user message via messages.transform hook", async () => {
    // Arrange - create rule with keywords
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

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      // Act
      const hooks = await plugin(mockInput);
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

      // Assert - rules injected as synthetic part in user message
      const userMsg = result.messages[0];
      const syntheticParts = (userMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
      expect(rulesText).toContain("Matched rules");
      expect(rulesText).toContain("Test Rule");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("should inject rules into user message with empty system prompt", async () => {
    // Arrange - create rule with keywords
    writeFileSync(
      path.join(globalRulesDir, "rule.md"),
      `---
keywords:
  - "rule"
---

# Rule Content`,
    );

    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      // Act
      const hooks = await plugin(mockInput);
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
              parts: [{ type: "text", text: "use rule content" }],
            },
          ],
        },
      );

      // Assert - rules injected as synthetic part
      const userMsg = result.messages[0];
      const syntheticParts = (userMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
      expect(rulesText).toContain("Matched rules");
      expect(rulesText).toContain("Rule Content");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("should not modify messages in messages.transform hook when no skill reload needed", async () => {
    // Arrange - create rule with keywords
    writeFileSync(
      path.join(globalRulesDir, "rule.md"),
      `---
keywords:
  - "test"
---

# Rule`,
    );

    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    const originalMessages = [
      {
        role: "user",
        parts: [{ sessionID: "test-123", type: "text", text: "Hello" }],
      },
    ];

    try {
      // Act
      const hooks = await plugin(mockInput);
      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const result = await messagesTransform(
        {},
        { messages: originalMessages },
      );

      // Assert - messages unchanged when keywords don't match
      // (Skill Reload only adds synthetic part when needsSkillReload is true)
      expect(result.messages).toEqual(originalMessages);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("seeds session state once from messages.transform and does not rescan", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const transform = hooks["experimental.chat.messages.transform"] as any;

    const messages = {
      messages: [
        {
          info: { role: "assistant" },
          parts: [
            {
              sessionID: "ses_seed",
              type: "tool-invocation",
              toolInvocation: {
                toolName: "read",
                args: { filePath: "src/a.ts" },
              },
            },
          ],
        },
      ],
    };

    try {
      // Act - call transform twice with same messages
      await transform({}, messages);
      await transform({}, messages);

      // Assert - should only seed once
      expect(getSeedCount("ses_seed")).toBe(1);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  describe("conditional rules integration", () => {
    it("should include conditional rule when keyword matches prompt", async () => {
      // Arrange - create rule with keywords
      writeFileSync(
        path.join(globalRulesDir, "typescript.mdc"),
        `---
keywords:
  - "react"
  - "component"
---

Use React best practices for components.`,
      );

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-123";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "write a react component" }],
            },
          ],
        };

        // messages.transform injects rules based on keywords
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - conditional rule should be injected to user message as synthetic
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).toContain("React best practices");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should exclude conditional rule when keyword does not match prompt", async () => {
      // Arrange - create rule with keywords
      writeFileSync(
        path.join(globalRulesDir, "typescript.mdc"),
        `---
keywords:
  - "react"
---

Use React best practices for components.`,
      );

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-456";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "hi there" }],
            },
          ],
        };

        // Process messages with NON-matching prompt
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - conditional rule should NOT be injected
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).not.toContain("React best practices");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should exclude rules without keywords (no unconditional injection)", async () => {
      // Arrange - create rule WITHOUT keywords
      writeFileSync(
        path.join(globalRulesDir, "always.md"),
        "# Always Apply\nThis rule always applies.",
      );
      writeFileSync(
        path.join(globalRulesDir, "conditional.mdc"),
        `---
keywords:
  - "special"
---

Special rule content.`,
      );

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Process with non-matching prompt
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform(
          {},
          {
            messages: [
              {
                role: "user",
                info: { sessionID: "test-session-789", role: "user" },
                parts: [{ type: "text", text: "Check src/index.ts" }],
              },
            ],
          },
        );

        // Assert - rule without keywords is NOT injected (no unconditional)
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).not.toContain("Always Apply");
        expect(rulesText).not.toContain("This rule always applies");
        expect(rulesText).not.toContain("Special rule content");
      } finally {
        process.env.HOME = originalHome;
      }
    });

    it("should handle multiple keyword matches", async () => {
      // Arrange - create rule with keywords
      writeFileSync(
        path.join(globalRulesDir, "multi.mdc"),
        `---
keywords:
  - "testing"
  - "test"
  - "jest"
---

Follow testing best practices.`,
      );

      const originalHome = process.env.HOME;
      process.env.HOME = testDir;

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        const testSessionID = "test-session-multi";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "add tests for this function" }],
            },
          ],
        };

        // Process with matching prompt
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - rule should be included because keywords match
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).toContain("testing best practices");
      } finally {
        process.env.HOME = originalHome;
      }
    });
  });

  it("system.transform no longer injects rules (rules moved to messages.transform)", async () => {
    // Arrange - create conditional rule
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;

    try {
      writeFileSync(
        path.join(globalRulesDir, "conditional.mdc"),
        `---
keywords:
  - "special"
---

Special rule content.`,
      );

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

      // Seed state directly (without calling messages.transform)
      upsertSessionState("ses_x", (s) => {
        s.seededFromHistory = true;
      });

      // Act: call system.transform directly
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { sessionID: "ses_x", model: { providerID: "test", modelID: "test" } },
        { system: ["Base prompt."] },
      );

      // Assert - system.transform no longer injects rules
      expect(result.system.join("\n")).not.toContain("Special rule content");
      expect(result.system.join("\n")).toContain("Base prompt.");
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

describe("Skill Reload Migration", () => {
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

  it("injects Skill Reload reminder as synthetic part in user message (U1)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_skill_reload_test";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow", "fae-collab"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - last user message contains Skill Reload reminder as synthetic
      const lastUserMsg = result.messages[0];
      const skillReloadPart = lastUserMsg.parts.find((p: any) => p.text?.includes("<system-reminder>") && p.text?.includes("dev-flow"));
      expect(skillReloadPart).toBeDefined();
      expect(skillReloadPart.type).toBe("text");
      expect(skillReloadPart.synthetic).toBe(true); // Must be synthetic (invisible to TUI)
      expect(skillReloadPart.text).toContain("fae-collab");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("Skill Reload is one-time consumption (U2)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_skill_reload_once";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages1 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "first" }] },
    ];

    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "second" }] },
    ];

    try {
      // Act - first call
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result1 = await messagesTransform({}, { messages: messages1 });

      // Assert - Skill Reload injected
      const skillReload1 = result1.messages[0].parts.find((p: any) => p.text?.includes("技能") && p.text?.includes("dev-flow"));
      expect(skillReload1).toBeDefined();

      // Act - second call
      const result2 = await messagesTransform({}, { messages: messages2 });

      // Assert - no Skill Reload (already consumed)
      const skillReload2 = result2.messages[0].parts.find((p: any) => p.text?.includes("技能"));
      expect(skillReload2).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("does not inject when no Skill Reload needed (U3)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_no_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set();
      // No needsSkillReload set
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - no Skill Reload part
      const skillReloadPart = result.messages[0].parts.find((p: any) => p.text?.includes("技能"));
      expect(skillReloadPart).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("skips Skill Reload injection when no user message (U4)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_no_user_msg";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - no error, no synthetic part (no user message to inject into)
      expect(result.messages).toEqual(messages);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("stores transformed messages in map (U5)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_transformed_map";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - transformedMessagesMap should contain the messages with Skill Reload
      // The map is internal to hooks, so we verify via result having Skill Reload part
      expect(result.messages[0].parts.find((p: any) => p.text?.includes("技能"))).toBeDefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("seededFromHistory does not block Skill Reload injection (U6)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_seeded_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.seededFromHistory = true;
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "continue" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - Skill Reload injected despite seededFromHistory
      const skillReloadPart = result.messages[0].parts.find((p: any) => p.text?.includes("技能") && p.text?.includes("dev-flow"));
      expect(skillReloadPart).toBeDefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("does not consume Skill Reload when no user message (U7)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_preserve_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    // First call - no user message
    const messages1 = [
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    try {
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      await messagesTransform({}, { messages: messages1 });

      // Assert - needsSkillReload still true (not consumed)
      const state1 = getSessionStateSnapshot(sessionID);
      expect(state1?.needsSkillReload).toBe(true);

      // Second call - with user message
      const messages2 = [
        { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
      ];

      const result2 = await messagesTransform({}, { messages: messages2 });

      // Assert - Skill Reload now injected (consumed)
      const skillReload2 = result2.messages[0].parts.find((p: any) => p.text?.includes("技能"));
      expect(skillReload2).toBeDefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("system.transform no longer injects Skill Reload (I1)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_system_no_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    try {
      // Act
      const systemTransform = hooks["experimental.chat.system.transform"] as any;
      const result = await systemTransform(
        { sessionID, model: { providerID: "test", modelID: "test" } },
        { system: ["Base prompt."] },
      );

      // Assert - system[] does not contain Skill Reload
      const systemText = result.system.join("\n");
      expect(systemText).not.toContain("[系统提醒]");
      expect(systemText).not.toContain("技能");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("injects full recovery protocol when needsRecoveryInjection is true (manual/EllaMaka compact)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_recovery_injection";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["space-master"]);
      s.needsRecoveryInjection = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "continue" }] },
    ];

    try {
      // Act
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result = await messagesTransform({}, { messages });

      // Assert - full recovery protocol injected as synthetic
      const recoveryPart = result.messages[0].parts.find((p: any) => p.text?.includes("The session context has been compacted"));
      expect(recoveryPart).toBeDefined();
      expect(recoveryPart.synthetic).toBe(true); // Must be synthetic (invisible to TUI)
      expect(recoveryPart.text).toContain("Execute recovery protocol immediately");
      expect(recoveryPart.text).toContain("<CRITICAL_RULE>");
      expect(recoveryPart.text).toContain("Read key files from the compaction summary");
      expect(recoveryPart.text).toContain("Reload previously loaded skills: space-master");
      expect(recoveryPart.text).toContain("Search and load task-relevant memories");
      expect(recoveryPart.text).toContain("Check current session state");
      expect(recoveryPart.text).toContain("Check related project git status");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("skips recovery injection when recoverySent is true and clears stale needsSkillReload (Plugin-triggered compact)", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_recovery_sent";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["space-master"]);
      s.recoverySent = true; // Plugin already sent recovery via promptAsync
      s.needsSkillReload = true; // Stale state from markCompacted
    });

    const messages1 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "continue" }] },
    ];

    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "next turn" }] },
    ];

    try {
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;

      // Act - first call: recoverySent=true skips injection and clears stale state
      const result1 = await messagesTransform({}, { messages: messages1 });

      // Assert - no recovery injection (recoverySent prevents duplicate)
      const recoveryText = result1.messages[0].parts.find((p: any) => p.text?.includes("Execute recovery protocol immediately"));
      expect(recoveryText).toBeUndefined();

      // Assert - stale needsSkillReload was cleared
      const stateAfter = getSessionStateSnapshot(sessionID);
      expect(stateAfter?.needsSkillReload).toBeUndefined();
      expect(stateAfter?.recoverySent).toBeUndefined();

      // Act - second turn: no legacy skill-reload duplicate
      const result2 = await messagesTransform({}, { messages: messages2 });
      const skillReload2 = result2.messages[0].parts.find((p: any) => p.text?.includes("技能"));
      expect(skillReload2).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("no duplicate legacy skill-reload after full recovery injection (manual compact with skills)", async () => {
    // Arrange - simulate manual compact: both needsRecoveryInjection and needsSkillReload are set
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_no_duplicate_after_recovery";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsRecoveryInjection = true;
      s.needsSkillReload = true; // markCompacted sets both
    });

    const messages1 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "first" }] },
    ];

    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "second" }] },
    ];

    try {
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;

      // Act - first call: full recovery injected (includes skills inline)
      const result1 = await messagesTransform({}, { messages: messages1 });

      // Assert - full recovery protocol injected as synthetic
      const recovery1 = result1.messages[0].parts.find((p: any) => p.text?.includes("Execute recovery protocol immediately"));
      expect(recovery1).toBeDefined();
      expect(recovery1.synthetic).toBe(true);
      expect(recovery1.text).toContain("dev-flow");

      // Assert - needsSkillReload cleared by full recovery injection
      const stateAfter = getSessionStateSnapshot(sessionID);
      expect(stateAfter?.needsSkillReload).toBeUndefined();

      // Act - second call: should NOT inject legacy skill-reload
      const result2 = await messagesTransform({}, { messages: messages2 });

      // Assert - no legacy skill-reload duplicate
      const skillReload2 = result2.messages[0].parts.find((p: any) => p.text?.includes("技能"));
      expect(skillReload2).toBeUndefined();
      const recovery2 = result2.messages[0].parts.find((p: any) => p.text?.includes("Execute recovery protocol immediately"));
      expect(recovery2).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("recoveryInjection is one-time consumption", async () => {
    // Arrange
    const originalHome = process.env.HOME;
    process.env.HOME = testDir;
    
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

    const sessionID = "ses_recovery_once";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsRecoveryInjection = true;
    });

    const messages1 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "first" }] },
    ];

    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "second" }] },
    ];

    try {
      // Act - first call
      const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
      const result1 = await messagesTransform({}, { messages: messages1 });

      // Assert - recovery protocol injected
      const recovery1 = result1.messages[0].parts.find((p: any) => p.text?.includes("Execute recovery protocol immediately"));
      expect(recovery1).toBeDefined();
      expect(recovery1.text).toContain("Execute recovery protocol immediately");

      // Act - second call
      const result2 = await messagesTransform({}, { messages: messages2 });

      // Assert - no recovery (already consumed)
      const recovery2 = result2.messages[0].parts.find((p: any) => p.text?.includes("Execute recovery protocol immediately"));
      expect(recovery2).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
    }
  });
});