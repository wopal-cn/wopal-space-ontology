import type { SessionSkillOverlay } from "../session-skill-overlay.js";
import type { SessionStore } from "../session-store.js";
import type { LoggerInstance } from "../logger.js";
import type { MessageWithInfo } from "./message-context.js";

export interface SkillCatalogInjectorContext {
  skillOverlay: Pick<SessionSkillOverlay, "descriptors">;
  sessionStore: SessionStore;
  logger: LoggerInstance;
}

function formatSkillCatalog(
  skills: Awaited<ReturnType<SessionSkillOverlay["descriptors"]>>,
): string {
  const lines = skills.map((skill) =>
    skill.description
      ? `- ${skill.name}: ${skill.description}`
      : `- ${skill.name}`,
  );
  return [
    "<system-reminder>",
    "[Task-activated skills]",
    "The following extra skills are active for this session:",
    ...lines,
    "Load a skill with the native skill(name) tool before following its instructions.",
    "</system-reminder>",
  ].join("\n");
}

export async function injectSkillCatalog(
  ctx: SkillCatalogInjectorContext,
  sessionID: string,
  messages: MessageWithInfo[],
): Promise<void> {
  // Ellamaka also invokes messages.transform while preparing a compaction
  // summary. The compaction hook runs first and marks the session, so suppress
  // this transient task catalog there; otherwise the model could summarize it
  // back into persisted history.
  if (ctx.sessionStore.get(sessionID)?.isCompacting === true) return;

  let skills: Awaited<ReturnType<SessionSkillOverlay["descriptors"]>>;
  try {
    skills = await ctx.skillOverlay.descriptors(sessionID);
  } catch (err) {
    ctx.logger.warn(
      { err, session_id: sessionID },
      "Skill catalog injection skipped after overlay lookup failure",
    );
    return;
  }
  if (skills.length === 0) return;

  messages.push({
    role: "user",
    info: {
      id: `wopal-skill-overlay:${sessionID}`,
      role: "user",
      sessionID,
    },
    parts: [
      {
        type: "text",
        text: formatSkillCatalog(skills),
        sessionID,
        synthetic: true,
      },
    ],
  });
}
