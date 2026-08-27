// L2 — the wrapping single-select chip group the landing picker needs.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotChips } from './SlotChips'

const OPTIONS = [
  { id: 'a', label: 'ראשון 16:00' },
  { id: 'b', label: 'חמישי 16:00' },
  { id: 'c', label: 'ראשון 23:00', disabled: true },
]

afterEach(() => {
  document.documentElement.dir = 'ltr'
  document.documentElement.removeAttribute('data-theme')
})

describe('SlotChips', () => {
  it('is a radio group: one selection, real inputs', async () => {
    const onValueChange = vi.fn()
    render(
      <SlotChips legend="בחירת מועד" options={OPTIONS} value="a" onValueChange={onValueChange} />,
    )
    expect(screen.getByRole('group', { name: 'בחירת מועד' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'ראשון 16:00' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'חמישי 16:00' }))
    expect(onValueChange).toHaveBeenCalledWith('b')
  })

  it('greys a disabled chip rather than hiding it — §5.4', () => {
    // A parent must SEE the cancelled slot exists and pick a different week, not conclude
    // there is nothing.
    render(<SlotChips legend="בחירת מועד" options={OPTIONS} value={null} onValueChange={vi.fn()} />)
    const disabled = screen.getByRole('radio', { name: 'ראשון 23:00' })
    expect(disabled).toBeDisabled()
    expect(disabled.closest('[data-disabled="true"]')).not.toBeNull()
  })

  it('wraps rather than tracking — the reason SegmentedControl could not serve', () => {
    render(<SlotChips legend="x" options={OPTIONS} value={null} onValueChange={vi.fn()} />)
    const row = screen.getByTestId('slot-chips').querySelector('.studio-slot-chips__row')
    expect(row).not.toBeNull()
  })

  it('renders in RTL and dark theme with no physical CSS', () => {
    document.documentElement.dir = 'rtl'
    document.documentElement.dataset.theme = 'dark'
    const { container } = render(
      <SlotChips legend="בחירת מועד" options={OPTIONS} value="b" onValueChange={vi.fn()} />,
    )
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
    expect(screen.getByRole('radio', { name: 'חמישי 16:00' })).toBeChecked()
  })
})
