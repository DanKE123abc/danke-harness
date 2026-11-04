// @vitest-environment jsdom
/** The Code panel frame: session selection, frame URL, and iframe rendering. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  selectMainViewSession, vscodeFrameUrl, VscodePanel, type VscodePanelProps,
} from '../src/client/VscodePanel.tsx'
import { en } from '../src/client/locales.ts'

const t: VscodePanelProps['t'] = makeTranslate({ ...commonEn, ...en })

afterEach(() => { cleanup() })

const SESSION = 'session-1'

const retained = {
  byId: { [SESSION]: { id: SESSION, retainedBy: { mainView: 1 } } },
  ids: [SESSION],
  phase: 'pending',
  projectionsBySession: {},
} as never

const none = { byId: {}, ids: [], phase: 'pending', projectionsBySession: {} } as never

/** Assemble the main-slot props with the session selector bound to one snapshot. */
function panelProps(snapshot: unknown): VscodePanelProps {
  const unused = (): never => { throw new Error('ui-vscode-panel fixture does not provide this hook') }
  return {
    useSessions: bindSnapshotSelector(createSnapshotStore(snapshot as never)),
    usePanelInfo: unused,
    useWorkspaces: unused,
    useResource: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    ...allowAllAccess,
    t,
  }
}

describe('selectMainViewSession', () => {
  it('returns the session retained by the main view', () => {
    expect(selectMainViewSession(retained)).toBe(SESSION)
  })

  it('returns undefined when no session is retained by the main view', () => {
    expect(selectMainViewSession(none)).toBeUndefined()
  })

  it('ignores a candidate without a main-view retention count', () => {
    const noMainView = { byId: { other: { id: 'other', retainedBy: {} } }, ids: ['other'], phase: 'pending', projectionsBySession: {} } as never
    expect(selectMainViewSession(noMainView)).toBeUndefined()
  })
})

describe('vscodeFrameUrl', () => {
  it('encodes a session into the workbench route', () => {
    expect(vscodeFrameUrl('a/b c')).toBe('/vscode?session=a%2Fb%20c')
  })

  it('falls back to the empty workspace route without a session', () => {
    expect(vscodeFrameUrl(undefined)).toBe('/vscode')
  })
})

describe('VscodePanel', () => {
  it('renders an iframe pointing at the retained session workspace', () => {
    render(<VscodePanel {...panelProps(retained)} />)
    const frame = screen.getByTitle('Code editor')
    expect(frame).toBeInstanceOf(HTMLIFrameElement)
    expect(frame.getAttribute('src')).toBe(`/vscode?session=${SESSION}`)
  })

  it('renders the empty workspace route without a session', () => {
    render(<VscodePanel {...panelProps(none)} />)
    expect(screen.getByTitle('Code editor').getAttribute('src')).toBe('/vscode')
  })
})
