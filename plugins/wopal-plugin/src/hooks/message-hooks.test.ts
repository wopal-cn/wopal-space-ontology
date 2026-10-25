import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import {
  resetSessionState,
  getSessionStateSnapshot,
  _upsertSessionState,
} from "../test-helpers.js";
import { createMessageHooks } from "./message-hooks.js";
import { SessionStore } from "../session-store.js";

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

describe("message-hooks", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
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
      const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
        const raw =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const pathname = new URL(raw).pathname;
        const data =
          pathname === "/skill"
            ? []
            : pathname === "/session/ses_seed"
              ? { id: "ses_seed", metadata: {} }
              : {};
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      const mockClient = {
        tool: { ids: vi.fn(async () => ({ data: [] })) },
        _client: { getConfig: () => ({ fetch: mockFetch }) },
      };
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
// ---------------------------------------------------------------------------
// Memory injection capability gating (capabilities structure)
// ---------------------------------------------------------------------------

function createMockLogger() {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  };
}

interface CapabilityHooksOpts {
  memoryInjectionEnabled?: boolean;
}

function createCapabilityHooks(opts?: CapabilityHooksOpts) {
  const sessionStore = new SessionStore({ max: 10 });
  const contextLogger = createMockLogger() as never;
  const rulesLogger = createMockLogger() as never;
  const memoryLogger = createMockLogger() as never;
  const capabilities = opts
    ? { memoryInjectionEnabled: opts.memoryInjectionEnabled }
    : undefined;

  const hooks = createMessageHooks({
    sessionStore,
    contextLogger,
    projectDirectory: testDir,
    transformedMessagesMap: new Map(),
    skillReloadCtx: { sessionStore, contextLogger },
    ruleMessageCtx: {
      sessionStore,
      ruleInjectorCtx: { directory: testDir, ruleFiles: [], rulesLogger },
      client: {} as never,
      taskManager: undefined,
      childSessionCache: new Map(),
      rulesLogger,
      ...(capabilities ? { capabilities } : {}),
    } as never,
    memoryMessageCtx: {
      memoryInjectorCtx: {
        client: {} as never,
        sessionStore,
        memoryLogger,
        memoryInjector: undefined,
        childSessionCache: new Map(),
        taskManager: undefined,
      },
      memoryInjector: undefined,
      sessionStore,
      memoryLogger,
      ...(capabilities ? { capabilities } : {}),
    } as never,
  });

  return { hooks, sessionStore };
}

describe("message-hooks memory injection capability", () => {
  it("sets needsMemoryInjection by default when no capabilities provided", async () => {
    const { hooks, sessionStore } = createCapabilityHooks();

    await (hooks["experimental.chat.messages.transform"] as any)(
      {},
      {
        messages: [
          {
            role: "user",
            info: { sessionID: "ses_cap_default", role: "user" },
            parts: [{ type: "text", text: "hello there" }],
          },
        ],
      },
    );

    expect(sessionStore.get("ses_cap_default")?.needsMemoryInjection).toBe(
      true,
    );
  });

  it("sets needsMemoryInjection when memoryInjectionEnabled is true", async () => {
    const { hooks, sessionStore } = createCapabilityHooks({
      memoryInjectionEnabled: true,
    });

    await (hooks["experimental.chat.messages.transform"] as any)(
      {},
      {
        messages: [
          {
            role: "user",
            info: { sessionID: "ses_cap_on", role: "user" },
            parts: [{ type: "text", text: "hello there" }],
          },
        ],
      },
    );

    expect(sessionStore.get("ses_cap_on")?.needsMemoryInjection).toBe(true);
  });

  it("does not set needsMemoryInjection when memoryInjectionEnabled is false (seed path)", async () => {
    const { hooks, sessionStore } = createCapabilityHooks({
      memoryInjectionEnabled: false,
    });

    await (hooks["experimental.chat.messages.transform"] as any)(
      {},
      {
        messages: [
          {
            role: "user",
            info: { sessionID: "ses_cap_off", role: "user" },
            parts: [{ type: "text", text: "hello there" }],
          },
        ],
      },
    );

    expect(
      sessionStore.get("ses_cap_off")?.needsMemoryInjection,
    ).toBeUndefined();
  });

  it("does not set needsMemoryInjection when memoryInjectionEnabled is false (chat.message path)", async () => {
    const { hooks, sessionStore } = createCapabilityHooks({
      memoryInjectionEnabled: false,
    });

    await (hooks["chat.message"] as any)(
      { sessionID: "ses_cap_chat" },
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "update prompt" }],
      },
    );

    const state = sessionStore.get("ses_cap_chat");
    expect(state?.lastUserPrompt).toBe("update prompt");
    expect(state?.needsMemoryInjection).toBeUndefined();
  });
});
