/**
 * dsh-tool-adapter — experiment 2 tests (P3.5 dynamic provider).
 *
 * The adapter now registers a `tool.provider` hook instead of a static
 * `tool` table, so the tool set is read from the container's live schemas on
 * every model request. There is no per-tool mapping table: enabling the
 * sandbox projects the fixed set (grep/glob/read/write/edit/str_replace_editor/
 * bash) that the container exposes, each shadowing the same-name builtin.
 * Verifies:
 *  - `sandbox.enabled:false` (or absent) idles the projection: no
 *    `tool.provider` is registered, so builtin tools run untouched
 *  - `sandbox.enabled:true` projects the container's fixed-set tools onto
 *    their same-name slots
 *  - the provider reads the current container schemas per call, so adding or
 *    removing container tools shows up on the next provider invocation
 *  - absent container degrades to a provider that silently returns no tools
 *  - a projected tool absent from the container is skipped
 *  - `sandbox.enabled:true` seeds the configured mode (`read-only` or
 *    `workspace-write`, default `workspace-write`) as a `sandbox/mode` event
 *  - execute passes a per-call agent with header.id/header.cwd only (no
 *    container session is created)
 *  - the session facade owns a private events array (deep-copied sandbox
 *    seed) and exposes `append(type, data)` for audit pairs
 *  - every tools.execute() is wrapped in a turn boundary: `turn/start` before
 *    dispatch, `turn/end` in a finally (closed even when the tool throws),
 *    reference-counted so concurrent calls on the same session emit exactly
 *    one start/end pair at the outermost nesting level
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";

type ContainerLogger = {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
};

// An approval/request waterfall listener: dsh dispatches (req, next); the
// listener either answers with an ApprovalOutcome or delegates via next().
type ApprovalAnswerer = (req: unknown, next: () => unknown) => unknown;

type Container = {
  get(name: "tools"):
    | {
        schemas(): { name: string; description: string; parameters: unknown }[];
        execute(exec: unknown): Promise<{
          isError: boolean;
          content?: { type: string; text?: string }[];
          error?: { message?: string };
          meta?: unknown;
        }>;
      }
    | undefined;
  logger(name: string): ContainerLogger;
  /** Optional: the real cordis ctx exposes on(); fakes may capture listeners. */
  on?(event: string, handler: ApprovalAnswerer): unknown;
};

type AdapterOptions = {
  sandbox?: { enabled: boolean; mode?: string };
  escalation?: "ask" | "never";
};

/** Sandbox-on options: the only shape that mounts the tool projection. */
function sandboxOn(mode?: "read-only" | "workspace-write"): AdapterOptions {
  return { sandbox: mode ? { enabled: true, mode } : { enabled: true } };
}

type ToolCtx = {
  sessionID: string;
  directory: string;
  worktree: string;
  callID?: string;
  extra?: { sandboxMode?: string };
  ask(input: {
    permission: string;
    patterns: string[];
    always: string[];
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

type Projected = {
  execute: (
    args: unknown,
    ctx: ToolCtx,
  ) => Promise<{ output: string; metadata: Record<string, unknown> }>;
};

/**
 * Read the facade's event log through the rc.1 Session contract
 * (`snapshotEvents()`), flattening to the plain {type, data} shape the
 * assertions compare against; the `seq`/`time` fields the log also carries
 * stay out of the projection so fold assertions keep their original shape.
 */
function eventsOf(exec: unknown): { type: string; data: unknown }[] {
  const session = (
    exec as {
      agent?: {
        session?: {
          snapshotEvents?: (from?: number, to?: number) => unknown[];
        };
      };
    }
  ).agent?.session;
  return (session?.snapshotEvents?.() ?? []).map((event) => {
    const e = event as { type: string; data: unknown };
    return { type: e.type, data: e.data };
  });
}

type ToolsService = {
  schemas(): { name: string; description: string; parameters: unknown }[];
  execute(exec: unknown): Promise<{
    isError: boolean;
    content?: { type: string; text?: string }[];
    error?: { message?: string };
    meta?: unknown;
  }>;
};

function fakeContainer(
  tools?: Partial<ToolsService>,
  overrides?: Partial<Pick<Container, "get">>,
): Container {
  const loggers = new Map<string, ContainerLogger>();
  return {
    get(name) {
      if (name !== "tools") return undefined;
      return {
        schemas: () => [
          {
            name: "grep",
            description: "dsh grep (ripgrep-backed)",
            parameters: {},
          },
          { name: "glob", description: "dsh glob", parameters: {} },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "NEEDLE-here" }],
        }),
        ...tools,
      };
    },
    logger(name) {
      let logger = loggers.get(name);
      if (!logger) {
        logger = { info: () => {}, warn: () => {}, error: () => {} };
        loggers.set(name, logger);
      }
      return logger;
    },
    ...overrides,
  };
}

/**
 * A fake cordis container ctx that records `on` listeners and can dispatch
 * the `approval/request` waterfall, while still serving `tools`/`logger`
 * like the real container. Used in answerer tests: the adapter registers its
 * answerer via `container.on`, so tests exercise the mapping by dispatching
 * a captured listener.
 */
function fakeContainerCtx(tools?: Partial<ToolsService>): {
  get(name: "tools"): ToolsService | undefined;
  logger(name: string): ContainerLogger;
  on(event: string, handler: ApprovalAnswerer): unknown;
  dispatchApprovalRequest(req: unknown): unknown;
} {
  const inner = fakeContainer(tools);
  const listeners = new Map<string, ApprovalAnswerer[]>();
  return {
    get: (name) => inner.get(name),
    logger: (name) => inner.logger(name),
    on(event, handler) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
    },
    dispatchApprovalRequest(req: unknown) {
      // Mirror cordis waterfall: outermost listener composes around next().
      let chain: ApprovalAnswerer = () => "unavailable";
      for (const handler of [
        ...(listeners.get("approval/request") ?? []),
      ].reverse()) {
        const innerNext = chain;
        chain = (req2: unknown) => handler(req2, () => innerNext(req2));
      }
      return chain(req);
    },
  };
}

let mod: {
  dshAdapter: (
    input: unknown,
    options?: AdapterOptions,
  ) => Promise<Record<string, unknown>>;
};

type ProviderOutput = { tools: Record<string, unknown> };

async function invokeProvider(
  out: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const provider = out["tool.provider"] as (
    input: unknown,
    output: ProviderOutput,
  ) => Promise<void>;
  const output: ProviderOutput = { tools: {} };
  await provider({}, output);
  return output.tools;
}

// The adapter reads no config files: behavior config arrives on the
// engine-delivered `PluginInput.pluginConfig` table, so the suite needs no
// WOPAL_HOME / settings isolation.
beforeEach(async () => {
  mod = await import("./index");
});

afterEach(() => {
  delete globalThis.__ellamakaDshContainer;
});

