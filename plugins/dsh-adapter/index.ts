/**
 * dsh-tool-adapter — experiment 2 (P3.5 dynamic provider).
 *
 * Projects tools from the in-process dsh container into ellamaka's
 * ToolRegistry through the dynamic `tool.provider` plugin hook. The container
 * is exposed by serve.ts (ELLAMAKA_DSH=1) on globalThis.__ellamakaDshContainer.
 *
 * Unlike the earlier static `tool` table (snapshotted at mount time), the
 * provider re-reads the container's live `tools.schemas()` on EVERY model
 * request — so tools mounted/unmounted inside the dsh container take effect
 * on the next request without a restart.
 *
 * The container is mounted with `session-checkpoint-policy` disabled
 * (ellamaka-tools profile patch layer): that plugin flushes the calling
 * agent's live dsh session before every tools/execute — an agent-loop
 * durability semantic. Without it, a cached session facade carrying the
 * tool's actual consumption surface is enough:
 *
 *   - session.header.cwd — resolved workdir for spawns
 *   - session.header.id  — spill ownership label
 *   - session.seq / session.eventAt(seq) / session.snapshotEvents(from, to)
 *     — the rc.1 seq-numbered read surface: sandbox-policy folds and the
 *     approval open-turn scan read through it (contiguity: seq === log length)
 *   - session.append     — audit-pair sink (approval/asked, approval/decided),
 *     committing frozen seq+time-stamped events
 *
 * Every tools.execute() dispatch is wrapped in a reference-counted turn
 * boundary (`turn/start` → dispatch → `turn/end`, finally-closed) so the dsh
 * approval plugin's open-turn precondition (`hasOpenTurn`) holds during
 * escalation audit.
 *
 * Escalation approval (Plan D-03/D-04/D-05): the adapter registers an
 * `approval/request` answerer on the container's cordis ctx. It routes each
 * dsh ask by session id to the calling turn's `ToolContext.ask` closure
 * (held in a per-session registry), asks ellamaka's Permission under
 * `sandbox_escalation` (patterns = the escalation target mode parsed from
 * the dsh reason, metadata = tool/callID/justification), and maps the
 * outcome — resolve → `allowed-once`, RejectedError/CorrectedError →
 * `rejected`, registry miss → `next()` (waterfall fail-closed). The
 * `escalation: "never"` option seeds an `approval/policy` event into every
 * facade so dsh's ApprovalService rejects deterministically before any
 * answerer dispatch.
 *
 * No dsh session is created in the container, so the container state stays
 * free of per-ellamaka-session records.
 *
 * The adapter has no per-tool mapping table: enabling the sandbox replaces the
 * builtin tool set with the dsh container's tools as a whole. The projection
 * set is fixed (grep/glob/read/write/edit/str_replace_editor/bash) because the
 * dsh tools are not independently swappable — dsh's edit requires its own read
 * to have observed the file, so mixing a builtin read with a dsh edit breaks
 * the observation bookkeeping. All or nothing.
 *
 * Sandbox semantics (DESIGN §4.10): `enabled: true` selects the sandbox
 * backend and injects a `sandbox/mode` event (`read-only` or
 * `workspace-write`, default `workspace-write`) into each session facade.
 * `enabled: false` (or absent) means the sandbox is OFF: the adapter idles its
 * tool projection — it registers no `tool.provider` and never shadows a
 * builtin, so ellamaka's builtin tools run untouched, exactly as if this
 * plugin were not loaded. The idle applies to the tool projection only; other
 * adapter responsibilities (when added) stay mounted.
 */
import type {
  Hooks,
  PluginInput,
  PluginOptions,
  ToolContext as PluginToolContext,
  ToolDefinition,
  ToolResult,
} from "@wopal/ellamaka-plugin";
import path from "node:path";
// Build projected tool schemas on the zod engine re-exported by
// @wopal/ellamaka-plugin (`tool.schema`). A standalone `zod` import resolves
// to a second copy whose classic types carry `_def` but no `_zod` marker; the
// ellamaka registry detects Zod types by `_zod` and would fall back to
// `legacyJsonSchema`, leaking raw Zod internals to the model and force-marking
// every field required. Sharing the SDK's engine keeps one zod across the host
// and every plugin.
import { tool } from "@wopal/ellamaka-plugin";

const z = tool.schema;

// The zod type surface used in signatures. `tool.schema` is the engine value,
// so instance-based extraction keeps the type available without a namespace.
type ZodType = InstanceType<typeof z.ZodType>;

type Container = {
  get(name: "tools"):
    | {
        schemas(): { name: string; description: string; parameters: unknown }[];
        execute(exec: unknown): Promise<{
          isError: boolean;
          content?: { type: string; text?: string }[];
          error?: { message?: string };
          meta?: unknown;
          /**
           * The schema-validated tool output value. For edit this is
           * `{path, before, after}` — the full file texts the backend applied —
           * which is the authoritative source for a real unified patch (see
           * `filediffFromValue`).
           */
          value?: unknown;
        }>;
      }
    | undefined;
  logger(name: string): {
    info(message: string, extra?: unknown): void;
    warn(message: string, extra?: unknown): void;
    error(message: string, extra?: unknown): void;
  };
  /**
   * The cordis event surface. The adapter registers its `approval/request`
   * answerer through it so dsh's ApprovalService waterfall can reach the
   * ellamaka Permission ask closure for the requesting session.
   */
  on(
    event: "approval/request",
    handler: (req: DshApprovalRequest, next: () => unknown) => unknown,
  ): unknown;
};

/**
 * The dsh `approval/request` waterfall payload (structural subset: the
 * adapter only consumes the routing id and the prompt-text fields).
 */
