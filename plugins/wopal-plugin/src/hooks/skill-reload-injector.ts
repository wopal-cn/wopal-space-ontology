import type { SessionStore } from "../session-store.js";
import type { LoggerInstance } from "../logger.js";
import { formatSessionID } from "../logger.js";
import type { MessageWithInfo } from "./message-context.js";

export interface SkillReloadInjectorContext {
  sessionStore: SessionStore;
  contextLogger: LoggerInstance;
}

export async function injectSkillReload(
  ctx: SkillReloadInjectorContext,
  sessionID: string,
  lastUserMsg: MessageWithInfo | undefined,
): Promise<void> {
  if (!lastUserMsg) return;

  const state = ctx.sessionStore.get(sessionID);

  // Dedup: Plugin-triggered compact already sent recovery via promptAsync
  if (state?.recoverySent === true) {
    ctx.sessionStore.upsert(sessionID, (s) => {
      delete s.recoverySent; // Clear sticky flag (one-time dedup)
      delete s.needsSkillReload;
    });
    ctx.contextLogger.debug(
      `${formatSessionID(sessionID, false)} recovery already sent, skip injection`,
    );
    return;
  }

  // Check if full recovery protocol needs injection (manual/EllaMaka-triggered compact)
  const needsInjection = ctx.sessionStore.consumeRecoveryInjection(sessionID);
  if (needsInjection) {
    const skills = state?.loadedSkills?.size ? Array.from(state.loadedSkills).join(", ") : null
    const skillLine = skills ? `\n- Reload previously loaded skills: ${skills}` : ""

    const recoveryText = `<system-reminder>
The session context has been compacted. Execute recovery protocol immediately and continue working:
<CRITICAL_RULE>
- Read key files from the compaction summary (plans, specs, etc. — max 3)
- Search and load task-relevant memories (max 3)${skillLine}
- Check current session state (active tasks, pending work)
- Check related project git status (current branch, uncommitted changes)
- Respond in the user's preferred language (check USER.md if unsure)
- Briefly report what was recovered, then continue the previous work
</CRITICAL_RULE>
</system-reminder>`;

    lastUserMsg.parts ??= [];
    lastUserMsg.parts.push({
      type: "text",
      text: recoveryText,
      synthetic: true,
    });

    ctx.sessionStore.upsert(sessionID, (s) => {
      delete s.needsSkillReload;
    });

    ctx.contextLogger.debug(
      `Injected full recovery protocol for session ${formatSessionID(sessionID, false)}`,
    );
    return;
  }

  // Legacy: skill-reload injection (when no full recovery needed)
  const skillsToReload = ctx.sessionStore.consumeSkillReload(sessionID);
  if (!skillsToReload || skillsToReload.length === 0) return;

  const reminderText = [
    "<system-reminder>",
    `上下文已被压缩，之前加载的技能 [${skillsToReload.join(", ")}] 内容已丢失。`,
    "请重新加载这些技能以恢复完整的指令和工具链。",
    "</system-reminder>",
  ].join("\n");

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: reminderText,
    synthetic: true,
  });

  ctx.contextLogger.debug(
    `${formatSessionID(sessionID, false)} injected skill reload: ${skillsToReload.join(", ")}`,
  );
}