describe("dsh-adapter projection", () => {
  test("sandbox off idles the projection: no tool.provider is registered", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, { sandbox: { enabled: false } });
    expect(out).toEqual({});
  });

  test("sandbox absent idles the projection: no tool.provider is registered", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, {});
    expect(out).toEqual({});
  });

  test("sandbox on projects every container tool in the fixed set (same-name shadow)", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, sandboxOn());
    expect(Object.keys(out)).toEqual(["tool.provider"]);
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual(["grep", "glob"]);
    expect((tools.grep as { description: string }).description).toContain(
      "dsh",
    );
  });

  test("missing container degrades to a provider that returns no tools", async () => {
    delete (globalThis as Record<string, unknown>).__ellamakaDshContainer;
    const out = await mod.dshAdapter({}, sandboxOn());
    expect(Object.keys(out)).toEqual(["tool.provider"]);
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual([]);
  });

  test("a projected tool absent from the container is skipped", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          { name: "glob", description: "dsh glob", parameters: {} },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual(["glob"]);
  });

  test("provider reflects container schema additions across invocations", async () => {
    const schemas: {
      name: string;
      description: string;
      parameters: unknown;
    }[] = [
      { name: "grep", description: "dsh grep", parameters: {} },
      { name: "glob", description: "dsh glob", parameters: {} },
    ];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => schemas,
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    expect(Object.keys(await invokeProvider(out))).toEqual(["grep", "glob"]);

    schemas.push({ name: "bash", description: "dsh bash", parameters: {} });
    expect(Object.keys(await invokeProvider(out))).toEqual([
      "grep",
      "glob",
      "bash",
    ]);

    schemas.splice(0, 1);
    expect(Object.keys(await invokeProvider(out))).toEqual(["glob", "bash"]);
  });

  test("execute closure propagates container output with dsh-container metadata", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const res = await tool.execute(
      {},
      { sessionID: "ses-meta", directory: "/w" },
    );
    expect(res.output).toBe("NEEDLE-here");
    expect(res.metadata.source).toBe("dsh-container");
  });

  test("execute passes a reusable session facade with header id, cwd, and events", async () => {
    const captured: { exec: unknown; eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ exec, eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctx = {
      sessionID: "ses-abc",
      directory: "/ellamaka/ws",
      worktree: "/ellamaka",
      ask: async () => {},
    };
    await tool.execute({}, ctx);
    await tool.execute({}, ctx);
    const first = captured[0];
    const repeated = captured[1] as { exec: { agent?: { session?: object } } };
    const exec = first.exec as {
      agent?: {
        session?: {
          header?: { id?: string; cwd?: string };
          events?: unknown[];
        };
      };
    };
    expect(exec.agent?.session?.header?.id).toBe("ses-abc");
    expect(exec.agent?.session?.header?.cwd).toBe("/ellamaka/ws");
    // Sandbox on (no explicit mode) -> adapter seeds workspace-write; the
    // dispatch happens inside an open turn (snapshot taken before the
    // finally-closed turn/end is appended).
    expect(first.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
    ]);
    expect(repeated.exec.agent?.session).toBe(exec.agent?.session);
  });

  test("session facade owns a private events array per session", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctxA = {
      sessionID: "ses-a",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    const ctxB = {
      sessionID: "ses-b",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    await tool.execute({}, ctxA);
    await tool.execute({}, ctxB);
    const execA = captured[0] as { agent?: { session?: unknown } };
    const execB = captured[1] as { agent?: { session?: unknown } };
    const eventsA = eventsOf(execA);
    const eventsB = eventsOf(execB);
    // Per-session arrays: appending turn events for session A must not leak
    // into session B's log (the shared sandboxEvents array would break this).
    expect(eventsA).not.toBe(eventsB);
    expect(eventsB).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
      { type: "turn/end", data: {} },
    ]);
  });

  test("facade append pushes typed events onto the session events array", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctx = {
      sessionID: "ses-append",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    await tool.execute({}, ctx);
    await tool.execute({}, ctx);
    // Both dispatches run inside the SAME session facade (cached by
    // sessionID). The live events array ends with two closed turn pairs —
    // the append surface approval/asked will use between them.
    const exec = captured[1] as { agent?: { session?: unknown } };
    expect(eventsOf(exec)).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
      { type: "turn/end", data: {} },
      { type: "turn/start", data: {} },
      { type: "turn/end", data: {} },
    ]);
  });

  test("execute closes the turn when the tool throws", async () => {
    const captured: { session?: unknown }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          // Capture the live session reference: the facade's finally block
          // appends the closing turn/end to this same seq-numbered log after
          // the tool throws.
          captured.push({
            session: (exec as { agent?: { session?: unknown } }).agent?.session,
          });
          throw new Error("boom");
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await expect(
      tool.execute(
        {},
        {
          sessionID: "ses-throw",
          directory: "/w",
          worktree: "/w",
          ask: async () => {},
        },
      ),
    ).rejects.toThrow("boom");
    // finally-closed: hasOpenTurn's reverse scan must see turn/end after the
    // matching turn/start, or the approval precondition breaks on the next call.
    const session = captured[0]?.session as {
      snapshotEvents(): { type: string }[];
    };
    const events = session.snapshotEvents();
    expect(events[events.length - 1].type).toBe("turn/end");
  });

  test("concurrent executes share one outermost turn pair (reference counting)", async () => {
    const captured: { session?: unknown }[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push({
            session: (exec as { agent?: { session?: unknown } }).agent?.session,
          });
          await gate;
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctx = {
      sessionID: "ses-concurrent",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    // Two calls dispatched in parallel on the same session; both block inside
    // the container until `release`.
    const first = tool.execute({}, ctx);
    const second = tool.execute({}, ctx);
    release();
    await Promise.all([first, second]);
    const session = captured[0]?.session as
      | { snapshotEvents(): { type: string }[] }
      | undefined;
    const events = session?.snapshotEvents() ?? [];
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === "turn/start")).toHaveLength(1);
    expect(types.filter((type) => type === "turn/end")).toHaveLength(1);
    expect(types[0]).toBe("sandbox/mode");
    expect(types[1]).toBe("turn/start");
    expect(types[types.length - 1]).toBe("turn/end");
  });

  test("execute preserves ellamaka file and external-directory permission gates", async () => {
    const asks: {
      permission: string;
      patterns: string[];
      always: string[];
      metadata: Record<string, unknown>;
    }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "read",
            description: "dsh read",
            parameters: { properties: { file_path: { type: "string" } } },
          },
          {
            name: "write",
            description: "dsh write",
            parameters: {
              properties: {
                file_path: { type: "string" },
                content: { type: "string" },
              },
            },
          },
          {
            name: "edit",
            description: "dsh edit",
            parameters: {
              properties: {
                file_path: { type: "string" },
                old_string: { type: "string" },
                new_string: { type: "string" },
              },
            },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const ctx = {
      sessionID: "ses-permission",
      directory: "/workspace/app",
      worktree: "/workspace",
      ask: async (input: {
        permission: string;
        patterns: string[];
        always: string[];
        metadata: Record<string, unknown>;
      }) => {
        asks.push(input);
      },
    };

    await (tools.read as Projected).execute({ filePath: "src/file.ts" }, ctx);
    await (tools.write as Projected).execute(
      { filePath: "/outside/file.ts", content: "next" },
      ctx,
    );
    await (tools.edit as Projected).execute(
      { filePath: "src/file.ts", oldString: "before", newString: "after" },
      ctx,
    );

    expect(asks).toEqual([
      {
        permission: "read",
        patterns: ["app/src/file.ts"],
        always: ["*"],
        metadata: {},
      },
      {
        permission: "external_directory",
        patterns: ["/outside/*"],
        always: ["/outside/*"],
        metadata: { filepath: "/outside/file.ts", parentDir: "/outside" },
      },
      {
        permission: "edit",
        patterns: ["../outside/file.ts"],
        always: ["*"],
        metadata: {},
      },
      {
        permission: "edit",
        patterns: ["app/src/file.ts"],
        always: ["*"],
        metadata: {},
      },
    ]);
  });

  test("str_replace_editor preserves read, edit, and external-directory gates by command", async () => {
    const asks: {
      permission: string;
      patterns: string[];
      always: string[];
      metadata: Record<string, unknown>;
    }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "str_replace_editor",
            description: "dsh editor",
            parameters: {
              properties: {
                command: { type: "string" },
                path: { type: "string" },
              },
            },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const editor = tools.str_replace_editor as Projected;
    const ctx = {
      sessionID: "ses-editor-permission",
      directory: "/workspace/app",
      worktree: "/workspace",
      ask: async (input: {
        permission: string;
        patterns: string[];
        always: string[];
        metadata: Record<string, unknown>;
      }) => {
        asks.push(input);
      },
    };

    await editor.execute(
      { command: "view", path: "/workspace/app/file.ts" },
      ctx,
    );
    await editor.execute(
      { command: "create", path: "/outside/new.ts", file_text: "created" },
      ctx,
    );

    expect(asks).toEqual([
      {
        permission: "read",
        patterns: ["app/file.ts"],
        always: ["*"],
        metadata: {},
      },
      {
        permission: "external_directory",
        patterns: ["/outside/*"],
        always: ["/outside/*"],
        metadata: { filepath: "/outside/new.ts", parentDir: "/outside" },
      },
      {
        permission: "edit",
        patterns: ["../outside/new.ts"],
        always: ["*"],
        metadata: {},
      },
    ]);
  });

  test("projects pwsh as logical bash and preserves its permission gate and cancellation", async () => {
    const asks: unknown[] = [];
    const calls: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "pwsh",
            description: "PowerShell command",
            parameters: {
              properties: {
                command: { type: "string" },
                description: { type: "string" },
              },
              required: ["command", "description"],
            },
          },
        ],
        execute: async (input: unknown) => {
          calls.push(input);
          return {
            isError: false,
            content: [{ type: "text", text: "pwsh-ok" }],
          };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual(["bash"]);
    const controller = new AbortController();
    const ctx = {
      sessionID: "ses-pwsh",
      directory: "/workspace/app",
      worktree: "/workspace",
      abort: controller.signal,
      ask: async (input: unknown) => {
        asks.push(input);
      },
    };
    const result = await (tools.bash as Projected).execute(
      { command: "Get-Location", description: "Read cwd" },
      ctx,
    );
    expect(asks).toEqual([
      {
        permission: "bash",
        patterns: ["Get-Location"],
        always: ["Get-Location"],
        metadata: {},
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "pwsh",
      arguments: { command: "Get-Location", description: "Read cwd" },
      signal: controller.signal,
    });
    expect(result.output).toBe("pwsh-ok");
    expect(result.metadata.containerTool).toBe("pwsh");
  });

  test("does not dispatch pwsh when logical shell permission is rejected", async () => {
    let executed = false;
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "pwsh",
            description: "PowerShell",
            parameters: { properties: { command: { type: "string" } } },
          },
        ],
        execute: async () => {
          executed = true;
          return { isError: false };
        },
      });
    const tools = await invokeProvider(await mod.dshAdapter({}, sandboxOn()));
    const call = (tools.bash as Projected).execute(
      { command: "Get-Location" },
      {
        sessionID: "ses-pwsh-denied",
        directory: "/workspace",
        worktree: "/workspace",
        ask: async () => {
          throw new Error("permission denied");
        },
      },
    );
    await expect(call).rejects.toThrow("permission denied");
    expect(executed).toBe(false);
  });

  test("bash preserves ellamaka's command permission gate", async () => {
    const asks: {
      permission: string;
      patterns: string[];
      always: string[];
      metadata: Record<string, unknown>;
    }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "bash",
            description: "dsh bash",
            parameters: {
              properties: {
                command: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const bash = tools.bash as Projected;
    const ctx = {
      sessionID: "ses-bash-permission",
      directory: "/workspace/app",
      worktree: "/workspace",
      ask: async (input: {
        permission: string;
        patterns: string[];
        always: string[];
        metadata: Record<string, unknown>;
      }) => {
        asks.push(input);
      },
    };

    await bash.execute(
      { command: "printf adapter-ok", description: "Print adapter proof" },
      ctx,
    );

    expect(asks).toEqual([
      {
        permission: "bash",
        patterns: ["printf adapter-ok"],
        always: ["printf adapter-ok"],
        metadata: {},
      },
    ]);
  });

  test("projects a dsh JSON Schema document into a ZodRawShape args map", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "grep",
            description: "dsh grep (ripgrep-backed)",
            parameters: {
              type: "object",
              properties: {
                pattern: {
                  type: "string",
                  required: true,
                  description: "Regular expression",
                },
                path: {
                  type: "string",
                  description: "File or directory to search",
                },
              },
              required: ["pattern"],
            },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as { args: Record<string, unknown> };
    // The plugin SDK contract is a ZodRawShape: each property value is a Zod
    // type. The registry's fromPlugin path detects this and generates the
    // correct flat JSON Schema (not a nested document-as-properties schema).
    expect(Object.keys(tool.args)).toEqual(["pattern", "path"]);
    expect("_zod" in (tool.args.pattern as object)).toBe(true);
    expect("_zod" in (tool.args.path as object)).toBe(true);
  });

  test("sandbox enabled injects sandbox/mode event into session facade", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "read-only" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-sandbox",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("sandbox enabled without mode defaults to workspace-write", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-default",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("sandbox disabled idles the projection (no facade, no events)", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, { sandbox: { enabled: false } });
    // No tool.provider: the builtin tools run untouched and no facade is built.
    expect(out).toEqual({});
  });

  test("sandbox config absent idles the projection (no facade, no events)", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, {});
    expect(out).toEqual({});
  });

  test("extra.sandboxMode read-only overrides a full-access space default", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-override",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "read-only" },
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("extra.sandboxMode full-access overrides a workspace-write space default", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "workspace-write" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-loosen",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "full-access" },
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "sandbox/mode", data: { mode: "danger-full-access" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("extra.sandboxMode equal to the space default appends a fresh event (idempotent fold)", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "read-only" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-same",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "read-only" },
        ask: async () => {},
      },
    );
    // Explicit choices always append. Folding the same value again is
    // harmless and keeps the rule uniform: any per-message choice wins over
    // whatever the facade carried before.
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("extra.sandboxMode matching the space default still overrides a previous per-message choice", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "workspace-write" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    // Turn 1: user chose read-only — appended, effective mode is read-only.
    await tool.execute(
      {},
      {
        sessionID: "ses-switch-back",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "read-only" },
        ask: async () => {},
      },
    );
    // Turn 2: user switches back to the space default (workspace-write). The
    // facade still carries the read-only event from turn 1, so the adapter
    // MUST append a fresh event — LAST-wins is the only way to restore the
    // default. Skipping the append because the value equals the space default
    // left the session stuck in read-only.
    await tool.execute(
      {},
      {
        sessionID: "ses-switch-back",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "workspace-write" },
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
    ]);
    // Turn 2 sees turn 1's closed boundary (turn/end) still in the log, then
    // the fresh workspace-write append restores the default via LAST-wins.
    expect(captured[1]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
      { type: "turn/end", data: {} },
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("mode override is per-session: another session keeps the space default", async () => {
    const captured: { eventsAtDispatch: unknown[] }[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          const events = eventsOf(exec);
          captured.push({ eventsAtDispatch: [...events] });
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "read-only" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-a",
        directory: "/w",
        worktree: "/w",
        extra: { sandboxMode: "workspace-write" },
        ask: async () => {},
      },
    );
    await tool.execute(
      {},
      {
        sessionID: "ses-b",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(captured[0]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "sandbox/mode", data: { mode: "workspace-write" } },
      { type: "turn/start", data: {} },
    ]);
    expect(captured[1]?.eventsAtDispatch).toEqual([
      { type: "sandbox/mode", data: { mode: "read-only" } },
      { type: "turn/start", data: {} },
    ]);
  });

  test("execute logs the tool call through the container logger", async () => {
    const logged: { level: string; message: string; extra?: unknown }[] = [];
    const container = fakeContainer();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer = container;
    const logger = container.logger("dsh-adapter");
    logger.info = (message, extra) =>
      logged.push({ level: "info", message, extra });
    logger.error = (message, extra) =>
      logged.push({ level: "error", message, extra });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      { pattern: "needle" },
      { sessionID: "ses-log", directory: "/w", callID: "call-1" },
    );
    expect(logged.length).toBe(1);
    expect(logged[0].level).toBe("info");
    expect(logged[0].message).toBe("tool call");
    expect(logged[0].extra).toMatchObject({
      tool: "grep",
      sessionID: "ses-log",
      callID: "call-1",
    });
  });

  test("execute logs tool errors through the container logger", async () => {
    const logged: { level: string; message: string; extra?: unknown }[] = [];
    const container = fakeContainer({
      execute: async () => ({ isError: true, error: { message: "boom" } }),
    });
    (globalThis as Record<string, unknown>).__ellamakaDshContainer = container;
    const logger = container.logger("dsh-adapter");
    logger.error = (message, extra) =>
      logged.push({ level: "error", message, extra });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await expect(
      tool.execute(
        { pattern: "needle" },
        { sessionID: "ses-log", directory: "/w" },
      ),
    ).rejects.toThrow("boom");
    expect(logged.length).toBe(1);
    expect(logged[0].level).toBe("error");
    expect(logged[0].message).toBe("tool call failed");
    expect(logged[0].extra).toMatchObject({
      tool: "grep",
      sessionID: "ses-log",
    });
  });

  test("execute projects dsh meta.diffs into ellamaka filediff metadata", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: {
              properties: {
                file_path: { type: "string" },
                old_string: { type: "string" },
                new_string: { type: "string" },
              },
            },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          meta: {
            diffs: [
              {
                path: "/workspace/app/src/file.ts",
                oldText: "unchanged\nold\n",
                newText: "unchanged\nnew\n",
              },
            ],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      {
        filePath: "/workspace/app/src/file.ts",
        oldString: "old",
        newString: "new",
      },
      {
        sessionID: "ses-diff",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    const filediff = res.metadata.filediff as {
      file: string;
      before: string;
      after: string;
      additions: number;
      deletions: number;
    };
    expect(filediff.file).toBe("/workspace/app/src/file.ts");
    expect(filediff.before).toBe("unchanged\nold\n");
    expect(filediff.after).toBe("unchanged\nnew\n");
    // Only the changed line counts; the shared context line is not a change.
    expect(filediff.additions).toBe(1);
    expect(filediff.deletions).toBe(1);
    // Without a validated full-file value the adapter emits no unified patch —
    // meta.diffs carry no absolute line positions, so one would be fabricated.
    expect(res.metadata.diff).toBeUndefined();
  });

  test("execute maps dsh snake_case args to ellamaka camelCase before dispatch", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: {
              properties: {
                file_path: { type: "string" },
                old_string: { type: "string" },
                new_string: { type: "string" },
              },
            },
          },
        ],
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    await tool.execute(
      {
        filePath: "/workspace/app/src/file.ts",
        oldString: "before",
        newString: "after",
      },
      {
        sessionID: "ses-map",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    const exec = captured[0] as { arguments?: Record<string, unknown> };
    expect(exec.arguments).toEqual({
      file_path: "/workspace/app/src/file.ts",
      old_string: "before",
      new_string: "after",
    });
  });

  test("execute preserves unmapped args unchanged when dispatching", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "write",
            description: "dsh write",
            parameters: {
              properties: {
                file_path: { type: "string" },
                content: { type: "string" },
              },
            },
          },
        ],
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.write as Projected;
    await tool.execute(
      { filePath: "/workspace/app/src/file.ts", content: "hello" },
      {
        sessionID: "ses-unmapped",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    const exec = captured[0] as { arguments?: Record<string, unknown> };
    expect(exec.arguments).toEqual({
      file_path: "/workspace/app/src/file.ts",
      content: "hello",
    });
  });

  test("filediffFromMeta degrades to undefined on malformed meta", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: { diffs: [{ path: "x", newText: null }] },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/workspace/app/src/file.ts" },
      {
        sessionID: "ses-malformed",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    expect(res.metadata.filediff).toBeUndefined();
  });

  test("filediffFromMeta counts repeated-line changes correctly", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: {
            diffs: [
              { path: "/w/f.ts", oldText: "same\nsame\n", newText: "same\n" },
            ],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-repeat",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    const filediff = res.metadata.filediff as {
      additions: number;
      deletions: number;
    };
    // One repeated line removed; the surviving "same" line is not a change.
    expect(filediff.additions).toBe(0);
    expect(filediff.deletions).toBe(1);
  });

  test("filediffFromMeta counts pure insertion with no deletions", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "write",
            description: "dsh write",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: {
            diffs: [{ path: "/w/f.ts", oldText: null, newText: "new\nline\n" }],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.write as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-insert",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    const filediff = res.metadata.filediff as {
      additions: number;
      deletions: number;
    };
    expect(filediff.additions).toBe(2);
    expect(filediff.deletions).toBe(0);
  });

  test("write retains its existing metadata projection when a full result value is present", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "write",
            description: "dsh write",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          value: {
            path: "/w/f.ts",
            operation: "update",
            before: "old\n",
            after: "new\n",
          },
          meta: {
            diffs: [{ path: "/w/f.ts", oldText: "old\n", newText: "new\n" }],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const res = await (tools.write as Projected).execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-write-value",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(res.metadata.diff).toBeUndefined();
    expect(res.metadata.filediff).toEqual({
      file: "/w/f.ts",
      before: "old\n",
      after: "new\n",
      additions: 1,
      deletions: 1,
    });
  });

  test("filediffFromMeta merges multiple hunks into one filediff", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: {
            diffs: [
              { path: "/w/f.ts", oldText: "old1\n", newText: "new1\n" },
              { path: "/w/f.ts", oldText: "old2\n", newText: "new2\n" },
            ],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-multi",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    const filediff = res.metadata.filediff as {
      file: string;
      before: string;
      after: string;
      additions: number;
      deletions: number;
    };
    expect(filediff.file).toBe("/w/f.ts");
    expect(filediff.before).toBe("old1\n\nold2\n");
    expect(filediff.after).toBe("new1\n\nnew2\n");
    expect(filediff.additions).toBe(2);
    expect(filediff.deletions).toBe(2);
  });

  test("filediffFromMeta degrades to undefined when a later hunk is null", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: {
            diffs: [
              { path: "/w/f.ts", oldText: "old\n", newText: "new\n" },
              null,
            ],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-nullhunk",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(res.metadata.filediff).toBeUndefined();
  });

  test("filediffFromMeta omits filediff for oversized hunks", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "write",
            description: "dsh write",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "ok" }],
          meta: {
            diffs: [
              {
                path: "/w/f.ts",
                oldText: "x\n".repeat(2000),
                newText: "y\n".repeat(2000),
              },
            ],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.write as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-oversize",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // 2000*2000 = 4M cells > 1M threshold; the filediff is omitted rather than
    // showing a misleading badge.
    expect(res.metadata.filediff).toBeUndefined();
  });

  // ----- full-file value diff (result.value) -----
  //
  // When the tool result exposes its schema-validated `value` ({path, before,
  // after}), the adapter derives a real unified patch from the full before/after
  // texts — the same shape the builtin edit tool emits via
  // createTwoFilesPatch/trimDiff. meta.diffs remain only the fallback: those
  // hunks carry no absolute line positions, so a patch built from them would
  // fabricate line numbers.

  /** The 67-char separator jsdiff@8.0.2 emits after the Index header. */
  const PATCH_SEPARATOR = "=".repeat(67);

  /** Build the exact jsdiff@8.0.2-format patch the adapter must emit (builtin parity). */
  function expectedPatch(path: string, hunkLines: string[]): string {
    return [
      `Index: ${path}`,
      PATCH_SEPARATOR,
      `--- ${path}`,
      `+++ ${path}`,
      ...hunkLines,
      "",
    ].join("\n");
  }

  test("execute emits a unified metadata.diff from the full-file value (single hunk)", async () => {
    const before = "const a = 1\nconst b = 2\nconst c = 3\n";
    const after = "const a = 1\nconst b = 42\nconst c = 3\n";
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/workspace/app/src/file.ts", before, after },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/workspace/app/src/file.ts" },
      {
        sessionID: "ses-value-single",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    expect(res.metadata.diff).toBe(
      expectedPatch("/workspace/app/src/file.ts", [
        "@@ -1,3 +1,3 @@",
        " const a = 1",
        "-const b = 2",
        "+const b = 42",
        " const c = 3",
      ]),
    );
    // Workbench filediff keeps its {file, before, after, additions, deletions}
    // shape, now sourced from the full-file texts with exact line-change counts.
    expect(res.metadata.filediff).toEqual({
      file: "/workspace/app/src/file.ts",
      before,
      after,
      additions: 1,
      deletions: 1,
    });
  });

  test("execute emits faithful multi-hunk metadata.diff (distant hunks stay separate)", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const before = lines.join("\n") + "\n";
    const after =
      lines
        .map((line) =>
          line === "line 3"
            ? "line THREE"
            : line === "line 25"
              ? "line TWENTY-FIVE"
              : line,
        )
        .join("\n") + "\n";
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/workspace/app/src/file.ts", before, after },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/workspace/app/src/file.ts" },
      {
        sessionID: "ses-value-multi",
        directory: "/workspace/app",
        worktree: "/workspace",
        ask: async () => {},
      },
    );
    // Two distant changes each keep their own hunk with real file line numbers;
    // the 8 unchanged gap lines (line 8..line 20) are NOT concatenated into a
    // fake contiguous change.
    expect(res.metadata.diff).toBe(
      expectedPatch("/workspace/app/src/file.ts", [
        "@@ -1,7 +1,7 @@",
        " line 1",
        " line 2",
        "-line 3",
        "+line THREE",
        " line 4",
        " line 5",
        " line 6",
        " line 7",
        "@@ -21,9 +21,9 @@",
        " line 21",
        " line 22",
        " line 23",
        " line 24",
        "-line 25",
        "+line TWENTY-FIVE",
        " line 26",
        " line 27",
        " line 28",
        " line 29",
      ]),
    );
    expect(res.metadata.filediff).toEqual({
      file: "/workspace/app/src/file.ts",
      before,
      after,
      additions: 2,
      deletions: 2,
    });
  });

  test("execute renders a pure insertion from the full-file value", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/w/f.ts", before: "b\nc\n", after: "a\nb\nc\n" },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-value-insert",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(res.metadata.diff).toBe(
      expectedPatch("/w/f.ts", ["@@ -1,2 +1,3 @@", "+a", " b", " c"]),
    );
    expect(res.metadata.filediff).toMatchObject({ additions: 1, deletions: 0 });
  });

  test("execute renders a deletion to an empty file from the full-file value", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/w/f.ts", before: "only\n", after: "" },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-value-delete",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(res.metadata.diff).toBe(
      expectedPatch("/w/f.ts", ["@@ -1,1 +0,0 @@", "-only"]),
    );
    expect(res.metadata.filediff).toMatchObject({ additions: 0, deletions: 1 });
  });

  test("execute strips common indentation like the builtin edit tool (trimDiff)", async () => {
    const before = "    a\n    b\n    c\n";
    const after = "    a\n    B\n    c\n";
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/w/f.ts", before, after },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-value-trim",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // The TUI patch mirrors the builtin: the common 4-space indentation is
    // stripped from the hunk content lines, while filediff keeps the full texts.
    expect(res.metadata.diff).toBe(
      expectedPatch("/w/f.ts", ["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c"]),
    );
    expect(res.metadata.filediff).toEqual({
      file: "/w/f.ts",
      before,
      after,
      additions: 1,
      deletions: 1,
    });
  });

  test("execute ignores a malformed full-file value (graceful, no fabricated diff)", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: 42, before: "a", after: "b" },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-value-malformed",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    expect(res.metadata.diff).toBeUndefined();
    expect(res.metadata.filediff).toBeUndefined();
    expect(res.output).toBe("Edit applied successfully.");
  });

  test("execute keeps the meta.diffs fallback when the full-file value is oversized", async () => {
    const before =
      Array.from({ length: 3000 }, (_, i) => `old ${i}`).join("\n") + "\n";
    const after =
      Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n") + "\n";
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "edit",
            description: "dsh edit",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          value: { path: "/w/f.ts", before, after },
          meta: {
            diffs: [{ path: "/w/f.ts", oldText: "old\n", newText: "new\n" }],
          },
        }),
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.edit as Projected;
    const res = await tool.execute(
      { filePath: "/w/f.ts" },
      {
        sessionID: "ses-value-oversize",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // 3000*3000 = 9M cells > 4M cap: no full-file diff is attempted (no
    // fabricated positions), and the pre-existing meta.diffs fallback still
    // provides the Workbench filediff.
    expect(res.metadata.diff).toBeUndefined();
    expect(res.metadata.filediff).toEqual({
      file: "/w/f.ts",
      before: "old\n",
      after: "new\n",
      additions: 1,
      deletions: 1,
    });
  });

  test("projected args expose camelCase filePath for read/edit/write", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "read",
            description: "dsh read",
            parameters: { properties: { file_path: { type: "string" } } },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.read as { args: Record<string, unknown> };
    expect(Object.keys(tool.args)).toEqual(["filePath"]);
  });
});

