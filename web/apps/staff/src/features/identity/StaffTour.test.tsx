// Ship-audit D6. The tour used to be a dead end twice over: finishing it rendered an
// EMPTY section (a coach's landing page was a blank screen), and nothing recorded that it
// had been seen, so it greeted the same coach on every single launch. §6.1 calls it a
// '3 screens, skippable' tour — something walked once, on the way to the today screen.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { StaffTour, TOUR_SEEN_KEY } from './StaffTour'

beforeEach(() => {
  globalThis.localStorage.clear()
  globalThis.location.hash = ''
})

describe('StaffTour', () => {
  it('renders the three-screen tour on a first run', () => {
    render(<StaffTour locale="he" />)
    expect(screen.getByTestId('staff-tour')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.tour.1'))).toBeInTheDocument()
  })

  it('lands the coach on the today screen when skipped, and remembers', async () => {
    render(<StaffTour locale="he" />)
    await userEvent.click(screen.getByText(t('he', 'common.tour.skip')))
    expect(globalThis.location.hash).toBe('#/schedule')
    expect(globalThis.localStorage.getItem(TOUR_SEEN_KEY)).not.toBeNull()
  })

  it('walks all three screens through to the same landing', async () => {
    render(<StaffTour locale="he" />)
    const next = () => userEvent.click(screen.getByText(t('he', 'common.tour.next')))
    await next()
    expect(screen.getByText(t('he', 'common.tour.2'))).toBeInTheDocument()
    await next()
    await next()
    expect(globalThis.location.hash).toBe('#/schedule')
  })

  it('never greets a coach who has already seen it', () => {
    globalThis.localStorage.setItem(TOUR_SEEN_KEY, '2026-08-27')
    render(<StaffTour locale="he" />)
    expect(screen.queryByTestId('staff-tour')).toBeNull()
    expect(globalThis.location.hash).toBe('#/schedule')
  })
})
