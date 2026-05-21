import { describe, it, expect } from "vitest";
import { SessionStore } from "./session-store.js";

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
});
