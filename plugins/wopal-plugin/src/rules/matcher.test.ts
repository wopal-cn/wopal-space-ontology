import { describe, it, expect } from "vitest";
import { promptMatchesKeywords } from "./matcher.js";

describe("promptMatchesKeywords", () => {
  it("should return true when keyword matches prompt", () => {
    expect(
      promptMatchesKeywords("I need help testing this function", ["testing"]),
    ).toBe(true);
  });

  it("should return false when keyword does not match prompt", () => {
    expect(
      promptMatchesKeywords("help me with the database", ["testing", "jest"]),
    ).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(promptMatchesKeywords("testing", ["Testing"])).toBe(true);
    expect(promptMatchesKeywords("TESTING", ["testing"])).toBe(true);
  });

  it("should match at word boundaries (start of word)", () => {
    // "test" should match "testing" (word boundary at start, keyword is prefix)
    expect(promptMatchesKeywords("I am testing this", ["test"])).toBe(true);
  });

  it("should not match mid-word", () => {
    // "test" should NOT match "contest" (not at word boundary)
    expect(promptMatchesKeywords("I entered a contest", ["test"])).toBe(false);
  });

  it("should handle multi-word keywords", () => {
    expect(
      promptMatchesKeywords("I need help with unit test coverage", [
        "unit test",
      ]),
    ).toBe(true);
  });

  it("should return true if any keyword matches (OR logic)", () => {
    expect(
      promptMatchesKeywords("please help with jest", [
        "testing",
        "jest",
        "vitest",
      ]),
    ).toBe(true);
  });

  it("should return false for empty keywords array", () => {
    expect(promptMatchesKeywords("some prompt", [])).toBe(false);
  });

  it("should return false for empty prompt", () => {
    expect(promptMatchesKeywords("", ["testing"])).toBe(false);
  });

  it("should escape special regex characters in keywords", () => {
    // "test.ts" keyword should match literally (dot is escaped)
    expect(promptMatchesKeywords("file.test.ts", ["test.ts"])).toBe(true);
    // Verify that without escaping, ".ts" would match anything like "tests" (but it doesn't)
    expect(promptMatchesKeywords("run tests now", ["test.ts"])).toBe(false);
  });

  // Chinese and CJK character support tests
  it("should match Chinese keywords as substring (no word boundary)", () => {
    // Chinese has no word boundaries, so substring matching should work
    expect(promptMatchesKeywords("帮我开发技能吧", ["开发技能"])).toBe(true);
    expect(promptMatchesKeywords("我需要开发技能", ["开发技能"])).toBe(true);
    expect(promptMatchesKeywords("开发技能很重要", ["开发技能"])).toBe(true);
  });

  it("should match mixed Chinese-English keywords", () => {
    // When keyword starts with Chinese, no leading boundary restriction
    expect(promptMatchesKeywords("我需要实现skill技能", ["实现skill"])).toBe(
      true,
    );
    expect(promptMatchesKeywords("自动实现skill", ["实现skill"])).toBe(true);
  });

  it("should apply word boundary for English-starting mixed keywords", () => {
    // When keyword starts with English, leading word boundary applies
    expect(promptMatchesKeywords("start app部署", ["app部署"])).toBe(true);
    // Should NOT match when English part is mid-word
    expect(promptMatchesKeywords("testapp部署", ["app部署"])).toBe(false);
  });

  // Wildcard support tests
  it("should support wildcard * for flexible matching", () => {
    // Chinese with wildcard
    expect(promptMatchesKeywords("请开发一个牛逼的技能", ["开发*技能"])).toBe(
      true,
    );
    expect(
      promptMatchesKeywords("请你开发一个游戏技能来帮我", ["*开发*技能*"]),
    ).toBe(true);
    expect(promptMatchesKeywords("搜索一下本地的技能", ["搜索*技能"])).toBe(
      true,
    );
    // Wildcard with empty middle should also match
    expect(promptMatchesKeywords("开发技能", ["开发*技能"])).toBe(true);
  });

  it("should support wildcard with English keywords", () => {
    expect(
      promptMatchesKeywords("I need to deploy my awesome skill", [
        "deploy*skill",
      ]),
    ).toBe(true);
    // Wildcard removes leading boundary restriction
    expect(promptMatchesKeywords("autodeploy my skill", ["*deploy*"])).toBe(
      true,
    );
  });

  it("should maintain backward compatibility for English word boundaries", () => {
    // Original English word boundary behavior should be preserved
    expect(promptMatchesKeywords("I entered a contest", ["test"])).toBe(false);
    expect(promptMatchesKeywords("I am testing this", ["test"])).toBe(true);
    expect(promptMatchesKeywords("testing", ["test"])).toBe(true);
  });
});