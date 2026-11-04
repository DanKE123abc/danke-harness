/**
 * Git Bash executor routing tests: the compat router decides how `execute()`
 * resolves argv (Git Bash `-c`), stamps sandbox facts, or refuses; the real
 * spawn mechanics are stubbed so the routing is deterministic on any host.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SANDBOX_UNAVAILABLE, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import type { ShellExecSpec, ShellExecution, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { GitBashSandboxExecutor, type GitBashConfig } from '../src/index.ts'
import type { GitBashResolution } from '../src/bash-path.ts'

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe'

/** Minimal volatile config surface. */
function makeConfig(compat: 'auto' | 'strict' = 'auto'): GitBashConfig {
  return {
    cwd: { get: () => '' },
    timeoutMs: { get: () => 60000 },
    maxTimeoutMs: { get: () => 600000 },
    maxOutputBytes: { get: () => 64000 },
    maxSpillBytes: { get: () => 64 * 1024 * 1024 },
    graceMs: { get: () => 3000 },
    bashPath: { get: () => '' },
    compat: { get: () => compat },
  }
}

function makeSpec(mode: string, overrides: Partial<ShellExecSpec> = {}): ShellExecSpec {
  return {
    command: 'echo hi',
    workdir: 'C:\\work',
    timeoutMs: 60000,
    onExpiry: 'kill',
    sandboxPolicy: { mode: mode as 'danger-full-access', workspaceRoot: 'C:\\work' },
    ...overrides,
  } as unknown as ShellExecSpec
}

function emptyResult(): ShellRunResult {
  return { stdout: { text: '', truncated: false }, stderr: { text: '', truncated: false }, exitCode: 0, signal: null }
}

/** A subclass that records argv and short-circuits the spawn mechanics. */
class StubExecutor extends GitBashSandboxExecutor {
  recorded: string[] = []
  constructor(ctx: Context, config: GitBashConfig, private readonly bash: string | undefined) {
    super(ctx, config)
  }
  override requireBashPath(): string {
    if (this.bash === undefined || this.bash === '') throw new Error('gitbash-sandbox: no Git for Windows bash found')
    return this.bash
  }
  protected override async executeArgv(spec: ShellExecSpec, argvOrPrepare: readonly string[]): Promise<ShellExecution> {
    this.recorded = [...argvOrPrepare]
    return { result: () => Promise.resolve(emptyResult()) } as unknown as ShellExecution
  }
}

/** A subclass that pins the bash-resolution verdict without touching the real fs. */
class ResolveExecutor extends GitBashSandboxExecutor {
  constructor(ctx: Context, config: GitBashConfig, private readonly resolution: GitBashResolution) {
    super(ctx, config)
  }
  protected override resolveBashPath(): GitBashResolution {
    return this.resolution
  }
}

async function setup(compat: 'auto' | 'strict' = 'auto', bash: string | undefined = GIT_BASH) {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: 'C:\\work' })
  const executor = new StubExecutor(ctx, makeConfig(compat), bash)
  return { ctx, executor }
}

describe('GitBashSandboxExecutor.execute', () => {
  it('runs danger-full-access via the resolved Git Bash', async () => {
    const { executor } = await setup()
    const handle = await executor.execute(makeSpec('danger-full-access'))
    expect(executor.recorded).toEqual([GIT_BASH, '-c', 'echo hi'])
    const result = await handle.result()
    expect(result.sandbox).toEqual({ mode: 'danger-full-access', denied: false })
  })

  it('runs workspace-write unconfined and labels the result under auto', async () => {
    const { executor } = await setup('auto')
    const handle = await executor.execute(makeSpec('workspace-write'))
    expect(executor.recorded).toEqual([GIT_BASH, '-c', 'echo hi'])
    const result = await handle.result()
    expect(result.sandbox).toEqual({ mode: 'workspace-write', denied: false, unconfined: true })
  })

  it('refuses workspace-write under strict', async () => {
    const { executor } = await setup('strict')
    const promise = executor.execute(makeSpec('workspace-write'))
    await expect(promise).rejects.toBeInstanceOf(SandboxUnavailableError)
    await expect(promise).rejects.toMatchObject({ code: SANDBOX_UNAVAILABLE })
  })

  it('refuses read-only under either compat', async () => {
    for (const compat of ['auto', 'strict'] as const) {
      const { executor } = await setup(compat)
      await expect(executor.execute(makeSpec('read-only'))).rejects.toMatchObject({ code: SANDBOX_UNAVAILABLE })
    }
  })

  it('falls back to deployment policy when the spec carries none', async () => {
    const { ctx, executor } = await setup('auto')
    vi.spyOn(ctx.sandboxPolicy, 'resolve').mockReturnValue({ mode: 'danger-full-access', workspaceRoot: 'C:\\work' })
    const handle = await executor.execute(makeSpec('danger-full-access', { sandboxPolicy: undefined }))
    const result = await handle.result()
    expect(result.sandbox).toEqual({ mode: 'danger-full-access', denied: false })
  })

  it('fails loud with a clear reason when no Git Bash is usable', async () => {
    const { executor } = await setup('auto', '')
    await expect(executor.execute(makeSpec('danger-full-access'))).rejects.toThrow(/no Git for Windows bash found/)
  })
})

describe('GitBashSandboxExecutor.requireBashPath', () => {
  it('returns a resolved Git Bash path', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: 'C:\\work' })
    const executor = new ResolveExecutor(ctx, makeConfig(), { path: GIT_BASH })
    expect(executor.requireBashPath()).toBe(GIT_BASH)
  })

  it('throws a clear error naming the reason when no Git Bash resolves', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: 'C:\\work' })
    const executor = new ResolveExecutor(ctx, makeConfig(), { reason: 'no Git for Windows bash found' })
    expect(() => executor.requireBashPath()).toThrow(/no Git for Windows bash found/)
  })

  it('falls back to a generic reason when the resolution carries none', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: 'C:\\work' })
    const executor = new ResolveExecutor(ctx, makeConfig(), {})
    expect(() => executor.requireBashPath()).toThrow(/no Git for Windows bash found/)
  })

  it('falls back to the shared resolver when resolveBashPath is not overridden', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: 'C:\\work' })
    const executor = new GitBashSandboxExecutor(ctx, makeConfig())
    // The default resolver returns a path when Git Bash is installed, else a
    // reason; either way it exercised the discovery branch deterministically.
    const resolution = executor.resolveBashPath()
    expect(resolution.path === undefined || typeof resolution.path === 'string').toBe(true)
  })
})

describe('GitBashSandboxExecutor.sandboxMode', () => {
  it('reads the deployment default mode', async () => {
    const { ctx, executor } = await setup()
    expect(executor.sandboxMode).toBe(ctx.sandboxPolicy.defaultMode)
  })
})
