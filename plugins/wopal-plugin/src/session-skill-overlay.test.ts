import { describe, expect, it, vi } from "vitest";
import type { OpencodeClient } from "@wopal/ellamaka-sdk/v2";
import { createSessionStore } from "./session-store.js";
import { SessionSkillOverlay } from "./session-skill-overlay.js";

function makeClient(seed: Record<string, Record<string, unknown>> = {}) {
  const sessions = new Map(
    Object.entries(seed).map(([id, metadata]) => [
      id,
      { id, metadata: structuredClone(metadata) },
    ]),
  );
  const update = vi.fn(
    async (args: { sessionID: string; metadata?: Record<string, unknown> }) => {
      const current = sessions.get(args.sessionID);
      if (!current) return { error: { name: "NotFound" } };
      current.metadata = structuredClone(args.metadata ?? {});
      return { data: current };
    },
  );
  const skills = vi.fn(async () => ({
    data: [
      {
        name: "dev-flow",
        description: "Development workflow",
        location: "/skills/dev-flow",
        content: "BODY",
      },
      {
        name: "space-master",
        description: "Space operations",
        location: "/skills/space-master",
        content: "BODY",
      },
      {
        name: "pdf",
        description: "PDF work",
        location: "/skills/pdf",
        content: "BODY",
      },
    ],
  }));
  const client = {
    app: { skills },
    session: {
      get: vi.fn(async (args: { sessionID: string }) => {
        const data = sessions.get(args.sessionID);
        return data
          ? { data: structuredClone(data) }
          : { error: { name: "NotFound" } };
      }),
      update,
    },
  };
  return {
    client: client as unknown as OpencodeClient,
    sessions,
    update,
    skills,
  };
}

describe("SessionSkillOverlay", () => {
  it("persists canonical initial skills while preserving unrelated metadata and caches only after success", async () => {
    const { client, sessions, update } = makeClient({
      child: {
        keep: { value: 1 },
        "wopal.sessionAssembly": { tools: ["existing"] },
      },
    });
    const store = createSessionStore();
    const overlay = new SessionSkillOverlay(client, store, "/workspace");

    const result = await overlay.grant("child", "initial", [
      "pdf",
      "dev-flow",
      "pdf",
    ]);

    expect(result).toEqual({
      sessionID: "child",
      newlyAdded: ["dev-flow", "pdf"],
      alreadyActive: [],
      effective: ["dev-flow", "pdf"],
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(sessions.get("child")?.metadata).toEqual({
      keep: { value: 1 },
      "wopal.sessionAssembly": {
        tools: ["existing"],
        skills: { initial: ["dev-flow", "pdf"], runtime: [] },
      },
    });
    expect(store.get("child")?.skillOverlay).toEqual({
      initial: ["dev-flow", "pdf"],
      runtime: [],
    });
  });

  it("adds runtime skills idempotently and reports already-active names", async () => {
    const { client, update } = makeClient({
      main: {
        "wopal.sessionAssembly": {
          skills: { initial: ["dev-flow"], runtime: ["pdf"] },
        },
      },
    });
    const overlay = new SessionSkillOverlay(
      client,
      createSessionStore(),
      "/workspace",
    );

    const result = await overlay.grant("main", "runtime", [
      "pdf",
      "space-master",
    ]);

    expect(result.newlyAdded).toEqual(["space-master"]);
    expect(result.alreadyActive).toEqual(["pdf"]);
    expect(result.effective).toEqual(["dev-flow", "pdf", "space-master"]);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole grant before mutation when any skill is unknown", async () => {
    const { client, update } = makeClient({ main: {} });
    const store = createSessionStore();
    const overlay = new SessionSkillOverlay(client, store, "/workspace");

    await expect(
      overlay.grant("main", "runtime", ["pdf", "missing-skill"]),
    ).rejects.toThrow("Unknown skill: missing-skill");

    expect(update).not.toHaveBeenCalled();
    expect(store.get("main")?.skillOverlay).toBeUndefined();
  });

  it("keeps session overlays isolated and hydrates from each session metadata", async () => {
    const { client } = makeClient({
      parent: {
        "wopal.sessionAssembly": {
          skills: { initial: ["dev-flow"], runtime: [] },
        },
      },
      child: {
        "wopal.sessionAssembly": { skills: { initial: [], runtime: ["pdf"] } },
      },
    });
    const overlay = new SessionSkillOverlay(
      client,
      createSessionStore(),
      "/workspace",
    );

    await expect(overlay.effective("parent")).resolves.toEqual(["dev-flow"]);
    await expect(overlay.effective("child")).resolves.toEqual(["pdf"]);
  });

  it("skips Skill Pool discovery for an empty overlay and caches discovery for active overlays", async () => {
    const { client, skills } = makeClient({
      empty: {},
      active: {
        "wopal.sessionAssembly": { skills: { initial: ["pdf"], runtime: [] } },
      },
    });
    const overlay = new SessionSkillOverlay(
      client,
      createSessionStore(),
      "/workspace",
    );

    await expect(overlay.descriptors("empty")).resolves.toEqual([]);
    expect(skills).not.toHaveBeenCalled();

    await expect(overlay.descriptors("active")).resolves.toEqual([
      { name: "pdf", description: "PDF work" },
    ]);
    await overlay.descriptors("active");
    expect(skills).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale Skill Pool cache once before rejecting a newly installed skill", async () => {
    const { client, skills, sessions } = makeClient({ main: {} });
    const overlay = new SessionSkillOverlay(
      client,
      createSessionStore(),
      "/workspace",
    );

    await overlay.skillPool();
    skills.mockResolvedValueOnce({
      data: [
        {
          name: "pdf",
          description: "PDF work",
          location: "/pdf",
          content: "BODY",
        },
        {
          name: "new-skill",
          description: "New",
          location: "/new",
          content: "BODY",
        },
      ],
    });

    await expect(
      overlay.grant("main", "runtime", ["new-skill"]),
    ).resolves.toMatchObject({ effective: ["new-skill"] });
    expect(skills).toHaveBeenCalledTimes(2);
    expect(
      (
        sessions.get("main")?.metadata["wopal.sessionAssembly"] as {
          skills: { runtime: string[] };
        }
      ).skills.runtime,
    ).toEqual(["new-skill"]);
  });

  it("serializes concurrent grants to the same session so neither update is lost", async () => {
    const { client, sessions } = makeClient({ main: {} });
    const rawUpdate = client.session.update!;
    client.session.update = vi.fn(async (args) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return rawUpdate(args);
    }) as typeof client.session.update;
    const overlay = new SessionSkillOverlay(
      client,
      createSessionStore(),
      "/workspace",
    );

    await Promise.all([
      overlay.grant("main", "runtime", ["pdf"]),
      overlay.grant("main", "runtime", ["dev-flow"]),
    ]);

    expect(
      (
        sessions.get("main")?.metadata["wopal.sessionAssembly"] as {
          skills: { runtime: string[] };
        }
      ).skills.runtime,
    ).toEqual(["dev-flow", "pdf"]);
    await expect(overlay.effective("main")).resolves.toEqual([
      "dev-flow",
      "pdf",
    ]);
  });
});
