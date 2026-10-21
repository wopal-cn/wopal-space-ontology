/**
 * Filesystem-fence tests. The extra-root fixtures live under the space's
 * sanctioned scratch area (`.wopal-space/.tmp`), the one writable location
 * outside the stock writable roots, so the bypass path is the only way a
 * write there can succeed.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { describe, expect, it } from 'vitest'
import type { WithExtras } from '../src/index.ts'
import { SandboxRootsFileSystem } from '../src/fs.ts'

/** The workspace-root scratch area, derived from this test file's location. */
function scratchBase(): string {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url))
  const workspaceRoot = resolve(packageRoot, '..', '..', '..')
  const base = join(workspaceRoot, '.wopal-space', '.tmp')
  mkdirSync(base, { recursive: true })
  return base
}

const DENIED_WORKSPACE = '/nonexistent-dsh-roots-ws'

function mount(initial: WithExtras): { fs: SandboxRootsFileSystem; setPolicy: (next: WithExtras) => void } {
  let policy: WithExtras = initial
  const ctx = new Context()
  ctx.provide('sandboxPolicy', { defaultMode: 'workspace-write', resolve: () => policy })
  const fs = new SandboxRootsFileSystem(ctx, {
    cwd: initial.writableRoots?.[0] ?? scratchBase(),
    diffBasisMaxBytes: 10 * 1024 * 1024,
  })
  return { fs, setPolicy: (next) => { policy = next } }
}

describe('SandboxRootsFileSystem', () => {
  it('writes a target under an extra root by bypassing the stock fence', async () => {
    const root = mkdtempSync(join(scratchBase(), 'fs-bypass-'))
    try {
      const canonicalRoot = canonicalPath(root)
      const { fs } = mount({ mode: 'workspace-write', workspaceRoot: DENIED_WORKSPACE, writableRoots: [canonicalRoot] })
      const target = await fs.resolve(join(root, 'hello.txt'))
      await fs.writeText(target, 'hello')
      expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('hello')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('edits a target under an extra root by bypassing the stock fence', async () => {
    const root = mkdtempSync(join(scratchBase(), 'fs-edit-'))
    try {
      writeFileSync(join(root, 'note.txt'), 'before')
      const canonicalRoot = realpathSync(root)
      const { fs } = mount({ mode: 'workspace-write', workspaceRoot: DENIED_WORKSPACE, writableRoots: [canonicalRoot] })
      const target = await fs.resolve(join(root, 'note.txt'))
      await fs.editText(target, { oldString: 'before', newString: 'after', replaceAll: false })
      expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('after')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('denies a target outside every writable root with FS_SANDBOX_DENIED', async () => {
    const root = mkdtempSync(join(scratchBase(), 'fs-denied-'))
    try {
      const { fs } = mount({ mode: 'workspace-write', workspaceRoot: DENIED_WORKSPACE, writableRoots: [] })
      const target = await fs.resolve(join(root, 'hello.txt'))
      const error = await fs.writeText(target, 'hello').then(() => undefined, (thrown: unknown) => thrown)
      expect(error).toBeInstanceOf(FsError)
      expect((error as FsError).code).toBe('FS_SANDBOX_DENIED')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('denies under read-only mode even when the target sits in an extra root', async () => {
    const root = mkdtempSync(join(scratchBase(), 'fs-readonly-'))
    try {
      const canonicalRoot = realpathSync(root)
      const { fs } = mount({ mode: 'read-only', workspaceRoot: DENIED_WORKSPACE, writableRoots: [canonicalRoot] })
      const target = await fs.resolve(join(root, 'hello.txt'))
      const error = await fs.writeText(target, 'hello').then(() => undefined, (thrown: unknown) => thrown)
      expect((error as FsError).code).toBe('FS_SANDBOX_DENIED')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})