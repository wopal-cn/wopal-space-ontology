/**
 * Shared types for the plugin's extension of the stock policy shape. Types
 * only — no runtime code.
 * @module dsh-sandbox-roots/internal/types
 */

import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'

/**
 * The extra writable roots this plugin owns. They ride the composition entry's
 * `config.writableRoots`, so the settings service projects them into the same
 * form as `mode` and `workspaceRoot`. A type alias on purpose: the implicit
 * index signature keeps the shape assignable to the schemastery `Dict`-extended
 * schema parameter types.
 */
export type SandboxRootsSection = {
  /** Extra writable directory roots as configured (`~` and relative spellings allowed). */
  writableRoots?: string[]
}

/**
 * The resolved policy extension: the stock execution policy plus the
 * config-derived extra roots, attached under `workspace-write` only.
 */
export type WithExtras = SandboxExecutionPolicy & SandboxRootsSection
