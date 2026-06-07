import { describe, it, expect } from "vitest";
import { SessionStore } from "./session-store.js";

/** Helper to set up a session with default state */
function setupSession(store: SessionStore, sessionID: string, overrides?: Record<string, unknown>) {
  store.upsert(sessionID, (s) => {
    Object.assign(s, overrides);
  });
}

describe("SessionStore", () => {
  it("prunes oldest sessions when over max", () => {
    const store = new SessionStore({ max: 2 });

    store.upsert("ses_1", (s) => void (s.lastUpdated = 1));
    store.upsert("ses_2", (s) => void (s.lastUpdated = 2));
    store.upsert("ses_3", (s) => void (s.lastUpdated = 3));

    const ids = store.ids();
    expect(ids).toHaveLength(2);
    expect(ids).toContain("ses_2");
    expect(ids).toContain("ses_3");
  });

  describe("shouldSkipInjection", () => {
    it("returns true while compacting", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.isCompacting = true;
      });

      expect(store.shouldSkipInjection("ses_c")).toBe(true);
    });

    it("returns false when not compacting", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_normal", (s) => {
        s.isCompacting = false;
      });

      expect(store.shouldSkipInjection("ses_normal")).toBe(false);
    });

    it("returns false for unknown session", () => {
      const store = new SessionStore({ max: 100 });
      expect(store.shouldSkipInjection("unknown")).toBe(false);
    });
  });

  describe("markCompacted", () => {
    it("clears compacting state and sets needsSkillReload when skills loaded", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.isCompacting = true;
        s.compactingSince = 1000;
        s.loadedSkills.add("dev-flow");
        s.loadedSkills.add("fae-collab");
      });

      store.markCompacted("ses_c");

      const state = store.get("ses_c");
      expect(state?.isCompacting).toBe(false);
      expect(state?.compactingSince).toBeUndefined();
      expect(state?.needsSkillReload).toBe(true);
    });

    it("does not set needsSkillReload when no skills loaded", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.isCompacting = true;
        s.compactingSince = 1000;
      });

      store.markCompacted("ses_c");

      const state = store.get("ses_c");
      expect(state?.isCompacting).toBe(false);
      expect(state?.needsSkillReload).toBeUndefined();
    });

    it("sets needsAutoContinue to true", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.isCompacting = true;
        s.compactingSince = 1000;
      });

      store.markCompacted("ses_c");

      const state = store.get("ses_c");
      expect(state?.needsAutoContinue).toBe(true);
    });

    it("sets needsAutoContinue even when skills are loaded", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.isCompacting = true;
        s.compactingSince = 1000;
        s.loadedSkills.add("dev-flow");
      });

      store.markCompacted("ses_c");

      const state = store.get("ses_c");
      expect(state?.needsAutoContinue).toBe(true);
      expect(state?.needsSkillReload).toBe(true);
    });
  });

  describe("recordSkillLoaded", () => {
    it("records skill names", () => {
      const store = new SessionStore({ max: 100 });
      store.recordSkillLoaded("ses_1", "dev-flow");
      store.recordSkillLoaded("ses_1", "fae-collab");

      const state = store.get("ses_1");
      expect(state?.loadedSkills.has("dev-flow")).toBe(true);
      expect(state?.loadedSkills.has("fae-collab")).toBe(true);
    });

    it("deduplicates skill names", () => {
      const store = new SessionStore({ max: 100 });
      store.recordSkillLoaded("ses_1", "dev-flow");
      store.recordSkillLoaded("ses_1", "dev-flow");

      const state = store.get("ses_1");
      expect(state?.loadedSkills.size).toBe(1);
    });
  });

  describe("consumeSkillReload", () => {
    it("returns skill names and clears needsSkillReload flag", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.loadedSkills.add("dev-flow");
        s.loadedSkills.add("fae-collab");
        s.needsSkillReload = true;
      });

      const result = store.consumeSkillReload("ses_c");
      expect(result).toEqual(["dev-flow", "fae-collab"]);

      const state = store.get("ses_c");
      expect(state?.needsSkillReload).toBeUndefined();
    });

    it("returns null when needsSkillReload is not set", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.loadedSkills.add("dev-flow");
      });

      expect(store.consumeSkillReload("ses_c")).toBeNull();
    });

    it("returns null when loadedSkills is empty", () => {
      const store = new SessionStore({ max: 100 });
      store.upsert("ses_c", (s) => {
        s.needsSkillReload = true;
      });

      expect(store.consumeSkillReload("ses_c")).toBeNull();
    });

    it("returns null for unknown session", () => {
      const store = new SessionStore({ max: 100 });
      expect(store.consumeSkillReload("unknown")).toBeNull();
    });
  });

  describe("context warning state machine", () => {
    const nowMs = Date.now();

    it("queueContextWarning sets pending when pct >= threshold", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", {});

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(true);

      const state = store.get("ses_main");
      expect(state?.pendingContextWarningPct).toBe(75);
    });

    it("queueContextWarning returns false if already pending", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", { pendingContextWarningPct: 70 });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(false);

      const state = store.get("ses_main");
      expect(state?.pendingContextWarningPct).toBe(70); // unchanged
    });

    it("queueContextWarning returns false if sending", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", { contextWarningSending: true });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(false);

      const state = store.get("ses_main");
      expect(state?.pendingContextWarningPct).toBeUndefined();
    });

    it("queueContextWarning returns false if compacting", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", { isCompacting: true });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(false);
    });

    it("queueContextWarning returns false if cooldown not passed", () => {
      const store = new SessionStore({ max: 100 });
      const lastWarningAt = nowMs - 60_000; // 1 minute ago (less than 5 min cooldown)
      setupSession(store, "ses_main", { lastContextWarningAt: lastWarningAt });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(false);
    });

    it("queueContextWarning succeeds after cooldown passed", () => {
      const store = new SessionStore({ max: 100 });
      const cooldownMs = SessionStore.CONTEXT_WARNING_COOLDOWN_MS;
      const lastWarningAt = nowMs - cooldownMs - 10_000; // passed cooldown
      setupSession(store, "ses_main", { lastContextWarningAt: lastWarningAt });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(true);

      const state = store.get("ses_main");
      expect(state?.pendingContextWarningPct).toBe(75);
    });

    it("queueContextWarning returns false if max warnings reached", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", { contextWarningsSent: SessionStore.MAX_CONTEXT_WARNINGS });

      const result = store.queueContextWarning("ses_main", 75, nowMs);
      expect(result).toBe(false);
    });

    it("queueContextWarning returns false for unknown session", () => {
      const store = new SessionStore({ max: 100 });
      const result = store.queueContextWarning("unknown", 75, nowMs);
      expect(result).toBe(false);
    });

    describe("begin/commit/rollback", () => {
      it("beginContextWarningSend clears pending and sets sending", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", { pendingContextWarningPct: 75 });

        const pct = store.beginContextWarningSend("ses_main");
        expect(pct).toBe(75);

        const state = store.get("ses_main");
        expect(state?.pendingContextWarningPct).toBeUndefined();
        expect(state?.contextWarningSending).toBe(true);
      });

      it("beginContextWarningSend returns null if no pending", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", {});

        const pct = store.beginContextWarningSend("ses_main");
        expect(pct).toBe(null);

        const state = store.get("ses_main");
        expect(state?.contextWarningSending).toBeUndefined();
      });

      it("commitContextWarningSend clears sending and updates timestamp/count", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", { contextWarningSending: true });

        store.commitContextWarningSend("ses_main", nowMs);

        const state = store.get("ses_main");
        expect(state?.contextWarningSending).toBeUndefined();
        expect(state?.lastContextWarningAt).toBe(nowMs);
        expect(state?.contextWarningsSent).toBe(1);
      });

      it("commitContextWarningSend increments count", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", { contextWarningSending: true, contextWarningsSent: 2 });

        store.commitContextWarningSend("ses_main", nowMs);

        const state = store.get("ses_main");
        expect(state?.contextWarningsSent).toBe(3);
      });

      it("rollbackContextWarningSend restores pending and clears sending", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", { contextWarningSending: true });

        store.rollbackContextWarningSend("ses_main", 75);

        const state = store.get("ses_main");
        expect(state?.contextWarningSending).toBeUndefined();
        expect(state?.pendingContextWarningPct).toBe(75);
        expect(state?.lastContextWarningAt).toBeUndefined(); // not updated
        expect(state?.contextWarningsSent).toBeUndefined(); // not incremented
      });
    });

    describe("clearContextWarningState", () => {
      it("clears pending and sending without resetCount", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", {
          pendingContextWarningPct: 75,
          contextWarningSending: false,
          lastContextWarningAt: nowMs - 100_000,
          contextWarningsSent: 2,
        });

        store.clearContextWarningState("ses_main");

        const state = store.get("ses_main");
        expect(state?.pendingContextWarningPct).toBeUndefined();
        expect(state?.contextWarningSending).toBeUndefined();
        expect(state?.lastContextWarningAt).toBe(nowMs - 100_000); // preserved
        expect(state?.contextWarningsSent).toBe(2); // preserved
      });

      it("clears all state with resetCount: true", () => {
        const store = new SessionStore({ max: 100 });
        setupSession(store, "ses_main", {
          pendingContextWarningPct: 75,
          contextWarningSending: false,
          lastContextWarningAt: nowMs - 100_000,
          contextWarningsSent: 2,
        });

        store.clearContextWarningState("ses_main", { resetCount: true });

        const state = store.get("ses_main");
        expect(state?.pendingContextWarningPct).toBeUndefined();
        expect(state?.contextWarningSending).toBeUndefined();
        expect(state?.lastContextWarningAt).toBeUndefined();
        expect(state?.contextWarningsSent).toBeUndefined();
      });
    });
  });

  describe("compact vs warning concurrency guard (B-01 regression)", () => {
    const nowMs = Date.now();

    it("begin → markCompacting → commit: compact after begin, commit does not write lastContextWarningAt/contextWarningsSent", () => {
      const store = new SessionStore({ max: 100 });
      // Step 1: begin — enters sending state
      setupSession(store, "ses_main", { pendingContextWarningPct: 75 });
      const pct = store.beginContextWarningSend("ses_main");
      expect(pct).toBe(75);

      // Step 2: markCompacting — compact starts while send is in-flight
      store.markCompacting("ses_main", nowMs);

      // Step 3: commit — should not write lastContextWarningAt or contextWarningsSent
      store.commitContextWarningSend("ses_main", nowMs);

      const state = store.get("ses_main");
      expect(state?.contextWarningSending).toBeUndefined();
      expect(state?.lastContextWarningAt).toBeUndefined();
      expect(state?.contextWarningsSent).toBeUndefined();
    });

    it("begin → markCompacting → rollback: compact after begin, rollback does not restore pendingContextWarningPct", () => {
      const store = new SessionStore({ max: 100 });
      // Step 1: begin — enters sending state
      setupSession(store, "ses_main", { pendingContextWarningPct: 80 });
      const pct = store.beginContextWarningSend("ses_main");
      expect(pct).toBe(80);

      // Step 2: markCompacting — compact starts while send is in-flight
      store.markCompacting("ses_main", nowMs);

      // Step 3: rollback — should not restore pendingContextWarningPct
      store.rollbackContextWarningSend("ses_main", 80);

      const state = store.get("ses_main");
      expect(state?.contextWarningSending).toBeUndefined();
      expect(state?.pendingContextWarningPct).toBeUndefined();
    });

    it("markCompacting → begin: compacting state causes begin to return null and clear pending", () => {
      const store = new SessionStore({ max: 100 });
      // Step 1: set up pending warning
      setupSession(store, "ses_main", { pendingContextWarningPct: 60 });

      // Step 2: markCompacting — compact starts, clears pending (per markCompacting logic)
      store.markCompacting("ses_main", nowMs);

      // Step 3: begin — should return null since isCompacting is true
      const result = store.beginContextWarningSend("ses_main");
      expect(result).toBeNull();

      const state = store.get("ses_main");
      expect(state?.pendingContextWarningPct).toBeUndefined();
      expect(state?.contextWarningSending).toBeUndefined();
    });
  });

  describe("markCompacting clears context warning state", () => {
    const nowMs = Date.now();

    it("clears pending, sending, lastContextWarningAt, and contextWarningsSent on compact", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", {
        pendingContextWarningPct: 75,
        contextWarningSending: false,
        lastContextWarningAt: nowMs - 100_000,
        contextWarningsSent: 2,
        isCompacting: false,
      });

      store.markCompacting("ses_main", nowMs);

      const state = store.get("ses_main");
      expect(state?.isCompacting).toBe(true);
      expect(state?.pendingContextWarningPct).toBeUndefined();
      expect(state?.contextWarningSending).toBeUndefined();
      expect(state?.lastContextWarningAt).toBeUndefined();
      expect(state?.contextWarningsSent).toBeUndefined();
    });

    it("clears warning state even when trigger is plugin", () => {
      const store = new SessionStore({ max: 100 });
      setupSession(store, "ses_main", {
        pendingContextWarningPct: 80,
        contextWarningsSent: 3,
        isCompacting: false,
      });

      store.markCompacting("ses_main", nowMs, "plugin");

      const state = store.get("ses_main");
      expect(state?.compactingTrigger).toBe("plugin");
      expect(state?.pendingContextWarningPct).toBeUndefined();
      expect(state?.contextWarningsSent).toBeUndefined();
    });
  });
});
