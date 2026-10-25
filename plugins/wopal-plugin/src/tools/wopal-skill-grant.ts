import {
  tool,
  type ToolContext,
  type ToolDefinition,
} from "@wopal/ellamaka-plugin";
import type { SessionSkillOverlay } from "../session-skill-overlay.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";

export function createWopalSkillGrantTool(
  manager: SimpleTaskManager,
  skillOverlay: SessionSkillOverlay,
): ToolDefinition {
  return tool({
    description:
      "Add installed Ellamaka skills to the current Wopal session or one of its managed child sessions. Grants are additive and do not change other tool permissions.",
    args: {
      skills: tool.schema
        .array(tool.schema.string())
        .min(1)
        .describe("Installed skill names to activate additively"),
      session_id: tool.schema
        .string()
        .optional()
        .describe("Current session or an owned managed child session ID"),
      task_id: tool.schema
        .string()
        .optional()
        .describe("Managed child task ID owned by the current session"),
    },
    execute: async (args, context: ToolContext) => {
      try {
        if (!context.sessionID) {
          return "Skill grant failed: current session ID is unavailable.";
        }
        if (args.session_id && args.task_id) {
          return "Skill grant failed: specify at most one of session_id or task_id.";
        }

        let targetSessionID = context.sessionID;
        if (args.task_id) {
          const verdict = manager.resolveTaskForParent(
            args.task_id,
            context.sessionID,
          );
          if (verdict.type !== "exact" && verdict.type !== "unique") {
            return `Skill grant failed: ${manager.formatResolveErrorMessage(args.task_id, context.sessionID)}`;
          }
          if (!verdict.task.sessionID) {
            return "Skill grant failed: managed task has no session ID.";
          }
          targetSessionID = verdict.task.sessionID;
        } else if (args.session_id && args.session_id !== context.sessionID) {
          const task = manager.findBySession(args.session_id);
          if (!task || task.parentSessionID !== context.sessionID) {
            return `Skill grant failed: session ${args.session_id} is not a managed child of the current session.`;
          }
          targetSessionID = args.session_id;
        }

        const result = await skillOverlay.grant(
          targetSessionID,
          "runtime",
          args.skills,
        );
        const added = result.newlyAdded.length
          ? result.newlyAdded.join(", ")
          : "(none)";
        const already = result.alreadyActive.length
          ? result.alreadyActive.join(", ")
          : "(none)";
        return [
          `Skill grant updated: ${result.sessionID}`,
          `Added: ${added}`,
          `Already active: ${already}`,
          `Effective overlay: ${result.effective.join(", ") || "(empty)"}`,
        ].join("\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Skill grant failed: ${message}`;
      }
    },
  });
}