type DshApprovalRequest = {
  agent?: { session?: { header?: { id?: string } } };
  toolName?: string;
  callId?: string;
  reason?: string;
};

/**
 * The SDK ToolContext.ask input shape the escalation answerer builds
 * (Omit<Permission.Request, "id" | "sessionID" | "tool">).
 */
type AskInput = {
  permission: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
};

type AskFn = (input: AskInput) => Promise<void>;

/**
 * Extract the escalation target mode from a dsh approval reason. The dsh
 * escalation choreography (`approveEscalation`) formats every ask reason as
 * `escalate sandbox to ${mode}: ${justification}` — the mode is parsed back
 * out so the ellamaka ask advertises the exact target pattern.
 */
function targetModeFromReason(reason: string): string | undefined {
  const match = /^escalate sandbox to ([a-z-]+):/.exec(reason);
  return match?.[1];
}

export interface DshAdapterConfig {
  /**
   * Space-level sandbox policy for the dsh tool container. `enabled: true`
   * selects the sandbox backend and injects a `sandbox/mode` event into each
   * session facade; `mode` is `read-only` or `workspace-write` (default
   * `workspace-write`). `enabled: false` (or absent) turns the sandbox OFF:
   * the adapter idles its tool projection and ellamaka's builtin tools run
   * untouched.
   */
  sandbox?: { enabled: boolean; mode?: "read-only" | "workspace-write" };
  /**
   * Sandbox escalation approval policy. `ask` (the default) bridges dsh
   * `approval/request` asks to ellamaka's Permission (Workbench approval
   * card); `never` seeds an `approval/policy` event into every session facade
   * so dsh's ApprovalService rejects every escalation deterministically before
   * any answerer dispatch (headless stance, no UI prompt).
   */
  escalation?: "ask" | "never";
}

/**
 * The legacy inline mount-options shape (`ellamaka.plugin[c][1]`). Kept as an
 * alias so existing callers keep type-checking; new configuration flows
 * through the engine-delivered `PluginInput.pluginConfig["dsh-adapter"]`
 * slice.
 */
export type DshAdapterOptions = DshAdapterConfig;

const DSH_ADAPTER_PLUGIN_NAME = "dsh-adapter";

// Validate the dsh-adapter behavior config. The engine re-exports zod through
// the plugin package, so this shares the host's one zod instance.
const dshAdapterConfigSchema = z.object({
  sandbox: z
    .object({
      enabled: z.boolean(),
      mode: z.enum(["read-only", "workspace-write"]).optional(),
    })
    .optional(),
  escalation: z.enum(["ask", "never"]).optional(),
});

/**
 * Render zod issues as `field.path: message` pairs — the fail-loud detail
 * both config channels report.
 */
function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Resolve the effective adapter config. Priority 1: the engine-delivered
 * `PluginInput.pluginConfig["dsh-adapter"]` slice (the engine merges the
 * three settings layers and hands the table over whole; the plugin reads no
 * files). Priority 2 (backward compat): the inline mount options
 * (`rawOptions`). Both absent -> built-in defaults (empty: the sandbox is
 * off, the adapter idles). A present-but-invalid entry throws on either
 * channel: a config typo must stop startup rather than silently degrade the
 * sandbox stance.
 */
function resolveDshAdapterConfig(
  input: PluginInput,
  rawOptions?: PluginOptions,
): DshAdapterConfig {
  const entry = input.pluginConfig?.[DSH_ADAPTER_PLUGIN_NAME];
  if (entry !== undefined) {
    const result = dshAdapterConfigSchema.safeParse(entry);
    if (!result.success) {
      throw new Error(
        `dsh-adapter config validation failed (pluginConfig.${DSH_ADAPTER_PLUGIN_NAME}): ${formatIssues(result.error.issues)}`,
      );
    }
    return result.data;
  }
  if (rawOptions === undefined) return {};
  const result = dshAdapterConfigSchema.safeParse(rawOptions);
  if (!result.success) {
    throw new Error(
      `dsh-adapter inline options validation failed: ${formatIssues(result.error.issues)}`,
    );
  }
  return result.data;
}

// A projected container tool, shaped as an SDK `ToolDefinition`. args are a
// ZodRawShape (the plugin SDK contract): the registry's fromPlugin path
// detects Zod types and generates the correct flat JSON Schema. Passing the
// dsh JSON Schema document as-is would make the registry treat its top-level
// keys (type/properties/required) as property definitions, producing a nested
// schema the model cannot call.
type ProjectedTool = ToolDefinition;

// The SDK ToolContext surface this adapter consumes, plus the optional
// callID the host Tool.Context carries at runtime.
type ToolContext = PluginToolContext & { callID?: string };

// Per-message sandbox mode selected in the composer. Carried on Tool.Context
// extra by the host; absent falls back to the space-level default.
type SandboxMode = "read-only" | "workspace-write" | "full-access";

// A session facade shaped for dsh consumers. The shape mirrors the official
// dsh rc.1 `Session` read surface (seq-numbered append-only log): the
// container's read-side consumers — session-projection cells, the
// sandbox-policy fold, and user-approval's hasOpenTurn reverse scan — read
// `seq` / `eventAt(seq)` / `snapshotEvents(from, to)` and require the same
// contiguity contract as the real session (`seq === log length`, `eventAt`
// returning exactly the event stored at that position). Events are deep
// frozen; `append` stores a JSON snapshot of `data` so later caller mutation
// never lands in the log, mirroring the official append's snapshot semantics.
// The log is process-memory only: no persistence plugin writes it (the tools
// profile disables session persistence by design), so nothing here is a
// durable record — exactly the lightweight per-call semantics the adapter
// documents. `turnDepth` reference-counts concurrent tools.execute() calls so
// nested/concurrent dispatches emit exactly one turn/start — turn/end pair,
// closed only at the outermost level (the shape dsh's hasOpenTurn reverse-scan
// expects).
type FacadeEvent = {
  readonly type: string;
  readonly seq: number;
  readonly time: number;
  readonly data: unknown;
};

