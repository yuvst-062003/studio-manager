// §6.1's plan step. Owner report, 2026-08-30: "on the sign in he cant pick the plan …
// there were no step of picking a plan where i should pick first between 300, 400, 550."
//
// The step's whole reason for existing is that a family could finish signup with
// `price_plan_id = NULL`, which prices their tuition at nothing — so the billing run raised
// no charge and the club found out at the end of the month.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PlanGate, promiseMethodFor } from './PlanGate'
import type { TrainingPlanClient, TrainingPlanView } from './trainingPlanClient'

const PLANS = [
  { id: 'p300', name: 'פעם בשבוע', monthly_amount_agorot: 30_000, weekly_extra_allowance: 0, is_current: false, is_offered: true },
  { id: 'p400', name: 'פעמיים בשבוע', monthly_amount_agorot: 40_000, weekly_extra_allowance: 1, is_current: false, is_offered: true },
  { id: 'p550', name: 'ללא הגבלה', monthly_amount_agorot: 55_000, weekly_extra_allowance: null, is_current: false, is_offered: true },
] as unknown as TrainingPlanView['plans']

function view(currentPlan: TrainingPlanView['current_plan'] = null): TrainingPlanView {
  return {
    current_plan: currentPlan,
    plans: PLANS,
    base_sessions: [],
    this_weeks_extras: [],
    credits_remaining: 0,
    scheduled_change: null,
  } as unknown as TrainingPlanView
}

function client(overrides: Partial<TrainingPlanClient> = {}): TrainingPlanClient {
  return {
    read: vi.fn(async () => view()),
    mark: vi.fn(),
    release: vi.fn(),
    requestPlan: vi.fn(async () => undefined),
    cancelChange: vi.fn(),
    claimPaid: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as TrainingPlanClient
}

const DANA = { id: 's1', display_name: 'דנה' }

function gate(props: Partial<Parameters<typeof PlanGate>[0]> = {}) {
  return render(
    <PlanGate client={client()} locale="he" students={[DANA]} {...props}>
      <div data-testid="app" />
    </PlanGate>,
  )
}

/** The בחירה button inside one named plan's card. Indexing `getAllByTestId` would say
 *  "the second one", which is not what any of these tests mean. */
async function chooseIn(planId: string) {
  return within(await screen.findByTestId(`plan-gate-option-${planId}`)).getByTestId(
    'plan-gate-choose',
  )
}

describe('the plan step (§6.1)', () => {
  it('asks the family to pick a plan when their child has none', async () => {
    gate()
    expect(await screen.findByTestId('plan-gate')).toBeInTheDocument()
    for (const plan of ['p300', 'p400', 'p550']) {
      expect(screen.getByTestId(`plan-gate-option-${plan}`)).toBeInTheDocument()
    }
    // 300 / 400 / 550 — the three numbers the owner named, as money rather than as copy.
    expect(screen.getByTestId('plan-gate-option-p300')).toHaveTextContent('300')
    expect(screen.getByTestId('plan-gate-option-p550')).toHaveTextContent('550')
  })

  it('stays out of the way when every child already has a plan', async () => {
    const current = { id: 'p400', name: 'פעמיים בשבוע', monthly_amount_agorot: 40_000 }
    gate({ client: client({ read: vi.fn(async () => view(current as never)) }) })
    expect(await screen.findByTestId('app')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-gate')).toBeNull()
  })

  it('never asks a trial family to commit to a monthly price', async () => {
    // §5.4a — a booked trial has no enrolment and no price, and the club decides when they
    // convert. Asking for 550 ₪ before the child has been on the mat is the opposite of
    // what a trial is for.
    const read = vi.fn(async () => view())
    gate({ client: client({ read }), students: [{ ...DANA, status: 'trial' }] })
    expect(await screen.findByTestId('app')).toBeInTheDocument()
    expect(read).not.toHaveBeenCalled()
  })

  it('sets the plan and sends the family to pay by card', async () => {
    const requestPlan = vi.fn(async () => undefined)
    const claimPaid = vi.fn(async () => undefined)
    const onGoToPayments = vi.fn()
    gate({ client: client({ requestPlan, claimPaid }), onGoToPayments })

    await userEvent.click(await chooseIn('p400'))
    // Card is the default route, so this is one press away.
    await userEvent.click(screen.getByTestId('plan-gate-confirm'))

    await waitFor(() => expect(requestPlan).toHaveBeenCalledWith('s1', 'p400'))
    expect(onGoToPayments).toHaveBeenCalled()
    // Nothing for a manager to confirm: the card settles itself through the IPN.
    expect(claimPaid).not.toHaveBeenCalled()
  })

  it('raises a claim the manager confirms when the money moves by hand', async () => {
    const requestPlan = vi.fn(async () => undefined)
    const claimPaid = vi.fn(async () => undefined)
    gate({ client: client({ requestPlan, claimPaid }) })

    await userEvent.click(await chooseIn('p300'))
    await userEvent.click(
      screen.getByRole('radio', { name: t('he', 'schedule.plan.gate.method.cash') }),
    )
    await userEvent.click(screen.getByTestId('plan-gate-paid-already'))
    await userEvent.click(screen.getByTestId('plan-gate-confirm'))

    // The plan applies on its own; only the MONEY waits for the manager.
    await waitFor(() => expect(requestPlan).toHaveBeenCalledWith('s1', 'p300'))
    expect(claimPaid).toHaveBeenCalledWith('p300', 'cash')
    expect(screen.getByTestId('plan-gate-claimed')).toBeInTheDocument()
  })

  it('lets the family past, and keeps asking', async () => {
    // Owner decision, 2026-08-30: skippable with a nagging banner. A club that has not
    // configured its plans yet must not lock every parent out of an app they can use.
    gate()
    await userEvent.click(await screen.findByTestId('plan-gate-later'))
    expect(screen.getByTestId('app')).toBeInTheDocument()
    expect(screen.getByTestId('plan-gate-banner')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('plan-gate-reopen'))
    expect(screen.getByTestId('plan-gate')).toBeInTheDocument()
  })

  it('says so rather than showing an empty list when the club has no plans', async () => {
    const empty = { ...view(), plans: [] } as TrainingPlanView
    gate({ client: client({ read: vi.fn(async () => empty) }) })
    expect(await screen.findByTestId('plan-gate-no-plans')).toBeInTheDocument()
    expect(screen.getByTestId('plan-gate-later')).toBeInTheDocument()
  })

  it('records a card that was paid elsewhere by the route it will reconcile from', () => {
    // A promise is a claim a MANAGER settles by hand. `card` has no `PromiseMethod` and
    // must not gain one — money paid by card outside the app arrives on the club's
    // statement, which is what `standing_order` already means in this queue (G8).
    expect(promiseMethodFor('card')).toBe('standing_order')
    expect(promiseMethodFor('cash')).toBe('cash')
    expect(promiseMethodFor('cheque')).toBe('cheque')
  })

  it('gives every control an accessible name, on both steps', async () => {
    gate()
    await screen.findByTestId('plan-gate')
    const named = () => {
      for (const control of [
        ...screen.getAllByRole('button'),
        ...screen.queryAllByRole('radio'),
        ...screen.queryAllByRole('checkbox'),
      ]) {
        expect(control).toHaveAccessibleName()
      }
    }
    named()
    // The radios and the "כבר שילמתי" box exist only on the second step, so a single
    // sweep of the first would check the half that has no inputs in it.
    await userEvent.click(await chooseIn('p300'))
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    named()
  })
})
