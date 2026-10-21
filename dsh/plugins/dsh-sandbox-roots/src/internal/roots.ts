/**
 * The extra-allow-list derivation home: expansion of configured roots to
 * canonical spellings, the stock `workspace-write` closed set (replicated so
 * the provider can merge it with the extras inside one profile string), and
 * the extras-containment decision the fs fence delegates to.
 * @module dsh-sandbox-roots/internal/roots
 */

import { homedir, tmpdir } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { isPathUnder } from './containment.ts'

/**
 * Expand one configured root to its canonical absolute spelling: a leading
 * `~` becomes the user home, relative entries resolve against the process
 * cwd, and the result is canonicalized (`realpathSync.native`). A missing
 * path keeps its absolute spelling — it matches nothing until it exists,
 * the stock conservative outcome.
 * @param entry - the root as configured.
 * @returns the canonical root spelling.
 */
export function expandRoot(entry: string): string {
  const absolute = entry === '~'
    ? homedir()
    : entry.startsWith('~/')
      ? resolvePath(homedir(), entry.slice(2))
      : resolvePath(entry)
  return canonicalPath(absolute)
}

/**
 * The stock `writableRoots` closed set — `workspaceRoot`, `/tmp`, and
 * `os.tmpdir()`, canonicalized and deduplicated; empty outside
 * `workspace-write`. Replicated (rather than imported) because the provider
 * assembles one merged root list for its profile string; parity with the
 * stock derivation is pinned by test.
 * @param policy - the file-effect policy to derive the stock roots from.
 * @returns the canonical stock writable roots.
 */
export function stockWritableRoots(policy: SandboxExecutionPolicy): string[] {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}

/**
 * Whether a canonical target key is contained by any of the roots — the pure
 * part of the fs fence's extra-root bypass decision.
 * @param targetKey - the canonical target key to test.
 * @param roots - the canonical extra roots.
 * @returns whether any root contains the target.
 */
export async function firstRootContaining(targetKey: string, roots: readonly string[]): Promise<boolean> {
  for (const root of roots) {
    if (await isPathUnder(targetKey, root)) return true
  }
  return false
}
