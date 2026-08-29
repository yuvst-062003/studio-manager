import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { PlanBadge } from './PlanBadge'

describe.each(DIRECTIONS)('PlanBadge in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders and flows in the document direction', () => {
      renderIn(<PlanBadge locale={locale} perWeek={3} />, { locale, theme })
      expect(screen.getByTestId('plan-badge')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })
  })
})

describe('PlanBadge', () => {
  it('shows the frequency, and says it in words for a screen reader', () => {
    // The glyph is `×3`; the accessible name is the sentence. A mark whose only meaning is
    // its shape is invisible to a screen reader and ambiguous to everyone else (SC 1.4.1).
    renderIn(<PlanBadge locale="he" perWeek={3} />)
    const badge = screen.getByTestId('plan-badge')
    expect(badge).toHaveTextContent('×3')
    expect(badge).toHaveTextContent(t('he', 'billing.plan.perWeek').replace('{{count}}', '3'))
    expect(badge).toHaveAttribute('data-plan', 'counted')
  })

  it('draws an open membership as its own state, not as a missing number', () => {
    // `price_plan.sessions_per_week` is nullable and null MEANS unlimited — it is a plan,
    // not an absent answer, and the badge has to tell those two apart.
    renderIn(<PlanBadge locale="he" perWeek={null} />)
    const badge = screen.getByTestId('plan-badge')
    expect(badge).toHaveTextContent('∞')
    expect(badge).toHaveTextContent(t('he', 'billing.plan.unlimited'))
    expect(badge).toHaveAttribute('data-plan', 'open')
  })

  it('marks a student with NO plan, because that one needs acting on', () => {
    // Not being billed at all is the only state on this badge a manager must do something
    // about, so it is drawn rather than left blank.
    renderIn(<PlanBadge locale="he" perWeek={undefined} />)
    const badge = screen.getByTestId('plan-badge')
    expect(badge).toHaveAttribute('data-plan', 'none')
    expect(badge).toHaveTextContent(t('he', 'billing.plan.badge.noneTitle'))
  })

  it('renders nothing while the plan map is still loading', () => {
    // Two different silences: "no plan set" is an answer and is drawn; "not read yet" is
    // not an answer and must not be drawn as one.
    renderIn(<PlanBadge loading locale="he" perWeek={undefined} />)
    expect(screen.queryByTestId('plan-badge')).toBeNull()
  })

  it('keeps the digits an LTR island inside an RTL row', () => {
    // Same rule RangeText exists for: `×3` beside Hebrew text must not reorder.
    const { container } = renderIn(<PlanBadge locale="he" perWeek={4} />, { locale: 'he' })
    expect(container.querySelector('[aria-hidden="true"][dir="ltr"]')).not.toBeNull()
  })

  it('never carries an amount — there is no prop for one', () => {
    // Invariant 3 forbids financial fields on coach-scoped responses. The badge is
    // manager-only at every call site; keeping money out of the component means a future
    // coach-facing caller would be wrong rather than dangerous.
    renderIn(<PlanBadge locale="he" perWeek={2} />)
    expect(screen.getByTestId('plan-badge').textContent).not.toMatch(/[₪$]|\d{3,}/)
  })
})
