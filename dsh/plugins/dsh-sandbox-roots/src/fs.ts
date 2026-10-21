/**
 * The sandbox-enforcing filesystem replacement: stock `SandboxedFileSystem`
 * semantics, plus a bypass that lets a mutation reach a target canonicalizing
 * under a settings-provided extra root. Targets under the stock roots (and
 * every denial) keep the stock behavior untouched.
 *
 * @module dsh-sandbox-roots/fs
 */

import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import type {
  FsEditOutcome,
  FsEditRequest,
  FsTarget,
  FsVersion,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { WithExtras } from './internal/types.ts'
import { firstRootContaining } from './internal/roots.ts'

/** Plugin config: the local backend's knobs verbatim; no new configuration. */
export type Config = LocalConfig

/**
 * The extra-roots-aware filesystem backend. Registers as `ctx.fs` (replacing
 * the `fs-sandbox` row). A `workspace-write` mutation whose fresh canonical
 * target lies under a `writableRoots` entry is delegated straight to the
 * inherited local backend — the stock fence's own roots would deny it, so the
 * bypass skips the fence for this target only; every other target (and every
 * denial) takes the stock path unchanged.
 */
export class SandboxRootsFileSystem extends SandboxedFileSystem {
  static inject = ['sandboxPolicy']

  /**
   * Fence the write by the per-call policy, allowing the extra-root bypass,
   * then delegate to the inherited atomic write. See {@link extraRootTarget}.
   * @param target - the resolved target to write.
   * @param content - the full new file content.
   * @param expected - the write intent guarding the write; omit for unconditional.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call policy; omit to use the deployment fallback.
   * @returns the write outcome from the inherited backend.
   */
  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    const bypass = await this.extraRootTarget(target, sandboxPolicy)
    if (bypass !== undefined) {
      // Cross-generation call: the inherited local write, skipping the stock
      // fence the direct `super` path would re-apply (and deny) for this target.
      return LocalFileSystem.prototype.writeText.call(this, bypass, content, expected, signal)
    }
    return super.writeText(target, content, expected, signal, sandboxPolicy)
  }

  /**
   * Fence the edit by the per-call policy, allowing the extra-root bypass,
   * then delegate to the inherited atomic edit. See {@link extraRootTarget}.
   * @param target - the resolved target to edit.
   * @param edit - the literal search/replace request.
   * @param expected - the version guard; omit for an unconditional edit.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call policy; omit to use the deployment fallback.
   * @returns the edit outcome from the inherited backend.
   */
  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    const bypass = await this.extraRootTarget(target, sandboxPolicy)
    if (bypass !== undefined) {
      return LocalFileSystem.prototype.editText.call(this, bypass, edit, expected, signal)
    }
    return super.editText(target, edit, expected, signal, sandboxPolicy)
  }

  /**
   * Return the EXACT target the mutation must use when the target
   * canonicalizes under a settings-provided extra root, or `undefined` to
   * take the stock fence path unchanged. Only `workspace-write` policies
   * carrying extra roots can produce a bypass; the fresh resolve mirrors the
   * stock fence's re-canonicalization, and the mutation delegates with this
   * fresh target (no check-here-write-there drift).
   */
  private async extraRootTarget(target: FsTarget, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsTarget | undefined> {
    const policy = (sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()) as WithExtras
    if (policy.mode !== 'workspace-write') return undefined
    const extras = policy.writableRoots ?? []
    if (extras.length === 0) return undefined
    const fresh = await this.resolve(target.displayPath)
    if (await firstRootContaining(fresh.targetKey, extras)) return fresh
    return undefined
  }
}

export default SandboxRootsFileSystem