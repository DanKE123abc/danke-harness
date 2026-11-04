/**
 * Git Bash resolver tests over an injectable filesystem/process surface: the
 * discovery chain (configured → default roots → PATH → registry), WSL
 * rejection, the Git-layout validation, and the probe signal.
 */

import { describe, expect, it } from 'vitest'
import type { BashPathIO } from '../src/bash-path.ts'
import {
  defaultIO, isBlockedBashPath, normalizeBashPath, normalizePathKey, resolveGitBash,
} from '../src/bash-path.ts'

const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe'
const GIT_ROOT = 'C:\\Program Files\\Git'
const GIT_CMD_GIT = 'C:\\Program Files\\Git\\cmd\\git.exe'

/** A fake host surface; `existing` is matched case-insensitively on Windows. */
function makeIO(opts: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  existing?: readonly string[]
  spawn?: BashPathIO['spawnSync']
} = {}): BashPathIO {
  const existing = new Set((opts.existing ?? []).map(normalizePathKey))
  return {
    platform: opts.platform ?? 'win32',
    env: opts.env ?? {},
    existsSync: path => existing.has(normalizePathKey(path)),
    spawnSync: opts.spawn ?? (() => ({ status: 0, stdout: 'MINGW64_NT-10.0-22631 x86_64\n', stderr: '' })),
    homedir: () => 'C:\\Users\\t',
    tmpdir: () => 'C:\\Users\\t\\AppData\\Local\\Temp',
  }
}

const mingwSpawn: BashPathIO['spawnSync'] = () => ({ status: 0, stdout: 'MINGW64_NT-10.0-22631 x86_64\n', stderr: '' })
const notGitSpawn: BashPathIO['spawnSync'] = () => ({ status: 1, stdout: '', stderr: 'not a Git Bash' })

describe('resolveGitBash', () => {
  it('only resolves on Windows', () => {
    expect(resolveGitBash({ io: makeIO({ platform: 'linux' }) })).toMatchObject({ reason: 'Git Bash resolution applies to Windows only' })
  })

  it('accepts a configured valid Git Bash with the Git layout', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT] })
    expect(resolveGitBash({ configured: GIT_BASH, io })).toEqual({ path: GIT_BASH })
  })

  it('normalizes quotes and strips surrounding whitespace from the configured path', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT] })
    expect(resolveGitBash({ configured: `  "${GIT_BASH}"  `, io })).toEqual({ path: GIT_BASH })
  })

  it('rejects a configured path that is not a Git layout and falls through', () => {
    const io = makeIO({ existing: ['C:\\tools\\bash.exe'] })
    const result = resolveGitBash({ configured: 'C:\\tools\\bash.exe', io })
    expect(result.path).toBeUndefined()
    expect(result.reason).toContain('not a Git for Windows layout')
  })

  it('rejects a configured path whose uname probe is not MINGW/MSYS', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT], spawn: notGitSpawn })
    const result = resolveGitBash({ configured: GIT_BASH, io })
    expect(result.path).toBeUndefined()
  })

  it('skips the probe when asked, accepting a layout-valid path', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT], spawn: notGitSpawn })
    expect(resolveGitBash({ configured: GIT_BASH, io }, false)).toEqual({ path: GIT_BASH })
  })

  it('rejects WSL bash (System32, Sysnative, WindowsApps, wsl mount)', () => {
    const system32 = 'C:\\Windows\\System32\\bash.exe'
    const io = makeIO({ existing: [system32, 'C:\\Windows\\System32\\cmd\\git.exe'] })
    const result = resolveGitBash({ configured: system32, io })
    expect(result.path).toBeUndefined()
  })

  it('finds Git through the default ProgramFiles root', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT], env: { ProgramFiles: 'C:\\Program Files' } })
    expect(resolveGitBash({ io })).toEqual({ path: GIT_BASH })
  })

  it('finds Git through the LOCALAPPDATA per-user root', () => {
    const perUser = 'C:\\Users\\t\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'
    const perUserGit = 'C:\\Users\\t\\AppData\\Local\\Programs\\Git\\cmd\\git.exe'
    const io = makeIO({ existing: [perUser, perUserGit], env: { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' } })
    expect(resolveGitBash({ io })).toEqual({ path: perUser })
  })

  it('finds Git through a bash.exe already on PATH', () => {
    const binDir = 'C:\\Program Files\\Git\\bin'
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT], env: { Path: `${binDir};C:\\Windows` } })
    expect(resolveGitBash({ io })).toEqual({ path: GIT_BASH })
  })

  it('finds Git through a git.exe reverse lookup on PATH', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT], env: { Path: 'C:\\Program Files\\Git\\cmd' } })
    expect(resolveGitBash({ io })).toEqual({ path: GIT_BASH })
  })

  it('finds Git through the registry InstallPath value', () => {
    const io = makeIO({
      existing: [GIT_BASH, GIT_CMD_GIT],
      spawn: (cmd, args) => cmd === 'reg'
        ? { status: 0, stdout: `    InstallPath    REG_SZ    ${GIT_ROOT}\r\n`, stderr: '' }
        : mingwSpawn(cmd, args),
    })
    expect(resolveGitBash({ io })).toEqual({ path: GIT_BASH })
  })

  it('accepts an MSYS (not MINGW) uname probe', () => {
    const io = makeIO({
      existing: [GIT_BASH, GIT_CMD_GIT],
      spawn: () => ({ status: 0, stdout: 'MSYS_NT-10.0-22631 x86_64\n', stderr: '' }),
    })
    expect(resolveGitBash({ configured: GIT_BASH, io })).toEqual({ path: GIT_BASH })
  })

  it('skips probing and the registry when spawn is unavailable', () => {
    const io = makeIO({ existing: [GIT_BASH, GIT_CMD_GIT] })
    delete io.spawnSync
    expect(resolveGitBash({ configured: GIT_BASH, io })).toEqual({ path: GIT_BASH })
  })

  it('finds a Git Bash exposed on PATH as `bash` without an extension', () => {
    const bare = 'C:\\tools\\git\\bin\\bash'
    const bareGit = 'C:\\tools\\git\\cmd\\git.exe'
    const io = makeIO({ existing: [bare, bareGit], env: { Path: 'C:\\tools\\git\\bin' } })
    expect(resolveGitBash({ io })).toEqual({ path: bare })
  })

  it('rejects a configured path whose basename is not bash', () => {
    const io = makeIO({ existing: ['C:\\Git\\bin\\zsh.exe', 'C:\\Git\\cmd\\git.exe'] })
    const result = resolveGitBash({ configured: 'C:\\Git\\bin\\zsh.exe', io })
    expect(result.path).toBeUndefined()
  })

  it('accepts a `<root>\\usr\\bin\\bash.exe` layout', () => {
    const usrBash = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
    const io = makeIO({ existing: [usrBash], env: { ProgramFiles: 'C:\\Program Files' } })
    expect(resolveGitBash({ io })).toEqual({ path: usrBash })
  })

  it('accepts a root recognized by the mingw64 git marker', () => {
    const io = makeIO({ existing: [GIT_BASH, 'C:\\Program Files\\Git\\mingw64\\bin\\git.exe'], env: { ProgramFiles: 'C:\\Program Files' } })
    expect(resolveGitBash({ io })).toEqual({ path: GIT_BASH })
  })

  it('falls through to the registry branch which is empty when spawn is unavailable', () => {
    const io = makeIO({ existing: [] })
    delete io.spawnSync
    const result = resolveGitBash({ io })
    expect(result.path).toBeUndefined()
  })

  it('treats a probe that throws as not-a-Git-Bash', () => {
    const io = makeIO({
      existing: [GIT_BASH, GIT_CMD_GIT],
      spawn: () => { throw new Error('probe failed') },
    })
    const result = resolveGitBash({ configured: GIT_BASH, io })
    expect(result.path).toBeUndefined()
  })

  it('reports a clear reason when nothing is usable', () => {
    const io = makeIO({ existing: [] })
    const result = resolveGitBash({ io })
    expect(result.path).toBeUndefined()
    expect(result.reason).toBe('no Git for Windows bash found')
  })
})

