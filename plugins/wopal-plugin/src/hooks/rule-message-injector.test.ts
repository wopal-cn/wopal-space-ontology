import { describe, it, expect } from "vitest";
import { extractAgentName } from "./message-context.js";
import type { MessageWithInfo } from "./message-context.js";

describe("extractAgentName", () => {
  it("returns agent from latest message with info.agent", () => {
    const messages: MessageWithInfo[] = [
      { info: { agent: "wopal" } },
      { info: { agent: "fae" } },
    ];
    expect(extractAgentName(messages)).toBe("fae");
  });

  it("skips messages without info.agent and returns the first found going backwards", () => {
    const messages: MessageWithInfo[] = [
      { info: { agent: "wopal" } },
      { role: "user", parts: [] },
      { info: {} },
    ];
    expect(extractAgentName(messages)).toBe("wopal");
  });

  it("returns undefined when no message has info.agent", () => {
    const messages: MessageWithInfo[] = [
      { role: "user", parts: [] },
      { info: { sessionID: "ses_1" } },
    ];
    expect(extractAgentName(messages)).toBeUndefined();
  });

  it("returns undefined for empty messages array", () => {
    expect(extractAgentName([])).toBeUndefined();
  });
});
