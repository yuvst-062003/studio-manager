// The container behind `#/plan/<studentId>`. Replaces `TrainingPlanSection.tsx`, deleted
// in the same commit.
//
// Same split as before and for the same reason: the screen is presentational and takes its
// data as props, so a test renders it without a server.
//
// **What is new is the ORDER of the money step** — see `PlanMoney`'s header for the whole
// argument. Recording the change first is what makes the client's chips and the server's
// ceiling agree by construction: `refuse_past_ceiling` prices from the payer's monthly
// total, so the client must read that total AFTER the change has moved it.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentBillingClient } from '../PaymentsSection'
import { PaymentOverlay } from '../PaymentOverlay'
import type { PaymentOverlayRequest } from '../PaymentOverlay'
import { PlanScreen } from './PlanScreen'
import { readMoneyContext } from './PlanMoney'
import type { MoneyContext, PaymentMethod } from './PlanMoney'
import { makeTrainingPlanClient } from '../trainingPlanClient'
import type { PlanOption, TrainingPlanView } from '../trainingPlanClient'

export function PlanSection({ locale, studentId }: { locale: Locale; studentId: string }) {
  const client = useMemo(() => makeTrainingPlanClient(apiFetch), [])
  const billing = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [view, setView] = useState<TrainingPlanView | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [money, setMoney] = useState<MoneyContext | null>(null)
  const [nextEffectiveOn, setNextEffectiveOn] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [overlay, setOverlay] = useState<PaymentOverlayRequest | null>(null)
  // Bumped after every write. A counter rather than calling the loader directly, so there
  // is exactly one place that writes `view` — the allowance, the offer list and the reasons
  // are all derived from the same server state, and a client that recomputed them would be
  // a second implementation of §5.1.
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .read(studentId)
      .then((next) => alive && setView(next))
      // A blank screen forever was the old failure mode — a dead end with no words.
      .catch(() => alive && setFailed(true))

    // This child's own method. Per child, because a mandate is signed per child at that
    // child's own price — which is why `/me/standing-order-links` returns a list.
    void apiFetch('/api/v1/me/payment-methods')
      .then(async (response) => {
        if (!alive || !response.ok) return
        const body = (await response.json()) as {
          items: { student_id: string; method: PaymentMethod | null }[]
        }
        setMethod(body.items.find((row) => row.student_id === studentId)?.method ?? null)
      })
      .catch(() => undefined)

    // The date a downgrade lands, from the SERVER's clock. A client deriving "the first of
    // next month" from the device clock disagrees with the worker across a timezone
    // boundary — a wrong date printed under a button the parent is about to press.
    void apiFetch('/api/v1/me/training-plans')
      .then(async (response) => {
        if (!alive || !response.ok) return
        const body = (await response.json()) as {
          items: { student_id: string; next_effective_on: string }[]
        }
        const row = body.items.find((item) => item.student_id === studentId)
        if (row) setNextEffectiveOn(row.next_effective_on)
      })
      .catch(() => undefined)

    return () => {
      alive = false
    }
  }, [client, studentId, reloads])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  const run = useCallback(
    (action: () => Promise<void>) => {
      if (busy) return
      setBusy(true)
      setError(null)
      action()
        .catch(() => setError(t(locale, 'common.error.generic')))
        .finally(() => setBusy(false))
    },
    [busy, locale],
  )

  /**
   * Record the change, THEN read the money.
   *
   * Not the obvious order, and the reason is arithmetic: `refuse_past_ceiling` prices
   * `credit_after` from the PAYER's monthly total, so chips priced off the chosen plan
   * would mean different money from the check the server makes. After the change lands, an
   * upgrade has already moved `price_plan_id` and the re-read carries the new total; a
   * downgrade has not, and those months are genuinely still at today's price.
   *
   * It is also what makes the standing-order link right: `?plan_id=` names the plan being
   * moved to, which a downgrade has not moved to yet.
   */
  const choosePlan = useCallback(
    (plan: PlanOption) => {
      run(async () => {
        setMoney(null)
        await client.requestPlan(studentId, plan.id)
        setMoney(await readMoneyContext(plan.id, studentId))
        refresh()
      })
    },
    [client, refresh, run, studentId],
  )

  const pickMethod = useCallback(
    (next: PaymentMethod) => {
      // Saving a method raises no promise and moves no money — it is a statement of
      // intent. The family answers here rather than being sent to another tab
      // mid-decision, which is how a plan change gets abandoned.
      setMethod(next)
      void apiFetch('/api/v1/me/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ student_id: studentId, method: next }] }),
      }).catch(() => undefined)
    },
    [studentId],
  )

  const payCard = useCallback(() => {
    run(async () => {
      if (money === null || money.openChargeIds.length === 0) return
      const order = await billing.createOrder([...money.openChargeIds], 1)
      const form = await billing.orderForm(order.public_ref)
      setOverlay({ kind: 'checkout', form })
    })
  }, [billing, money, run])

  const promise = useCallback(
    (promiseMethod: 'cash' | 'cheque', prepayMonths: number) => {
      run(async () => {
        if (money === null) return
        await billing.createPromise(
          [...money.openChargeIds],
          promiseMethod,
          prepayMonths,
          // "It is coming", not "I already handed it over". Different claims to a manager.
          false,
        )
        setMoney(null)
        refresh()
      })
    },
    [billing, money, refresh, run],
  )

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          refresh()
        }}
      />
    )
  }
  if (view === null) return null

  return (
    <>
      <PlanScreen
        locale={locale}
        view={view}
        method={method}
        money={money}
        busy={busy}
        error={error}
        nextEffectiveOn={nextEffectiveOn || new Date().toISOString()}
        onMark={(sessionId) => run(async () => {
          await client.mark(studentId, sessionId)
          refresh()
        })}
        onRelease={(bookingId) => run(async () => {
          await client.release(bookingId)
          refresh()
        })}
        onCancelChange={(changeId) => run(async () => {
          await client.cancelChange(studentId, changeId)
          refresh()
        })}
        onChoosePlan={choosePlan}
        onPickMethod={pickMethod}
        onPayCard={payCard}
        onPromise={promise}
        onCloseMoney={() => setMoney(null)}
      />
      {overlay ? (
        <PaymentOverlay
          locale={locale}
          request={overlay}
          onClose={() => setOverlay(null)}
          onComplete={() => {
            setOverlay(null)
            // The change and the money are both server state now; re-read rather than
            // patch, the same rule every other write on this screen follows.
            setMoney(null)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}
