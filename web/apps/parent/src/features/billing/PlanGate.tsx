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
// **The five ways to pay are four routes and a tense.** The owner listed "cash or chechs or
// card or הוראת קבע or mark already paid", and the fifth is not a fifth route — it is any of
// the four in the past tense. Rendering it as a peer would raise a promise that cannot say
// how the money arrived, which is the one thing the manager reconciling it needs. So it is a
// checkbox over the four, which is also the shape `TrainingPlanScreen`'s confirm step
// already uses.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Alert, Button, Card, Checkbox, MoneyDisplay, Radio } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PromiseMethod } from './billingClient'
import type { PlanOption, TrainingPlanClient } from './trainingPlanClient'

/** §5.10's routes, plus the card. The first four are `PromiseMethod`; `card` is not a
 *  promise at all — it is the app's own payment flow, so it sends the family to `1b`. */
const METHODS = ['card', 'cash', 'cheque', 'standing_order'] as const
export type GateMethod = (typeof METHODS)[number]

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
  /** Where the card route goes. Injected so a test asserts it without a real location. */
  onGoToPayments?: () => void
  /** Bumped by the caller's own reload after a plan is set. */
  onChosen?: () => void
  children: ReactNode
}

export function PlanGate({
  locale,
  client,
  students,
  onGoToPayments,
  onChosen,
  children,
}: PlanGateProps) {
  // `null` while the reads are in flight — the step must not flash in front of a family
  // whose children all have plans already.
  const [missing, setMissing] = useState<{ student: PlanGateStudent; plans: PlanOption[] } | null>(
    null,
  )
  const [skipped, setSkipped] = useState(false)
  const [reopened, setReopened] = useState(0)
  const [chosen, setChosen] = useState<PlanOption | null>(null)
  const [method, setMethod] = useState<GateMethod>('card')
  const [paidAlready, setPaidAlready] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'card' | 'claimed' | null>(null)

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
        setMissing({ student, plans: [...view.plans] })
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

  async function confirm(plan: PlanOption) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Order matters. The plan is what the family came to set, and it applies on its own —
      // a claim raised first and a plan that then failed would leave the manager confirming
      // money against nothing.
      await client.requestPlan(missing!.student.id, plan.id)
      if (method === 'card' && !paidAlready) {
        setDone('card')
        onChosen?.()
        onGoToPayments?.()
        return
      }
      // Everything else is a promise the manager settles — including "already paid by
      // card", which the app cannot confirm any more than it can confirm a cheque.
      // `card` has no `PromiseMethod`, so a card that was already paid is recorded by the
      // route the money will actually be reconciled from: the club's own bank statement,
      // which is what `standing_order` already means here.
      await client.claimPaid(plan.id, promiseMethodFor(method))
      setDone('claimed')
      setChosen(null)
      onChosen?.()
    } catch {
      setError(t(locale, 'common.error.generic'))
    } finally {
      setBusy(false)
    }
  }

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
                : 'schedule.plan.gate.claimSent',
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
                  setChosen(plan)
                }}
                variant="secondary"
              >
                {t(locale, 'schedule.plan.gate.chooseThis')}
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <div data-testid="plan-gate-pay">
            <h2>
              {t(locale, 'schedule.plan.gate.payHow')} — <bdi>{chosen.name}</bdi>
            </h2>
            <MoneyDisplay agorot={chosen.monthly_amount_agorot} label={chosen.name} />
            <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
              <legend>{t(locale, 'schedule.plan.gate.payHow')}</legend>
              {METHODS.map((option) => (
                <Radio
                  checked={method === option}
                  key={option}
                  label={t(locale, `schedule.plan.gate.method.${option}`)}
                  name="plan-gate-method"
                  onChange={() => setMethod(option)}
                  value={option}
                />
              ))}
            </fieldset>
            <Checkbox
              checked={paidAlready}
              data-testid="plan-gate-paid-already"
              label={t(locale, 'schedule.plan.gate.paidAlready')}
              onChange={(event) => setPaidAlready(event.target.checked)}
            />
            {method !== 'card' || paidAlready ? (
              <p style={mutedStyle}>{t(locale, 'schedule.plan.claimHint')}</p>
            ) : null}
            <div style={rowStyle}>
              <Button
                data-testid="plan-gate-confirm"
                disabled={busy}
                onClick={() => void confirm(chosen)}
                variant="primary"
              >
                {t(locale, 'schedule.plan.gate.confirm')}
              </Button>
              <Button
                data-testid="plan-gate-back"
                disabled={busy}
                onClick={() => setChosen(null)}
                variant="ghost"
              >
                {t(locale, 'schedule.plan.gate.back')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {done === 'claimed' ? (
        // Re-reads rather than closing: a family with two children answers for the second
        // here, and the same press lands them on home when there is no second.
        <Button
          data-testid="plan-gate-continue"
          onClick={() => {
            setDone(null)
            setMethod('card')
            setPaidAlready(false)
            setReopened((n) => n + 1)
          }}
          variant="primary"
        >
          {t(locale, 'common.setup.continue')}
        </Button>
      ) : null}

      {/* Never a dead end. A club with no plans, a family who wants to ask first, a parent
          who opened the app to check tonight's lesson — all of them get past this. */}
      <Button data-testid="plan-gate-later" onClick={() => setSkipped(true)} variant="ghost">
        {t(locale, 'schedule.plan.gate.later')}
      </Button>
    </div>
  )
}

/**
 * Which promise method records money that arrived by `choice`.
 *
 * `card` has no `PromiseMethod` of its own and must not gain one: a promise is a claim a
 * MANAGER settles by hand, and a card payment through the app settles itself through the
 * IPN. A card the family paid somewhere else is money that will show up on the club's
 * statement rather than in anyone's hand, which is exactly what `standing_order` already
 * means in this queue (G8 — the provider cannot confirm it either).
 */
export function promiseMethodFor(choice: GateMethod): PromiseMethod {
  return choice === 'card' ? 'standing_order' : choice
}
