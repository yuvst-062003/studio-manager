// The staff app's half of the cash conversation (feature pass 2026-08-27) — the same two
// buttons the dashboard has, on the phone in the manager's pocket, because the notes
// change hands at the door of the dojo and not at a desk.
//
// MANAGER-ONLY BY ROUTE AND BY SHELL. §13's third invariant keeps financial fields off
// coach-scoped endpoints; this screen calls only ManagerOrOwner routes (a coach gets
// 403s and the shell never links them here). It is deliberately the first money surface
// in the staff app, and it stays exactly this narrow.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { Button, Card, EmptyState, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type CashRow = {
  id: string
  status: string
  total_agorot: number
  payer_name: string
  charge_count: number
  created_at: string
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

export function CashSection({ locale }: { locale: Locale }) {
  const [requests, setRequests] = useState<CashRow[] | null>(null)
  const [reloads, setReloads] = useState(0)
  const [inFlight, setInFlight] = useState<string | null>(null)

  const client = useMemo(
    () => ({
      async pending(): Promise<CashRow[]> {
        const response = await apiFetch('/api/v1/cash-requests?status=pending')
        if (!response.ok) throw new Error(String(response.status))
        return ((await response.json()) as { items: CashRow[] }).items
      },
      async decide(requestId: string, how: 'confirm' | 'decline'): Promise<void> {
        const response = await apiFetch(`/api/v1/cash-requests/${requestId}/${how}`, {
          method: 'POST',
        })
        if (!response.ok) throw new Error(String(response.status))
      },
    }),
    [],
  )

  useEffect(() => {
    let alive = true
    client
      .pending()
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
      void client
        .decide(requestId, how)
        .then(() => setReloads((n) => n + 1))
        .finally(() => setInFlight(null))
    },
    [client, inFlight],
  )

  if (requests === null) return null

  return (
    <section
      aria-labelledby="staff-cash-title"
      data-testid="staff-cash"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <div className="studio-page-header">
        <h2 id="staff-cash-title">{t(locale, 'billing.cash.manager.title')}</h2>
      </div>
      {requests.length === 0 ? (
        <EmptyState title={t(locale, 'billing.cash.manager.empty')} />
      ) : (
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
      )}
    </section>
  )
}
