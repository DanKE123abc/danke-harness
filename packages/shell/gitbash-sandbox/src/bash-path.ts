/**
 * Git for Windows resolution for the Windows bash executor.
 *
 * One resolver owns the Git Bash verdict so the executor, the terminal
 * adoption, and the path dialect all agree on a single path. The chain is
 * configured path, then standard install roots, then PATH (`bash.exe` and a
 * `git.exe` reverse lookup), then the Git for Windows registry value. WSL's
 * `System32\bash.exe`, `WindowsApps` shims, and `\\wsl$` mounts are rejected.
 * @module @deepseek-ai/dsh-gitbash-sandbox/bash-path
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, normalize } from 'node:path'

/** Injectable filesystem/process surface so the resolver is unit-testable. */
export interface BashPathIO {
  readonly platform: NodeJS.Platform
  readonly env: NodeJS.ProcessEnv
  existsSync(path: string): boolean
  readdirSync?(path: string): string[]
  spawnSync?(command: string, args: string[], options?: { windowsHide?: boolean; encoding?: 'utf8' }): { status: number | null; stdout: string; stderr: string; error?: unknown }
  homedir?(): string
  tmpdir?(): string
}

/** The resolver verdict. */
export interface GitBashResolution {
  /** The resolved Git Bash executable, or undefined when none is usable. */
  readonly path?: string
  /** Human reason when `path` is undefined (the last failure). */
  readonly reason?: string
}

/** The real host I/O surface; `spawnSync` is always present on the host. */
export type HostBashPathIO = BashPathIO & { spawnSync: NonNullable<BashPathIO['spawnSync']> }

/** The real host I/O surface.
 * @returns the host-backed {@link BashPathIO}, with `spawnSync` guaranteed.
 */
export function defaultIO(): HostBashPathIO {
  return {
    platform: process.platform,
    env: process.env,
    existsSync,
    readdirSync,
    spawnSync: (command, args, options) => {
      const result = spawnSync(command, args, { windowsHide: true, encoding: 'utf8', ...options })
      return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        ...(result.error !== undefined ? { error: result.error } : {}),
      }
    },
    homedir,
    tmpdir,
  }
}

/** A candidate the resolver may accept. */
export interface GitBashCandidate {
  readonly path: string
  readonly root: string
}

/**
 * WSL's bash is not Git Bash. Exclude the System32/Sysnative shims, the
 * WindowsApps installs, and any `\\wsl$` / `\\wsl.localhost` mount.
 * @param path - the candidate executable path.
 * @returns whether the candidate must be rejected as non-Git-Bash.
 */
export function isBlockedBashPath(path: string): boolean {
  const key = normalize(path).replaceAll('/', '\\').toLowerCase()
  if (key.startsWith('\\\\wsl$\\') || key.startsWith('\\\\wsl.localhost\\')) return true
  if (key.includes('\\windows\\system32\\bash.exe')) return true
  if (key.includes('\\windows\\sysnative\\bash.exe')) return true
  if (key.includes('\\windowsapps\\')) return true
  return false
}

/** Normalize one user/YAML path value (trim, strip one matching quote pair).
 * @param value - the raw config value.
 * @returns the trimmed, unquoted path.
 */
export function normalizeBashPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/** Is `path` an existing file (any name)? */
function isFile(io: BashPathIO, path: string): boolean {
  return io.existsSync(path)
}

/** Is `path` a file whose basename is `bash.exe` (or `bash`)? */
function isBashFile(io: BashPathIO, path: string): boolean {
  const name = basename(path).toLowerCase()
  if (name !== 'bash.exe' && name !== 'bash') return false
  return isFile(io, path)
}

/** The Git for Windows root a bash path belongs to, if it matches the layout. */
function gitRootFor(io: BashPathIO, bashPath: string): string | undefined {
  // Accept `<root>\bin\bash.exe` and `<root>\usr\bin\bash.exe`: walk the
  // bash file's own directory and its two ancestors, each a candidate root.
  const dir = dirname(bashPath)
  const parent = dirname(dir)
  for (const root of [dir, parent, dirname(parent)]) {
    if (io.existsSync(join(root, 'cmd', 'git.exe'))) return root
    if (io.existsSync(join(root, 'usr', 'bin', 'bash.exe'))) return root
    if (io.existsSync(join(root, 'mingw64', 'bin', 'git.exe'))) return root
  }
  return undefined
}

/** Probe a candidate: it must be a Git for Windows bash (MINGW/MSYS uname). */
function probeGitBash(io: BashPathIO, path: string): boolean {
  if (typeof io.spawnSync !== 'function') return true
  try {
    const result = io.spawnSync(path, ['-c', 'uname -s'])
    if (result.status !== 0) return false
    const uname = result.stdout.trim()
    return uname.startsWith('MINGW') || uname.startsWith('MSYS')
  } catch { return false }
}

/** Fully validate a candidate as a usable Git Bash. */
function validate(io: BashPathIO, path: string, probe: boolean): GitBashCandidate | undefined {
  if (!isBashFile(io, path)) return undefined
  if (isBlockedBashPath(path)) return undefined
  const root = gitRootFor(io, path)
  if (root === undefined) return undefined
  if (probe && !probeGitBash(io, path)) return undefined
  return { path, root }
}

