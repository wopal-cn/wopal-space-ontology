import { describe, expect, it, vi } from "vitest";
import { createWopalSkillGrantTool } from "./wopal-skill-grant.js";

function getExecute(toolDefinition: unknown) {
  return (
    toolDefinition as { execute: (...args: unknown[]) => Promise<string> }
  ).execute;
}

function makeOverlay() {
  return {
    grant: vi.fn().mockResolvedValue({
      sessionID: "main",
      newlyAdded: ["pdf"],
      alreadyActive: [],
      effective: ["pdf"],
    }),
  };
}

describe("wopal_skill_grant", () => {
  it("grants to the current session when no target is specified", async () => {
    const overlay = makeOverlay();
    const manager = {
      findBySession: vi.fn(),
      resolveTaskForParent: vi.fn(),
      formatResolveErrorMessage: vi.fn(),
    };
    const execute = getExecute(
      createWopalSkillGrantTool(manager as never, overlay as never),
    );

    const output = await execute({ skills: ["pdf"] }, { sessionID: "main" });

    expect(overlay.grant).toHaveBeenCalledWith("main", "runtime", ["pdf"]);
    expect(output).toContain("Added: pdf");
  });

  it("resolves task_id only inside the current main session ownership", async () => {
    const overlay = makeOverlay();
    overlay.grant.mockResolvedValue({
      sessionID: "child",
      newlyAdded: ["pdf"],
      alreadyActive: [],
      effective: ["pdf"],
    });
    const manager = {
      findBySession: vi.fn(),
      resolveTaskForParent: vi.fn().mockReturnValue({
        type: "exact",
        task: {
          id: "wopal-task-child",
          sessionID: "child",
          parentSessionID: "main",
        },
      }),
      formatResolveErrorMessage: vi.fn(),
    };
    const execute = getExecute(
      createWopalSkillGrantTool(manager as never, overlay as never),
    );

    await execute(
      { skills: ["pdf"], task_id: "wopal-task-child" },
      { sessionID: "main" },
    );

    expect(manager.resolveTaskForParent).toHaveBeenCalledWith(
      "wopal-task-child",
      "main",
    );
    expect(overlay.grant).toHaveBeenCalledWith("child", "runtime", ["pdf"]);
  });

  it("rejects conflicting target parameters without mutation", async () => {
    const overlay = makeOverlay();
    const manager = {
      findBySession: vi.fn(),
      resolveTaskForParent: vi.fn(),
      formatResolveErrorMessage: vi.fn(),
    };
    const execute = getExecute(
      createWopalSkillGrantTool(manager as never, overlay as never),
    );

    const output = await execute(
      { skills: ["pdf"], session_id: "child", task_id: "wopal-task-child" },
      { sessionID: "main" },
    );

    expect(output).toContain("at most one");
    expect(overlay.grant).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary session that is not the current or an owned managed child", async () => {
    const overlay = makeOverlay();
    const manager = {
      findBySession: vi.fn().mockReturnValue({
        sessionID: "other",
        parentSessionID: "someone-else",
      }),
      resolveTaskForParent: vi.fn(),
      formatResolveErrorMessage: vi.fn(),
    };
    const execute = getExecute(
      createWopalSkillGrantTool(manager as never, overlay as never),
    );

    const output = await execute(
      { skills: ["pdf"], session_id: "other" },
      { sessionID: "main" },
    );

    expect(output).toContain("not a managed child");
    expect(overlay.grant).not.toHaveBeenCalled();
  });
});
