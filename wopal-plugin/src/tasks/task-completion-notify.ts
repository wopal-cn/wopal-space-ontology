import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[task]", "task");

const SOUND_ENABLED = process.env.WOPAL_TASK_NOTIFY_SOUND !== "false";
const SOUND_PATH = "/System/Library/Sounds/Glass.aiff";

export function notifyTaskCompletion(_sessionId: string): void {
  try {
    if (SOUND_ENABLED) {
      Bun.spawn(["afplay", SOUND_PATH], {
        stdout: "ignore",
        stderr: "ignore",
      });
    }
  } catch (e) {
    debugLog(`Task completion notification error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
