/**
 * Git for Windows bash executor: the Windows `ctx.shell` that runs the official
 * `bash` tool on a resolved Git Bash instead of PowerShell.
 *
 * It extends the shipped sandbox bash executor to inherit the resolve/spec
 * contract, the deadline and output capture mechanics, and the report shape,
 * but overrides the execution boundary: the inner argv is
 * `[<git-bash.exe>, '-c', <command>]` and, on Windows, the sandbox policy is
 * applied through the explicit compat router instead of `ctx.sandbox` (MSYS2
 * cannot start inside the restricted-token sandbox). Off Windows it delegates
 * to the confined parent path, so a mis-wired composition stays safe.
 *
 * The compat router never silently widens a promise: `danger-full-access`
 * runs normally, `workspace-write` runs unconfined only under `compat:auto`
 * (labelled `[compat: ...]`), and `read-only` / `compat:strict` refuse before
 * argv resolution. The Git Bash verdict comes from one resolver shared with
 * the terminal adoption and the path dialect.
 * @module @deepseek-ai/dsh-gitbash-sandbox
 */

import type { Volatile } from '@deepseek-ai/cordis'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ShellExecSpec, ShellExecution, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-bash-local'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { SandboxUnavailableError, type ConfinedSandboxMode } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { resolveGitBash, type GitBashResolution } from './bash-path.ts'
import { compatNote, gitBashRoute, type CompatMode } from './compat.ts'

/** Plugin config: the local executor's knobs plus the Git Bash path and compat mode. */
export interface GitBashConfig extends LocalConfig {
  /** Explicit Git Bash `bash.exe`; empty means auto-discover. */
  bashPath: Volatile<string>
  /** `auto` (default) runs `workspace-write` unconfined; `strict` refuses it. */
  compat: Volatile<CompatMode>
}

/** The config schema: the bash-local fields plus `bashPath` and `compat`. */
export const Config = z.object({
  cwd: z.string().volatile(),
  timeoutMs: z.number().default(120000).volatile(),
  maxTimeoutMs: z.number().default(600000).volatile(),
  maxOutputBytes: z.number().default(64000).volatile(),
  maxSpillBytes: z.number().default(64 * 1024 * 1024).volatile(),
  graceMs: z.number().default(3000).volatile(),
  bashPath: z.string().default('').volatile(),
  compat: z.union(['auto', 'strict'] as const).default('auto').volatile(),
})

/** The compat mode currently configured. */
function configuredCompat(config: GitBashConfig): CompatMode {
  return config.compat.get()
}

/**
 * Registers as `ctx.shell` in place of `pwsh-sandbox` on Windows. The tool
 * layer is unchanged: `tool-bash` calls `resolve()`/`execute()` exactly as it
 * does on POSIX, so the model sees the same `bash` tool on every platform.
 */
export class GitBashSandboxExecutor extends SandboxBashExecutor {
  static override inject = ['subprocess', 'sandbox', 'sandboxPolicy']
  static override Config = Config

  constructor(ctx: Context, override readonly config: GitBashConfig) {
    super(ctx, config)
  }

  /** The configured default mode — the capability fact the tool layer reads. */
  override get sandboxMode(): SandboxMode {
    return this.ctx.sandboxPolicy.defaultMode
  }

  /** Resolve the per-call policy, falling back to deployment policy. */
  private resolvePolicy(spec: ShellExecSpec): SandboxExecutionPolicy {
    return spec.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
  }

  /**
   * Resolve the configured Git Bash. Overridable so tests and terminal
   * consumers drive the verdict deterministically; the default discovers via
   * the shared resolver.
   * @returns the resolution (path or a reason).
   */
  resolveBashPath(): GitBashResolution {
    return resolveGitBash({ configured: this.config.bashPath.get() })
  }

  /**
   * Resolve a usable Git Bash. Throws a clear error when none is found;
   * callers surface it as a spawn failure.
   * @returns the Git Bash executable path.
   */
  requireBashPath(): string {
    const resolution = this.resolveBashPath()
    if (resolution.path === undefined) {
      throw new Error(`gitbash-sandbox: ${resolution.reason ?? 'no Git for Windows bash found'}. Install Git for Windows or set the gitbash-sandbox bashPath setting.`)
    }
    return resolution.path
  }

  override async execute(spec: ShellExecSpec): Promise<ShellExecution> {
    const policy = this.resolvePolicy(spec)
    const route = gitBashRoute({ mode: policy.mode, compat: configuredCompat(this.config), platform: process.platform })
    /* v8 ignore next -- off-Windows delegation needs a POSIX host (this executor mounts on win32 only) */
    if (route === 'delegate') return super.execute(spec)
    if (route === 'refuse') {
      throw new SandboxUnavailableError(policy.mode as ConfinedSandboxMode, `Git Bash cannot be confined on Windows; refusing to run it unconfined in ${policy.mode} mode. Select danger-full-access or set gitbash-sandbox compat to auto.`)
    }
    const argv = [this.requireBashPath(), '-c', spec.command]
    const ex = await this.executeArgv(spec, argv)
    const sandbox = route === 'unconfined'
      ? { mode: policy.mode, denied: false, unconfined: true as const }
      : { mode: policy.mode, denied: false }
    return SandboxBashExecutor.decorateResult(ex, (result: ShellRunResult) => ({ ...result, sandbox }))
  }
}

/** Re-exported so the settings row and the terminal adoption read one dialect. */
export { compatNote }

export default GitBashSandboxExecutor
