/**
 * Session Notify Plugin
 *
 * Plays Glass sound when session goes idle (unconditional, no TaskManager).
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";

const SOUND_PATH = "/System/Library/Sounds/Glass.aiff";

const sessionNotifyPlugin = async (_pluginInput: PluginInput): Promise<Hooks> => {
  return {
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (input.event.type !== "session.idle") return;

      try {
        Bun.spawn(["afplay", SOUND_PATH], {
          stdout: "ignore",
          stderr: "ignore",
        });
      } catch {
        // Silently ignore audio failures (non-blocking notification)
      }
    },
  };
};

export default {
  id: "wopal-session-notify",
  server: sessionNotifyPlugin,
};