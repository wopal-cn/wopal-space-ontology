/**
 * Pure-derivation tests for the allow-list home: tilde/relative expansion,
 * deduplication, and the Seatbelt form builder.
 */

import { homedir, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { expandRoot, firstRootContaining, stockWritableRoots } from '../src/internal/roots.ts'
import { seatbeltProfile } from '../src/internal/seatbelt.ts'

describe('expandRoot', () => {
  it('expands a bare ~ to the home directory', () => {
    expect(expandRoot('~')).toBe(canonicalPath(homedir()))
  })

  it('expands a ~-prefixed path below the home directory', () => {
    expect(expandRoot('~/sub/dir')).toBe(canonicalPath(join(homedir(), 'sub/dir')))
  })

  it('resolves a relative entry against the process cwd', () => {
    expect(expandRoot('dsh-sandbox-roots-rel-unique/./a')).toBe(resolve('dsh-sandbox-roots-rel-unique/a'))
  })

  it('keeps an absolute entry absolute and lexically normalized when it is missing', () => {
    expect(expandRoot('/nonexistent-dsh-roots/./x')).toBe('/nonexistent-dsh-roots/x')
  })

  it('preserves the spelling of a missing path', () => {
    const missing = join(homedir(), `dsh-sandbox-roots-missing-${process.pid}`)
    expect(expandRoot(missing)).toBe(missing)
  })
})

describe('firstRootContaining', () => {
  it('returns true when the target key is the root itself', async () => {
    const root = canonicalPath('/tmp')
    expect(await firstRootContaining(root, [root])).toBe(true)
  })

  it('returns true when the target key lies beneath the root', async () => {
    const root = canonicalPath('/tmp')
    expect(await firstRootContaining(`${root}${sep}child${sep}file`, [root])).toBe(true)
  })

  it('returns false when no root contains the target', async () => {
    expect(await firstRootContaining('/usr/bin/node', ['/nonexistent-root'])).toBe(false)
  })

  it('returns false for an empty extras list', async () => {
    expect(await firstRootContaining('/tmp/anything', [])).toBe(false)
  })
})

describe('stockWritableRoots', () => {
  it('mirrors the stock writableRoots closed set', () => {
    const roots = stockWritableRoots({ mode: 'workspace-write', workspaceRoot: '/ws' })
    expect(roots).toEqual([...new Set([resolve('/ws'), canonicalPath('/tmp'), canonicalPath(tmpdir())])])
  })

  it('returns an empty list outside workspace-write', () => {
    expect(stockWritableRoots({ mode: 'read-only', workspaceRoot: '/ws' })).toEqual([])
    expect(stockWritableRoots({ mode: 'danger-full-access', workspaceRoot: '/ws' })).toEqual([])
  })
})

describe('seatbeltProfile', () => {
  /** The stock profiles.ts assembly, replicated for character-for-character parity. */
  function stockSeatbeltProfile(roots: string[]): string {
    const sbpl = (path: string): string => `"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    const forms = ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write* (literal ${sbpl('/dev/null')}))`]
    if (roots.length > 0) {
      forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbpl(root)})`).join(' ')})`)
    }
    return forms.join(' ')
  }

  it('matches the stock form sequence exactly for the standard roots', () => {
    const roots = stockWritableRoots({ mode: 'workspace-write', workspaceRoot: '/ws' })
    expect(seatbeltProfile(roots)).toBe(stockSeatbeltProfile(roots))
  })

  it('appends a subpath form for each extra root', () => {
    const extra = expandRoot('~/extra-root')
    const profile = seatbeltProfile([canonicalPath('/tmp'), extra])
    expect(profile).toContain(`(subpath "${extra.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`)
    expect(profile).toContain('(deny file-write*)')
    expect(profile).toContain('(literal "/dev/null")')
  })

  it('escapes backslashes and double quotes in root spellings', () => {
    const profile = seatbeltProfile(['/we"ird\\path'])
    expect(profile).toContain('(subpath "/we\\"ird\\\\path")')
  })
})
