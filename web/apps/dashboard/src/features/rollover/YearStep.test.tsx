// §5.15 step 1 — the two bidi defects the 2026-08-28 staging screenshots caught, and the
// shape of the step's footer.
//
// Both failures are invisible to `textContent`: the DOM order is correct either way and
// only the bidi layout reverses. So every assertion here is on the MECHANISM that keeps
// the layout right, not on the characters.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { YearStep } from './YearStep'
import type { RolloverClient, TrainingYear } from './client'

const year = (over: Partial<TrainingYear> = {}): TrainingYear =>
  ({
    id: 'y1',
    name: '2026–2027',
    starts_on: '2026-09-01',
    ends_on: '2027-09-01',
    status: 'draft',
    ...over,
  }) as TrainingYear

function renderStep(value: TrainingYear) {
  return render(
    <YearStep
      client={{} as RolloverClient}
      locale="he"
      onDone={vi.fn()}
      onSkip={vi.fn()}
      onYearCreated={vi.fn()}
      status="done"
      today="2026-08-29T09:00:00.000Z"
      year={value}
    />,
  )
}

describe('YearStep · bidi', () => {
  it('holds the date range in ONE ltr island', () => {
    // Staging printed `2027-09-01 – 2026-09-01`: two ltr date runs with a neutral dash
    // between them, in an RTL paragraph, are free to be reordered.
    const { container } = renderStep(year())
    const range = container.querySelector('.studio-range')
    expect(range).toHaveAttribute('dir', 'ltr')
    expect(range?.textContent).toBe('2026-09-01–2027-09-01')
  })

  it('lets the year NAME choose its own direction rather than forcing one', () => {
    // `2026–2027` has no strong character at all, so an RTL paragraph laid it out
    // `2027–2026`. `dir="auto"` reads the first strong character and finds none, so the
    // digits stay in order — without hard-coding ltr, which would break a Hebrew name.
    const { container } = renderStep(year())
    const name = container.querySelector('[data-testid="rollover-year-name"] bdi')
    expect(name).toHaveAttribute('dir', 'auto')
    expect(name?.textContent).toBe('2026–2027')
  })

  it('applies the same isolation to a Hebrew name, which must stay rtl', () => {
    const { container } = renderStep(year({ name: 'שנת תשפ״ז' }))
    const name = container.querySelector('[data-testid="rollover-year-name"] bdi')
    expect(name).toHaveAttribute('dir', 'auto')
    expect(name?.textContent).toBe('שנת תשפ״ז')
  })
})

describe('YearStep · the footer', () => {
  it('separates what the step SAYS from what a manager can DO', () => {
    // The row used to hold up to four buttons and two sentences at one rank. The status
    // line and the derived hint are description, and description is not an action.
    const { container } = renderStep(year())
    const bar = container.querySelector('.studio-actionbar')
    const meta = container.querySelector('.rollover-step-actions__meta')
    expect(bar).not.toBeNull()
    expect(meta).not.toBeNull()
    expect(bar).toContainElement(screen.getByTestId('rollover-done-year'))
    expect(meta).toContainElement(screen.getByTestId('rollover-step-status-year'))
    expect(bar).not.toContainElement(screen.getByTestId('rollover-step-status-year'))
  })

  it('aligns a lone primary to the inline-end edge instead of leaving it adrift', () => {
    // `year` is derived and offers no back, skip or reopen — so there is no start group,
    // and ActionBar must not spread to both edges around an empty one.
    const { container } = renderStep(year())
    expect(container.querySelector('.studio-actionbar')).toHaveAttribute('data-align', 'end')
    expect(container.querySelectorAll('.studio-actionbar__group')).toHaveLength(1)
  })
})
