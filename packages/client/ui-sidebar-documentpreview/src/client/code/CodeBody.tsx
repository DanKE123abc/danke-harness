/** Incrementally highlighted source; the document owner supplies the accumulated text and wrap preference. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import type {} from './locales.ts'
import css from './CodeBody.module.css'

/** Document owner props and this renderer's localized controls. */
let codeRemote: unknown
export function setCodeRemote(remote: unknown): void {
  codeRemote = remote
}

export type CodeBodyProps = DocumentPreviewProps & PropsLocale<'sidebarCodePreview'>

/** @param props - accumulated document contents and framework props. @returns one stable CodeBlock, or no body for byte contents. */
export function CodeBody({ resourceAddress, content, wrap, scrollportRef, t, useResource }: CodeBodyProps): ReactNode {
  const file = parseFileAddress(resourceAddress)
  if (file === undefined) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`)
  const meta = typeof useResource === 'function' ? useResource<'file'>(resourceAddress) : undefined
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  if (content.kind !== 'text') return null
  const language = languageForPath(file.path)

  const sessionId = file.scope === 'session' ? file.sessionId : undefined
  const path = file.path
  const version = meta?.value?.version

  const save = async (): Promise<void> => {
    if (sessionId === undefined) return
    setSaving(true)
    setError(undefined)
    try {
      const remote = codeRemote as
        | {
          workspaceFiles: {
            write: (
              sessionId: string,
              path: string,
              content: string,
              options: { expectedVersion?: string },
              signal: AbortSignal,
            ) => Promise<{ ok?: boolean; value?: { version?: string }; error?: { message?: string } }>
          }
        }
        | undefined
      if (remote === undefined) throw new Error('remote unavailable')
      const writeOptions = version === undefined ? {} : { expectedVersion: version }
      const result = await remote.workspaceFiles.write(sessionId, path, draft, writeOptions, new AbortController().signal)
      if (!result?.ok) setError(result?.error?.message ?? 'write failed')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className={css.renderer} data-code-preview data-wrap={wrap}>
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          style={{ width: '100%', minHeight: '60vh', fontFamily: 'monospace' }}
        />
        {error !== undefined ? <div>{error}</div> : null}
        <div>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={css.renderer} data-code-preview data-wrap={wrap}>
      <CodeBlock
        className={css.code}
        contentRef={scrollportRef}
        code={content.text}
        lang={language}
        streaming={!content.eof}
        wrap={wrap}
        lineNumbers
        copyLabel={t('copy')}
        copiedLabel={t('copied')}
        toolbarLabels={{ codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') }}
      />
      <div>
        <Button onClick={() => { setDraft(content.text); setEditing(true) }}>Edit</Button>
      </div>
    </div>
  )
}
