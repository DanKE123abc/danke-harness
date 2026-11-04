/** Web subagent catalog, navigation, and addressed-session composer owner. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import React from 'react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SubagentCatalogAction, SubagentHeaderLineage, type SubagentCatalogInjected, type SubagentHeaderLineageProps } from './SubagentHeaderLineage.tsx'
import {
  SubagentReadOnlyComposer, type SubagentReadOnlyMatch,
} from './SubagentReadOnlyComposer.tsx'
import { registerSidebarChat, subagentChatAddress } from './sidebar-chat/index.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { en, NS, zh, type SubagentKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Subagent catalog and read-only composer copy. */
    'subagent': SubagentKey
  }
}

export type {
  SubagentCatalogActionProps, SubagentCatalogInjected, SubagentHeaderLineageProps,
} from './SubagentHeaderLineage.tsx'
export type {
  SubagentReadOnlyComposerProps, SubagentReadOnlyMatch,
} from './SubagentReadOnlyComposer.tsx'

/** Required services for subagent presentation and navigation. */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale', 'sidebarRight', 'remote']

/** Claim the composer for one-shot history or an unavailable continuation owner. */
function selectReadOnlySubagent(owner: ComposerChainProps): SubagentReadOnlyMatch | null {
  const subagent = owner.session?.subagent
  if (subagent === undefined || subagent === null) return null
  if (subagent.address.mode === 'unknown') return { reason: 'unknown' }
  if (subagent.address.mode === 'one-shot') return { reason: 'one-shot' }
  // Until a Host summary establishes parent availability, keep the normal
  // disabled composer instead of claiming that the parent is offline.
  if (subagent.parentAvailable !== false) return null
  // A RUNNING parent-offline continuable child keeps the default composer:
  // its input is disabled there, but the same primary Stop stays available so
  // the child can be interrupted. Once it stops, this takeover returns.
  return owner.session?.running === true ? null : { reason: 'parent-unavailable' }
}

/**
 * Client plugin body: register the subagent catalog and read-only composer seats.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-subagent: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.inject(['resources', 'sidebarRightTabs'], (scope) => {
    registerSidebarChat(scope, ctx.locale.bind(NS))
    const TASKS_ID_LOCAL = '@deepseek-ai/dsh-client-ui-subagent-tasks'
    ctx.effect(() => scope.sidebarRightTabs.register({
      id: TASKS_ID_LOCAL,
      kind: 'tasks',
      priority: 'builtin',
      title: () => t('tasks'),
      guide: [{ id: 'tasks', order: 20, title: () => t('tasks') }],
    }), 'ui-subagent: tasks tab type')
  })
  const TASKS_ID = '@deepseek-ai/dsh-client-ui-subagent-tasks'
  function TasksTab(props: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS>): ReactNode {
    const catalogActions: SubagentCatalogInjected = {
      openChild(address: SubagentAddress) {
        ctx.uiWorkspace.openSession(address)
      },
      openChildAside(address: SubagentAddress) {
        ctx.sidebarRight.openResource(subagentChatAddress(address), {
          kind: 'subagentchat',
          preferNewPane: true,
        })
      },
      refreshProjection(parentSessionId: SessionId) {
        void ctx.sessions.refreshProjections(parentSessionId)
      },
    }
    return React.createElement(SubagentHeaderLineage, {
      ...(props as unknown as SubagentHeaderLineageProps),
      ...catalogActions,
      t,
    })
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TASKS_ID,
    locale: NS,
  }, TasksTab)), 'ui-subagent: tasks tab body')
  function SideChatUtility(props: PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS>): ReactNode {
    const [pending, setPending] = useState(false)
    const onClick = async (): Promise<void> => {
      setPending(true)
      try {
        const sidechat = ctx.remote?.session
        if (sidechat === undefined) return
        const result = await sidechat.sidechatStart({ sessionId: props.sessionId })
        if (result.ok) {
          ctx.sidebarRight.openResource(subagentChatAddress({
            parentSessionId: props.sessionId,
            childSessionId: result.value.sessionId,
            mode: 'continuable',
          }), { kind: 'subagentchat', preferNewPane: true })
        }
      } finally {
        setPending(false)
      }
    }
    return React.createElement('button', { type: 'button', disabled: pending, onClick }, t('sidechat'))
  }
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'sidechat',
    order: 5,
    locale: NS,
  }, SideChatUtility)), 'ui-subagent: side chat utility')
  const catalogActions = (_parentSessionId: SessionId): SubagentCatalogInjected => ({
    openChild(address: SubagentAddress) {
      ctx.uiWorkspace.openSession(address)
    },
    openChildAside(address: SubagentAddress) {
      ctx.sidebarRight.openResource(subagentChatAddress(address), {
        kind: 'subagentchat',
        preferNewPane: true,
      })
    },
    refreshProjection(parentSessionId: SessionId) {
      void ctx.sessions.refreshProjections(parentSessionId)
    },
  })
  ctx.slots.inject(
    'conversation.session.header.lineage',
    () => ctx.slots.register({
      name: 'conversation.session.header.lineage',
      locale: NS,
      inject: catalogActions,
    }, SubagentHeaderLineage),
  )
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'subagent-catalog',
      // Between the preset label (-10) and background tasks (20), after Team
      // navigation (-20).
      order: 10,
      locale: NS,
      inject: catalogActions,
    }, SubagentCatalogAction),
  )
  ctx.slots.inject(
    'conversation.composer',
    () => ctx.slots.register({
      name: 'conversation.composer',
      priority: -10,
      locale: NS,
      select: selectReadOnlySubagent,
    }, SubagentReadOnlyComposer),
  )
}
