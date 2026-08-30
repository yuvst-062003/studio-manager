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
import { PlanGate, isPromiseRoute } from './PlanGate'
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

  it('takes money by card at signup, forward, because nothing is owed yet', async () => {
    // The card is the only route that can actually charge, and at signup the billing run
    // has not reached this family — so their basket is empty and the months go FORWARD.
    // The money lands as credit and covers the first charge the moment it is raised.
    const requestPlan = vi.fn(async () => undefined)
    const claimPaid = vi.fn(async () => undefined)
    const onPayByCard = vi.fn(async () => undefined)
    gate({
      client: client({ requestPlan, claimPaid }),
      monthlyTotalAgorot: 40_000,
      onPayByCard,
    })

    await userEvent.click(await chooseIn('p400'))
    await userEvent.click(screen.getByTestId('plan-gate-method-card'))
    await userEvent.click(screen.getByRole('radio', { name: '3' }))
    // 3 x 400 quoted before the family leaves the app.
    expect(screen.getByTestId('plan-gate-route-card')).toHaveTextContent('1,200')
    await userEvent.click(screen.getByTestId('plan-gate-pay-now'))

    await waitFor(() => expect(requestPlan).toHaveBeenCalledWith('s1', 'p400'))
    expect(onPayByCard).toHaveBeenCalledWith(3)
    // Nothing for a manager to confirm: the card settles itself through the IPN.
    expect(claimPaid).not.toHaveBeenCalled()
  })

  it('never offers "already paid" on the card', async () => {
    // There would be nothing for a human to confirm — which is the same reason the card is
    // not a `PromiseMethod`.
    gate({ onPayByCard: vi.fn(async () => undefined) })
    await userEvent.click(await chooseIn('p300'))
    await userEvent.click(screen.getByTestId('plan-gate-method-card'))
    expect(screen.getByTestId('plan-gate-pay-now')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-gate-paid-already')).toBeNull()
  })

  it('offers both tenses on every route the club takes by hand', async () => {
    // Owner correction, 2026-08-30: "when you enter each he can actually pay or choose
    // already paid". Cash, cheques and standing orders move no money through software, so
    // both answers are the same promise with a different tense.
    gate()
    await userEvent.click(await chooseIn('p300'))
    for (const route of ['cash', 'cheque', 'standing_order']) {
      await userEvent.click(screen.getByTestId(`plan-gate-method-${route}`))
      expect(screen.getByTestId(`plan-gate-route-${route}`)).toBeInTheDocument()
      expect(screen.getByTestId('plan-gate-pay-now')).toBeInTheDocument()
      expect(screen.getByTestId('plan-gate-paid-already')).toBeInTheDocument()
      await userEvent.click(screen.getByTestId('plan-gate-back'))
    }
  })

  it('tells the manager the money is already in the drawer', async () => {
    const requestPlan = vi.fn(async () => undefined)
    const claimPaid = vi.fn(async () => undefined)
    gate({ client: client({ requestPlan, claimPaid }) })

    await userEvent.click(await chooseIn('p300'))
    await userEvent.click(screen.getByTestId('plan-gate-method-cash'))
    await userEvent.click(screen.getByTestId('plan-gate-paid-already'))

    // The plan applies on its own; only the MONEY waits for the manager.
    await waitFor(() => expect(requestPlan).toHaveBeenCalledWith('s1', 'p300'))
    expect(claimPaid).toHaveBeenCalledWith('p300', 'cash', true)
  })

  it('tells the manager to expect money that has not moved yet', async () => {
    // The same promise object, the other tense. Without the distinction both buttons
    // produced one indistinguishable pending row and the manager could not tell "look in
    // the drawer now" from "wait for them".
    const claimPaid = vi.fn(async () => undefined)
    gate({ client: client({ claimPaid }) })

    await userEvent.click(await chooseIn('p550'))
    await userEvent.click(screen.getByTestId('plan-gate-method-cheque'))
    await userEvent.click(screen.getByTestId('plan-gate-pay-now'))

    await waitFor(() => expect(claimPaid).toHaveBeenCalledWith('p550', 'cheque', false))
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

  it('keeps the card out of the promise queue', () => {
    // A promise is a claim a MANAGER settles by hand. A card payment through the app
    // settles itself through the IPN, so a card promise would be a pending item nobody
    // ever has to act on.
    expect(isPromiseRoute('card')).toBe(false)
    expect(isPromiseRoute('cash')).toBe(true)
    expect(isPromiseRoute('cheque')).toBe(true)
    expect(isPromiseRoute('standing_order')).toBe(true)
  })


  it('names the route and says the money moves in person', async () => {
    // "\u05dc\u05e9\u05dc\u05dd \u05e2\u05db\u05e9\u05d9\u05d5" was a lie on these three: pressing it pays nobody, because the
    // app takes no money on cash, cheques or a standing order (owner, 2026-08-30).
    gate()
    await userEvent.click(await chooseIn('p300'))
    for (const route of ['cash', 'cheque', 'standing_order'] as const) {
      await userEvent.click(screen.getByTestId(`plan-gate-method-${route}`))
      expect(screen.getByTestId('plan-gate-pay-now')).toHaveTextContent(
        t('he', `schedule.plan.gate.hand.${route}`),
      )
      expect(screen.getByTestId('plan-gate-pay-now')).not.toHaveTextContent(
        t('he', 'schedule.plan.gate.payNow'),
      )
      await userEvent.click(screen.getByTestId('plan-gate-back'))
    }
  })

  it('keeps "pay now" on the card, which really does pay now', async () => {
    gate({ onPayByCard: vi.fn(async () => undefined) })
    await userEvent.click(await chooseIn('p300'))
    await userEvent.click(screen.getByTestId('plan-gate-method-card'))
    expect(screen.getByTestId('plan-gate-pay-now')).toHaveTextContent(
      t('he', 'schedule.plan.gate.payNow'),
    )
  })

  it('moves on by itself once the answer is recorded', async () => {
    // It used to stop on a confirmation with a "\u05d4\u05de\u05e9\u05da" to press. There is nothing left to
    // ask this family, so the step re-reads: the next child who needs a plan, or the app.
    const read = vi
      .fn()
      .mockResolvedValueOnce(view())
      .mockResolvedValue(view({ id: 'p300', name: 'פעם בשבוע' } as never))
    gate({ client: client({ read }) })

    await userEvent.click(await chooseIn('p300'))
    await userEvent.click(screen.getByTestId('plan-gate-method-cash'))
    await userEvent.click(screen.getByTestId('plan-gate-paid-already'))

    await waitFor(() => expect(screen.getByTestId('app')).toBeInTheDocument())
    expect(screen.queryByTestId('plan-gate')).toBeNull()
  })

  it('records a second payment without refusing it', async () => {
    // **The reported bug.** `act` re-requested the plan on every press, so once it was set
    // the server refused with "this student is already on that plan" — and every second
    // action died as a bare common.error.generic. Setting a plan and paying for it are two
    // operations; only the first is done.
    const requestPlan = vi.fn(async () => undefined)
    const claimPaid = vi.fn(async () => undefined)
    // The child still has no plan on re-read, so the step stays open for a second answer.
    gate({ client: client({ requestPlan, claimPaid }) })

    await userEvent.click(await chooseIn('p400'))
    await userEvent.click(screen.getByTestId('plan-gate-method-cash'))
    await userEvent.click(screen.getByTestId('plan-gate-paid-already'))
    await waitFor(() => expect(claimPaid).toHaveBeenCalledTimes(1))

    await userEvent.click(await chooseIn('p400'))
    await userEvent.click(screen.getByTestId('plan-gate-method-cheque'))
    await userEvent.click(screen.getByTestId('plan-gate-pay-now'))

    await waitFor(() => expect(claimPaid).toHaveBeenCalledTimes(2))
    expect(claimPaid).toHaveBeenLastCalledWith('p400', 'cheque', false)
    // The plan was asked for ONCE. The second round changed nothing about it.
    expect(requestPlan).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('plan-gate-error')).toBeNull()
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
    // Three steps, and only the last has inputs in it — a single sweep of the first would
    // check the half with no controls to check.
    await userEvent.click(await chooseIn('p300'))
    named()
    await userEvent.click(screen.getByTestId('plan-gate-method-card'))
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    named()
  })
})
