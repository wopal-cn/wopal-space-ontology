import { describe, expect, it, vi } from "vitest";
import { createSessionStore } from "../session-store.js";
import { injectSkillCatalog } from "./skill-catalog-injector.js";
import type { MessageWithInfo } from "./message-context.js";

function baseMessages(sessionID = "ses_main"): MessageWithInfo[] {
  return [
    {
      role: "user",
      info: { id: "msg_user", role: "user", sessionID, agent: "fae" },
      parts: [{ type: "text", text: "do the task", sessionID }],
    },
    {
      role: "assistant",
      info: { id: "msg_assistant", role: "assistant", sessionID, agent: "fae" },
      parts: [{ type: "text", text: "working", sessionID }],
    },
  ];
}

describe("injectSkillCatalog", () => {
  it("appends one transient tail snapshot without mutating retained history", async () => {
    const messages = baseMessages();
    const retained = structuredClone(messages);
    const overlay = {
      descriptors: vi.fn().mockResolvedValue([
        {
          name: "pdf",
          description: "Work with PDF documents",
          location: "/secret/skills/pdf",
          content: "SECRET SKILL BODY",
        },
      ]),
    };

    await injectSkillCatalog(
      {
        skillOverlay: overlay as never,
        sessionStore: createSessionStore(),
        logger: { warn: vi.fn() } as never,
      },
      "ses_main",
      messages,
    );

    expect(messages.slice(0, retained.length)).toEqual(retained);
    expect(messages).toHaveLength(retained.length + 1);
    const snapshot = messages.at(-1)!;
    expect(snapshot.info?.role).toBe("user");
    expect(snapshot.info?.sessionID).toBe("ses_main");
    expect(snapshot.parts).toHaveLength(1);
    expect(snapshot.parts?.[0]?.synthetic).toBe(true);
    const text = snapshot.parts?.[0]?.text ?? "";
    expect(text).toContain("pdf");
    expect(text).toContain("Work with PDF documents");
    expect(text).toContain("skill(name)");
    expect(text).not.toContain("SECRET SKILL BODY");
    expect(text).not.toContain("/secret/skills/pdf");
  });

  it("publishes the complete current overlay on every request instead of digest-suppressing it", async () => {
    const overlay = {
      descriptors: vi
        .fn()
        .mockResolvedValueOnce([{ name: "pdf", description: "PDF" }])
        .mockResolvedValueOnce([
          { name: "dev-flow", description: "Development workflow" },
          { name: "pdf", description: "PDF" },
        ]),
    };
    const store = createSessionStore();
    const first = baseMessages();
    const second = baseMessages();

    await injectSkillCatalog(
      {
        skillOverlay: overlay as never,
        sessionStore: store,
        logger: { warn: vi.fn() } as never,
      },
      "ses_main",
      first,
    );
    await injectSkillCatalog(
      {
        skillOverlay: overlay as never,
        sessionStore: store,
        logger: { warn: vi.fn() } as never,
      },
      "ses_main",
      second,
    );

    expect(first.at(-1)?.parts?.[0]?.text).toContain("pdf");
    expect(second.at(-1)?.parts?.[0]?.text).toContain("pdf");
    expect(second.at(-1)?.parts?.[0]?.text).toContain("dev-flow");
    expect(overlay.descriptors).toHaveBeenCalledTimes(2);
  });

  it("does not append dynamic catalog context when the engine is compacting the session", async () => {
    const store = createSessionStore();
    store.markCompacting("ses_compact", Date.now());
    const messages = baseMessages("ses_compact");
    const overlay = {
      descriptors: vi
        .fn()
        .mockResolvedValue([{ name: "pdf", description: "PDF" }]),
    };

    await injectSkillCatalog(
      {
        skillOverlay: overlay as never,
        sessionStore: store,
        logger: { warn: vi.fn() } as never,
      },
      "ses_compact",
      messages,
    );

    expect(messages).toHaveLength(2);
    expect(overlay.descriptors).not.toHaveBeenCalled();
  });

  it("does nothing for an empty overlay", async () => {
    const messages = baseMessages();
    const overlay = { descriptors: vi.fn().mockResolvedValue([]) };

    await injectSkillCatalog(
      {
        skillOverlay: overlay as never,
        sessionStore: createSessionStore(),
        logger: { warn: vi.fn() } as never,
      },
      "ses_main",
      messages,
    );

    expect(messages).toHaveLength(2);
  });
  it("fails open when overlay descriptor lookup fails", async () => {
    const messages = baseMessages();
    const overlay = {
      descriptors: vi
        .fn()
        .mockRejectedValue(new Error("session lookup failed")),
    };
    const logger = { warn: vi.fn() };

    await expect(
      injectSkillCatalog(
        {
          skillOverlay: overlay as never,
          sessionStore: createSessionStore(),
          logger: logger as never,
        },
        "ses_main",
        messages,
      ),
    ).resolves.toBeUndefined();

    expect(messages).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