type FacadeSession = {
  header: { id: string; cwd: string };
  /** The next event's sequence number — always the log length. */
  readonly seq: number;
  /** Fork-inherited prefix length; the facade is never a fork child, so 0. */
  readonly inheritedEventCount: number;
  /** Immutable half-open-range snapshot; a frozen array of frozen events. */
  snapshotEvents(from?: number, to?: number): readonly FacadeEvent[];
  /** The frozen event stored at one exact position, or undefined. */
  eventAt(seq: number): FacadeEvent | undefined;
  /** Commit one event: assigns seq + time and returns the frozen entry. */
  append(type: string, data: unknown): FacadeEvent;
  turnDepth: number;
};

type JsonSchemaNode = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
};

/**
 * dsh tools use snake_case argument names; ellamaka's Workbench render layer
 * reads camelCase. The adapter maps the model-facing schema to camelCase so
 * the projected tool looks like a builtin, then maps back to snake_case
 * before dispatching into the dsh container.
 */
const ARG_NAME_MAP: Record<string, string> = {
  file_path: "filePath",
  old_string: "oldString",
  new_string: "newString",
};

/**
 * The fixed set of dsh container tools the adapter projects onto ellamaka's
 * builtin slots when the sandbox is enabled. There is no per-tool mapping
 * table: the dsh tools are not independently swappable, because dsh's edit
 * requires its own read to have observed the file first. Mixing a builtin read
 * with a dsh edit would leave dsh's observation bookkeeping unaware of the
 * read, so the edit could never run. All or nothing. Each dsh tool shadows the
 * same-name ellamaka builtin.
 */
const PROJECTED_TOOLS: readonly string[] = [
  "grep",
  "glob",
  "read",
  "write",
  "edit",
  "str_replace_editor",
  "bash",
];

function toCamelCase(name: string): string {
  return ARG_NAME_MAP[name] ?? name;
}

function toSnakeCase(name: string): string {
  for (const [snake, camel] of Object.entries(ARG_NAME_MAP)) {
    if (camel === name) return snake;
  }
  return name;
}

/**
 * Convert a dsh JSON Schema document into a ZodRawShape.
 *
 * The dsh tool registry exposes each tool's parameters as a full JSON Schema
 * document (`{ type: "object", properties: {...}, required: [...] }`). The
 * plugin SDK contract is a ZodRawShape — a map of property name to Zod type —
 * so the document is unwrapped into its property definitions, each converted
 * to the matching Zod type.
 *
 * The conversion must stay faithful to what the container declares, because
 * dsh re-validates every call against its own schema: dsh compiles nullable
 * parameters to `oneOf: [{ type: X }, { type: "null" }]` and enumerations to
 * `enum`, and rejects args that miss those constraints (the
 * str_replace_editor `insert_line` regression: a degraded `z.unknown()` let
 * the model send shapes dsh then refused with `oneOf branch (matched 0)`).
 * The per-property `description` carries the model-facing usage guidance and
 * must survive as `.describe()` so the model sees parameter semantics.
 * Only genuinely unsupported nodes degrade to `z.unknown()` so a future dsh
 * schema extension can never break the projection.
 */
function jsonSchemaToZodShape(schema: unknown): Record<string, ZodType> {
  const node = schema as JsonSchemaNode;
  const properties = node?.properties ?? {};
  const required = new Set(node?.required ?? []);
  const shape: Record<string, ZodType> = {};
  for (const [name, property] of Object.entries(properties)) {
    let type = jsonSchemaNodeToZod(property);
    if (!required.has(name)) type = type.optional();
    const description =
      typeof property?.description === "string"
        ? property.description
        : undefined;
    if (description && description.trim()) type = type.describe(description);
    shape[toCamelCase(name)] = type;
  }
  return shape;
}

/** Convert a single JSON Schema node, preserving oneOf/anyOf unions and enums. */
function jsonSchemaNodeToZod(node: JsonSchemaNode | undefined): ZodType {
  if (!node || typeof node !== "object") return z.unknown();

  // Nullable parameters arrive as `oneOf: [{ type: X }, { type: "null" }]`;
  // anyOf is accepted as the same union shape. The null branch maps to
  // `.nullable()` so null placeholders and omission satisfy validation
  // exactly like the container's own validator.
  const branches = Array.isArray(node.oneOf)
    ? node.oneOf
    : Array.isArray(node.anyOf)
      ? node.anyOf
      : undefined;
  if (branches && branches.length > 0) {
    const nullable = branches.some((branch) => branch?.type === "null");
    const converted = branches
      .filter((branch) => branch?.type !== "null")
      .map((branch) => jsonSchemaNodeToZod(branch));
    if (converted.length === 0) return z.null();
    const union =
      converted.length === 1
        ? converted[0]
        : z.union(converted as [ZodType, ZodType, ...ZodType[]]);
    return nullable ? union.nullable() : union;
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const values = node.enum;
    if (values.every((value) => typeof value === "string")) {
      return z.enum(values as [string, ...string[]]);
    }
    const literals = values
      .filter((value): value is string | number | boolean => {
        const kind = typeof value;
        return kind === "string" || kind === "number" || kind === "boolean";
      })
      .map((value) => z.literal(value));
    if (literals.length === values.length && literals.length > 0) {
      return literals.length === 1
        ? literals[0]
        : z.union(literals as [ZodType, ZodType, ...ZodType[]]);
    }
    return z.unknown();
  }

  if (node.const !== undefined) {
    const kind = typeof node.const;
    if (kind === "string" || kind === "number" || kind === "boolean") {
      return z.literal(node.const as string | number | boolean);
    }
    return z.unknown();
  }

  switch (node.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(
        node.items ? jsonSchemaNodeToZod(node.items) : z.unknown(),
      );
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function contentText(
  content: { type: string; text?: string }[] | undefined,
): string {
  return (content ?? [])
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("\n");
}

/**
 * The dsh edit tool result `value` shape the adapter consumes: the
 * schema-validated full before/after file texts the backend applied. Unlike
 * `meta.diffs` (per-hunk fragments with no absolute line positions), these
 * texts support a real unified patch with accurate hunk line numbers.
 */
type DshFileChangeValue = {
  path: string;
  before: string;
  after: string;
};

function isDshFileChangeValue(value: unknown): value is DshFileChangeValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.length > 0 &&
    typeof candidate.before === "string" &&
    typeof candidate.after === "string"
  );
}

