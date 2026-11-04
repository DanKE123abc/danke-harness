// @vitest-environment jsdom
/** Code panel registration: the main keyed occupant and its teardown. */
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, PANEL_ID } from '../src/client/index.ts'

describe('ui-vscode-panel apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions'])
  })


  it('registers the code main panel and removes it on teardown', async () => {
    const runtime = await SlotTestRuntime.create()
    try {
      await runtime.declare({ main: { kind: 'keyed', scope: 'root' } })
      runtime.ctx.provide('locale', new LocaleRuntime(runtime.ctx))
      const handle = await runtime.mount({ inject: [...inject], apply })
      const entries = runtime.slots.entries('main')
      expect(entries.map(entry => entry.options.key)).toEqual([PANEL_ID])
      expect(entries[0]!.locale).toBe('vscode-panel')
      await handle.dispose()
      expect(runtime.slots.entries('main')).toEqual([])
    } finally {
      await runtime.dispose()
    }
  })
})
