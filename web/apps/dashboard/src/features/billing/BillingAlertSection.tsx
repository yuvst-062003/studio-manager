// §5.10's money alert, as a `6c` section. Seam 4: the alert centre composes sections from
// four milestones, and this is M6's.
//
// **What it counts, and why it could not until now.** `DebtAlert` takes three numbers:
// overdue households, `amount_mismatch` orders and stale `pending` ones. The last two are
// facts about `payment_order`, and §7 exposed only `POST /payment-orders` and
// `GET /payment-orders/{public_ref}` — no way to ask which orders exist. So the component,
// its copy and `registerBillingAlerts` all shipped with nothing able to fill them, and
// §5.10's "a high-priority manager alert is raised" could not happen. `GET
// /payment-orders?status=` is what closed that.
import { useEffect, useState } from 'react'
import { registerSlot } from '@studio/ui'
import { apiFetch } from '@studio/core'
import type { AlertSectionProps } from '../people/AlertCentre'
import { DebtAlert } from './DebtAlert'
import { DEBT_ALERT_ORDER } from './register'

type OrderRow = { public_ref: string; status: string; expires_at: string | null }
type ChargeRow = { payer_person_id: string; due_date: string; status: string }

async function page<T>(path: string): Promise<T[]> {
  try {
    const response = await apiFetch(path)
    if (!response.ok) return []
    return ((await response.json()) as { items: T[] }).items
  } catch {
    return []
  }
}

export function BillingAlertSection({ locale }: AlertSectionProps) {
  const [mismatches, setMismatches] = useState(0)
  const [stale, setStale] = useState(0)
  const [overdue, setOverdue] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [mismatched, pending, charges] = await Promise.all([
        page<OrderRow>('/api/v1/payment-orders?status=amount_mismatch&limit=200'),
        page<OrderRow>('/api/v1/payment-orders?status=pending&limit=200'),
        page<ChargeRow>('/api/v1/charges?status=open&limit=200'),
      ])
      if (!alive) return
      setMismatches(mismatched.length)
      // §5.10's last threat row — 'nightly job flags orders pending for more than 24h'.
      // The job sets `expired`; this counts the ones already past their window but not yet
      // swept, which is what a manager looking at the board right now would want to know.
      const now = Date.now()
      setStale(
        pending.filter((row) => row.expires_at !== null && Date.parse(row.expires_at) < now)
          .length,
      )
      // Households, not charges: a family two months behind is one conversation.
      const today = Date.now()
      setOverdue(
        new Set(
          charges
            .filter((row) => Date.parse(row.due_date) < today)
            .map((row) => row.payer_person_id),
        ).size,
      )
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <DebtAlert
      locale={locale}
      overdueHouseholds={overdue}
      amountMismatches={mismatches}
      staleOrders={stale}
      onOpenCollections={() => {
        globalThis.location.hash = '#/billing'
      }}
    />
  )
}

/**
 * Registered here rather than through `register.ts`'s `registerBillingAlerts`.
 *
 * That helper declares `registerSlot<DebtAlertProps>('alert-centre', ...)`, but the slot's
 * renderer is called with `AlertSectionProps` — `AlertCentre` does
 * `useSlot<AlertSectionProps>` and passes `{ locale, client }`. So the helper's type
 * argument describes what `DebtAlert` needs rather than what the slot supplies, and
 * anything satisfying it cannot actually be mounted. This section takes the slot's real
 * props and fetches the three counts itself, which is what every other `6c` section does.
 *
 * The order is `register.ts`'s own constant, so M6 keeps the place
 * `features/people/register.ts` left it: "M6's debt alert belongs above a trial queue."
 */
export function registerBillingAlertSection(): void {
  registerSlot<AlertSectionProps>('alert-centre', {
    key: 'billing-debt',
    order: DEBT_ALERT_ORDER,
    render: BillingAlertSection,
  })
}
