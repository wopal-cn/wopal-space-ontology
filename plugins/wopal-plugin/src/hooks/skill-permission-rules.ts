import type { PermissionRule } from "@wopal/ellamaka-sdk/v2";
import type { SessionSkillOverlay } from "../session-skill-overlay.js";
import { taskLogger, type LoggerInstance } from "../logger.js";

export interface SkillPermissionRulesInput {
  sessionID: string;
  agent: string;
  permission: string;
  patterns: string[];
}

export interface SkillPermissionRulesOutput {
  rules: PermissionRule[];
}

export function createSkillPermissionRulesHooks(
  skillOverlay?: Pick<SessionSkillOverlay, "effective">,
  logger: LoggerInstance = taskLogger,
) {
  async function onPermissionRules(
    input: SkillPermissionRulesInput,
    output: SkillPermissionRulesOutput,
  ): Promise<void> {
    if (!skillOverlay || input.permission !== "skill") return;

    let activeSkills: string[];
    try {
      activeSkills = await skillOverlay.effective(input.sessionID);
    } catch (err) {
      logger.warn(
        { err, session_id: input.sessionID },
        "Skill permission overlay lookup failed; contributing no runtime rules",
      );
      return;
    }

    const effective = new Set(activeSkills);
    for (const pattern of input.patterns) {
      if (!effective.has(pattern)) continue;
      output.rules.push({
        permission: "skill",
        pattern,
        action: "allow",
      });
    }
  }

  return {
    "experimental.permission.rules": onPermissionRules,
  };
}
