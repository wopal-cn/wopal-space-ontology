/**
 * The sandbox-policy service replacement: stock `SandboxPolicyService`
 * resolution (mode, session cwd, override kit, prompt context) with the
 * composition entry's extra writable roots attached to every
 * `workspace-write` policy. The enforcing consumers — the fs fence
 * (`./fs`) and the process wrapper (`./sandbox`) — read the extra
 * `writableRoots` field; stock consumers see the plain policy shape.
 *
 * @module dsh-sandbox-roots
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import type { Config as PolicyConfig, SandboxPolicyRequest } from '@deepseek-ai/dsh-sandbox-policy'
import { expandRoot } from './internal/roots.ts'
import type { WithExtras } from './internal/types.ts'

export type { SandboxRootsSection, WithExtras } from './internal/types.ts'

/**
 * Plugin config: the stock sandbox-policy keys verbatim plus the extra
 * writable roots. This plugin's Config is the one configuration surface — the
 * settings service projects it into a form from the schema, so the extra
 * roots are edited beside `mode` and `workspaceRoot` rather than in a
 * separate plugin-owned section.
 */
export interface Config extends PolicyConfig {
  /** Extra writable roots honored under `workspace-write`, `~` spells the home directory (default: none). */
  writableRoots?: string[]
}

/**
 * The policy service (`ctx.sandboxPolicy`). Stamps every resolved
 * `workspace-write` policy with the configured extra roots as
 * `writableRoots` (canonical, deduplicated; absent when the list is empty, so
 * the stock policy shape is preserved).
 */
export class SandboxRootsPolicyService extends SandboxPolicyService {
  // Inline schema call: the config catalog walks `static Config` statically.
  static Config: z<Config> = z.object({
    mode: z.union(['read-only', 'workspace-write', 'danger-full-access'] as const).default('read-only'),
    workspaceRoot: z.string(),
    writableRoots: z.array(z.string()).default([]),
  })

  // Identical to the stock injection.
  static inject = ['sessionProjections']

  /** The configured extra roots, expanded and canonical, deduplicated once at construction. */
  private readonly extras: readonly string[]

  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.extras = [...new Set((config.writableRoots ?? []).map(expandRoot))]
  }

  /**
   * Resolve the complete policy for one capability call — the stock mode,
   * workspace root, and session identity, plus the configured
   * `writableRoots` under `workspace-write` (the field is omitted when no
   * extra root is configured, preserving the stock policy shape).
   * @param request - optional session and approved mode override.
   * @returns the fully resolved per-call policy.
   */
  override resolve(request: SandboxPolicyRequest = {}): WithExtras {
    const base = super.resolve(request)
    if (base.mode !== 'workspace-write' || this.extras.length === 0) return base
    return { ...base, writableRoots: [...this.extras] }
  }
}

export default SandboxRootsPolicyService
