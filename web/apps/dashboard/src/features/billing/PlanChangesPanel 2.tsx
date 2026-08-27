// §11's queue — the money half of a plan change, which is a human's job.
//
// **The parent's tap changes access; a person always closes the loop on money.** Two of the
// club's three payment routes are prepaid, so a change cannot settle itself: a family who
// wrote twelve cheques in September has already paid for November at the old price, and a
// family on a shared uPay link keeps being charged the old amount until somebody cancels
// the mandate and sends the new one. G8 says the provider cannot do that for us, and this
// queue is the app admitting it rather than pretending otherwise.
//
// The **monthly difference** travels with each row, because "collect 100 ₪ × the remaining
// months" is the instruction and a manager should not have to look two prices up to work
// it out.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient, ManagerPlanChangeOut } from './billingClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

export function PlanChangesPanel({
  locale,
  client,
  onChanged,
}: {
  locale: Locale
  client: DashboardBillingClient
  onChanged?: () => void
}) {
  const [changes, setChanges] = useState<ManagerPlanChangeOut[] | null>(null)
  const [reloads, setReloads] = useState(0)
  const [inFlight, setInFlight] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    client
      .planChanges()
      .then((rows) => alive && setChanges(rows))
      .catch(() => alive && setChanges([]))
    return () => {
      alive = false
    }
  }, [client, reloads])

  const settle = useCallback(
    (changeId: string) => {
      if (inFlight) return
      setInFlight(changeId)
      void client
        .settlePlanChange(changeId)
        .then(() => {
          setReloads((n) => n + 1)
          onChanged?.()
        })
        .finally(() => setInFlight(null))
    },
    [client, inFlight, onChanged],
  )

  if (changes === null) return null
  if (changes.length === 0) {
    // A heading over nothing is a row of noise on a dashboard that already carries a
    // collections list. The marker is for tests and costs the manager nothing.
    return <span data-testid="plan-changes-loaded" hidden />
  }

  return (
    <section aria-labelledby="plan-changes-title" data-testid="plan-changes">
      <h3 id="plan-changes-title">{t(locale, 'billing.planChange.queueTitle')}</h3>
      <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'billing.planChange.hint')}</p>
      <Card>
        {changes.map((change) => (
          <div key={change.id} style={rowStyle} data-testid="plan-change-row">
            <strong style={{ flex: 1, minInlineSize: 0 }}>
              <bdi>{change.student_name}</bdi>
            </strong>
            <span>
              <bdi>{change.from_plan_name ?? '—'}</bdi>
              {' → '}
              <bdi>{change.to_plan_name}</bdi>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {t(locale, 'billing.planChange.effectiveOn')} {change.effective_on}
            </span>
            {/* The instruction, as a number. Signed: a downgrade is money the club stops
                collecting, and rendering it as a positive would read as money to chase. */}
            <span data-testid="plan-change-difference">
              {t(locale, 'billing.planChange.difference')}{' '}
              <MoneyDisplay
                agorot={change.monthly_difference_agorot}
                tone={change.monthly_difference_agorot >= 0 ? 'debt' : 'paid'}
                label={change.student_name}
              />
            </span>
            <Button
              variant="primary"
              data-testid="plan-change-settle"
              disabled={inFlight !== null}
              onClick={() => settle(change.id)}
            >
              {t(locale, 'billing.planChange.settle')}
            </Button>
          </div>
        ))}
      </Card>
    </section>
  )
}