/**
 * Schema fidelity: the projected args must carry the container's real type
 * constraints (oneOf unions, enums) and per-property descriptions. The
 * str_replace_editor `insert` failure is the canonical regression: the
 * `insert_line` constraint was projected away, the model sent strings, and
 * dsh's validator rejected every call with `oneOf branch (matched 0)`.
 */
describe("projected schema fidelity", () => {
  const editorTools = () => ({
    schemas: () => [
      {
        name: "str_replace_editor",
        description: "dsh editor",
        parameters: {
          type: "object",
          required: ["command", "path"],
          properties: {
            command: {
              type: "string",
              enum: ["view", "create", "str_replace", "insert"],
              description: "The commands to run.",
            },
            path: {
              type: "string",
              description: "Absolute path to file or directory.",
            },
            insert_line: {
              oneOf: [{ type: "integer" }, { type: "null" }],
              description: "Required integer parameter of `insert` command.",
            },
            view_range: {
              oneOf: [
                { type: "array", items: { type: "integer" } },
                { type: "null" },
              ],
              description: "Optional parameter of `view` command.",
            },
          },
        },
      },
    ],
  });

  type ArgLike = {
    safeParse(input: unknown): { success: boolean };
    description?: string;
  };

  async function editorArgs(): Promise<Record<string, ArgLike>> {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer(editorTools());
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    return (tools.str_replace_editor as { args: Record<string, ArgLike> }).args;
  }

  test("oneOf [integer, null] projects to a nullable integer, not any", async () => {
    const args = await editorArgs();
    expect(args.insert_line.safeParse(1).success).toBe(true);
    expect(args.insert_line.safeParse(null).success).toBe(true);
    expect(args.insert_line.safeParse("1").success).toBe(false);
    expect(args.insert_line.safeParse(1.5).success).toBe(false);
  });

  test("enum constraints survive the projection", async () => {
    const args = await editorArgs();
    expect(args.command.safeParse("view").success).toBe(true);
    expect(args.command.safeParse("insert").success).toBe(true);
    expect(args.command.safeParse("undo_edit").success).toBe(false);
  });

  test("oneOf [array<integer>, null] projects to a nullable integer array", async () => {
    const args = await editorArgs();
    expect(args.view_range.safeParse([1, 2]).success).toBe(true);
    expect(args.view_range.safeParse(null).success).toBe(true);
    expect(args.view_range.safeParse("1").success).toBe(false);
    expect(args.view_range.safeParse([1.5]).success).toBe(false);
  });

  test("constraints and descriptions reach the model-facing JSON Schema", async () => {
    const args = await editorArgs();
    expect(args.command.description).toContain("commands");
    expect(args.insert_line.description).toContain("insert");
    const { tool } = await import("@wopal/ellamaka-plugin");
    const json = tool.schema.toJSONSchema(
      tool.schema.object(args as Record<string, never>),
      { io: "input" },
    ) as {
      properties: Record<
        string,
        { description?: string; enum?: unknown[]; anyOf?: { type?: string }[] }
      >;
    };
    expect(json.properties.command.enum).toEqual([
      "view",
      "create",
      "str_replace",
      "insert",
    ]);
    expect(json.properties.command.description).toContain("commands");
    expect(json.properties.insert_line.description).toContain("insert");
    expect(
      (json.properties.insert_line.anyOf ?? []).map((branch) => branch.type),
    ).toEqual(["integer", "null"]);
  });

  test("scalar property descriptions are preserved on plain nodes", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        schemas: () => [
          {
            name: "read",
            description: "dsh read",
            parameters: {
              type: "object",
              required: ["file_path"],
              properties: {
                file_path: {
                  type: "string",
                  description:
                    "Path to read, resolved by the filesystem backend.",
                },
              },
            },
          },
        ],
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const args = (tools.read as { args: Record<string, ArgLike> }).args;
    expect(args.filePath.description).toContain("Path to read");
  });
});