describe('isBlockedBashPath', () => {
  it('rejects the WSL/Sysnative/WindowsApps shapes and wsl mounts', () => {
    expect(isBlockedBashPath('C:\\Windows\\System32\\bash.exe')).toBe(true)
    expect(isBlockedBashPath('C:\\Windows\\Sysnative\\bash.exe')).toBe(true)
    expect(isBlockedBashPath('C:\\Program Files\\WindowsApps\\bash.exe')).toBe(true)
    expect(isBlockedBashPath('\\\\wsl$\\Ubuntu\\bin\\bash')).toBe(true)
    expect(isBlockedBashPath('\\\\wsl.localhost\\Ubuntu\\bin\\bash')).toBe(true)
  })

  it('accepts an ordinary Git Bash path', () => {
    expect(isBlockedBashPath(GIT_BASH)).toBe(false)
  })
})

describe('normalizeBashPath', () => {
  it('strips one matching quote pair and surrounding whitespace', () => {
    expect(normalizeBashPath('  "C:\\Git\\bin\\bash.exe"  ')).toBe('C:\\Git\\bin\\bash.exe')
    expect(normalizeBashPath("'C:\\Git\\bin\\bash.exe'")).toBe('C:\\Git\\bin\\bash.exe')
  })

  it('leaves an unquoted path untouched', () => {
    expect(normalizeBashPath('C:\\Git\\bin\\bash.exe')).toBe('C:\\Git\\bin\\bash.exe')
  })
})

describe('normalizePathKey', () => {
  it('is case-insensitive and separator-normalized', () => {
    expect(normalizePathKey('C:\\Git\\bin\\bash.exe')).toBe(normalizePathKey('c:/git/bin/bash.exe'))
  })
})

describe('defaultIO', () => {
  it('surfaces the real host', () => {
    const io = defaultIO()
    expect(io.platform).toBe(process.platform)
    expect(typeof io.existsSync).toBe('function')
    expect(typeof io.spawnSync).toBe('function')
  })

  it('wraps a successful spawn', () => {
    const io = defaultIO()
    const result = io.spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")'])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(result.error).toBeUndefined()
  })

  it('wraps a spawn error (ENOENT) into the surfaced result', () => {
    const io = defaultIO()
    const result = io.spawnSync('definitely-not-a-real-command-xyz', [])
    expect(result.error).toBeDefined()
    expect(result.status).toBeNull()
  })
})
