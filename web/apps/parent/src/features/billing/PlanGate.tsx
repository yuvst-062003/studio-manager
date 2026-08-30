// §6.1's missing step — בחירת מסלול, between the health declaration and home.
//
// Owner report, 2026-08-30: "on the sign in he cant pick the plan. i entered all, signed
// the privacy and health, but there were no step of picking a plan where i should pick
// first between 300, 400, 550 — and when i enter the plan pick a way to pay."
//
// Everything this step needs already existed and none of it was reachable during signup:
// `TrainingPlanScreen` could switch a plan, but it lives behind `#/plan/<studentId>`,
// linked only from a student card's enrolments section. A family finishing §6.1 landed on
// home with `price_plan_id = NULL`, which prices their tuition at nothing — so the billing
// run raised no charge, the payments screen was empty, and the club found out at the end of
// the month.
//
// **The plan applies immediately, and that is the server's existing behaviour rather than a
// new rule.** `PlanChangeService.request` calls `_is_upgrade(None, target)`, which is True
// for a student with no plan, and an upgrade sets `student.price_plan_id` at request time.
// So this screen needs no special "first plan" endpoint: picking is an upgrade from nothing.
//
// **A skip, not a block** (owner decision, 2026-08-30). Unlike §5.5's health gate this one
// renders the app behind it, because the failure mode of blocking is worse than the failure
// mode of nagging: a club that has not configured its plans yet would lock every parent out
// of an app they can otherwise use. The banner is the nag, and it does not go away.
//
// **Four routes, and entering one shows what that route can do** (owner correction,
// 2026-08-30: "It should be 4 payments option and when you enter each he can actually pay
// or choose already paid"). A first pass put "already paid" beside the routes as a fifth
// peer and then as a checkbox floating over them; both were wrong, because what "pay now"
// MEANS is different in each route and only the route knows:
//
//   card              pays. There is no charge to settle yet — the billing run has not
//                     reached this family — so the money goes forward: 1/2/3/6 months,
//                     opened at uPay, landing as credit that covers the first charge the
//                     moment it is raised. There is no "already paid" here, because a card
//                     payment through the app confirms itself through the IPN.
//   cash / cheque /   cannot pay, ever: no money moves through software on these routes.
//   הוראת קבע          Both answers are the same promise object with a different TENSE, and
//                     the tense is what the manager acts on — look in the drawer now, or
//                     wait. `already_paid` carries it (migration 0017); without it two
//                     buttons produced one indistinguishable row and meant nothing.
//
// Neither answer on the three human routes settles anything. G8: money is real when a
// human says it arrived, which is the whole reason the promise object exists.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Alert, Button, Card, MoneyDisplay, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PromiseMethod } from './billingClient'
import type { PlanOption, TrainingPlanClient } from './trainingPlanClient'

/** The four routes, in the order §5.10's payments screen lists them. `card` is the only
 *  one the app can actually take money on; the other three are `PromiseMethod`. */
const METHODS = ['card', 'cash', 'cheque', 'standing_order'] as const
export type GateMethod = (typeof METHODS)[number]

/** The card's own chips, matching the payments screen's (`MONTH_OPTIONS` there). */
const MONTHS = [1, 2, 3, 6] as const

export type PlanGateStudent = { id: string; display_name: string; status?: string }

const gateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  minBlockSize: '44px',
}

const mutedStyle: CSSProperties = { color: 'var(--text-muted)' }

/**
 * Which of this family's children still has no plan.
 *
 * **A trial child is not one of them.** §5.4a's funnel puts a booked trial in
 * `status: 'trial'` with no enrolment and no price, and asking that family to commit to
 * 550 ₪ a month before the child has been on the mat is the opposite of what the trial is
 * for. The club decides when they convert, and the step appears then.
 */
export function needsPlan(student: PlanGateStudent, hasPlan: boolean): boolean {
  if (student.status === 'trial') return false
  return !hasPlan
}

export type PlanGateProps = {
  locale: Locale
  client: TrainingPlanClient
  students: readonly PlanGateStudent[]
  /**
   * The card route: opens an order for N months forward and hands back uPay's form.
   * Injected rather than reached through `apiFetch` here, so a test drives the whole
   * flow without a server and without a real form submission.
   */
  onPayByCard?: (months: number) => Promise<void>
  /**
   * This payer's monthly total in agorot, from `GET /me/prepay-terms`. **The payer's, not
   * the plan's**: a parent with two children is quoted "three months for both", because
   * that is what the card will charge and what credit is measured in. Falls back to the
   * chosen plan's own price when the read failed, which is right for the one-child family
   * that is nearly every family here.
   */
  monthlyTotalAgorot?: number
  /** Bumped by the caller's own reload after a plan is set. */
  onChosen?: () => void
  children: ReactNode
}

