import type { MessageWithInfo } from "./hooks/message-context.js";

export interface SessionState {
  lastUserPrompt?: string;
  needsMemoryInjection?: boolean;
  lastUpdated: number;
  isCompacting?: boolean;
  compactingSince?: number;
  seededFromHistory: boolean;
  seedCount?: number;
  /** Recent messages for short-query context enrichment */
  recentMessages: MessageWithInfo[];
  /** Raw text injected via system-reminder in the most recent system.transform cycle */
  injectedRawText?: string | undefined;
  /** Skill names loaded via the `skill` tool in this session */
  loadedSkills: Set<string>;
  /** Set to true after compact completes when loadedSkills is non-empty */
  needsSkillReload?: boolean;
  /** Set to true after compact completes, signals event-router to send recovery message */
  needsAutoContinue?: boolean;
  /** Set to "plugin" when compact was triggered by context_manage tool; checked by event-router to distinguish Plugin-initiated vs other compacts */
  compactingTrigger?: "plugin";
  /** Recovery instruction already sent via promptAsync (Plugin-triggered compact). Prevents duplicate injection in messages.transform */
  recoverySent?: boolean;
  /** Recovery protocol needs injection in messages.transform (manual/EllaMaka-triggered compact) */
  needsRecoveryInjection?: boolean;
  /** Main-session compact requested during active tool run; trigger summarize after session.idle */
  pendingCompactTrigger?: "plugin";
  /** Agent name extracted from the most recent messages.transform cycle */
  agent?: string | undefined;
  /** The user prompt for which rules were last injected (dedup) */
  lastRulesPrompt?: string;
  /** Model provider ID (from step-finish event) */
  providerID?: string;
  /** Model ID (from step-finish event) */
  modelID?: string;
  /** Context window limit in tokens (from provider config lookup) */
  contextLimit?: number;
  /** Last token usage captured from step-finish event (cumulative) */
  lastTokens?: {
    input: number;
    output: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
    updatedAt: number; // timestamp for freshness check
  };
}

export interface SessionStoreOptions {
  max?: number;
}

export class SessionStore {
  private stateMap = new Map<string, SessionState>();
  private max: number;
  private tick = 0;

  constructor(opts: SessionStoreOptions = {}) {
    this.max = opts.max ?? 100;
  }

  setMax(limit: number): void {
    this.max = limit;
  }

  ids(): string[] {
    return Array.from(this.stateMap.keys());
  }

  get(sessionID: string): SessionState | undefined {
    return this.stateMap.get(sessionID);
  }

  snapshot(sessionID: string): SessionState | undefined {
    const s = this.stateMap.get(sessionID);
    if (!s) return undefined;
    return { ...s, loadedSkills: new Set(s.loadedSkills) };
  }

  reset(): void {
    this.stateMap.clear();
    this.max = 100;
    this.tick = 0;
  }

  upsert(sessionID: string, mutator: (state: SessionState) => void): void {
    let state = this.stateMap.get(sessionID);
    if (!state) {
      state = this.createDefaultState();
      this.stateMap.set(sessionID, state);
    }

    mutator(state);

    // Match existing semantics: overwrite lastUpdated after mutation.
    state.lastUpdated = ++this.tick;

    while (this.stateMap.size > this.max) {
      let oldestID: string | null = null;
      let oldestTime = Infinity;

      for (const [id, st] of this.stateMap.entries()) {
        if (st.lastUpdated < oldestTime) {
          oldestTime = st.lastUpdated;
          oldestID = id;
        }
      }

      if (oldestID) {
        this.stateMap.delete(oldestID);
      }
    }
  }

  markCompacting(sessionID: string, nowMs: number, trigger?: "plugin"): void {
    this.upsert(sessionID, (state) => {
      state.isCompacting = true;
      state.compactingSince = nowMs;
      if (trigger === "plugin") {
        state.compactingTrigger = "plugin";
      }
    });
  }

  markCompacted(sessionID: string): void {
    this.upsert(sessionID, (state) => {
      state.isCompacting = false;
      delete state.compactingSince;
      // DO NOT delete compactingTrigger here — event-router reads it to distinguish Plugin-initiated
      state.needsAutoContinue = true;

      // Manual/EllaMaka-triggered compact: set needsRecoveryInjection for messages.transform injection
      if (!state.compactingTrigger) {
        state.needsRecoveryInjection = true;
      }

      if (state.loadedSkills.size > 0) {
        state.needsSkillReload = true;
      }
    });
  }

  shouldSkipInjection(sessionID: string): boolean {
    const state = this.stateMap.get(sessionID);
    return state?.isCompacting === true;
  }

  recordSkillLoaded(sessionID: string, skillName: string): void {
    this.upsert(sessionID, (state) => {
      state.loadedSkills.add(skillName);
    });
  }

  consumeSkillReload(sessionID: string): string[] | null {
    const state = this.stateMap.get(sessionID);
    if (!state?.needsSkillReload || state.loadedSkills.size === 0) return null;
    const skills = Array.from(state.loadedSkills);
    this.upsert(sessionID, (s) => {
      delete s.needsSkillReload;
    });
    return skills;
  }

  consumeRecoveryInjection(sessionID: string): boolean {
    const state = this.stateMap.get(sessionID);
    if (!state?.needsRecoveryInjection) return false;
    this.upsert(sessionID, (s) => {
      delete s.needsRecoveryInjection;
    });
    return true;
  }

  private createDefaultState(): SessionState {
    return {
      lastUpdated: ++this.tick,
      seededFromHistory: false,
      seedCount: 0,
      recentMessages: [],
      loadedSkills: new Set<string>(),
    };
  }
}

export function createSessionStore(opts?: SessionStoreOptions): SessionStore {
  return new SessionStore(opts ?? { max: 100 });
}
