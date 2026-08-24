import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { StatusChip } from './StatusChip'

const STATUSES = ['debt', 'paid', 'pending', 'cancelled', 'unmarked', 'planned'] as const

describe.each(DIRECTIONS)('StatusChip in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(STATUSES)('renders the %s chip with its label as text', (status) => {
      renderIn(<StatusChip label="חוב" status={status} />, { locale, theme })
      expect(screen.getByText('חוב')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('StatusChip', () => {
  it.each(STATUSES)('exposes %s through data-status', (status) => {
    renderIn(<StatusChip label="x" status={status} />)
    // Only-source-observable: jsdom applies no stylesheet, so the attribute is the
    // testable form of "this chip is drawn in the debt colour".
    expect(screen.getByText('x')).toHaveAttribute('data-status', status)
  })

  it('carries its meaning in text, never in colour alone (SC 1.4.1)', () => {
    // The whole point of a chip: a person who cannot distinguish the red from the green
    // still reads "חוב" and "שולם".
    renderIn(
      <>
        <StatusChip label="חוב" status="debt" />
        <StatusChip label="שולם" status="paid" />
      </>,
    )
    expect(screen.getByText('חוב')).toBeVisible()
    expect(screen.getByText('שולם')).toBeVisible()
  })

  it('takes its label as a prop, so one status can read differently per screen', () => {
    renderIn(<StatusChip label="חוב של 320₪" status="debt" />)
    expect(screen.getByText('חוב של 320₪')).toBeVisible()
  })

  it('never renders D8s retired grey — 4h draws בוטל in #7a766d, which G11 retires', () => {
    renderIn(<StatusChip label="בוטל" status="cancelled" />)
    const chip = screen.getByText('בוטל')
    expect(chip.getAttribute('style') ?? '').not.toContain('#7a766d')
    expect(chip).toHaveAttribute('data-status', 'cancelled')
  })

  it('hardcodes no colour at all — every status resolves through a token (G13)', () => {
    for (const status of STATUSES) {
      const { unmount } = renderIn(<StatusChip label="x" status={status} />)
      expect(screen.getByText('x').getAttribute('style')).toBeNull()
      unmount()
    }
  })
})