export function PlanGate({
  locale,
  client,
  students,
  onPayByCard,
  monthlyTotalAgorot,
  onChosen,
  children,
}: PlanGateProps) {
  // `null` while the reads are in flight — the step must not flash in front of a family
  // whose children all have plans already.
  const [missing, setMissing] = useState<{
    student: PlanGateStudent
    plans: PlanOption[]
    /** The plan this student is ON. Null until one is set, then the id `act` must not
     *  re-request — see its body. */
    currentPlanId: string | null
  } | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [reopened, setReopened] = useState(0)
  const [chosen, setChosen] = useState<PlanOption | null>(null)
  /** `null` until the family enters a route. Entering one is a step, not a radio: what the
   *  route can do is different in each, so the actions belong inside it. */
  const [method, setMethod] = useState<GateMethod | null>(null)
  const [months, setMonths] = useState<number>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'card' | 'claimed' | 'promised' | null>(null)

  // One id list, stable across renders, so the effect below does not re-run on every
  // parent render just because `students` is a fresh array literal.
  const studentKey = useMemo(() => students.map((row) => row.id).join(','), [students])

  useEffect(() => {
    let live = true
    void (async () => {
      for (const student of students) {
        if (student.status === 'trial') continue
        // Sequential, not `Promise.all`: §6.1's first run asks about ONE child, the same
        // decision the health gate makes, and reading three plans to show one is work
        // nobody needs done.
        const view = await client.read(student.id).catch(() => null)
        if (!live) return
        if (view === null) continue
        if (!needsPlan(student, view.current_plan !== null)) continue
        // **Carried across the re-read, for the same child.** Resetting it here undid the
        // whole point: the step re-reads itself after every answer, so a family recording
        // a second payment arrived back with no memory of the plan just set and asked the
        // server to set it again — the refusal this fix exists to stop. A DIFFERENT child
        // starts empty, which is what the id comparison is for.
        setMissing((previous) => ({
          student,
          plans: [...view.plans],
          currentPlanId:
            previous && previous.student.id === student.id ? previous.currentPlanId : null,
        }))
        return
      }
      if (live) setMissing(null)
    })()
    return () => {
      live = false
    }
  }, [client, students, studentKey, reopened])

  if (missing === null) return <>{children}</>

  // The nag. `children` renders behind it — this gate never takes the app away.
  if (skipped) {
    return (
      <>
        <Alert iconLabel={t(locale, 'schedule.plan.gate.title')} tone="pending">
          <span data-testid="plan-gate-banner" style={rowStyle}>
            {t(locale, 'schedule.plan.gate.banner')}
            <Button
              data-testid="plan-gate-reopen"
              onClick={() => {
                setSkipped(false)
                setDone(null)
              }}
              variant="secondary"
            >
              {t(locale, 'schedule.plan.gate.bannerAction')}
            </Button>
          </span>
        </Alert>
        {children}
      </>
    )
  }

  /**
   * Set the plan, then do whatever this route does.
   *
   * The plan is written FIRST and on its own. It is what the family came to choose, it
   * applies immediately, and a claim raised before it that then failed would leave the
   * manager confirming money against no plan at all.
   */
  async function act(plan: PlanOption, run: () => Promise<'card' | 'claimed' | 'promised'>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // **Only when it would actually change something.**
      //
      // This used to fire on every press, so a family who set a plan and then came back to
      // record a second payment hit `POST /plan-changes` with the plan they were already
      // on — which the server rightly refuses ("this student is already on that plan"),
      // and which arrived here as a bare `common.error.generic`. The plan step was
      // one-shot: any second action failed, and said nothing useful about why.
      //
      // Setting a plan and paying for it are two operations, and welding them into one
      // was the mistake. The server's refusal is correct and stays; this simply stops
      // asking for a change that is not one.
      if (missing!.currentPlanId !== plan.id) {
        await client.requestPlan(missing!.student.id, plan.id)
        setMissing((current) => (current ? { ...current, currentPlanId: plan.id } : current))
      }
      const outcome = await run()
      onChosen?.()
      if (outcome === 'card') {
        // uPay is a full-page navigation; leave the step exactly as it is behind it.
        setDone('card')
        return
      }
      // **Straight on, no "continue" to press** (owner, 2026-08-30). The answer is
      // recorded, so the step has nothing left to ask this family: the re-read either
      // finds the next child who needs a plan, or finds nobody and renders the app.
      setDone(null)
      setChosen(null)
      setMethod(null)
      setMonths(1)
      setReopened((n) => n + 1)
    } catch {
      setError(t(locale, 'common.error.generic'))
    } finally {
      setBusy(false)
    }
  }

  /** What the card will actually charge. `months x monthly` on two integers (G2) — and the
   *  server prices the order itself, so this is a quote rather than an instruction. */
  const monthly = monthlyTotalAgorot && monthlyTotalAgorot > 0
    ? monthlyTotalAgorot
    : (chosen?.monthly_amount_agorot ?? 0)

  return (
    <div data-testid="plan-gate" style={gateStyle}>
      <Card>
        <h1>{t(locale, 'schedule.plan.gate.title')}</h1>
        <p>{t(locale, 'schedule.plan.gate.intro')}</p>
        <p style={mutedStyle}>
          {t(locale, 'schedule.plan.gate.forChild').replace('{name}', missing.student.display_name)}
        </p>
      </Card>

      {error ? (
        <Alert iconLabel={t(locale, 'schedule.plan.gate.title')} live tone="danger">
          <span data-testid="plan-gate-error">{error}</span>
        </Alert>
      ) : null}

      {done ? (
        <Alert iconLabel={t(locale, 'schedule.plan.gate.title')} live tone="paid">
          <span data-testid={`plan-gate-${done}`}>
            {t(
              locale,
              done === 'card'
                ? 'schedule.plan.gate.cardNext'
                : done === 'claimed'
                  ? 'schedule.plan.gate.claimSent'
                  : 'schedule.plan.gate.willPaySent',
            )}
          </span>
        </Alert>
      ) : null}

      {missing.plans.length === 0 ? (
        // A club that has configured no plans. Saying so beats an empty list, and the skip
        // below is what keeps this family out of a dead end.
        <p data-testid="plan-gate-no-plans">{t(locale, 'schedule.plan.gate.noPlans')}</p>
      ) : chosen === null ? (
        missing.plans.map((plan) => (
          <Card key={plan.id}>
            <div data-testid={`plan-gate-option-${plan.id}`} style={rowStyle}>
              <strong style={{ flex: 1, minInlineSize: 0 }}>
                <bdi>{plan.name}</bdi>
              </strong>
              <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
              <span style={mutedStyle}>{t(locale, 'schedule.plan.monthly')}</span>
              <span style={mutedStyle}>
                {plan.weekly_extra_allowance === null
                  ? t(locale, 'schedule.plan.unlimited')
                  : t(locale, 'schedule.plan.remaining').replace(
                      '{{count}}',
                      String(plan.weekly_extra_allowance),
                    )}
              </span>
              <Button
                data-testid="plan-gate-choose"
                onClick={() => {
                  setDone(null)
                  setMethod(null)
                  setMonths(1)
                  setChosen(plan)
                }}
                variant="secondary"
              >
                {t(locale, 'schedule.plan.gate.chooseThis')}
              </Button>
            </div>
          </Card>
        ))
      ) : method === null ? (
        // **Four routes, and each is a way IN.** Not a radio group with one confirm
        // button: "pay now" means something different in every one of them, and only the
        // route knows what.
        <Card>
          <div data-testid="plan-gate-pay">
            <h2>
              {t(locale, 'schedule.plan.gate.payHow')} — <bdi>{chosen.name}</bdi>
            </h2>
            <MoneyDisplay agorot={chosen.monthly_amount_agorot} label={chosen.name} />
            <span style={mutedStyle}>{t(locale, 'schedule.plan.monthly')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {METHODS.map((option) => (
                <Button
                  data-testid={`plan-gate-method-${option}`}
                  key={option}
                  onClick={() => {
                    setDone(null)
                    setMethod(option)
                  }}
                  variant="secondary"
                >
                  {t(locale, `schedule.plan.gate.method.${option}`)}
                </Button>
              ))}
            </div>
            <Button
              data-testid="plan-gate-back"
              disabled={busy}
              onClick={() => setChosen(null)}
              variant="ghost"
            >
              {t(locale, 'schedule.plan.gate.back')}
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div data-testid={`plan-gate-route-${method}`}>
            <h2>{t(locale, `schedule.plan.gate.method.${method}`)}</h2>

            {method === 'card' ? (
              // **The card is the only route that can actually take money**, and at signup
              // there is nothing to settle: the billing run has not reached this family, so
              // their basket is empty. The months are therefore bought FORWARD, which lands
              // as credit and covers the first charge the moment it is raised. No "already
              // paid" here — a card payment through the app confirms itself via the IPN.
              <>
                <SegmentedControl
                  legend={t(locale, 'schedule.plan.gate.months')}
                  legendVisible
                  onValueChange={(next) => setMonths(Number(next))}
                  options={MONTHS.map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(months)}
                />
                <p style={rowStyle}>
                  <span>{t(locale, 'schedule.plan.gate.cardTotal')}</span>
                  <MoneyDisplay
                    agorot={monthly * months}
                    label={t(locale, 'schedule.plan.gate.cardTotal')}
                  />
                </p>
                <p style={mutedStyle}>{t(locale, 'schedule.plan.gate.cardHint')}</p>
                <div style={rowStyle}>
                  <Button
                    data-testid="plan-gate-pay-now"
                    disabled={busy || onPayByCard === undefined}
                    onClick={() =>
                      void act(chosen, async () => {
                        await onPayByCard!(months)
                        return 'card'
                      })
                    }
                    variant="primary"
                  >
                    {t(locale, 'schedule.plan.gate.payNow')}
                  </Button>
                  <Button
                    data-testid="plan-gate-back"
                    disabled={busy}
                    onClick={() => setMethod(null)}
                    variant="ghost"
                  >
                    {t(locale, 'schedule.plan.gate.back')}
                  </Button>
                </div>
              </>
            ) : (
              // Cash, cheques and standing orders move no money through software. Both
              // buttons raise the SAME promise; what differs is the tense, and the tense is
              // what tells the manager whether to go and look now or wait.
              <>
                <MoneyDisplay agorot={chosen.monthly_amount_agorot} label={chosen.name} />
                <div style={rowStyle}>
                  {/* **Never "לשלם עכשיו" on these three.** Nothing is paid by pressing
                      it — the app takes no money on cash, cheques or a standing order, and
                      a button that says otherwise is the screen lying about what it does.
                      The label names the route and says the money moves in person, which
                      is what actually happens next (owner, 2026-08-30). */}
                  <Button
                    data-testid="plan-gate-pay-now"
                    disabled={busy}
                    onClick={() =>
                      void act(chosen, async () => {
                        await client.claimPaid(chosen.id, method as PromiseMethod, false)
                        return 'promised'
                      })
                    }
                    variant="primary"
                  >
                    {t(locale, `schedule.plan.gate.hand.${method}`)}
                  </Button>
                  <Button
                    data-testid="plan-gate-paid-already"
                    disabled={busy}
                    onClick={() =>
                      void act(chosen, async () => {
                        await client.claimPaid(chosen.id, method as PromiseMethod, true)
                        return 'claimed'
                      })
                    }
                    variant="secondary"
                  >
                    {t(locale, 'schedule.plan.gate.paidAlready')}
                  </Button>
                  <Button
                    data-testid="plan-gate-back"
                    disabled={busy}
                    onClick={() => setMethod(null)}
                    variant="ghost"
                  >
                    {t(locale, 'schedule.plan.gate.back')}
                  </Button>
                </div>
                <p style={mutedStyle}>{t(locale, 'schedule.plan.gate.willPayHint')}</p>
                <p style={mutedStyle}>{t(locale, 'schedule.plan.gate.paidHint')}</p>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Never a dead end. A club with no plans, a family who wants to ask first, a parent
          who opened the app to check tonight's lesson — all of them get past this. */}
      <Button data-testid="plan-gate-later" onClick={() => setSkipped(true)} variant="ghost">
        {t(locale, 'schedule.plan.gate.later')}
      </Button>
    </div>
  )
}

/**
 * The three routes that raise a promise — every route except the card.
 *
 * **The card is not in this set and must not join it.** A promise is a claim a MANAGER
 * settles by hand; a card payment through the app settles itself through the IPN, so a
 * card promise would be a pending item nobody ever has to act on. That is also why the
 * card step offers no "already paid": there is nothing for a human to confirm.
 */
export function isPromiseRoute(choice: GateMethod): choice is PromiseMethod {
  return choice !== 'card'
}
