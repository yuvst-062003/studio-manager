// The manager's half of the cash conversation (feature pass 2026-08-27): who said
// "אני אשלם במזומן", for how much, since when — and the two endings. ✓ records the cash
// payment over what those charges are STILL owed (never the snapshot; the service
// recomputes) and settles them; ✗ leaves everything open and tells the parent, which is
// what the parent chose over silence.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDateInStudioZone } from '@studio/core'
import { Button, Card, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient, ManagerCashRequestOut } from './billingClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

export function CashRequestsPanel({
  locale,
  client,
  onChanged,
}: {
  locale: Locale
  client: DashboardBillingClient
  onChanged?: () => void
}) {
  const [requests, setRequests] = useState<ManagerCashRequestOut[] | null>(null)
  const [reloads, setReloads] = useState(0)
  const [inFlight, setInFlight] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    client
      .cashRequests('pending')
      .then((rows) => alive && setRequests(rows))
      .catch(() => alive && setRequests([]))
    return () => {
      alive = false
    }
  }, [client, reloads])

  const decide = useCallback(
    (requestId: string, how: 'confirm' | 'decline') => {
      if (inFlight) return
      setInFlight(requestId)
      const action = how === 'confirm' ? client.confirmCash(requestId) : client.declineCash(requestId)
      void action
        .then(() => {
          setReloads((n) => n + 1)
          onChanged?.()
        })
        .finally(() => setInFlight(null))
    },
    [client, inFlight, onChanged],
  )

  if (requests === null || requests.length === 0) return null

  return (
    <section aria-labelledby="cash-requests-title" data-testid="cash-requests">
      <h3 id="cash-requests-title">{t(locale, 'billing.cash.manager.title')}</h3>
      <Card>
        {requests.map((request) => (
          <div key={request.id} style={rowStyle} data-testid="cash-request-row">
            <strong style={{ flex: 1, minInlineSize: 0 }}>
              <bdi>{request.payer_name}</bdi>
            </strong>
            <span style={{ color: 'var(--text-muted)' }}>
              {request.charge_count} {t(locale, 'billing.cash.manager.charges')}
              {' · '}
              {formatDateInStudioZone(request.created_at, locale)}
            </span>
            <MoneyDisplay agorot={request.total_agorot} tone="pending" />
            <Button
              variant="primary"
              data-testid="cash-confirm"
              disabled={inFlight !== null}
              onClick={() => decide(request.id, 'confirm')}
            >
              {t(locale, 'billing.cash.manager.confirm')}
            </Button>
            <Button
              variant="secondary"
              data-testid="cash-decline"
              disabled={inFlight !== null}
              onClick={() => decide(request.id, 'decline')}
            >
              {t(locale, 'billing.cash.manager.decline')}
            </Button>
          </div>
        ))}
      </Card>
    </section>
  )
}
