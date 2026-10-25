import { describe, expect, it, vi } from "vitest";
import { createSkillPermissionRulesHooks } from "./skill-permission-rules.js";

describe("experimental.permission.rules skill overlay consumer", () => {
  it("adds exact allows only for requested skill names present in the overlay", async () => {
    const overlay = {
      effective: vi.fn().mockResolvedValue(["dev-flow", "pdf"]),
    };
    const hooks = createSkillPermissionRulesHooks(overlay as never);
    const output = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };

    await hooks["experimental.permission.rules"](
      {
        sessionID: "ses_child",
        agent: "fae",
        permission: "skill",
        patterns: ["pdf", "pdf-extra", "dev-flow"],
      },
      output,
    );

    expect(output.rules).toEqual([
      { permission: "skill", pattern: "pdf", action: "allow" },
      { permission: "skill", pattern: "dev-flow", action: "allow" },
    ]);
    expect(overlay.effective).toHaveBeenCalledWith("ses_child");
  });

  it("does not read or contribute overlay rules for other permissions", async () => {
    const overlay = { effective: vi.fn().mockResolvedValue(["pdf"]) };
    const hooks = createSkillPermissionRulesHooks(overlay as never);
    const output = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };

    await hooks["experimental.permission.rules"](
      {
        sessionID: "ses_child",
        agent: "fae",
        permission: "bash",
        patterns: ["pdf"],
      },
      output,
    );

    expect(output.rules).toEqual([]);
    expect(overlay.effective).not.toHaveBeenCalled();
  });

  it("contributes no rule for ungranted skills or wildcard-like partial matches", async () => {
    const overlay = { effective: vi.fn().mockResolvedValue(["pdf"]) };
    const hooks = createSkillPermissionRulesHooks(overlay as never);
    const output = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };

    await hooks["experimental.permission.rules"](
      {
        sessionID: "ses_child",
        agent: "fae",
        permission: "skill",
        patterns: ["*", "pd", "pdf/*", "other"],
      },
      output,
    );

    expect(output.rules).toEqual([]);
  });
  it("fails deny-safe with zero rules when overlay hydration fails", async () => {
    const overlay = {
      effective: vi.fn().mockRejectedValue(new Error("session lookup failed")),
    };
    const logger = { warn: vi.fn() };
    const hooks = createSkillPermissionRulesHooks(
      overlay as never,
      logger as never,
    );
    const output = {
      rules: [] as Array<{
        permission: string;
        pattern: string;
        action: string;
      }>,
    };

    await expect(
      hooks["experimental.permission.rules"](
        {
          sessionID: "ses_child",
          agent: "fae",
          permission: "skill",
          patterns: ["pdf"],
        },
        output,
      ),
    ).resolves.toBeUndefined();

    expect(output.rules).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