describe("dsh-adapter escalation answerer bridge", () => {
  /** The dsh escalation reason shape: `escalate sandbox to ${mode}: ${justification}`. */
  const escalationRequest = (overrides?: Partial<Record<string, unknown>>) => ({
    agent: { session: { header: { id: "ses-esc" } } },
    toolName: "bash",
    callId: "call-esc-1",
    reason:
      "escalate sandbox to danger-full-access: need to write outside the workspace",
    ...overrides,
  });

  test("registers an approval/request answerer on the container ctx", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter({}, sandboxOn());
    expect(Object.keys(out)).toEqual(["tool.provider"]);
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual(["grep", "glob"]);
    // Run one execute so the ask closure registers for ses-esc...
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-esc",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // ...then the answerer must be present and route the request.
    const outcome =
      await containerCtx.dispatchApprovalRequest(escalationRequest());
    expect(outcome).toBe("allowed-once");
  });

  test("no container ctx.on (legacy fake) degrades: provider still works", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    expect(Object.keys(tools)).toEqual(["grep", "glob"]);
  });

  test("ask resolve maps to allowed-once with sandbox_escalation ask params", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const asks: {
      permission: string;
      patterns: string[];
      always: string[];
      metadata: Record<string, unknown>;
    }[] = [];
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-esc",
        directory: "/w",
        worktree: "/w",
        ask: async (input) => {
          asks.push(input);
        },
      },
    );
    const outcome =
      await containerCtx.dispatchApprovalRequest(escalationRequest());
    expect(outcome).toBe("allowed-once");
    expect(asks).toEqual([
      {
        permission: "sandbox_escalation",
        patterns: ["danger-full-access"],
        always: ["danger-full-access"],
        metadata: {
          tool: "bash",
          callID: "call-esc-1",
          justification:
            "escalate sandbox to danger-full-access: need to write outside the workspace",
          targetMode: "danger-full-access",
        },
      },
    ]);
  });

  test("ask RejectedError maps to rejected", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const rejected = Object.assign(
      new Error("The user rejected permission to use this specific tool call."),
      { name: "PermissionRejectedError" },
    );
    await tool.execute(
      {},
      {
        sessionID: "ses-esc",
        directory: "/w",
        worktree: "/w",
        ask: async () => {
          throw rejected;
        },
      },
    );
    const outcome =
      await containerCtx.dispatchApprovalRequest(escalationRequest());
    expect(outcome).toBe("rejected");
  });

  test("ask CorrectedError maps to rejected", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const corrected = Object.assign(new Error("rejected with feedback: no"), {
      name: "PermissionCorrectedError",
      feedback: "no",
    });
    await tool.execute(
      {},
      {
        sessionID: "ses-esc",
        directory: "/w",
        worktree: "/w",
        ask: async () => {
          throw corrected;
        },
      },
    );
    const outcome =
      await containerCtx.dispatchApprovalRequest(escalationRequest());
    expect(outcome).toBe("rejected");
  });

  test("unknown session (askRegistry miss) delegates via next() and yields unavailable", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-known",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // The request routes to an unregistered session: fail-closed waterfall.
    const outcome = await containerCtx.dispatchApprovalRequest(
      escalationRequest({
        agent: { session: { header: { id: "ses-stranger" } } },
      }),
    );
    expect(outcome).toBe("unavailable");
  });

  test("escalation: never seeds an approval/policy event into every session facade", async () => {
    const captured: { events?: { type: string; data: unknown }[] }[] = [];
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer = {
      ...containerCtx,
      get(name: "tools") {
        if (name !== "tools") return undefined;
        return {
          schemas: () => [
            {
              name: "grep",
              description: "dsh grep (ripgrep-backed)",
              parameters: {},
            },
            { name: "glob", description: "dsh glob", parameters: {} },
          ],
          execute: async (exec: unknown) => {
            captured.push({
              events: eventsOf(exec),
            });
            return { isError: false, content: [{ type: "text", text: "ok" }] };
          },
        };
      },
    };
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "workspace-write" },
        escalation: "never",
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-never",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    // The policy fold rides the seeded log; dsh's ApprovalService decides
    // 'never' before any answerer dispatch (deterministic rejection).
    expect(captured[0]?.events?.[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "workspace-write" },
    });
    expect(captured[0]?.events?.[1]).toEqual({
      type: "approval/policy",
      data: { policy: "never" },
    });
    expect(captured[0]?.events?.[2]).toEqual({ type: "turn/start", data: {} });
  });

  test("escalation: never never invokes the ellamaka ask closure", async () => {
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      containerCtx;
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "workspace-write" },
        escalation: "never",
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    let asked = 0;
    await tool.execute(
      {},
      {
        sessionID: "ses-never",
        directory: "/w",
        worktree: "/w",
        ask: async () => {
          asked += 1;
        },
      },
    );
    await containerCtx.dispatchApprovalRequest(escalationRequest());
    // dsh service-level short-circuit; the answerer must not reach ask() as a
    // live UI prompt. (The bridge itself never runs for 'never'.)
    expect(asked).toBe(0);
  });

  test("escalation: ask (default) registers no approval/policy override", async () => {
    const captured: { events?: { type: string; data: unknown }[] }[] = [];
    const containerCtx = fakeContainerCtx();
    (globalThis as Record<string, unknown>).__ellamakaDshContainer = {
      ...containerCtx,
      get(name: "tools") {
        if (name !== "tools") return undefined;
        return {
          schemas: () => [
            {
              name: "grep",
              description: "dsh grep (ripgrep-backed)",
              parameters: {},
            },
            { name: "glob", description: "dsh glob", parameters: {} },
          ],
          execute: async (exec: unknown) => {
            captured.push({
              events: eventsOf(exec),
            });
            return { isError: false, content: [{ type: "text", text: "ok" }] };
          },
        };
      },
    };
    const out = await mod.dshAdapter(
      {},
      {
        sandbox: { enabled: true, mode: "workspace-write" },
      },
    );
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-ask-default",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    const types = (captured[0]?.events ?? []).map((event) => event.type);
    expect(types).not.toContain("approval/policy");
  });
});

