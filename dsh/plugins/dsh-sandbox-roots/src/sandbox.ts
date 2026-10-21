/**
 * The process-sandbox provider replacement: stock `LocalSandboxProvider`
 * runner selection with the settings-provided extra writable roots merged
 * into the macOS Seatbelt profile. Other runners keep the stock semantics
 * (and fail loud when extra roots are configured, rather than silently
 * dropping them from the profile).
 *
 * @module dsh-sandbox-roots/sandbox
 */

import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import type { ConfinedArgv, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { stockWritableRoots } from './internal/roots.ts'
import { seatbeltProfile } from './internal/seatbelt.ts'
import type { WithExtras } from './internal/types.ts'

/**
 * The extra-roots-aware process-sandbox provider. Registers as `ctx.sandbox`
 * (replacing the `sandbox` row). Without extra roots (or outside
 * `workspace-write`) it delegates to the stock provider, keeping every
 * platform's runner chain; with extra roots it assembles the Seatbelt wrap
 * itself — stock roots plus the extras, canonical and deduplicated — with the
 * stock Seatbelt enforcement evidence.
 */
export class SandboxRootsSandboxProvider extends LocalSandboxProvider {
  /**
   * Wrap `argv` under `policy`, granting the extra roots when the policy
   * carries them. The extra roots ride the resolved policy object, so a
   * per-call consumer (the bash sandbox executor resolves before every
   * wrap) receives them without any per-session state here.
   * @param argv - the exact argv the caller is about to spawn.
   * @param policy - the file-effect policy this execution runs under.
   * @param signal - cancellation forwarded to the stock provider's runner resolution.
   * @returns the wrapped argv plus the selected backend's evidence, or the
   *   stock provider's verdict when no extra root is configured.
   */
  override async confine(
    argv: readonly string[],
    policy: SandboxPolicy,
    signal?: AbortSignal,
  ): Promise<ConfinedArgv> {
    const extras = (policy as WithExtras).writableRoots ?? []
    if (policy.mode !== 'workspace-write' || extras.length === 0) {
      return super.confine(argv, policy, signal)
    }
    if (process.platform !== 'darwin') {
      throw new Error(`dsh-sandbox-roots: writableRoots (${extras.length} root(s)) requires the macOS Seatbelt runner; unsupported runner platform ${process.platform}`)
    }
    // Both lists are canonical by construction (stock derivation; expandRoot
    // at resolve time) — the Set merge is the only deduplication needed.
    const roots = [...new Set([...stockWritableRoots(policy), ...extras])]
    return {
      argv: ['sandbox-exec', '-p', seatbeltProfile(roots), '--', ...argv],
      enforcement: 'full',
      denialSignatures: ['operation not permitted'],
      runnerFailureRules: [{ fatalSignatures: ['sandbox-exec: '] }],
    }
  }
}

export default SandboxRootsSandboxProvider