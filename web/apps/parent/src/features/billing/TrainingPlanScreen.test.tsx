// The parent's plan screen — what 300 / 400 / 550 ₪ actually buys this child.
//
// The tests that carry weight are the two rules a reasonable implementation gets wrong: a
// plan that buys this student nothing is SHOWN with its reason rather than hidden, and a
// row that cannot be marked says WHY rather than being quietly disabled. Both exist because
// the alternative is a phone call to the manager.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { TrainingPlanScreen } from './TrainingPlanScreen'
import type { TrainingPlanView } from './trainingPlanClient'

const LOCALE = 'he' as const

const PLANS = [
  { id: 'p300', name: '300', monthly_amount_agorot: 30_000, weekly_extra_allowance: 0, is_offered: true, is_current: false },
  { id: 'p400', name: '400', monthly_amount_agorot: 40_000, weekly_extra_allowance: 1, is_offered: true, is_current: true },
  { id: 'p550', name: '550', monthly_amount_agorot: 55_000, weekly_extra_allowance: null, is_offered: false, is_current: false },
]

function view(overrides: Partial<TrainingPlanView> = {}): TrainingPlanView {
  return {
    student_id: 's1',
    student_name: 'דנה כהן',
    current_plan: PLANS[1]!,
    base_sessions: [
      {
        session_id: 'b1',
        group_name: 'ג׳ודו קבוצה 3',
        starts_at: '2026-11-17T16:30:00Z',
        ends_at: '2026-11-17T17:30:00Z',
      },
    ],
    this_weeks_extras: [
      {
        session_id: 'x1',
        group_id: 'g1',
        group_name: 'ג׳ודו ראשון',
        kind: 'extra',
        starts_at: '2026-11-15T14:00:00Z',
        ends_at: '2026-11-15T15:00:00Z',
        booking_id: null,
        is_markable: true,
        reason: null,
      },
      {
        session_id: 'x2',
        group_id: 'g2',
        group_name: 'קרוספיט שני',
        kind: 'extra',
        starts_at: '2026-11-16T14:00:00Z',
        ends_at: '2026-11-16T15:00:00Z',
        booking_id: null,
        is_markable: true,
        reason: null,
      },
    ],
    credits_remaining: 1,
    plans: PLANS,
    scheduled_change: null,
    ...overrides,
  }
}

function renderScreen(props: Record<string, unknown> = {}) {
  return render(
    <TrainingPlanScreen
      locale={LOCALE}
      view={view()}
      onMark={vi.fn()}
      onRelease={vi.fn()}
      onRequestPlan={vi.fn()}
      onCancelChange={vi.fn()}
      {...props}
    />,
  )
}

describe('the parent’s training plan', () => {
  it('shows what is always included, separately from what is chosen', () => {
    // §3 — base sessions are never marked. Rendering them beside the choosable ones with
    // no button is what makes "always included" mean something to a parent.
    renderScreen()
    const included = screen.getByTestId('plan-always-included')
    expect(within(included).getByText(/ג׳ודו קבוצה 3/)).toBeInTheDocument()
    expect(within(included).queryByTestId('plan-mark')).not.toBeInTheDocument()
  })

  it('counts the credits left this week', () => {
    renderScreen()
    expect(screen.getByTestId('plan-credits')).toHaveTextContent('1')
  })

  it('says "no weekly limit" rather than a number on an unlimited plan', () => {
    // A large number is a limit. The absence of one is a different thing and the screen
    // has to say the different thing.
    renderScreen({ view: view({ credits_remaining: null, current_plan: PLANS[2]! }) })
    expect(screen.getByTestId('plan-credits')).toHaveTextContent(
      t(LOCALE, 'schedule.plan.unlimited'),
    )
  })

  it('marks a session and releases it again', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined)
    const onRelease = vi.fn().mockResolvedValue(undefined)
    renderScreen({ onMark, onRelease })
    await userEvent.click(screen.getAllByTestId('plan-mark')[0]!)
    expect(onMark).toHaveBeenCalledWith('x1')

    renderScreen({
      onRelease,
      view: view({
        this_weeks_extras: [{ ...view().this_weeks_extras[0]!, booking_id: 'bk1' }],
      }),
    })
    await userEvent.click(screen.getAllByTestId('plan-release')[0]!)
    expect(onRelease).toHaveBeenCalledWith('bk1')
  })

  it('greys an unmarkable row and says why, rather than disabling it silently', () => {
    // §7 — every refusal names the reason. A disabled control with no explanation is the
    // support call this whole screen exists to prevent.
    renderScreen({
      view: view({
        credits_remaining: 0,
        this_weeks_extras: [
          {
            ...view().this_weeks_extras[0]!,
            is_markable: false,
            reason: 'no_credits',
          },
        ],
      }),
    })
    expect(screen.queryByTestId('plan-mark')).not.toBeInTheDocument()
    expect(screen.getByTestId('plan-reason')).toHaveTextContent(
      t(LOCALE, 'schedule.plan.reason.no_credits'),
    )
  })

  it('shows a plan that buys this student nothing, with its reason', () => {
    // §5.1 — a greyed PLAN is shown, never hidden. It turns itself on when the child moves
    // up a group, which is exactly why hiding it would be wrong rather than merely unkind.
    renderScreen()
    const row = screen.getByTestId('plan-option-p550')
    expect(row).toHaveTextContent(t(LOCALE, 'schedule.plan.notOffered'))
    expect(within(row).queryByTestId('plan-choose')).not.toBeInTheDocument()
  })

  it('offers the plans that do raise the week, and never the current one', () => {
    renderScreen()
    expect(
      within(screen.getByTestId('plan-option-p300')).getByTestId('plan-choose'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('plan-option-p400')).queryByTestId('plan-choose'),
    ).not.toBeInTheDocument()
  })

  it('requests a plan change and says when it takes effect', async () => {
    const onRequestPlan = vi.fn().mockResolvedValue(undefined)
    renderScreen({ onRequestPlan })
    await userEvent.click(
      within(screen.getByTestId('plan-option-p300')).getByTestId('plan-choose'),
    )
    expect(onRequestPlan).toHaveBeenCalledWith('p300')
  })

  it('shows a scheduled change with the date and a way out of it', async () => {
    // Which is the whole reason a change is a row rather than an edit.
    const onCancelChange = vi.fn().mockResolvedValue(undefined)
    renderScreen({
      onCancelChange,
      view: view({
        scheduled_change: {
          id: 'c1',
          student_id: 's1',
          from_price_plan_id: 'p400',
          to_price_plan_id: 'p300',
          effective_on: '2026-12-01',
          status: 'scheduled',
          settlement_status: 'pending',
          requested_at: '2026-11-10T09:00:00Z',
          applied_at: null,
        },
      }),
    })
    const banner = screen.getByTestId('plan-scheduled-change')
    expect(banner).toHaveTextContent('2026-12-01')
    await userEvent.click(within(banner).getByTestId('plan-cancel-change'))
    expect(onCancelChange).toHaveBeenCalledWith('c1')
  })

  it('never builds a ₪ string by hand', () => {
    // G2, and the RTL hazard is the FIX rather than the bug: a `direction: ltr` wrapper
    // would flip `300₪` to `₪300`.
    const { container } = renderScreen()
    for (const el of container.querySelectorAll('*')) {
      if (el.closest('.studio-money')) continue
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
      expect(own).not.toContain('₪')
    }
  })
})
