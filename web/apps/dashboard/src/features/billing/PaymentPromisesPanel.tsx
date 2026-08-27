// The manager's half of both hand-carried routes (feature pass 2026-08-27): who said
// "אני אשלם במזומן" or "אביא צ׳קים", for how much, by which route, since when — and the
// two endings. ✓ records the payment over what those charges are STILL owed (never the
// snapshot; the service recomputes) and settles them; ✗ leaves everything open and tells
// the parent, which is what the parent chose over silence.
//
// **One queue, not two.** The payment-routes spec §8: cheques are cash with a different
// word on the payment. Both end at a manager confirming by hand, so `method` is a column
// here rather than a second screen — and the filter beside it is what lets the manager
// ask §10's question, "how much of this is sitting in undeposited cheques".
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDateInStudioZone } from '@studio/core'
import { Button, Card, MoneyDisplay, SegmentedControl } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type {
  DashboardBillingClient,
  ManagerPaymentPromiseOut,
  PromiseMethod,
} from './billingClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

const METHODS: readonly PromiseMethod[] = ['cash', 'cheque']

export function PaymentPromisesPanel({
  locale,
  client,
  onChanged,
}: {
  locale: Locale
  client: DashboardBillingClient
  onChanged?: () => void
}) {
  const [promises, setPromises] = useState<ManagerPaymentPromiseOut[] | null>(null)
  const [method, setMethod] = useState<PromiseMethod | null>(null)
  const [reloads, setReloads] = useState(0)
  const [inFlight, setInFlight] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    client
      // The method filter goes to the SERVER, beside the status one. Filtering the loaded
      // rows in the browser would answer 'of the ones that happened to load', which is a
      // different question from the one the control appears to ask.
      .paymentPromises('pending', method ?? undefined)
      .then((rows) => alive && setPromises(rows))
      .catch(() => alive && setPromises([]))
    return () => {
      alive = false
    }
  }, [client, method, reloads])

  const decide = useCallback(
    (promiseId: string, how: 'confirm' | 'decline') => {
      if (inFlight) return
      setInFlight(promiseId)
      const action =
        how === 'confirm' ? client.confirmPromise(promiseId) : client.declinePromise(promiseId)
      void action
        .then(() => {
          setReloads((n) => n + 1)
          onChanged?.()
        })
        .finally(() => setInFlight(null))
    },
    [client, inFlight, onChanged],
  )

  // Nothing to decide and no filter narrowing the view: the queue has no empty state on
  // this screen, because a heading over nothing is a row of noise on a dashboard that
  // already has a collections list. A filter that empties it DOES render, or the manager
  // cannot tell "no cheques" from "the control did nothing".
  if (promises === null || (promises.length === 0 && method === null)) return null

  return (
    <section aria-labelledby="payment-promises-title" data-testid="payment-promises">
      <h3 id="payment-promises-title">{t(locale, 'billing.promise.manager.title')}</h3>
      <SegmentedControl
        legend={t(locale, 'billing.promise.manager.method')}
        value={method ?? 'all'}
        options={[
          { value: 'all', label: t(locale, 'billing.promise.manager.filterAll') },
          ...METHODS.map((each) => ({
            value: each,
            label: t(locale, `billing.method.${each}`),
          })),
        ]}
        onValueChange={(next) => setMethod(next === 'all' ? null : (next as PromiseMethod))}
      />
      <Card>
        {promises.length === 0 ? (
          <p data-testid="payment-promises-empty">
            {t(locale, 'billing.promise.manager.empty')}
          </p>
        ) : null}
        {promises.map((promise) => (
          <div key={promise.id} style={rowStyle} data-testid="payment-promise-row">
            <strong style={{ flex: 1, minInlineSize: 0 }}>
              <bdi>{promise.payer_name}</bdi>
            </strong>
            {/* The column §10 exists for: a confirmed cheque recorded as cash is a year of
                post-dated cheques the club can no longer count. */}
            <span data-testid="promise-method">
              {t(locale, `billing.method.${promise.method}`)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {promise.charge_count} {t(locale, 'billing.promise.manager.charges')}
              {' · '}
              {formatDateInStudioZone(promise.created_at, locale)}
            </span>
            <MoneyDisplay agorot={promise.total_agorot} tone="pending" />
            <Button
              variant="primary"
              data-testid="promise-confirm"
              disabled={inFlight !== null}
              onClick={() => decide(promise.id, 'confirm')}
            >
              {t(locale, 'billing.promise.manager.confirm')}
            </Button>
            <Button
              variant="secondary"
              data-testid="promise-decline"
              disabled={inFlight !== null}
              onClick={() => decide(promise.id, 'decline')}
            >
              {t(locale, 'billing.promise.manager.decline')}
            </Button>
          </div>
        ))}
      </Card>
    </section>
  )
}
