import { describe, it, expect } from "vitest";
import type { OpenCodeSession } from "./types.js";

describe("OpenCodeSession", () => {
  it("has optional summarize method with correct signature", () => {
    const session: OpenCodeSession = {
      get: async () => undefined,
      messages: async () => undefined,
      promptAsync: async () => undefined,
      abort: async () => undefined,
      update: async () => undefined,
      // summarize omitted — should be valid (optional)
    };

    // Optional: summarize may be undefined
    expect(session.summarize).toBeUndefined();
  });

  it("accepts summarize with SDK-compatible parameters", async () => {
    let capturedArgs: unknown = null;

    const session: OpenCodeSession = {
      get: async () => undefined,
      messages: async () => undefined,
      promptAsync: async () => undefined,
      abort: async () => undefined,
      update: async () => undefined,
      summarize: async (args) => {
        capturedArgs = args;
        return { status: "ok" };
      },
    };

    const result = await session.summarize!({
      path: { id: "ses_abc123" },
      body: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    });

    expect(result).toEqual({ status: "ok" });
    expect(capturedArgs).toEqual({
      path: { id: "ses_abc123" },
      body: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    });
  });

  it("accepts summarize with optional query parameter", async () => {
    let capturedArgs: unknown = null;

    const session: OpenCodeSession = {
      get: async () => undefined,
      messages: async () => undefined,
      promptAsync: async () => undefined,
      abort: async () => undefined,
      update: async () => undefined,
      summarize: async (args) => {
        capturedArgs = args;
        return undefined;
      },
    };

    await session.summarize!({
      path: { id: "ses_abc123" },
      body: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
      query: { directory: "/workspace" },
    });

    expect(capturedArgs).toEqual({
      path: { id: "ses_abc123" },
      body: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
      query: { directory: "/workspace" },
    });
  });
});
