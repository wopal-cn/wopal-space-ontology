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
  /** Session title from OpenCode session API (updated on step-finish) */
  title?: string;
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
    updatedAt: number;
  };
  /** Context warning pending — set by MainSessionMonitorStrategy when pct >= threshold */
  pendingContextWarningPct?: number;
  /** Context warning in-flight — set before promptAsync, cleared on commit/rollback */
  contextWarningSending?: boolean;
  /** Timestamp of last successfully sent context warning */
  lastContextWarningAt?: number;
  /** Number of context warnings sent in current session (reset on compact) */
  contextWarningsSent?: number;
  /** Cached compaction agent summary text, consumed atomly by handleSessionCompacted */
  compactionSummaryText?: string;
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
      // Clear context warning state on compact — context is being reset
      delete state.pendingContextWarningPct;
      delete state.contextWarningSending;
      delete state.lastContextWarningAt;
      delete state.contextWarningsSent;
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

  setCompactionSummary(sessionID: string, text: string): void {
    this.upsert(sessionID, (s) => {
      s.compactionSummaryText = text;
    });
  }

  consumeCompactionSummary(sessionID: string): string | null {
    const state = this.stateMap.get(sessionID);
    if (!state?.compactionSummaryText) return null;
    const text = state.compactionSummaryText;
    this.upsert(sessionID, (s) => {
      delete s.compactionSummaryText;
    });
    return text;
  }

  // Context warning state machine helpers

  /** Cooldown period in ms between context warnings (5 minutes) */
  static readonly CONTEXT_WARNING_COOLDOWN_MS = 300_000;

  /** Max number of context warnings per session before stopping */
  static readonly MAX_CONTEXT_WARNINGS = 3;

  /**
   * Queue a context warning for the session.
   * Checks: pending, sending, cooldown, max count.
   * Returns true if warning was queued, false if skipped.
   */
  queueContextWarning(sessionID: string, pct: number, nowMs: number): boolean {
    const state = this.stateMap.get(sessionID);
    if (!state) return false;

    // Skip if already pending
    if (state.pendingContextWarningPct !== undefined) return false;

    // Skip if sending in progress
    if (state.contextWarningSending) return false;

    // Skip if compacting
    if (state.isCompacting) return false;

    // Skip if cooldown not passed
    if (state.lastContextWarningAt !== undefined) {
      const elapsed = nowMs - state.lastContextWarningAt;
      if (elapsed < SessionStore.CONTEXT_WARNING_COOLDOWN_MS) return false;
    }

    // Skip if max warnings reached
    const sentCount = state.contextWarningsSent ?? 0;
    if (sentCount >= SessionStore.MAX_CONTEXT_WARNINGS) return false;

    this.upsert(sessionID, (s) => {
      s.pendingContextWarningPct = pct;
    });
    return true;
  }

  /**
   * Begin sending context warning — atomically enter sending state and clear pending.
   * Returns the pct value to send, or null if no pending warning.
   */
  beginContextWarningSend(sessionID: string): number | null {
    const state = this.stateMap.get(sessionID);
    if (!state || state.pendingContextWarningPct === undefined) return null;
    if (state.isCompacting) {
      this.upsert(sessionID, (s) => { delete s.pendingContextWarningPct; });
      return null;
    }

    const pct = state.pendingContextWarningPct;
    this.upsert(sessionID, (s) => {
      delete s.pendingContextWarningPct;
      s.contextWarningSending = true;
    });
    return pct;
  }

  /**
   * Commit context warning send — clear sending, update timestamp, increment count.
   */
  commitContextWarningSend(sessionID: string, nowMs: number): void {
    this.upsert(sessionID, (s) => {
      if (s.isCompacting) {
        delete s.contextWarningSending;
        return;
      }
      delete s.contextWarningSending;
      s.lastContextWarningAt = nowMs;
      s.contextWarningsSent = (s.contextWarningsSent ?? 0) + 1;
    });
  }

  /**
   * Rollback context warning send — clear sending, restore pending.
   */
  rollbackContextWarningSend(sessionID: string, pct: number): void {
    this.upsert(sessionID, (s) => {
      delete s.contextWarningSending;
      if (s.isCompacting) {
        return;
      }
      s.pendingContextWarningPct = pct;
    });
  }

  /**
   * Clear context warning state (used after compact or explicit cleanup).
   * If resetCount is true, also reset the warning count.
   */
  clearContextWarningState(sessionID: string, options?: { resetCount?: boolean }): void {
    this.upsert(sessionID, (s) => {
      delete s.pendingContextWarningPct;
      delete s.contextWarningSending;
      if (options?.resetCount) {
        delete s.contextWarningsSent;
        delete s.lastContextWarningAt;
      }
    });
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
