// `3e` תשלומים וגבייה, mounted. Nothing imported these screens: `CollectionsScreen`,
// `ReconciliationQueue` and `DebtAlert` were built, unit-tested and unreachable in a
// running app, which made W4's exit gate untestable through a browser.
//
// Every screen here is presentational — it takes its rows as props — so this file is the
// one that fetches. That is the same arrangement `features/people` uses for `6c`.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { CollectionsScreen } from './CollectionsScreen'
import type { HouseholdRow } from './CollectionsScreen'
import { ReconciliationQueue } from './ReconciliationQueue'
import { makeDashboardBillingClient } from './billingClient'
import type {
  ChargeOut,
  MatchSuggestion,
  RecurringSubscriptionOut,
  UpayIpnRecordOut,
} from './billingClient'

/** §5.10 bills calendar months, so the collections screen is always about one. */
function currentPeriod(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

async function json<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await apiFetch(path)
    if (!response.ok) return fallback
    return (await response.json()) as T
  } catch {
    return fallback
  }
}

/**
 * §5.10's household rows, built from the open charges.
 *
 * One row per PAYER and not per student: 'choosing N months selects the N oldest unpaid
 * tuition charges across every student this person pays for', so a family with two
 * children owes one balance and chases as one household.
 */
function householdsFrom(charges: readonly ChargeOut[], today: Date): HouseholdRow[] {
  const byPayer = new Map<string, ChargeOut[]>()
  for (const charge of charges) {
    const rows = byPayer.get(charge.payer_person_id) ?? []
    rows.push(charge)
    byPayer.set(charge.payer_person_id, rows)
  }
  return [...byPayer].map(([payerPersonId, rows]) => {
    const oldestDue = rows
      .map((row) => Date.parse(row.due_date))
      .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
    return {
      payerPersonId,
      // The payer's name needs a person read this lane has no route for; the id is what
      // every action on the row keys on, and the students name the family in practice.
      payerName: '',
      studentNames: [],
      balanceAgorot: rows.reduce(
        (sum, row) => sum + row.amount_agorot - (row.allocated_agorot ?? 0),
        0,
      ),
      monthsInDebt: new Set(rows.map((row) => `${row.period_year}-${row.period_month}`)).size,
      daysOverdue: Math.max(
        0,
        Math.floor((today.getTime() - oldestDue) / (24 * 60 * 60 * 1000)),
      ),
    }
  })
}

export function BillingSection({ locale, view }: { locale: Locale; view: 'collections' | 'reconciliation' }) {
  const client = useMemo(() => makeDashboardBillingClient(apiFetch), [])
  const period = useMemo(() => currentPeriod(), [])
  const [charges, setCharges] = useState<ChargeOut[]>([])
  const [unmatched, setUnmatched] = useState<UpayIpnRecordOut[]>([])
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [expected, setExpected] = useState<RecurringSubscriptionOut[]>([])
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [open, ipns, suggested, subscriptions] = await Promise.all([
        json<{ items: ChargeOut[] }>('/api/v1/charges?status=open&limit=200', { items: [] }),
        client.unmatched().catch(() => [] as UpayIpnRecordOut[]),
        client.suggestions().catch(() => ({ items: [] as MatchSuggestion[], never_auto: true })),
        json<{ items: RecurringSubscriptionOut[] }>('/api/v1/recurring-subscriptions', {
          items: [],
        }),
      ])
      if (!alive) return
      setCharges(open.items)
      setUnmatched(ipns)
      setSuggestions(suggested.items)
      setExpected(subscriptions.items)
    })()
    return () => {
      alive = false
    }
  }, [client, reloads])

  const refresh = useCallback(() => setReloads((n) => n + 1), [])

  if (view === 'reconciliation') {
    return (
      <ReconciliationQueue
        locale={locale}
        client={client}
        unmatched={unmatched}
        suggestions={suggestions}
        expected={expected}
        // §5.10's queue is about a payment nobody can identify; the id is what the match
        // is made against, and the card owner name beside it is the evidence a manager
        // actually reads.
        payerName={() => ''}
        onChanged={refresh}
      />
    )
  }

  const households = householdsFrom(charges, new Date())
  return (
    <CollectionsScreen
      locale={locale}
      client={client}
      households={households}
      openDebtAgorot={households.reduce((sum, row) => sum + row.balanceAgorot, 0)}
      // `3e`'s two collected figures need a payments total for the month, which has no
      // manager-facing aggregate route. Shown as zero rather than as a guess: a wrong
      // number on a collections screen is worse than an obviously absent one.
      collectedThisMonthAgorot={0}
      collectedSharePercent={0}
      activeSubscriptions={expected.filter((row) => row.status === 'active').length}
      failedCharges={0}
      period={period}
    />
  )
}
