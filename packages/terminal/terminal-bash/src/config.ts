/** Validated configuration for the local PTY backend. */

import z from '@deepseek-ai/schemastery'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'
import { resolveGitBash } from '@deepseek-ai/dsh-gitbash-sandbox/bash-path'

/** One supported interactive shell dialect. */
export type ShellDialect = 'bash' | 'pwsh'

/** Public plugin configuration. */
export interface Config {
  /** Backend registry type (default: `shell`). */
  backendType?: string
  /** Interactive shell dialect (default: `bash`); selects the argv/env/startup defaults. */
  shellDialect?: ShellDialect
  /** Interactive shell executable (default per dialect: `/bin/bash`, or the resolved pwsh). */
  shellPath?: string
  /** Shell arguments (default per dialect: bash `--noprofile --norc -i`, pwsh `-NoLogo -NoProfile`). */
  shellArgs?: string[]
  /**
   * Windows Git Bash backend: resolve Git for Windows and run it as an
   * interactive bash shell, skipping the (incompatible) restricted-token
   * confinement. `bash` dialect only; ignored off Windows. The explicit
   * `gitBashPath` wins over auto-discovery, and `shellPath`/`shellArgs` are
   * replaced by the Git Bash profile.
   */
  gitBash?: boolean
  /** Explicit Git Bash `bash.exe` when `gitBash` is set; empty auto-discovers. */
  gitBashPath?: string
  /** Terminal rows. */
  rows?: number
  /** Terminal columns. */
  cols?: number
  /** Maximum retained logical lines. */
  scrollbackLines?: number
  /** Maximum retained UTF-8 bytes. */
  scrollbackMaxBytes?: number
  /** Maximum bytes returned by one read or settled viewport. */
  maxReadBytes?: number
  /** Readiness polling interval. */
  pollIntervalMs?: number
  /** Delay before Linux exact syscall probes. */
  exactProbeAfterMs?: number
  /** Silence duration that yields `inferred_idle`. */
  idleSilenceMs?: number
  /**
   * Extra wait beyond `idleSilenceMs`, once a prompt marker was seen, for the shell to
   * regain the foreground before `inferred_idle` settles; at least one `pollIntervalMs`.
   */
  handoffGraceMs?: number
  /**
   * Extra wait beyond `idleSilenceMs` and `handoffGraceMs`, once a prompt marker was seen but
   * its printable tail has not arrived, before `inferred_idle` settles. The marker is written
   * by the shell's own prompt function and the tail by the same render, so a missing tail is a
   * delivery delay on a contended host rather than an absent prompt. Zero keeps the bound at
   * `idleSilenceMs + handoffGraceMs`; any other value covers at least one `pollIntervalMs`, so a
   * nonzero tolerance always contains a readiness poll.
   */
  promptTailGraceMs?: number
  /** Absolute bound for one send and the complete pwsh startup sequence. */
  timeoutMs?: number
  /** Grace before teardown escalates to `SIGKILL`. */
  disposeGraceMs?: number
}

/** Configuration after Schemastery defaults and dialect resolution. */
export type ResolvedConfig = Omit<Required<Config>, 'shellDialect' | 'shellPath' | 'shellArgs' | 'gitBash' | 'gitBashPath'> & {
  shellDialect: ShellDialect
  shellPath: string
  shellArgs: string[]
  /** Whether the Git Bash (unconfined) Windows backend is active. */
  gitBash: boolean
}

/** Bash dialect default executable. */
export const DEFAULT_BASH_SHELL = '/bin/bash'
/** Bash dialect default arguments (interactive, profile-free). */
export const DEFAULT_BASH_ARGS = ['--noprofile', '--norc', '-i']
/** Pwsh dialect default arguments (interactive host, profile-free). */
export const DEFAULT_PWSH_ARGS = ['-NoLogo', '-NoProfile']
/** Git Bash default arguments (interactive, profile-free, like bash). */
export const GIT_BASH_ARGS = ['--noprofile', '--norc', '-i']

