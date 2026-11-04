/**
 * The Code panel: an iframe hosting the VS Code Web workbench served at /vscode.
 * The workbench opens the current main-view Session's workspace (dsh://) or its
 * empty temporary workspace when none is retained; the dsh:// scheme provider is
 * registered by the builtin dsh-workspace extension (Phase 2).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from './locales.ts'
import css from './VscodePanel.module.css'

/** Full component props: the main-slot runtime share (with the session hook) and localized copy. */
export type VscodePanelProps = PropsRuntime<'main'> & PropsLocale<'vscode-panel'>

/** The session retained by the main view, or undefined when none is. */
export function selectMainViewSession(snapshot: SessionListState): string | undefined {
  const row = Object.values(snapshot.byId).find(candidate => (candidate.retainedBy.mainView ?? 0) > 0)
  return row?.id
}

/** Build the workbench URL for a session (encoded) or the empty workspace. */
export function vscodeFrameUrl(sessionId: string | undefined): string {
  return sessionId === undefined ? '/vscode' : `/vscode?session=${encodeURIComponent(sessionId)}`
}

/**
 * Render the embedded workbench iframe.
 * @param props - main-slot inputs, the session hook, and localized copy.
 * @returns the Code panel frame.
 */
export function VscodePanel({ useSessions, t }: VscodePanelProps): ReactNode {
  const sessionId = useSessions(selectMainViewSession)
  return (
    <div className={css.frame}>
      <iframe
        title={t('frame.title')}
        className={css.iframe}
        src={vscodeFrameUrl(sessionId)}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  )
}
