/**
 * Work / Code mode switch: a sliding segmented control that switches the
 * main column between the Conversation (Work) and a registered Code panel.
 *
 * This is a POC occupant of the `sidebar.mode.switch` slot. It owns the
 * selected mode in local state and asks the layout to select the matching
 * main panel. The Code target is a placeholder: until a `code` panel is
 * registered, selecting Code leaves the Conversation in place (the layout
 * throws on a missing panel, so this occupant keeps the previous mode).
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from './locales.ts'
import css from './ModeSwitch.module.css'

/** The two modes the switch offers. `work` is the DSH Conversation, `code` the VS Code panel. */
export type SidebarMode = 'work' | 'code'

/** The registered main-panel key the Code mode targets. */
const CODE_PANEL: MainPanelId = 'code' as MainPanelId

/** Layout action the occupant needs; `null` selects the Conversation. */
export interface ModeSwitchInjected {
  selectPanel: (panelId: MainPanelId | null) => void
}

/** Full component props: the slot's runtime share, the layout action, and localized copy. */
export type ModeSwitchProps =
  PropsRuntime<'sidebar.mode.switch'>
  & InjectFace<ModeSwitchInjected>
  & PropsLocale<'sidebar'>

/**
 * Render the sliding Work / Code control.
 * @param props - runtime owner share, layout action, and locale copy.
 * @returns the segmented switch, or nothing when the sidebar is collapsed.
 */
export function ModeSwitch({ wide, selectPanel, t }: ModeSwitchProps): ReactNode {
  const [mode, setMode] = useState<SidebarMode>('work')
  if (!wide) return null
  const select = (next: SidebarMode): void => {
    if (next === 'code') {
      // Placeholder: a real Code panel registration replaces this guard.
      setMode(next)
      selectPanel(CODE_PANEL)
      return
    }
    setMode('work')
    selectPanel(null)
  }
  return (
    <div className={css.switch} role="tablist" aria-label={t('mode.switch.aria')}>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'work'}
        className={clsx(css.option, mode === 'work' && css.active)}
        onClick={() => { select('work') }}
      >
        {t('mode.work')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'code'}
        className={clsx(css.option, mode === 'code' && css.active)}
        onClick={() => { select('code') }}
      >
        {t('mode.code')}
      </button>
      <span aria-hidden="true" className={clsx(css.thumb, mode === 'code' && css.thumbCode)} />
    </div>
  )
}
