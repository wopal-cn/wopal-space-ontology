import type { MessageWithInfo } from "./hooks/message-context.js";

export interface SessionState {
  contextPaths: Set<string>;
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
  /** Model info from session events (providerID + modelID for token logs) */
  model?: {
    providerID: string;
    modelID: string;
    variant?: string;
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
    return {
      ...s,
      contextPaths: new Set(s.contextPaths),
    };
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

  markCompacting(sessionID: string, nowMs: number): void {
    this.upsert(sessionID, (state) => {
      state.isCompacting = true;
      state.compactingSince = nowMs;
    });
  }

  markCompacted(sessionID: string): void {
    this.upsert(sessionID, (state) => {
      state.isCompacting = false;
      delete state.compactingSince;
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

  private createDefaultState(): SessionState {
    return {
      contextPaths: new Set<string>(),
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
