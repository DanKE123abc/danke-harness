import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FilesInjected } from './face.ts'

/** Props for the changes tab body. */
export type ChangesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & FilesInjected & PropsLocale<'sidebarFiles'>

/** A minimal Git changes view backed by workspaceFiles git status/diff. */
export function ChangesBody({
  useTabInfo, gitStatus, gitDiff, t,
}: ChangesBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const [changes, setChanges] = useState<readonly { path: string; status: string; staged: boolean }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (gitStatus === undefined) return
    const controller = new AbortController()
    let cancelled = false
    void gitStatus(tab.id, controller.signal).then((result: {
      changes: readonly { path: string; status: string; staged: boolean }[]
      branch: string | null
    }) => {
      if (!cancelled) setChanges(result.changes)
    }).catch(() => {
      if (!cancelled) setChanges([])
    })
    return () => {
      cancelled = true
      controller.abort()
    }
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
              {change.status} {change.path}
            </button>
          </li>
        ))}
      </ul>
      {selected !== null && (
        <pre>{loading ? t('loading') : diff}</pre>
      )}
    </div>
  )
}
