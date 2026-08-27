// `3e` תשלומים וגבייה, mounted. Nothing imported these screens: `CollectionsScreen`,
// `ReconciliationQueue` and `DebtAlert` were built, unit-tested and unreachable in a
// running app, which made W4's exit gate untestable through a browser.
//
// Every screen here is presentational — it takes its rows as props — so this file is the
// one that fetches. That is the same arrangement `features/people` uses for `6c`.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { CashRequestsPanel } from './CashRequestsPanel'
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

/** What the household rows need from the manager's student list (§3.2 gives a manager
 *  the whole list, so one page-sized read serves every row). */
export type StudentNameRow = {
  id: string
  first_name: string
  last_name: string
  guardian_display_names?: string[]
}

/**
 * §5.10's household rows, built from the open charges.
 *
 * One row per PAYER and not per student: 'choosing N months selects the N oldest unpaid
 * tuition charges across every student this person pays for', so a family with two
 * children owes one balance and chases as one household.
 *
 * Ship-audit D1: `payerName` and `studentNames` used to be hardcoded empty — every
 * checkbox on the collections list had an empty accessible name (a critical axe `label`
 * violation), and a manager chased debts with no family name on the row. The names come
 * from the students list: `guardian_display_names` is primary-first, so the first one is
 * the payer in every family the product actually has.
 */
export function householdsFrom(
  charges: readonly ChargeOut[],
  today: Date,
  students: readonly StudentNameRow[] = [],
): HouseholdRow[] {
  const studentById = new Map(students.map((student) => [student.id, student]))
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
    const family = [
      ...new Set(rows.map((row) => row.student_id).filter((id): id is string => id != null)),
    ]
      .map((id) => studentById.get(id))
      .filter((student): student is StudentNameRow => student !== undefined)
    return {
      payerPersonId,
      payerName: family.flatMap((s) => s.guardian_display_names ?? [])[0] ?? '',
      studentNames: family.map((s) => `${s.first_name} ${s.last_name}`),
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
  const [students, setStudents] = useState<StudentNameRow[]>([])
  const [unmatched, setUnmatched] = useState<UpayIpnRecordOut[]>([])
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [expected, setExpected] = useState<RecurringSubscriptionOut[]>([])
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [open, ipns, suggested, subscriptions, names] = await Promise.all([
        json<{ items: ChargeOut[] }>('/api/v1/charges?status=open&limit=200', { items: [] }),
        client.unmatched().catch(() => [] as UpayIpnRecordOut[]),
        client.suggestions().catch(() => ({ items: [] as MatchSuggestion[], never_auto: true })),
        json<{ items: RecurringSubscriptionOut[] }>('/api/v1/recurring-subscriptions', {
          items: [],
        }),
        // D1 — the names the household rows render and the checkbox labels read from.
        json<{ items: StudentNameRow[] }>('/api/v1/students?limit=200', { items: [] }),
      ])
      if (!alive) return
      setCharges(open.items)
      setStudents(names.items)
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

  const households = householdsFrom(charges, new Date(), students)
  return (
    <>
    {/* Above the debt board, because a pending cash request IS tonight's collections
        news: the family already answered, and the board below still shows them in debt
        until the notes change hands. */}
    <CashRequestsPanel locale={locale} client={client} onChanged={refresh} />
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
    </>
  )
}