/**
 * rc.1 Session contract conformance (DESIGN-dsh-poc §4.5 fold invariant
 * carried on a seq-numbered log). The container's read-side consumers
 * (session-projection cells, sandbox-policy fold, user-approval
 * hasOpenTurn reverse scan) require the facade to expose the same
 * seq/eventAt/snapshotEvents surface as the official dsh Session:
 *   - seq is always the log length (contiguity contract)
 *   - eventAt(seq) returns exactly the event stored at that position
 *   - snapshotEvents() is a frozen half-open-range snapshot
 *   - append returns the frozen committed event (with seq + time)
 *   - appended data is snapshotted (later caller mutation never lands)
 */
describe("facade rc.1 session contract", () => {
  test("snapshotEvents exposes the seq-numbered log and append assigns contiguous seqs", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctx = {
      sessionID: "ses-seq",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    await tool.execute({}, ctx);
    const session = (captured[0] as { agent?: { session?: unknown } }).agent
      ?.session as {
      seq: number;
      eventAt(seq: number): { type: string; seq: number } | undefined;
      snapshotEvents(from?: number, to?: number): readonly unknown[];
      append(
        type: string,
        data: unknown,
      ): { type: string; seq: number; time: number; data: unknown };
      inheritedEventCount: number;
    };
    // After the first dispatch the log holds: sandbox seed + turn/start +
    // turn/end (the execute closure has returned).
    expect(session.seq).toBe(3);
    expect(session.inheritedEventCount).toBe(0);
    // Contiguity: eventAt(seq) is exactly the event stored at that position.
    const appended = session.append("approval/asked", { id: "apr-1" });
    expect(appended.seq).toBe(3);
    expect(appended.type).toBe("approval/asked");
    expect(typeof appended.time).toBe("number");
    expect(session.seq).toBe(4);
    expect(session.eventAt(3)?.type).toBe("approval/asked");
    expect(session.eventAt(4)).toBeUndefined();
    // Half-open snapshot ranges, frozen.
    const full = session.snapshotEvents();
    expect(Object.isFrozen(full)).toBe(true);
    expect(full.map((event) => (event as { type: string }).type)).toEqual([
      "sandbox/mode",
      "turn/start",
      "turn/end",
      "approval/asked",
    ]);
    const slice = session.snapshotEvents(1, 3);
    expect(Object.isFrozen(slice)).toBe(true);
    expect(slice.map((event) => (event as { type: string }).type)).toEqual([
      "turn/start",
      "turn/end",
    ]);
  });

  test("appended data is snapshotted: caller mutation never lands in the log", async () => {
    const captured: unknown[] = [];
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push(exec);
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    await tool.execute(
      {},
      {
        sessionID: "ses-snap",
        directory: "/w",
        worktree: "/w",
        ask: async () => {},
      },
    );
    const session = (captured[0] as { agent?: { session?: unknown } }).agent
      ?.session as {
      append(type: string, data: unknown): { data: { id: string } };
      eventAt(seq: number): { data: { id: string } } | undefined;
      seq: number;
    };
    const payload = { id: "apr-original" };
    const committed = session.append("approval/asked", payload);
    payload.id = "apr-mutated";
    expect(committed.data.id).toBe("apr-original");
    expect(session.eventAt(session.seq - 1)?.data.id).toBe("apr-original");
  });

  test("hasOpenTurn-compatible reverse scan: open turn visible mid-dispatch, closed after", async () => {
    const captured: { session?: unknown }[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer({
        execute: async (exec: unknown) => {
          captured.push({
            session: (exec as { agent?: { session?: unknown } }).agent?.session,
          });
          await gate;
          return { isError: false, content: [{ type: "text", text: "ok" }] };
        },
      });
    const out = await mod.dshAdapter({}, sandboxOn());
    const tools = await invokeProvider(out);
    const tool = tools.grep as Projected;
    const ctx = {
      sessionID: "ses-open",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    };
    const pending = tool.execute({}, ctx);
    // Let the dispatch reach the gated container execute (permission ask +
    // facade creation resolve on microtasks before the gate opens).
    await Promise.resolve();
    await Promise.resolve();
    // Mirror dsh-user-approval's hasOpenTurn reverse scan while the dispatch
    // is inside its open turn.
    const session = captured[0]?.session as {
      seq: number;
      eventAt(seq: number): { type: string } | undefined;
    };
    let open = false;
    for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
      const type = session.eventAt(seq)?.type;
      if (type === "turn/start") {
        open = true;
        break;
      }
      if (type === "turn/end") break;
    }
    expect(open).toBe(true);
    release();
    await pending;
  });
});