/** Enumerate the default Git for Windows install roots. */
function defaultRoots(io: BashPathIO): string[] {
  const env = io.env
  const roots: string[] = []
  const pushRoot = (value: string | undefined): void => {
    if (value === undefined || value.trim() === '') return
    roots.push(join(value.replace(/[\\/]+$/, ''), 'Git'))
  }
  pushRoot(env.ProgramFiles ?? env.PROGRAMFILES)
  pushRoot(env.ProgramW6432)
  pushRoot(env['ProgramFiles(x86)'])
  if (env.LOCALAPPDATA !== undefined && env.LOCALAPPDATA.trim() !== '') {
    roots.push(join(env.LOCALAPPDATA, 'Programs', 'Git'))
  }
  return [...new Set(roots)]
}

/** Standard bash candidates under one Git root. */
function bashCandidates(root: string): string[] {
  return [join(root, 'bin', 'bash.exe'), join(root, 'usr', 'bin', 'bash.exe')]
}

/** The PATH directories split from the environment. */
function pathDirs(io: BashPathIO): string[] {
  const env = io.env
  return (env.Path ?? env.PATH ?? '').split(';').map(dir => dir.trim()).filter(dir => dir.length > 0)
}

/** Git roots discovered from PATH (bash.exe and a git.exe reverse lookup). */
function pathCandidates(io: BashPathIO): string[] {
  const paths: string[] = []
  const dirs = pathDirs(io)
  // Exact bash.exe paths on PATH (Git may add `<root>\bin` without `cmd`).
  for (const dir of dirs) {
    if (isBashFile(io, join(dir, 'bash.exe'))) paths.push(join(dir, 'bash.exe'))
    if (isBashFile(io, join(dir, 'bash'))) paths.push(join(dir, 'bash'))
  }
  // A git.exe on PATH points at `<root>\cmd\git.exe`; its parent is the root.
  for (const dir of dirs) {
    if (isFile(io, join(dir, 'git.exe'))) {
      const root = dirname(dirname(join(dir, 'git.exe')))
      paths.push(...bashCandidates(root))
    }
  }
  return paths
}

/** Git roots from the Git for Windows registry value. */
function registryRoots(io: BashPathIO): string[] {
  if (typeof io.spawnSync !== 'function') return []
  const roots: string[] = []
  for (const key of ['HKLM\\SOFTWARE\\GitForWindows', 'HKCU\\Software\\GitForWindows']) {
    try {
      const result = io.spawnSync('reg', ['query', key, '/v', 'InstallPath'])
      if (result.status !== 0) continue
      // `    InstallPath    REG_SZ    C:\Program Files\Git`
      const match = /REG_(?:SZ|EXPAND_SZ)\s+(.+)$/m.exec(result.stdout)
      if (match?.[1] !== undefined) roots.push(match[1].trim().replace(/[\\/]+$/, ''))
    } catch { /* ignore */ }
  }
  return roots
}

/** The candidate list, deduplicated and ordered by preference. */
function candidatePaths(io: BashPathIO, configured: string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  const push = (path: string): void => {
    const key = normalize(path).toLowerCase()
    if (path.length > 0 && !seen.has(key)) { seen.add(key); paths.push(path) }
  }
  if (configured.trim() !== '') push(normalizeBashPath(configured))
  for (const root of defaultRoots(io)) for (const candidate of bashCandidates(root)) push(candidate)
  for (const candidate of pathCandidates(io)) push(candidate)
  for (const root of registryRoots(io)) for (const candidate of bashCandidates(root)) push(candidate)
  return paths
}

/**
 * Resolve a usable Git Bash, caching the verdict by configured path + platform.
 * The first validated candidate wins; when none is usable the last reason is
 * returned for a human-readable failure.
 * @param options - the configured path and the I/O surface (defaults to the real host).
 * @param probe - run `uname -s` to confirm the Git for Windows fingerprint
 *   (default true for the strongest signal; the layout check is always applied).
 * @returns the resolved path or a reason.
 */
export function resolveGitBash(options: { configured?: string; io?: BashPathIO }, probe = true): GitBashResolution {
  const io = options.io ?? defaultIO()
  const configured = normalizeBashPath(options.configured ?? '')
  if (io.platform !== 'win32') return { reason: 'Git Bash resolution applies to Windows only' }
  if (configured !== '' && validate(io, configured, probe) !== undefined) return { path: configured }
  let lastReason = 'no Git for Windows bash found'
  for (const candidate of candidatePaths(io, configured)) {
    const valid = validate(io, candidate, probe)
    if (valid !== undefined) return { path: valid.path }
    if (isBashFile(io, candidate) && !isBlockedBashPath(candidate) && gitRootFor(io, candidate) === undefined) {
      lastReason = `found bash but it is not a Git for Windows layout: ${candidate}`
    }
  }
  return { reason: lastReason }
}

/** Normalize a path for identity comparisons (Windows case-insensitive).
 * @param path - the candidate path.
 * @returns the lower-cased, forward-slash-normalized key.
 */
export function normalizePathKey(path: string): string {
  return normalize(path).replaceAll('/', '\\').toLowerCase()
}