/** One text line plus whether it ends with a newline (EOF marker handling). */
type DiffLine = { text: string; hasNewline: boolean };

/**
 * Split text into lines the way a unified diff sees them: a trailing newline
 * terminates the previous line rather than producing an extra empty one, and
 * the last line keeps its missing-newline state for the patch's
 * `\ No newline at end of file` markers.
 */
function splitDiffLines(text: string): DiffLine[] {
  if (text === "") return [];
  const segments = text.split("\n");
  const lines: DiffLine[] = [];
  for (let i = 0; i < segments.length; i++) {
    const last = i === segments.length - 1;
    if (last && segments[i] === "") break;
    lines.push({ text: segments[i]!, hasNewline: !last });
  }
  return lines;
}

function sameDiffLine(a: DiffLine, b: DiffLine): boolean {
  return a.text === b.text && a.hasNewline === b.hasNewline;
}

// Bounded comparison budget for the line alignment. Beyond it the adapter
// omits the diff (graceful degrade) rather than risk an unbounded O(n*m) walk
// or fabricate positions it cannot compute.
const MAX_DIFF_CHARS = 2_000_000;
const MAX_LCS_CELLS = 4_000_000;

// Context lines per hunk side, matching the builtin edit tool's
// createTwoFilesPatch default (jsdiff context: 4).
const DIFF_CONTEXT = 4;

type DiffEntry = { side: "=" | "-" | "+"; line: DiffLine };

/**
 * Line alignment via an LCS direction table (rolled length rows, so memory is
 * O(min(n,m)) plus the direction bytes). Returns undefined when the comparison
 * would exceed MAX_LCS_CELLS.
 */
function alignLines(
  before: DiffLine[],
  after: DiffLine[],
): DiffEntry[] | undefined {
  const n = before.length;
  const m = after.length;
  if (n * m > MAX_LCS_CELLS) return undefined;
  const dir = new Uint8Array(n * m);
  let prev = new Int32Array(m + 1);
  let curr = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (sameDiffLine(before[i]!, after[j]!)) {
        curr[j] = prev[j + 1]! + 1;
        dir[i * m + j] = 0;
      } else if (prev[j]! >= curr[j + 1]!) {
        curr[j] = prev[j]!;
        dir[i * m + j] = 1;
      } else {
        curr[j] = curr[j + 1]!;
        dir[i * m + j] = 2;
      }
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  const entries: DiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const move = dir[i * m + j];
    if (move === 0) {
      entries.push({ side: "=", line: before[i]! });
      i++;
      j++;
    } else if (move === 1) {
      entries.push({ side: "-", line: before[i]! });
      i++;
    } else {
      entries.push({ side: "+", line: after[j]! });
      j++;
    }
  }
  while (i < n) {
    entries.push({ side: "-", line: before[i]! });
    i++;
  }
  while (j < m) {
    entries.push({ side: "+", line: after[j]! });
    j++;
  }
  return entries;
}

/**
 * Build a unified-diff patch between two full-file texts, mirroring the
 * builtin edit tool's shape: jsdiff `createTwoFilesPatch` with the default
 * 4 context lines, the `Index:`/`---`/`+++` headers, hunk line numbers counted
 * from the real files, and per-line `\ No newline at end of file` markers.
 * Distant changes stay separate hunks — context never bridges unrelated
 * hunks into one fake contiguous change.
 *
 * Returns undefined when the texts are identical or exceed the bounded
 * comparison budget: the caller then omits the diff rather than fabricating
 * one.
 */
