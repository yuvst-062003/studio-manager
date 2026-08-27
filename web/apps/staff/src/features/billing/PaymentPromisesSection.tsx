// The staff app's half of both hand-carried routes (feature pass 2026-08-27) — the same two
// buttons the dashboard has, on the phone in the manager's pocket, because the notes and the
// cheques change hands at the door of the dojo and not at a desk.
//
// MANAGER-ONLY BY ROUTE AND BY SHELL. §13's third invariant keeps financial fields off
// coach-scoped endpoints; this screen calls only ManagerOrOwner routes (a coach gets
// 403s and the shell never links them here). It is deliberately the first money surface
// in the staff app, and it stays exactly this narrow.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDateInStudioZone, useNetworkMode } from '@studio/core'
import { Button, Card, EmptyState, LoadFailed, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makePromiseClient } from './promiseClient'
import type { PromiseClient, StaffPromiseRow } from './promiseClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

export function PaymentPromisesSection({
  locale,
  client: injected,
}: {
  locale: Locale
  client?: PromiseClient
}) {
  const [promises, setPromises] = useState<StaffPromiseRow[] | null>(null)
  const [reloads, setReloads] = useState(0)
  const [failed, setFailed] = useState(false)
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [inFlight, setInFlight] = useState<string | null>(null)

  const client = useMemo(() => injected ?? makePromiseClient(), [injected])

  useEffect(() => {
    let alive = true
    client
      .pending()
      .then((rows) => alive && setPromises(rows))
      // S11 — an empty promise list is a claim ("nothing to collect at the door"), so a
      // failed read must not render as one.
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [client, reloads])

  const decide = useCallback(
    (promiseId: string, how: 'confirm' | 'decline') => {
      if (inFlight) return
      setInFlight(promiseId)
      void client
        .decide(promiseId, how)
        .then(() => setReloads((n) => n + 1))
        .finally(() => setInFlight(null))
    },
    [client, inFlight],
  )

  if (promises === null) return null

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        offline={networkMode !== 'online'}
        onRetry={() => {
          setFailed(false)
          setReloads((n) => n + 1)
        }}
      />
    )
  }

  return (
    <section
      aria-labelledby="staff-promises-title"
      data-testid="staff-payment-promises"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <div className="studio-page-header">
        <h2 id="staff-promises-title">{t(locale, 'billing.promise.manager.title')}</h2>
      </div>
      {promises.length === 0 ? (
        <EmptyState title={t(locale, 'billing.promise.manager.empty')} />
      ) : (
        <Card>
          {promises.map((promise) => (
            <div key={promise.id} style={rowStyle} data-testid="payment-promise-row">
              <strong style={{ flex: 1, minInlineSize: 0 }}>
                <bdi>{promise.payer_name}</bdi>
              </strong>
              {/* The manager at the door is holding notes or a bundle of cheques. A row
                  that does not say which is a row they cannot check against their hand. */}
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
      )}
    </section>
  )
}
