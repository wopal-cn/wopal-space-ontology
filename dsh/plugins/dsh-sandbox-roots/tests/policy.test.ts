/**
 * Policy-service tests: resolution of the composition entry's extra writable
 * roots onto every `workspace-write` policy, and the stock semantics the
 * override must leave untouched.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { SandboxRootsPolicyService } from '../src/index.ts'
import type { WithExtras } from '../src/index.ts'

type PolicyConfig = ConstructorParameters<typeof SandboxRootsPolicyService>[1]

function fakeSession(cwd?: string): Session {
  const id = 'sess-fake'
  return { id, header: { id, ...(cwd === undefined ? {} : { cwd }) } } as unknown as Session
}

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

async function mounted(config: PolicyConfig): Promise<SandboxRootsPolicyService> {
  const ctx = new Context()
  ctx.provide('sessionProjections', { register: () => () => {}, stateOf: () => undefined })
  return new SandboxRootsPolicyService(ctx, config)
}

describe('SandboxRootsPolicyService', () => {
  it('resolves the stock-shaped policy when config declares no extra root', async () => {
    const service = await mounted({ mode: 'workspace-write', workspaceRoot: '/fallback', writableRoots: [] })
    await tick()
    expect(service.resolve()).toEqual({ mode: 'workspace-write', workspaceRoot: resolve('/fallback') })
  })

  it('attaches the config roots expanded, canonicalized, and deduplicated', async () => {
    const service = await mounted({
      mode: 'workspace-write',
      workspaceRoot: '/fallback',
      writableRoots: ['~/docs', '~/docs', '/tmp/extra'],
    })
    await tick()
    const policy = service.resolve() as WithExtras
    expect(policy.writableRoots).toEqual([canonicalPath(join(homedir(), 'docs')), canonicalPath('/tmp/extra')])
  })

  it('carries no writableRoots outside workspace-write even with configured roots', async () => {
    for (const mode of ['read-only', 'danger-full-access'] as const) {
      const service = await mounted({ mode, workspaceRoot: '/fallback', writableRoots: ['/tmp/extra'] })
      await tick()
      const policy = service.resolve()
      expect(policy.mode).toBe(mode)
      expect('writableRoots' in policy).toBe(false)
    }
  })

  it('keeps the stock session-cwd and approved-override semantics', async () => {
    const service = await mounted({ mode: 'workspace-write', workspaceRoot: '/fallback', writableRoots: ['/tmp/extra'] })
    await tick()
    expect(service.resolve({ session: fakeSession('/projects/x') })).toEqual({
      mode: 'workspace-write',
      workspaceRoot: resolve('/projects/x'),
      sessionId: 'sess-fake',
      writableRoots: [canonicalPath('/tmp/extra')],
    })
    const overridden = service.resolve({ session: fakeSession('/projects/x'), mode: 'read-only' })
    expect('writableRoots' in overridden).toBe(false)
  })

  it('hands each resolve its own array, so a caller cannot mutate the configured roots', async () => {
    const service = await mounted({ mode: 'workspace-write', workspaceRoot: '/fallback', writableRoots: ['/tmp/extra'] })
    await tick()
    const first = service.resolve() as WithExtras
    first.writableRoots?.push('/tmp/injected')
    expect((service.resolve() as WithExtras).writableRoots).toEqual([canonicalPath('/tmp/extra')])
  })
})