/**
 * Engine-delivered pluginConfig consumption + dependency boundary.
 *
 * dsh-adapter behavior config flows through the engine-delivered
 * `PluginInput.pluginConfig["dsh-adapter"]` slice: the engine merges the
 * three settings layers and hands over the whole table; the plugin reads no
 * config files and never resolves a space root. The legacy inline mount
 * options (`rawOptions`) are honored only as the fallback when the slice is
 * absent. Invalid config fails loud on both channels.
 *
 * The upstream package scope string is assembled at runtime so this guard
 * file never matches itself when it scans `index.ts`.
 */
const UPSTREAM_SCOPE = ["@open", "code-ai"].join("");

function indexSource(): string {
  return readFileSync(new URL("./index.ts", import.meta.url), "utf8");
}

describe("dsh-adapter dependency boundary", () => {
  test("index.ts carries no upstream package-scope import", () => {
    expect(indexSource().includes(UPSTREAM_SCOPE)).toBe(false);
  });

  test("index.ts imports the fork plugin package", () => {
    expect(indexSource().includes("@wopal/ellamaka-plugin")).toBe(true);
  });

  test("package.json declares no upstream dependencies", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const offenders = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((name) => name.startsWith(UPSTREAM_SCOPE));
    expect(offenders).toEqual([]);
  });

  test("package.json pins the fork plugin at an exact pure version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const declared = manifest.dependencies?.["@wopal/ellamaka-plugin"];
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("dsh-adapter config source boundary", () => {
  test("index.ts no longer carries the settings file-read chain", () => {
    const source = indexSource();
    for (const symbol of [
      "settingsLayerPaths",
      "readPluginConfigLayer",
      "loadPluginConfig",
      "jsonc-parser",
      "readFileSync",
      "wopalSpaceRoot",
    ]) {
      expect(source.includes(symbol)).toBe(false);
    }
  });

  test("package.json no longer declares the jsonc-parser dependency", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["jsonc-parser"]).toBeUndefined();
  });
});

