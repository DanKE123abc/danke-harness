/**
 * Node-half lifecycle: the surface plugin's host entry is an inert loader seat.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-vscode-panel node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { apply() }).not.toThrow()
  })
})
