// @vitest-environment jsdom
/** Work / Code sliding switch behavior through direct props. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ModeSwitch, type ModeSwitchProps } from '../src/client/ModeSwitch.tsx'
import { en } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

const t: ModeSwitchProps['t'] = makeTranslate({ ...commonEn, ...en })

afterEach(() => { cleanup() })

function mount({ wide = true, selectPanel = vi.fn() }: { wide?: boolean; selectPanel?: ModeSwitchProps['selectPanel'] } = {}) {
  const view = render(<ModeSwitch wide={wide} selectPanel={selectPanel} t={t} />)
  return { view, selectPanel }
}

describe('ModeSwitch', () => {
  it('renders both options with Work selected in the expanded column', () => {
    const { selectPanel } = mount()
    const list = screen.getByRole('tablist', { name: 'Workspace mode' })
    expect(list).toBeDefined()
    const [work, code] = screen.getAllByRole('tab')
    expect(work.textContent).toBe('Work')
    expect(work.getAttribute('aria-selected')).toBe('true')
    expect(code.textContent).toBe('Code')
    expect(code.getAttribute('aria-selected')).toBe('false')
    expect(selectPanel).not.toHaveBeenCalled()
  })

  it('renders nothing when the sidebar is collapsed', () => {
    const { view } = mount({ wide: false })
    expect(view.container.childElementCount).toBe(0)
  })

  it('selects the Code panel and flips the selection', () => {
    const { selectPanel } = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))
    expect(selectPanel).toHaveBeenCalledExactlyOnceWith('code')
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Work' }).getAttribute('aria-selected')).toBe('false')
  })

  it('returns to the Conversation (null panel) from Code', () => {
    const { selectPanel } = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(selectPanel).toHaveBeenNthCalledWith(1, 'code')
    expect(selectPanel).toHaveBeenNthCalledWith(2, null)
    expect(screen.getByRole('tab', { name: 'Work' }).getAttribute('aria-selected')).toBe('true')
  })

  it('re-selecting the active option re-issues the same panel request', () => {
    const { selectPanel } = mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(selectPanel).toHaveBeenCalledTimes(2)
    expect(selectPanel).toHaveBeenNthCalledWith(1, null)
    expect(selectPanel).toHaveBeenNthCalledWith(2, null)
  })
})
