import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FilesInjected } from './face.ts'

/** Props for the changes tab body. */
export type ChangesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & FilesInjected & PropsLocale<'sidebarFiles'>

/** A minimal Git changes view backed by workspaceFiles git status/diff. */
export function ChangesBody({
  useTabInfo, gitStatus, gitDiff, gitStage, gitUnstage, gitCommit, t,
}: ChangesBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const [changes, setChanges] = useState<readonly { path: string; status: string; staged: boolean }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  const refreshStatus = (signal: AbortSignal): void => {
    if (gitStatus === undefined) return
    void gitStatus(tab.id, signal).then((result: {
      changes: readonly { path: string; status: string; staged: boolean }[]
      branch: string | null
    }) => {
      setChanges(result.changes)
    }).catch(() => {
      setChanges([])
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    refreshStatus(controller.signal)
    return () => { controller.abort() }
  }, [gitStatus, tab.id])

  useEffect(() => {
    if (gitDiff === undefined || selected === null) return
    const change = changes.find(item => item.path === selected)
    if (change === undefined) return
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    void gitDiff(tab.id, change.path, change.staged, controller.signal).then((result: {
      path: string
      staged: boolean
      text: string
      truncated: boolean
    }) => {
      if (!cancelled) setDiff(result.text)
    }).catch(() => {
      if (!cancelled) setDiff('')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [gitDiff, tab.id, selected, changes])

  return (
    <div>
      <ul>
        {changes.map(change => (
          <li key={change.path}>
            <button type="button" onClick={() => { setSelected(change.path) }}>
              {change.status} {change.path} {change.staged ? '(staged)' : ''}
            </button>
            {change.staged
              ? (gitUnstage !== undefined && (
                <button type="button" onClick={() => { void gitUnstage(tab.id, [change.path], new AbortController().signal).then(() => { refreshStatus(new AbortController().signal) }) }}>
                    Unstage
                </button>
              ))
              : (gitStage !== undefined && (
                <button type="button" onClick={() => { void gitStage(tab.id, [change.path], new AbortController().signal).then(() => { refreshStatus(new AbortController().signal) }) }}>
                    Stage
                </button>
              ))}
          </li>
        ))}
      </ul>
      {selected !== null && (
        <pre>{loading ? t('loading') : diff}</pre>
      )}
      {gitCommit !== undefined && (
        <div>
          <input value={commitMessage} onChange={(event) => { setCommitMessage(event.target.value) }} />
          <button
            type="button"
            disabled={committing || commitMessage.trim() === ''}
            onClick={() => {
              setCommitting(true)
              void gitCommit(tab.id, commitMessage, new AbortController().signal).then(() => {
                setCommitMessage('')
                refreshStatus(new AbortController().signal)
              }).finally(() => { setCommitting(false) })
            }}
          >
            Commit
          </button>
        </div>
      )}
    </div>
  )
}
