/**
 * Shared session store singleton.
 * Used by both the plugin runtime (index.ts) and test helpers (test-helpers.ts).
 */

import { createSessionStore } from "./session-store.js";

export const sessionStore = createSessionStore();
