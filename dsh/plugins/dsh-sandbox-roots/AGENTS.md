---
name: dsh-sandbox-roots
description: Sandbox writable-roots extension plugin (@wopal/dsh-sandbox-roots) — plugin dependency-resolution boundary and mandatory TDD
---

# dsh-sandbox-roots — Agent Rules

In `workspace-write` sandbox mode, merge the `writableRoots` declared in
settings (the `sandbox-policy:` section, hot-reloaded) into the fs tool
allow-list, the process sandbox allow-list, and the policy object itself.
The implementation specification (design of record) is `docs/design.md` —
it holds the upstream version anchor, verified facts, and per-file design.
**Read it before implementing; this file does not restate its content.**

Authoritative documents:

- Implementation specification: `docs/design.md`
- Upstream reference source (same version as the deployment closure):
  `labs/ref-repos/deepseek-harness/` (REF)

## Development commands

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # tsdown, output into lib/
pnpm check       # typecheck + test + build full chain
```

## TDD is mandatory

All logic in `src/` (including `internal/` pure functions and the three
service subclasses) requires a failing test first (`tests/*.test.ts`), then
the implementation; refactors adjust tests in step. Upstream-behavior
replication (e.g. `internal/containment.ts` copied from REF) is likewise
locked by tests.

## Plugin dependency resolution (highest priority)

One installer serves both runtimes: the official plugin manager's pnpm, on
the profile's own `package.json`. `ellamaka dsh plugin add <dir>` forwards to
it. This package is a plain dsh bundle and needs no special packaging, but
the spec form decides what lands in the profile (measured on dsh
0.2.0-rc.2):

- **`file:<abs>`** copies the package into `<profile>/node_modules/` (per its
  `files` field) and installs its `dependencies` there. This is what
  `ellamaka dsh plugin add <dir>` records, and the only option for a package
  with registry dependencies.
- **A bare path** is recorded as `link:<abs>` — a symlink to the source tree.
  Its `dependencies` are **not** installed; any `import` of one fails with
  `ERR_MODULE_NOT_FOUND`. Only usable for live-edit development of a package
  whose runtime imports all resolve elsewhere.

Rules that follow:

- **Registry dependencies** (`dependencies`) install only on a `file:`
  install; keep them genuinely third-party. A `@deepseek-ai/*` entry here
  duplicates a module the host already runs, and the profile copy wins
  resolution from inside the plugin.
- **Peers** (`peerDependencies`) are resolved by the dsh loader from the
  installation scope, independently of the spec form: a `link:` install
  resolves them fine. No per-plugin linking step exists or is needed.
- **pnpm** is a host prerequisite, exactly as for the official `dsh` CLI:
  neither product bundles or installs one. A missing `pnpm` fails the install
  with an explicit message.
- **The source directory stays clean of what `file:` would copy**: the
  install takes only the `files` field, so `node_modules/`, `lib/` and
  `pnpm-lock.yaml` are local development state and stay out of version
  control. Do not run `pnpm run link-peers`-style peer materialization or
  `npm install` here; none is needed.

## Upstream alignment constraints

- Official packages inside the closure ship without `src/`; never deep-import
  `@deepseek-ai/*` `src/*` at runtime. Upstream implementations this plugin
  needs are copied into `internal/` as directed by `docs/design.md` and
  locked by tests.
- When overriding official services (the sandbox-policy / fs-sandbox /
  sandbox provider rows), `static Config` must restate every stock field
  before adding new ones (a patch row's config is replaced wholesale, never
  deep-merged).

## Verification requirements

- Automated: a green `pnpm check` is a precondition for any commit.
- ellamaka: reinstall with `ellamaka dsh plugin --profile web add <dir>`,
  then the user restarts the engine to verify (restarts are always performed
  by the user).
- Official dsh: boot `dsh web` under an **isolated copy** of `$DSH_HOME` and
  verify a zero-error plugin tree; never run boot experiments against any
  live home.