/**
 * Build a PluginInput carrying the engine-delivered `pluginConfig` table.
 * `pluginInput()` omits the table entirely (legacy caller shape); the engine
 * itself always delivers an object — `{}` when no layer carries a `wopal`
 * node — covered by `pluginInput({})`.
 */
function pluginInput(table?: Record<string, unknown>): unknown {
  return table === undefined ? {} : { pluginConfig: table };
}

/**
 * Mount the adapter (the sandbox-on path requires a live container) and run
 * one dispatch, returning the facade's seeded events. The container is
 * installed before mount because the factory captures it at mount time.
 */
async function mountSandboxEvents(
  input: unknown,
  options: AdapterOptions | undefined,
): Promise<{ type: string; data: unknown }[]> {
  const captured: { type: string; data: unknown }[][] = [];
  (globalThis as Record<string, unknown>).__ellamakaDshContainer =
    fakeContainer({
      execute: async (exec: unknown) => {
        captured.push(eventsOf(exec) as { type: string; data: unknown }[]);
        return { isError: false, content: [{ type: "text", text: "ok" }] };
      },
    });
  const out = await mod.dshAdapter(input, options);
  const tools = await invokeProvider(out);
  const tool = tools.grep as Projected;
  await tool.execute(
    {},
    {
      sessionID: "ses-cfg",
      directory: "/w",
      worktree: "/w",
      ask: async () => {},
    },
  );
  return captured[0] ?? [];
}