function unifiedPatch(
  path: string,
  beforeText: string,
  afterText: string,
): { patch: string; additions: number; deletions: number } | undefined {
  if (beforeText.length + afterText.length > MAX_DIFF_CHARS) return undefined;
  const before = splitDiffLines(beforeText);
  const after = splitDiffLines(afterText);

  // Strip the common prefix/suffix first: typical edits reduce to a tiny
  // middle, so the LCS walk stays cheap without any heuristic.
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    sameDiffLine(before[prefix]!, after[prefix]!)
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    sameDiffLine(
      before[before.length - 1 - suffix]!,
      after[after.length - 1 - suffix]!,
    )
  ) {
    suffix++;
  }

  const oldMiddle = before.slice(prefix, before.length - suffix);
  const newMiddle = after.slice(prefix, after.length - suffix);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return undefined;
  const middle = alignLines(oldMiddle, newMiddle);
  if (!middle) return undefined;

  const entries: DiffEntry[] = [
    ...before.slice(0, prefix).map((line): DiffEntry => ({ side: "=", line })),
    ...middle,
    ...before
      .slice(before.length - suffix)
      .map((line): DiffEntry => ({ side: "=", line })),
  ];

  // A line participates in a hunk when it changed or sits within DIFF_CONTEXT
  // lines of a change; contiguous runs of participants become hunks (the same
  // merge rule jsdiff applies, so hunks split exactly like the builtin's).
  const needed = Array.from({ length: entries.length }, () => false);
  for (let index = 0; index < entries.length; index++) {
    if (entries[index]!.side === "=") continue;
    const from = Math.max(0, index - DIFF_CONTEXT);
    const to = Math.min(entries.length - 1, index + DIFF_CONTEXT);
    for (let k = from; k <= to; k++) needed[k] = true;
  }

  const out: string[] = [
    `Index: ${path}`,
    "===================================================================",
    `--- ${path}`,
    `+++ ${path}`,
  ];
  let additions = 0;
  let deletions = 0;
  let index = 0;
  let oldConsumed = 0;
  let newConsumed = 0;

  while (index < entries.length) {
    if (!needed[index]) {
      const entry = entries[index]!;
      if (entry.side !== "+") oldConsumed++;
      if (entry.side !== "-") newConsumed++;
      index++;
      continue;
    }
    const oldBase = oldConsumed;
    const newBase = newConsumed;
    const hunkLines: string[] = [];
    while (index < entries.length && needed[index]) {
      const entry = entries[index]!;
      if (entry.side !== "+") oldConsumed++;
      if (entry.side !== "-") newConsumed++;
      hunkLines.push((entry.side === "=" ? " " : entry.side) + entry.line.text);
      // A line without a trailing newline carries the standard marker so the
      // patch stays faithful about the file's end-of-file state.
      if (!entry.line.hasNewline)
        hunkLines.push("\\ No newline at end of file");
      if (entry.side === "+") additions++;
      if (entry.side === "-") deletions++;
      index++;
    }
    const oldCount = oldConsumed - oldBase;
    const newCount = newConsumed - newBase;
    // Unified-diff quirk: a zero-length side starts one line lower (jsdiff's
    // formatPatch does the same).
    const oldStart = oldCount === 0 ? oldBase : oldBase + 1;
    const newStart = newCount === 0 ? newBase : newBase + 1;
    out.push(
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...hunkLines,
    );
  }

  return { patch: out.join("\n") + "\n", additions, deletions };
}

/**
 * Strip the common leading indentation from a patch's content lines, mirroring
 * the builtin edit tool's `trimDiff` so dsh edits render exactly like builtin
 * edits in the TUI. Header lines (`Index:`/`---`/`+++`/`@@`/EOF markers) are
 * untouched.
 */
function trimDiff(patch: string): string {
  const lines = patch.split("\n");
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  );
  if (contentLines.length === 0) return patch;
  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1);
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/);
      if (match) min = Math.min(min, match[1]!.length);
    }
  }
  if (min === Infinity || min === 0) return patch;
  const trimmedLines = lines.map((line) => {
    if (
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++")
    ) {
      const prefix = line[0]!;
      const content = line.slice(1);
      return prefix + content.slice(min);
    }
    return line;
  });
  return trimmedLines.join("\n");
}

/**
 * Derive the diff metadata from one dsh file-mutation result `value`
 * (`{path, before, after}` from edit): the unified patch for
 * the TUI (trimDiff-applied, builtin parity) plus the full-file texts and
 * exact `+N/-N` counts for the Workbench `filediff`. Returns undefined when
 * the value is absent, malformed, or too large to diff — the caller then
 * falls back to the meta.diffs path or omits diff metadata entirely.
 */
function filediffFromValue(value: unknown):
  | {
      file: string;
      before: string;
      after: string;
      patch: string;
      additions: number;
      deletions: number;
    }
  | undefined {
  if (!isDshFileChangeValue(value)) return undefined;
  const full = unifiedPatch(value.path, value.before, value.after);
  if (!full) return undefined;
  return {
    file: value.path,
    before: value.before,
    after: value.after,
    patch: trimDiff(full.patch),
    additions: full.additions,
    deletions: full.deletions,
  };
}

type DshDiff = { path: string; oldText: string | null; newText: string };

/**
 * Count added/removed lines between two texts using an order-sensitive,
 * duplicate-preserving LCS diff. A line present on both sides is not a change;
 * only lines unique to one side count toward the `+N/-N` badge, matching the
 * builtin edit tool's per-change statistics. Repeated lines are handled
 * correctly (e.g. `"same\nsame"` → `"same"` is `+0/-1`, not `+0/-0`).
 *
 * Uses a rolling LCS-length table (O(m) memory) instead of a full O(n*m) table,
 * so large hunks cannot exhaust memory. Retained lines equal the LCS length,
 * so deletions = n - LCS and additions = m - LCS. For very large hunks the
 * O(n*m) comparison is bounded by a threshold: beyond it the function returns
 * `null` so the caller omits the structured `filediff` entirely rather than
 * showing a misleading badge.
 */
function countLineChanges(
  before: string,
  after: string,
): { additions: number; deletions: number } | null {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const n = beforeLines.length;
  const m = afterLines.length;
  // Bound the O(n*m) LCS comparison. Beyond this, signal "too large to count
  // precisely" so the caller drops the filediff instead of emitting a wrong
  // badge.
  const MAX_LCS_CELLS = 1_000_000;
  if (n * m > MAX_LCS_CELLS) {
    return null;
  }
  let prev = Array.from<number>({ length: m + 1 }).fill(0);
  let curr = Array.from<number>({ length: m + 1 }).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      curr[j] =
        beforeLines[i] === afterLines[j]
          ? prev[j + 1] + 1
          : Math.max(prev[j], curr[j + 1]);
    }
    [prev, curr] = [curr, prev];
  }
  const lcs = prev[0];
  return { additions: m - lcs, deletions: n - lcs };
}

