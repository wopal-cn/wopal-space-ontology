import { describe, expect, it, vi } from "vitest";
import { createHookContext, createAllHooks } from "./index.js";
import { createSessionStore } from "../session-store.js";

function logger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

describe("Skill Assembly hook wiring", () => {
  it("uses the same overlay source for model visibility and runtime permission", async () => {
    const active = new Set(["pdf"]);
    const overlay = {
      descriptors: vi.fn(async () =>
        [...active]
          .sort()
          .map((name) => ({ name, description: `${name} description` })),
      ),
      effective: vi.fn(async () => [...active].sort()),
    };
    const log = logger();
    const ctx = createHookContext({
      client: {} as never,
      directory: "/workspace",
      projectDirectory: "/workspace",
      logDir: "/tmp",
      ruleFiles: [],
      sessionStore: createSessionStore(),
      coreLogger: log as never,
      rulesLogger: log as never,
      taskLogger: log as never,
      memoryLogger: log as never,
      contextLogger: log as never,
      skillOverlay: overlay as never,
    });
    const { hooks, transformedMessagesMap } = createAllHooks(ctx);
    const messages = [
      {
        role: "user",
        info: {
          id: "msg_1",
          role: "user",
          sessionID: "ses_child",
          agent: "fae",
        },
        parts: [{ type: "text", text: "work", sessionID: "ses_child" }],
      },
    ];

    await (hooks["experimental.chat.messages.transform"] as Function)(
      {},
      { messages },
    );
    const rules = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };
    await (hooks["experimental.permission.rules"] as Function)(
      {
        sessionID: "ses_child",
        agent: "fae",
        permission: "skill",
        patterns: ["pdf"],
      },
      rules,
    );

    expect(messages.at(-1)?.parts?.[0]?.text).toContain("pdf description");
    expect(
      transformedMessagesMap.get("ses_child")?.at(-1)?.parts?.[0]?.text,
    ).toContain("pdf description");
    expect(rules.rules).toEqual([
      { permission: "skill", pattern: "pdf", action: "allow" },
    ]);

    active.add("dev-flow");
    const next = [
      {
        role: "user",
        info: {
          id: "msg_2",
          role: "user",
          sessionID: "ses_child",
          agent: "fae",
        },
        parts: [{ type: "text", text: "continue", sessionID: "ses_child" }],
      },
    ];
    await (hooks["experimental.chat.messages.transform"] as Function)(
      {},
      { messages: next },
    );
    const nextRules = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };
    await (hooks["experimental.permission.rules"] as Function)(
      {
        sessionID: "ses_child",
        agent: "fae",
        permission: "skill",
        patterns: ["dev-flow"],
      },
      nextRules,
    );

    expect(next.at(-1)?.parts?.[0]?.text).toContain("dev-flow description");
    expect(nextRules.rules).toEqual([
      { permission: "skill", pattern: "dev-flow", action: "allow" },
    ]);
  });
  it("suppresses the catalog through the real compaction-hook -> messages-transform wiring", async () => {
    const overlay = {
      descriptors: vi.fn(async () => [
        { name: "pdf", description: "pdf description" },
      ]),
      effective: vi.fn(async () => ["pdf"]),
    };
    const log = logger();
    const ctx = createHookContext({
      client: {} as never,
      directory: "/workspace",
      projectDirectory: "/workspace",
      logDir: "/tmp",
      ruleFiles: [],
      sessionStore: createSessionStore(),
      coreLogger: log as never,
      rulesLogger: log as never,
      taskLogger: log as never,
      memoryLogger: log as never,
      contextLogger: log as never,
      skillOverlay: overlay as never,
    });
    const { hooks } = createAllHooks(ctx);

    await (hooks["experimental.session.compacting"] as Function)(
      { sessionID: "ses_compact" },
      { context: [], prompt: undefined },
    );
    const messages = [
      {
        role: "user",
        info: {
          id: "msg_compact",
          role: "user",
          sessionID: "ses_compact",
          agent: "fae",
        },
        parts: [{ type: "text", text: "history", sessionID: "ses_compact" }],
      },
    ];
    await (hooks["experimental.chat.messages.transform"] as Function)(
      {},
      { messages },
    );

    expect(messages).toHaveLength(1);
    expect(overlay.descriptors).not.toHaveBeenCalled();
  });
});
