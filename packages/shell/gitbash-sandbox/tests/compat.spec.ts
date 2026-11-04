/**
 * Git Bash compat routing matrix: every mode × compat × platform verdict, and
 * the model-facing marker text.
 */

import { describe, expect, it } from 'vitest'
import { COMPAT_MODES, compatNote, gitBashRoute, type CompatMode, type GitBashRouteInput } from '../src/compat.ts'

describe('gitBashRoute', () => {
  const modes = ['read-only', 'workspace-write', 'danger-full-access'] as const
  const platforms: NodeJS.Platform[] = ['win32', 'linux', 'darwin']

  it('delegates off Windows for every mode', () => {
    for (const mode of modes) {
      for (const compat of COMPAT_MODES) {
        for (const platform of platforms.filter(p => p !== 'win32')) {
          expect(gitBashRoute({ mode, compat, platform })).toBe('delegate')
        }
      }
    }
  })

  it('runs full-access normally on Windows under either compat', () => {
    for (const compat of COMPAT_MODES) {
      expect(gitBashRoute({ mode: 'danger-full-access', compat, platform: 'win32' })).toBe('run')
    }
  })

  it('runs workspace-write unconfined on Windows only under auto', () => {
    expect(gitBashRoute({ mode: 'workspace-write', compat: 'auto', platform: 'win32' })).toBe('unconfined')
    expect(gitBashRoute({ mode: 'workspace-write', compat: 'strict', platform: 'win32' })).toBe('refuse')
  })

  it('refuses read-only on Windows under either compat', () => {
    for (const compat of COMPAT_MODES) {
      expect(gitBashRoute({ mode: 'read-only', compat, platform: 'win32' })).toBe('refuse')
    }
  })

  it('is closed over the mode/compat vocabularies', () => {
    const modes = ['read-only', 'workspace-write', 'danger-full-access'] as const
    const compat: CompatMode = 'auto'
    for (const mode of modes) {
      const input: GitBashRouteInput = { mode, compat, platform: 'win32' }
      expect(['delegate', 'run', 'unconfined', 'refuse']).toContain(gitBashRoute(input))
    }
  })
})

describe('compatNote', () => {
  it('names the session mode it ran under', () => {
    expect(compatNote('workspace-write')).toBe('[compat: bash runs outside the DSH file sandbox (session mode workspace-write)]')
  })
})