/**
 * Fallback path: extract an ellamaka `filediff` from dsh result `meta.diffs`.
 *
 * Used only when the result exposes no validated full-file `value` (see
 * `filediffFromValue`). dsh's edit/write tools project `meta.diffs` (an array
 * of `{path, oldText, newText}` hunks, one per applied change) via their
 * `presentationMeta`. The Workbench render layer (`message-part.tsx`) consumes
 * `filediff` with `file`/`before`/`after` and derives the diff itself when
 * `patch` is absent.
 *
 * The adapter merges every hunk into a single `filediff`: `before`/`after`
 * concatenate each hunk's old/new text, and the `+N/-N` badge sums the
 * per-hunk line changes. This mirrors dsh's own DiffBlock, which draws each
 * hunk's old side red and new side green without line numbers. These hunks
 * carry no absolute line positions, so no unified patch is derived from them
 * (the Workbench derives the display diff from the concatenated texts).
 * Malformed or absent meta yields `undefined` so the projected tool degrades
 * to plain text.
 */
function filediffFromMeta(meta: unknown):
  | {
      file: string;
      before: string;
      after: string;
      additions: number;
      deletions: number;
    }
  | undefined {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta))
    return undefined;
  const diffs = (meta as Record<string, unknown>).diffs;
  if (!Array.isArray(diffs) || diffs.length === 0) return undefined;
  const file = (diffs[0] as Partial<DshDiff> | undefined)?.path;
  if (typeof file !== "string" || file.length === 0) return undefined;
  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  let additions = 0;
  let deletions = 0;
  for (const raw of diffs) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return undefined;
    const diff = raw as Partial<DshDiff>;
    if (typeof diff.path !== "string" || typeof diff.newText !== "string")
      return undefined;
    if (diff.oldText !== null && typeof diff.oldText !== "string")
      return undefined;
    const before = diff.oldText ?? "";
    const after = diff.newText;
    beforeParts.push(before);
    afterParts.push(after);
    const counts = countLineChanges(before, after);
    // A null count means the hunk is too large to count precisely; omit the
    // structured filediff rather than show a misleading badge.
    if (counts === null) return undefined;
    additions += counts.additions;
    deletions += counts.deletions;
  }
  return {
    file,
    before: beforeParts.join("\n"),
    after: afterParts.join("\n"),
    additions,
    deletions,
  };
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function askToolPermission(
  source: string,
  args: unknown,
  ctx: ToolContext,
): Promise<void> {
  if (source === "bash") {
    const command = (args as { command?: unknown }).command;
    if (typeof command !== "string") return;
    await ctx.ask({
      permission: "bash",
      patterns: [command],
      always: [command],
      metadata: {},
    });
    return;
  }

  const input = args as {
    file_path?: unknown;
    path?: unknown;
    command?: unknown;
  };
  const filePath =
    source === "str_replace_editor" ? input.path : input.file_path;
  if (typeof filePath !== "string") return;
  const permission =
    source === "read" ||
    (source === "str_replace_editor" && input.command === "view")
      ? "read"
      : source === "write" ||
          source === "edit" ||
          source === "str_replace_editor"
        ? "edit"
        : undefined;
  if (!permission) return;

  const filepath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(ctx.directory, filePath);
  const isProjectPath =
    isInside(ctx.directory, filepath) ||
    (ctx.worktree !== "/" && isInside(ctx.worktree, filepath));
  if (!isProjectPath) {
    const parentDir = path.dirname(filepath);
    const pattern = path.join(parentDir, "*").replaceAll("\\", "/");
    await ctx.ask({
      permission: "external_directory",
      patterns: [pattern],
      always: [pattern],
      metadata: { filepath, parentDir },
    });
  }

  await ctx.ask({
    permission,
    patterns: [path.relative(ctx.worktree, filepath).replaceAll("\\", "/")],
    always: ["*"],
    metadata: {},
  });
}

