/**
 * Git Bash compat (unconfined) routing for the Windows executor.
 *
 * Git for Windows (MSYS2) cannot be launched inside DSH's Windows
 * restricted-token sandbox (documented Win32 error 5 / 0xC0000142), so a
 * Windows Git Bash executor cannot be both confined and usable. The `compat`
 * choice makes that cost explicit instead of silently weakening a promise:
 * `auto` runs the command unconfined under `workspace-write` and labels the
 * result, while `strict` refuses every mode below `danger-full-access`.
 * @module @deepseek-ai/dsh-gitbash-sandbox/compat
 */

import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

/** The Git Bash compat mode. `auto` is the default. */
export type CompatMode = 'auto' | 'strict'

/** The closed compat-mode vocabulary (mirrors the `compat` config field). */
export const COMPAT_MODES: readonly CompatMode[] = ['auto', 'strict']

/** How one Git Bash execution may run. */
export type GitBashRoute = 'delegate' | 'run' | 'unconfined' | 'refuse'

/** Pure inputs for {@link gitBashRoute}. */
export interface GitBashRouteInput {
  /** The resolved per-call sandbox mode. */
  readonly mode: SandboxMode
  /** The configured compat mode. */
  readonly compat: CompatMode
  /** The host platform (win32 is the only Git Bash host). */
  readonly platform: NodeJS.Platform
}

/**
 * Decide how one Git Bash execution runs. Pure so the matrix is unit-testable.
 *
 * Off Windows this executor is never mounted, but the route still delegates to
 * the confined POSIX path so a mis-wired composition fails safe. On Windows:
 * `danger-full-access` runs normally (full access needs no confinement label);
 * `workspace-write` runs unconfined under `auto` and refuses under `strict`;
 * `read-only` always refuses.
 * @param input - the resolved mode, compat choice, and platform.
 * @returns the route the executor should take.
 */
export function gitBashRoute(input: GitBashRouteInput): GitBashRoute {
  const { mode, compat, platform } = input
  if (platform !== 'win32') return 'delegate'
  if (mode === 'danger-full-access') return 'run'
  if (mode === 'read-only') return 'refuse'
  return compat === 'strict' ? 'refuse' : 'unconfined'
}

/** The model-facing compat marker appended to an unconfined result. */
export { compatNote } from '@deepseek-ai/dsh-shell'
