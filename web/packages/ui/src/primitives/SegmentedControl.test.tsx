import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { SegmentedControl } from './SegmentedControl'

const OPTIONS = [
  { value: 'day', label: 'יום' },
  { value: 'week', label: 'שבוע' },
  { value: 'month', label: 'חודש' },
] as const

describe.each(DIRECTIONS)('SegmentedControl in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is one radio group with every option', () => {
      renderIn(
        <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="week" />,
        { locale, theme },
      )
      expect(screen.getByRole('radiogroup', { name: 'תצוגה' })).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(document.documentElement.dir).toBe(dir)
    })

    it('marks exactly the current value as selected', () => {
      renderIn(
        <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="week" />,
        { locale, theme },
      )
      expect(screen.getByRole('radio', { name: 'שבוע' })).toBeChecked()
      expect(
        screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked),
      ).toHaveLength(1)
    })
  })
})

describe('SegmentedControl', () => {
  it('reports the newly chosen value', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <SegmentedControl
        legend="תצוגה"
        onValueChange={onValueChange}
        options={OPTIONS}
        value="week"
      />,
    )
    await user.click(screen.getByRole('radio', { name: 'חודש' }))
    expect(onValueChange).toHaveBeenCalledWith('month')
  })

  it('supports more than two options — D5s calendar has three views, 4h draws two', () => {
    renderIn(
      <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="day" />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('gives each instance its own group name, so two controls do not interfere', () => {
    renderIn(
      <>
        <SegmentedControl legend="A" onValueChange={() => {}} options={OPTIONS} value="day" />
        <SegmentedControl legend="B" onValueChange={() => {}} options={OPTIONS} value="week" />
      </>,
    )
    // Asserted on the `name` attribute, not on how many radios read as checked: React
    // drives `checked` as a controlled prop, so it forces each input's state on every
    // render and a SHARED name still looks correct in jsdom. In a real browser two
    // controls sharing a name interfere on click. Verified by mutation — pinning `name`
    // to a constant left the checked-count version of this test green.
    const names = new Set(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).name))
    expect(names.size).toBe(2)
  })

  it('is operable from the keyboard', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <SegmentedControl
        legend="תצוגה"
        onValueChange={onValueChange}
        options={OPTIONS}
        value="day"
      />,
    )
    await user.tab()
    expect(screen.getByRole('radio', { name: 'יום' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenCalledWith('week')
  })
})
