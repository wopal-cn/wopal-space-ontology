---
name: dsh-web-fetch-http-fakeip
description: @wopal fork of the official dsh-web-fetch-http plugin — dual-runtime (ellamaka/official dsh) install and dependency-resolution boundaries, fork modification constraints, and verification requirements
---

# dsh-web-fetch-http-fakeip — Agent Rules

Fork of the official `@deepseek-ai/dsh-web-fetch-http`: allows the Clash TUN
fake-ip range (198.18.0.0/15) so `ctx.web` / `web_fetch` works behind the
user's proxy while every other SSRF guard stays intact. This package edits
`lib/index.js` directly and has no build chain of its own.

Authoritative documents:

- Upstream reference source (same version as this package):
  `labs/ref-repos/deepseek-harness/` (REF)
- Replacement contract: header comment of `cordis.patch.yml` (never change a
  row's `name`; disable the stock row, then insert a new row with a new id)

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

## Fork modification constraints

- Every fork modification point carries a
  `// Fork (dsh-web-fetch-http-fakeip): ...` comment anchor stating intent
  and allow scope; keep the diff against upstream minimal.
- When upgrading the upstream version: re-apply all Fork-anchor changes and
  introduce nothing beyond the anchors.

## Verification requirements

This package has no test chain; verify against the target runtime:

- ellamaka: reinstall with `ellamaka dsh plugin --profile web add <dir>`,
  then the user restarts the engine to verify (restarts are always performed
  by the user).
- Official dsh: boot `dsh web` under an **isolated copy** of `$DSH_HOME` and
  verify a zero-error plugin tree; never run boot experiments against any
  live home.
- After every change, check that the disable/insert pair in
  `cordis.patch.yml` still maps correctly onto the upstream provider id.