/** Run the adapter with config expected to be invalid; return the error message. */
async function configErrorMessage(
  input: unknown,
  options?: AdapterOptions,
): Promise<string> {
  try {
    await mod.dshAdapter(input, options);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected dshAdapter to reject, but it resolved");
}

describe("dsh-adapter pluginConfig consumption (engine-delivered slice)", () => {
  test("engine-delivered slice wins over inline rawOptions", async () => {
    const events = await mountSandboxEvents(
      pluginInput({
        "dsh-adapter": { sandbox: { enabled: true, mode: "read-only" } },
      }),
      { sandbox: { enabled: true, mode: "workspace-write" } },
    );
    expect(events[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "read-only" },
    });
  });

  test("slice disables the sandbox even when inline options enable it (precedence, no merge)", async () => {
    const out = await mod.dshAdapter(
      pluginInput({ "dsh-adapter": { sandbox: { enabled: false } } }),
      { sandbox: { enabled: true, mode: "read-only" } },
    );
    expect(out).toEqual({});
  });

  test("missing table or missing slice falls back to inline rawOptions", async () => {
    const absentTable = await mountSandboxEvents(
      {},
      { sandbox: { enabled: true, mode: "read-only" } },
    );
    expect(absentTable[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "read-only" },
    });

    const emptyTable = await mountSandboxEvents(pluginInput({}), {
      sandbox: { enabled: true, mode: "workspace-write" },
    });
    expect(emptyTable[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "workspace-write" },
    });

    const otherSliceOnly = await mountSandboxEvents(
      pluginInput({ "wopal-plugin": { rules: { enabled: true } } }),
      { sandbox: { enabled: true, mode: "read-only" } },
    );
    expect(otherSliceOnly[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "read-only" },
    });
  });

  test("empty slice is a present entry: sandbox off, no inline fallback", async () => {
    const out = await mod.dshAdapter(pluginInput({ "dsh-adapter": {} }), {
      sandbox: { enabled: true, mode: "read-only" },
    });
    expect(out).toEqual({});
  });

  test("both channels absent idles the projection (no provider)", async () => {
    (globalThis as Record<string, unknown>).__ellamakaDshContainer =
      fakeContainer();
    expect(await mod.dshAdapter(pluginInput(), undefined)).toEqual({});
    expect(await mod.dshAdapter(pluginInput({}), undefined)).toEqual({});
  });

  test("invalid slice sandbox.enabled fails loud with plugin name and field path", async () => {
    const message = await configErrorMessage(
      pluginInput({ "dsh-adapter": { sandbox: { enabled: "yes" } } }),
    );
    expect(message).toContain("dsh-adapter");
    expect(message).toContain("sandbox.enabled");
  });

  test("invalid slice sandbox.mode fails loud with field path", async () => {
    const message = await configErrorMessage(
      pluginInput({
        "dsh-adapter": { sandbox: { enabled: true, mode: "yolo" } },
      }),
    );
    expect(message).toContain("dsh-adapter");
    expect(message).toContain("sandbox.mode");
  });

  test("invalid slice escalation fails loud with field path", async () => {
    const message = await configErrorMessage(
      pluginInput({ "dsh-adapter": { escalation: "sometimes" } }),
    );
    expect(message).toContain("dsh-adapter");
    expect(message).toContain("escalation");
  });

  test("non-object slice fails loud", async () => {
    await expect(
      mod.dshAdapter(pluginInput({ "dsh-adapter": "on" }), undefined),
    ).rejects.toThrow(/dsh-adapter/);
  });

  test("invalid slice does not silently fall back to valid inline options", async () => {
    await expect(
      mod.dshAdapter(
        pluginInput({
          "dsh-adapter": { sandbox: { enabled: true, mode: "yolo" } },
        }),
        { sandbox: { enabled: true, mode: "read-only" } },
      ),
    ).rejects.toThrow(/sandbox\.mode/);
  });

  test("escalation flows through the slice (never seeds approval/policy)", async () => {
    const events = await mountSandboxEvents(
      pluginInput({
        "dsh-adapter": {
          sandbox: { enabled: true, mode: "workspace-write" },
          escalation: "never",
        },
      }),
      undefined,
    );
    expect(events[0]).toEqual({
      type: "sandbox/mode",
      data: { mode: "workspace-write" },
    });
    expect(events[1]).toEqual({
      type: "approval/policy",
      data: { policy: "never" },
    });
  });

  test("invalid inline rawOptions fail loud (validation bypass guard)", async () => {
    await expect(
      mod.dshAdapter(pluginInput(), {
        sandbox: { enabled: true, mode: "nope" },
      } as AdapterOptions),
    ).rejects.toThrow();
    await expect(
      mod.dshAdapter(pluginInput(), {
        escalation: "sometimes",
      } as AdapterOptions),
    ).rejects.toThrow();
    await expect(
      mod.dshAdapter(pluginInput(), "on" as unknown as AdapterOptions),
    ).rejects.toThrow();
  });
});
