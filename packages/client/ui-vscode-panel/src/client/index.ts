/**
 * Code panel client half: register the `code` main panel that hosts the VS Code
 * workbench iframe, behind the sidebar Work/Code mode switch.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { VscodePanel } from './VscodePanel.tsx'
import { en, NS, zh, type VscodePanelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Embedded Code panel copy. */
    'vscode-panel': VscodePanelKey
  }
}

export type { VscodePanelProps } from './VscodePanel.tsx'
export { selectMainViewSession, vscodeFrameUrl } from './VscodePanel.tsx'

/** The main-panel key the Work/Code switch selects. */
export const PANEL_ID = 'code' as MainPanelId

/** Required services: the slot registry, localized copy, and the session list. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: register dictionaries and the Code main panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'vscode-panel: dictionaries')
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
    }, VscodePanel)
  })
}
