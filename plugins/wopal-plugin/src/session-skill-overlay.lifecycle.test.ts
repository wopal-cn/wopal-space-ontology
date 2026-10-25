import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient } from "@wopal/ellamaka-sdk/v2";
import { SessionSkillOverlay } from "./session-skill-overlay.js";
import { SessionStore } from "./session-store.js";
import { createSkillPermissionRulesHooks } from "./hooks/skill-permission-rules.js";

function makePersistentClient() {
  const sessions = new Map<
    string,
    { id: string; metadata: Record<string, unknown> }
  >([
    [
      "parent",
      {
        id: "parent",
        metadata: {
          "wopal.sessionAssembly": {
            skills: { initial: ["dev-flow"], runtime: [] },
          },
        },
      },
    ],
    [
      "child",
      {
        id: "child",
        metadata: {
          "wopal.sessionAssembly": {
            skills: { initial: ["pdf"], runtime: ["space-master"] },
          },
        },
      },
    ],
  ]);
  const client = {
    app: {
      skills: vi.fn(async () => ({
        data: [
          {
            name: "dev-flow",
            description: "Development workflow",
            location: "/dev",
            content: "BODY",
          },
          {
            name: "pdf",
            description: "PDF",
            location: "/pdf",
            content: "BODY",
          },
          {
            name: "space-master",
            description: "Space",
            location: "/space",
            content: "BODY",
          },
        ],
      })),
    },
    session: {
      get: vi.fn(async ({ sessionID }: { sessionID: string }) => ({
        data: sessions.get(sessionID),
      })),
      update: vi.fn(
        async ({
          sessionID,
          metadata,
        }: {
          sessionID: string;
          metadata: Record<string, unknown>;
        }) => {
          const session = sessions.get(sessionID)!;
          session.metadata = structuredClone(metadata);
          return { data: session };
        },
      ),
    },
  };
  return { client: client as unknown as OpencodeClient, sessions };
}

describe("Session Skill Overlay lifecycle recovery", () => {
  it("rehydrates the same persisted overlay in a fresh plugin/store instance", async () => {
    const { client } = makePersistentClient();
    const first = new SessionSkillOverlay(
      client,
      new SessionStore(),
      "/workspace",
    );
    const secondStore = new SessionStore();
    const second = new SessionSkillOverlay(client, secondStore, "/workspace");

    await expect(first.effective("child")).resolves.toEqual([
      "pdf",
      "space-master",
    ]);
    await expect(second.effective("child")).resolves.toEqual([
      "pdf",
      "space-master",
    ]);
    expect(secondStore.get("child")?.skillOverlay).toEqual({
      initial: ["pdf"],
      runtime: ["space-master"],
    });
  });

  it("rehydrates current metadata after compaction invalidates a stale overlay cache", async () => {
    const { client, sessions } = makePersistentClient();
    const store = new SessionStore();
    const overlay = new SessionSkillOverlay(client, store, "/workspace");

    await expect(overlay.effective("child")).resolves.toEqual([
      "pdf",
      "space-master",
    ]);
    sessions.get("child")!.metadata = {
      "wopal.sessionAssembly": {
        skills: { initial: ["pdf"], runtime: ["dev-flow"] },
      },
    };
    store.markCompacted("child");

    await expect(overlay.effective("child")).resolves.toEqual([
      "dev-flow",
      "pdf",
    ]);
  });

  it("keeps parent and child metadata overlays isolated after fresh-instance hydration", async () => {
    const { client } = makePersistentClient();
    const overlay = new SessionSkillOverlay(
      client,
      new SessionStore(),
      "/workspace",
    );

    await expect(overlay.effective("parent")).resolves.toEqual(["dev-flow"]);
    await expect(overlay.effective("child")).resolves.toEqual([
      "pdf",
      "space-master",
    ]);
  });

  it("never treats loadedSkills recovery state as authorization", async () => {
    const { client, sessions } = makePersistentClient();
    sessions.get("child")!.metadata = {};
    const store = new SessionStore();
    store.recordSkillLoaded("child", "pdf");
    const overlay = new SessionSkillOverlay(client, store, "/workspace");
    const hooks = createSkillPermissionRulesHooks(overlay);
    const output = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };

    await hooks["experimental.permission.rules"](
      {
        sessionID: "child",
        agent: "fae",
        permission: "skill",
        patterns: ["pdf"],
      },
      output,
    );

    expect(output.rules).toEqual([]);
    expect(store.get("child")?.loadedSkills.has("pdf")).toBe(true);
    expect(store.get("child")?.skillOverlay).toEqual({
      initial: [],
      runtime: [],
    });
  });
});