/**
 * Resolve the effective per-dialect shell specification. Defaulting is this
 * explicit step: an unset or empty `shellPath`/`shellArgs` selects the
 * dialect's defaults, while a non-empty explicit value always wins.
 * (Schemastery materializes an absent optional array as `[]`, so emptiness —
 * not just `undefined` — means "dialect default".)
 *
 * Git Bash mode overrides the bash dialect on Windows: the executable is the
 * resolved Git for Windows bash (the explicit `gitBashPath`, else auto-
 * discovery), and the profile-free interactive args replace the default.
 * Off Windows Git Bash mode fails loud instead of silently using system bash.
 * @param config - Schemastery-resolved plugin configuration.
 * @returns the fully resolved configuration.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const shellDialect = config.shellDialect ?? 'bash'
  const gitBash = config.gitBash === true && shellDialect === 'bash'
  if (config.gitBash === true && !gitBash) {
    throw new Error('terminal-bash: gitBash applies only to the bash dialect')
  }
  let gitBashPath: string | undefined
  if (gitBash) {
    const resolved = resolveGitBash({ configured: config.gitBashPath ?? '' })
    if (resolved.path === undefined) {
      throw new Error(`terminal-bash: ${resolved.reason ?? 'no Git for Windows bash found'}. Install Git for Windows or set the gitBashPath setting.`)
    }
    gitBashPath = resolved.path
  }
  return {
    ...(config as Required<Config>),
    shellDialect,
    shellPath: gitBashPath
      ?? (config.shellPath !== undefined && config.shellPath.length > 0
        ? config.shellPath
        : (shellDialect === 'pwsh' ? resolvePwshPath() : DEFAULT_BASH_SHELL)),
    shellArgs: config.shellArgs !== undefined && config.shellArgs.length > 0
      ? config.shellArgs
      : (gitBash ? GIT_BASH_ARGS : (shellDialect === 'pwsh' ? DEFAULT_PWSH_ARGS : DEFAULT_BASH_ARGS)),
    gitBash,
  }
}

/** Schemastery config exposed by the plugin. */
export const Config: z<Config> = z.object({
  backendType: z.string().default('shell'),
  shellDialect: z.union(['bash', 'pwsh'] as const).default('bash'),
  shellPath: z.string().required(false),
  shellArgs: z.array(z.string()).required(false),
  gitBash: z.boolean().default(false),
  gitBashPath: z.string().default(''),
  rows: z.number().default(40),
  cols: z.number().default(160),
  scrollbackLines: z.number().default(10_000),
  scrollbackMaxBytes: z.number().default(4 * 1024 * 1024),
  maxReadBytes: z.number().default(256 * 1024),
  pollIntervalMs: z.number().default(50),
  exactProbeAfterMs: z.number().default(150),
  idleSilenceMs: z.number().default(3_000),
  handoffGraceMs: z.number().default(500),
  promptTailGraceMs: z.number().default(0),
  timeoutMs: z.number().default(30_000),
  disposeGraceMs: z.number().default(3_000),
})

/**
 * Assert every effective numeric config field is a positive safe integer — except
 * `promptTailGraceMs`, whose zero is the documented "no extension" value — and that bounds
 * compose.
 * @param config - Schemastery-resolved plugin configuration.
 * @returns Narrows the input to the fully resolved configuration.
 */
export function validateConfig(config: Config): asserts config is ResolvedConfig {
  const resolved = config as ResolvedConfig
  if (resolved.backendType.length === 0) throw new Error('terminal-bash: backendType must be non-empty')
  if (resolved.shellPath.length === 0) throw new Error('terminal-bash: shellPath must be non-empty')
  for (const [name, value] of Object.entries(resolved)) {
    if (name === 'promptTailGraceMs') continue
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`terminal-bash: ${name} must be a positive safe integer`)
    }
  }
  if (typeof resolved.promptTailGraceMs === 'number'
    && (!Number.isSafeInteger(resolved.promptTailGraceMs) || resolved.promptTailGraceMs < 0)) {
    throw new Error('terminal-bash: promptTailGraceMs must be a non-negative safe integer')
  }
  if (resolved.maxReadBytes > resolved.scrollbackMaxBytes) {
    throw new Error('terminal-bash: maxReadBytes must not exceed scrollbackMaxBytes')
  }
  if (resolved.handoffGraceMs < resolved.pollIntervalMs) {
    throw new Error('terminal-bash: handoffGraceMs must be at least pollIntervalMs so one readiness poll runs inside the grace window')
  }
  if (resolved.promptTailGraceMs !== 0 && resolved.promptTailGraceMs < resolved.pollIntervalMs) {
    throw new Error('terminal-bash: promptTailGraceMs must be zero or at least pollIntervalMs so a nonzero tolerance contains one readiness poll')
  }
}