export async function dshAdapter(
  _input: PluginInput,
  rawOptions?: PluginOptions,
): Promise<Hooks> {
  // Prefer the engine-delivered `input.pluginConfig["dsh-adapter"]` slice;
  // fall back to the legacy inline mount options. Invalid config throws here
  // so startup fails loud rather than silently degrading the sandbox stance.
  const options = resolveDshAdapterConfig(_input, rawOptions);

  // Sandbox OFF (`enabled: false` or absent): idle the tool projection
  // entirely. Registering no `tool.provider` means ellamaka's builtin tools
  // run untouched — the same runtime behavior as if this plugin were not
  // loaded. The container is not inspected, no facade is built, no
  // `sandbox/mode` event is seeded. This gates the tool projection only: any
  // future adapter responsibility outside the projection mounts normally.
  if (options.sandbox?.enabled !== true) return {};

  const container = (globalThis as Record<string, unknown>)
    .__ellamakaDshContainer as Container | undefined;
  // Container missing -> the provider silently returns no tools (degraded).
  if (!container) return { "tool.provider": async (_input, _output) => {} };
  const tools = container.get("tools");
  if (!tools) return { "tool.provider": async (_input, _output) => {} };

  const log = container.logger("dsh-adapter");
  const sessions = new Map<string, FacadeSession>();

  // Resolve the space-level escalation policy once at mount. `ask` (the
  // default) bridges dsh approval asks to ellamaka Permission; `never` seeds
  // an `approval/policy` override into every session facade so dsh's
  // ApprovalService rejects deterministically before any answerer dispatch.
  const escalation = options.escalation ?? "ask";
  const escalationPolicyEvents: { type: string; data: unknown }[] =
    escalation === "never"
      ? [{ type: "approval/policy", data: { policy: "never" } }]
      : [];

  // Per-session ask closures for the escalation answerer. Registered on every
  // tools.execute() (the plugin SDK hands each call its own ToolContext.ask
  // bound to the live permission table); keyed by the ellamaka sessionID the
  // dsh request routes back through (req.agent.session.header.id).
  const askRegistry = new Map<string, AskFn>();

  // Escalation answerer bridge (Plan D-03/D-04): dsh's ApprovalService
  // waterfall asks THIS listener before falling through to fail-closed.
  // The ask closure is looked up by the requesting session's id; a hit asks
  // ellamaka Permission (`sandbox_escalation`) and maps the reply to the dsh
  // outcome vocabulary — resolve → `allowed-once`, RejectedError /
  // CorrectedError → `rejected`; a miss delegates via next() so the chain
  // ends at the service's own `unavailable` (fail closed). A container
  // without the cordis event surface (degraded container) skips the bridge:
  // asks then fall through to the service's own fail-closed `unavailable`.
  container.on?.("approval/request", (req, next) => {
    const sessionID = req.agent?.session?.header?.id;
    const ask =
      sessionID !== undefined ? askRegistry.get(sessionID) : undefined;
    if (!ask) return next();
    const targetMode =
      req.reason !== undefined ? targetModeFromReason(req.reason) : undefined;
    return ask({
      permission: "sandbox_escalation",
      patterns: [targetMode ?? "escalation"],
      always: [targetMode ?? "escalation"],
      metadata: {
        tool: req.toolName,
        callID: req.callId,
        justification: req.reason,
        targetMode,
      },
    }).then(
      () => "allowed-once",
      (error: unknown) => {
        const name = (error as { name?: string } | undefined)?.name;
        if (
          name === "PermissionRejectedError" ||
          name === "PermissionCorrectedError"
        )
          return "rejected";
        throw error;
      },
    );
  });

  // Resolve the space-level sandbox policy once at mount. Reaching here means
  // the sandbox is enabled (the factory returned early otherwise), so the
  // default mode is `read-only` when selected, else `workspace-write` (the
  // dsh base profile default). Space-level default (mount-time fallback): the
  // per-message mode from Tool.Context.extra takes precedence; this only
  // applies when the caller did not select a mode (TUI sessions, queue
  // follow-ups without a choice).
  const defaultMode: SandboxMode =
    options.sandbox?.mode === "read-only" ? "read-only" : "workspace-write";
  // Per-facade seed: the space-default sandbox mode fold + (never policy) the
  // approval policy override dsh's ApprovalService folds via
  // effectiveApprovalPolicy. Copied per session so appends never leak across
  // facades. Per-message overrides append at execute time (LAST-wins fold).
  const sandboxEvents: { type: string; data: unknown }[] = [
    { type: "sandbox/mode", data: { mode: defaultMode } },
    ...escalationPolicyEvents,
  ];

  // Per-session facade factory. Seeding appends a fresh copy of the
  // sandbox-mode (and optional approval-policy) events into the session's
  // own log, so each session's seq numbering and folds are independent.
  // The rc.1 contract lives on a private `log` array: `seq` is its length,
  // `eventAt` indexes it, `snapshotEvents` freezes a range slice, and
  // `append` commits a JSON-snapshotted, deep-frozen event — the same
  // contiguity and immutability semantics the official Session grants.
  function facadeFor(sessionID: string, directory: string): FacadeSession {
    let facade = sessions.get(sessionID);
    if (!facade) {
      const log: FacadeEvent[] = [];
      const freezeEvent = (
        type: string,
        seq: number,
        data: unknown,
      ): FacadeEvent =>
        Object.freeze({
          type,
          seq,
          time: Date.now(),
          data: structuredClone(data),
        });
      const seed = (type: string, data: unknown) => {
        log.push(
          Object.freeze({
            type,
            seq: log.length,
            time: Date.now(),
            data: structuredClone(data),
          }),
        );
      };
      for (const event of sandboxEvents) seed(event.type, event.data);
      facade = {
        header: { id: sessionID, cwd: directory },
        get seq() {
          return log.length;
        },
        inheritedEventCount: 0,
        snapshotEvents(from = 0, to = log.length) {
          return Object.freeze(log.slice(from, to));
        },
        eventAt(seq) {
          return log[seq];
        },
        append(type, data) {
          const event = freezeEvent(type, log.length, data);
          log.push(event);
          return event;
        },
        turnDepth: 0,
      };
      sessions.set(sessionID, facade);
    }
    return facade;
  }

  // dsh event-log vocabulary for the composer's full-access preset: the
  // one-shot danger-full-access fold. Never a space-level config value.
  function modeEventValue(mode: SandboxMode): string {
    return mode === "full-access" ? "danger-full-access" : mode;
  }

  // Reference-counted turn boundary around one tools.execute() call. Concurrent
  // calls on the same session share a single open turn: the pair is emitted
  // only at the outermost nesting level, matching dsh's hasOpenTurn semantics.
  async function executeInTurn<T>(
    facade: FacadeSession,
    run: () => Promise<T>,
  ): Promise<T> {
    facade.turnDepth += 1;
    if (facade.turnDepth === 1) facade.append("turn/start", {});
    try {
      return await run();
    } finally {
      facade.turnDepth -= 1;
      if (facade.turnDepth === 0) facade.append("turn/end", {});
    }
  }

  // Project a single container tool onto its same-name builtin slot. The
  // execute closure is rebuilt per provider call but reuses the shared facade
  // cache, logger, and permission-ask logic declared once at adapter scope
  // (memory-level cost).
  function project(
    source: string,
    schema: { description: string; parameters: unknown },
    dispatchSource = source,
  ): ProjectedTool {
    return {
      description: schema.description,
      args: jsonSchemaToZodShape(schema.parameters),
      execute: async (
        args: Record<string, unknown>,
        ctx: ToolContext,
      ): Promise<ToolResult> => {
        // Map the model-facing camelCase args back to dsh snake_case before
        // permission checks and dispatch, so both read the same snake_case
        // surface the container expects.
        const dispatchArgs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args)) {
          dispatchArgs[toSnakeCase(key)] = value;
        }
        await askToolPermission(source, dispatchArgs, ctx);
        const session = facadeFor(ctx.sessionID, ctx.directory);
        // Per-message sandbox override: the composer selector rides on
        // Tool.Context.extra. Appending a fresh sandbox/mode event (LAST-wins
        // fold) switches the effective mode mid-session. Every explicit
        // choice appends — including one equal to the space default — because
        // the facade may already carry an earlier per-message choice (e.g.
        // read-only from a previous turn); skipping same-as-default values
        // would leave that stale override in force. Absence keeps whatever
        // the facade currently folds to.
        const requestedMode = (
          ctx.extra as { sandboxMode?: SandboxMode } | undefined
        )?.sandboxMode;
        if (requestedMode) {
          session.append("sandbox/mode", {
            mode: modeEventValue(requestedMode),
          });
        }
        // Same-mode escalation guard: the model does not see the session's
        // effective mode, so it may retry a denied command with a
        // `sandbox_permissions` equal to the mode this call already runs
        // under. dsh's approveEscalation rejects that as "not strictly
        // wider" — a throw, not an approval — so the call fails with a
        // confusing error instead of just running. Strip the escalation
        // fields when the requested mode equals the effective mode of THIS
        // call: the command can already run as-is, so there is nothing to
        // approve. Only genuinely wider requests reach dsh's approval.
        // The effective mode is this call's message mode when the user made
        // an explicit choice, else the space-level default. The composer
        // linkage keeps them strictly aligned: approval cards that widen the
        // session update the selector, so the next user message carries the
        // wider mode — there is no hidden-wider-than-selector state.
        const requestedEscalation = dispatchArgs.sandbox_permissions;
        if (typeof requestedEscalation === "string") {
          const effective = modeEventValue(requestedMode ?? defaultMode);
          if (requestedEscalation === effective) {
            delete dispatchArgs.sandbox_permissions;
            delete dispatchArgs.justification;
          }
        }
        // Register this call's ask closure for the escalation answerer: dsh
        // routes `approval/request` back through
        // `req.agent.session.header.id` (= ctx.sessionID), and the closure
        // carries the live ellamaka permission table of the calling turn.
        askRegistry.set(ctx.sessionID, ctx.ask);
        const agent = {
          session,
        };
        return executeInTurn(session, async () => {
          const result = await tools.execute({
            callId: ctx.callID ?? `dsh-${source}-${Date.now()}`,
            name: dispatchSource,
            arguments: dispatchArgs,
            signal: ctx.abort ?? new AbortController().signal,
            agent,
          });
          const output = contentText(result.content);
          if (result.isError) {
            const message =
              output || result.error?.message || `dsh tool "${source}" failed`;
            log.error("tool call failed", {
              tool: source,
              sessionID: ctx.sessionID,
              callID: ctx.callID,
              error: message,
            });
            throw new Error(message);
          }
          log.info("tool call", {
            tool: source,
            sessionID: ctx.sessionID,
            callID: ctx.callID,
          });
          const metadata: Record<string, unknown> = {
            source: "dsh-container",
            containerTool: dispatchSource,
          };
          // Prefer the schema-validated full-file value for edit: it yields
          // a real unified patch with accurate hunk line numbers plus an
          // exact-content filediff for the Workbench. meta.diffs remain the
          // fallback for results that expose no value — their hunks carry no
          // absolute positions, so no unified patch can be truthfully derived
          // from them.
          const fullDiff =
            source === "edit" ? filediffFromValue(result.value) : undefined;
          if (fullDiff) {
            metadata.diff = fullDiff.patch;
            metadata.filediff = {
              file: fullDiff.file,
              before: fullDiff.before,
              after: fullDiff.after,
              additions: fullDiff.additions,
              deletions: fullDiff.deletions,
            };
          } else {
            const filediff = filediffFromMeta(result.meta);
            if (filediff) metadata.filediff = filediff;
          }
          return {
            output,
            title: source,
            metadata,
          };
        });
      },
    };
  }

  // Dynamic provider: re-reads the container's live schemas on every model
  // request so mounts/unmounts take effect immediately. The projection set is
  // fixed; a container tool absent from the live schemas is skipped, so a
  // partially-mounted container degrades to the tools it does expose.
  return {
    "tool.provider": async (_input, output) => {
      const available = new Map(tools.schemas().map((s) => [s.name, s]));
      for (const name of PROJECTED_TOOLS) {
        // Shell permissions and the model-facing slot retain the logical name.
        // The live provider decides which platform backend receives execution.
        const dispatchSource =
          name === "bash" && !available.has(name) && available.has("pwsh")
            ? "pwsh"
            : name;
        const schema = available.get(dispatchSource);
        if (!schema) continue;
        output.tools[name] = project(name, schema, dispatchSource);
      }
    },
  };
}

export default { id: "dsh-adapter", server: dshAdapter };
