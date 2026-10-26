import { describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdtempSync } from "fs";

// The engine delivers the sidecar Authorization header through
// `PluginInput.serverHeaders`. The v2 client built inside the plugin must
// attach it to every request — without it, an authenticated sidecar rejects
// session lookup, skill grant, and question.reply with 401. The catalog
// injection path (messages.transform) issues a session lookup, which is the
// observable request used here.
function messageWithSession(sessionID: string) {
  return {
    role: "user",
    info: { id: `msg_${sessionID}`, role: "user", sessionID },
    parts: [{ type: "text", text: "hello", sessionID }],
  };
}

describe("v2 client serverHeaders delivery", () => {
  it("attaches pluginInput.serverHeaders to outgoing v2 client requests", async () => {
    const testDir = mkdtempSync(
      path.join(os.tmpdir(), "wopal-plugin-headers-"),
    );
    process.env.WOPAL_HOME = path.join(testDir, ".wopal");

    const seenAuthorization: (string | undefined)[] = [];
    const internalFetch = vi.fn(async (input: unknown) => {
      const req = input as { headers?: Headers | Record<string, string> };
      const headers = new Headers(req.headers ?? undefined);
      seenAuthorization.push(headers.get("authorization") ?? undefined);
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as { url: string }).url,
      );
      if (url.pathname === "/skill") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const sessionMatch = url.pathname.match(/^\/session\/([^/]+)$/);
      if (sessionMatch) {
        return new Response(
          JSON.stringify({
            id: decodeURIComponent(sessionMatch[1]),
            metadata: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const mockInput = {
      client: {
        _client: { getConfig: () => ({ fetch: internalFetch }) },
      },
      project: {},
      directory: testDir,
      worktree: testDir,
      $: {},
      serverUrl: new URL("http://localhost:3000"),
      serverHeaders: { Authorization: "Basic dGVzdDpzZWNyZXQ=" },
    } as never;

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin(mockInput);

    const transform = (
      hooks as Record<
        string,
        (input: unknown, output: unknown) => Promise<unknown>
      >
    )["experimental.chat.messages.transform"];
    expect(typeof transform).toBe("function");

    const sessionID = "ses_header_test";
    await transform({}, { messages: [messageWithSession(sessionID)] });

    expect(seenAuthorization.length).toBeGreaterThan(0);
    for (const auth of seenAuthorization) {
      expect(auth).toBe("Basic dGVzdDpzZWNyZXQ=");
    }
  });

  it("sends no Authorization header when serverHeaders is absent", async () => {
    const testDir = mkdtempSync(path.join(os.tmpdir(), "wopal-plugin-noauth-"));
    process.env.WOPAL_HOME = path.join(testDir, ".wopal");

    const seenAuthorization: (string | undefined)[] = [];
    const internalFetch = vi.fn(async (input: unknown) => {
      const req = input as { headers?: Headers | Record<string, string> };
      const headers = new Headers(req.headers ?? undefined);
      seenAuthorization.push(headers.get("authorization") ?? undefined);
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as { url: string }).url,
      );
      if (url.pathname === "/skill") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const sessionMatch = url.pathname.match(/^\/session\/([^/]+)$/);
      if (sessionMatch) {
        return new Response(
          JSON.stringify({
            id: decodeURIComponent(sessionMatch[1]),
            metadata: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const mockInput = {
      client: {
        _client: { getConfig: () => ({ fetch: internalFetch }) },
      },
      project: {},
      directory: testDir,
      worktree: testDir,
      $: {},
      serverUrl: new URL("http://localhost:3000"),
    } as never;

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin(mockInput);

    const transform = (
      hooks as Record<
        string,
        (input: unknown, output: unknown) => Promise<unknown>
      >
    )["experimental.chat.messages.transform"];
    expect(typeof transform).toBe("function");

    const sessionID = "ses_header_noauth";
    await transform({}, { messages: [messageWithSession(sessionID)] });

    expect(seenAuthorization.length).toBeGreaterThan(0);
    for (const auth of seenAuthorization) {
      expect(auth).toBeUndefined();
    }
  });

  it("falls back to v1 client config headers when serverHeaders is absent", async () => {
    const testDir = mkdtempSync(
      path.join(os.tmpdir(), "wopal-plugin-fallback-auth-"),
    );
    process.env.WOPAL_HOME = path.join(testDir, ".wopal");

    const seenAuthorization: (string | undefined)[] = [];
    const internalFetch = vi.fn(async (input: unknown) => {
      const req = input as { headers?: Headers | Record<string, string> };
      const headers = new Headers(req.headers ?? undefined);
      seenAuthorization.push(headers.get("authorization") ?? undefined);
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as { url: string }).url,
      );
      if (url.pathname === "/skill") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const sessionMatch = url.pathname.match(/^\/session\/([^\/]+)$/);
      if (sessionMatch) {
        return new Response(
          JSON.stringify({
            id: decodeURIComponent(sessionMatch[1]),
            metadata: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const mockInput = {
      client: {
        _client: {
          getConfig: () => ({
            fetch: internalFetch,
            headers: { Authorization: "Basic ZmFsbGJhY2s6YXV0aA==" },
          }),
        },
      },
      project: {},
      directory: testDir,
      worktree: testDir,
      $: {},
      serverUrl: new URL("http://localhost:3000"),
    } as never;

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin(mockInput);

    const transform = (
      hooks as Record<
        string,
        (input: unknown, output: unknown) => Promise<unknown>
      >
    )["experimental.chat.messages.transform"];
    expect(typeof transform).toBe("function");

    const sessionID = "ses_header_fallback";
    await transform({}, { messages: [messageWithSession(sessionID)] });

    expect(seenAuthorization.length).toBeGreaterThan(0);
    for (const auth of seenAuthorization) {
      expect(auth).toBe("Basic ZmFsbGJhY2s6YXV0aA==");
    }
  });
});
