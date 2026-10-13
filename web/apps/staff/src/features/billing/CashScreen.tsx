// §5.10's money, in the pocket of the person who collects it (owner, 2026-10-14: "I want
// to replace the timer with cash, and there do the cash collection").
//
// **Why a tab at all.** This club is paid in notes and cheques, handed over at the door of
// the dojo while children put their shoes on. One half of that — the requests parents send
// — has been written and working at `#/cash` since the 2026-08-27 feature pass, reachable
// only by typing a hash nobody types. The other half, who still owes what, lived on the
// dashboard a manager opens at home. Both now sit on one tab, so the record is made while
// the notes are still in hand instead of from memory afterwards.
//
// MANAGER-ONLY, TWICE. Every endpoint behind this screen is `ManagerOrOwner`, and
// `StaffTabBar` draws no cash tab for anybody else — SPEC §13's third invariant keeps
// financial fields off coach-scoped endpoints, so a coach's app has no money in it at all.
// The two rules agree rather than one catching what the other let through.
import { useEffect, useMemo, useState } from 'react'
import { Banknote, ChevronLeft } from 'lucide-react'
import { formatAgorot, useNetworkMode } from '@studio/core'
import { EmptyState, LoadFailed, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentPromisesSection } from './PaymentPromisesSection'
import { makeCashClient } from './cashClient'
import type { CashClient, OpenCharge } from './cashClient'
import { cashThisMonth, householdsFrom, outstandingAgorot } from './households'
import type { Household, NamedStudent } from './households'

/** Three months is where a debt stops being an oversight and becomes a conversation. */
const LATE_MONTHS = 3

export function CashScreen({
  locale,
  client: injected,
  peopleClient,
  students,
  clock = () => new Date(),
}: {
  locale: Locale
  client?: CashClient
  /** Where the names on the debt rows come from: `GET /students`, which already carries
   *  `guardian_display_names` primary-first. Optional — a household with no name resolved
   *  still renders, by its children's names, never as an empty row. */
  peopleClient?: { search(query: string): Promise<{ items: readonly NamedStudent[] }> }
  /** Names injected directly, for tests and for a caller that already holds the list. */
  students?: readonly NamedStudent[]
  /** The device clock, for "this month". A function, like every other clock in this app. */
  clock?: () => Date
}) {
  const client = useMemo(() => injected ?? makeCashClient(), [injected])
  const [charges, setCharges] = useState<OpenCharge[] | null>(null)
  const [monthAgorot, setMonthAgorot] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const [loadedStudents, setLoadedStudents] = useState<readonly NamedStudent[]>([])

  useEffect(() => {
    if (students !== undefined || peopleClient === undefined) return
    let live = true
    // A failed name read is not a failed screen: the debts are the point, and a row titled
    // by its children instead of its payer is still a row a manager can collect against.
    void peopleClient
      .search('')
      .then((body) => live && setLoadedStudents(body.items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [peopleClient, students])

  useEffect(() => {
    let live = true
    // No `setFailed(false)` here: a setState in an effect BODY is a cascading render the
    // compiler lint rejects, and the retry button already clears the flag as it bumps
    // `attempt`. The only writes below are inside the promise's own callbacks, which run
    // after the render that scheduled them.
    void Promise.all([client.openCharges(), client.payments()])
      .then(([open, payments]) => {
        if (!live) return
        setCharges(open)
        setMonthAgorot(cashThisMonth(payments, clock()))
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
    // `clock` is a function identity a caller may recreate per render; the read is about
    // `attempt` and the client, and re-running it on every tick would be a request a
    // second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, attempt])

  const households = useMemo(
    () => householdsFrom(charges ?? [], students ?? loadedStudents),
    [charges, students, loadedStudents],
  )
  const owedTotal = households.reduce((sum, row) => sum + row.owedAgorot, 0)
  const family = households.find((row) => row.payerPersonId === openFamily) ?? null

  if (failed) {
    return (
      <div className="px-4 pt-4">
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </div>
    )
  }

  return (
    <section className="tw-scope flex flex-col gap-4 px-4 pt-4" data-testid="cash-screen">
      <header className="flex flex-col gap-1 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xs">
        <h1 className="flex items-center gap-2 text-base font-black text-[var(--fg)]">
          <Banknote aria-hidden="true" className="h-5 w-5 text-[var(--paid)]" />
          {t(locale, 'billing.cash.month.title')}
        </h1>
        <p className="m-0 font-mono text-2xl font-black text-[var(--fg)]" data-testid="cash-month-total">
          {monthAgorot === null ? '—' : formatAgorot(monthAgorot)}
        </p>
      </header>

      {/* The first band, as it has always been: a parent's request waiting for somebody to
          say the money arrived. Unchanged component, unchanged endpoints — all it ever
          lacked was a door. */}
      <PaymentPromisesSection locale={locale} />

      <section className="flex flex-col gap-2" data-testid="cash-debts">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-black text-[var(--fg)]">
            {t(locale, 'billing.cash.debts.title')}
          </h2>
          {charges !== null && households.length > 0 ? (
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {t(locale, 'billing.cash.debts.summary')
                .replace('{{families}}', String(households.length))
                .replace('{{total}}', formatAgorot(owedTotal))}
            </span>
          ) : null}
        </div>

        {charges !== null && households.length === 0 ? (
          <EmptyState title={t(locale, 'billing.cash.debts.empty')} />
        ) : null}

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {households.map((row) => (
            <li key={row.payerPersonId}>
              <button
                type="button"
                aria-haspopup="dialog"
                data-testid={`cash-family-${row.payerPersonId}`}
                onClick={() => setOpenFamily(row.payerPersonId)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-start transition-all active:scale-[0.99]"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-bold text-[var(--fg)]">
                    <bdi>{row.title}</bdi>
                  </span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">
                    {describe(locale, row)}
                  </span>
                </span>
                <span className="ms-auto flex shrink-0 items-center gap-2">
                  {row.monthsOwed >= LATE_MONTHS ? (
                    <span className="rounded-full bg-[var(--danger-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--danger)]">
                      {t(locale, 'billing.cash.debts.late')}
                    </span>
                  ) : null}
                  <span className="font-mono text-sm font-black text-[var(--danger)]">
                    {formatAgorot(row.owedAgorot)}
                  </span>
                  <ChevronLeft
                    aria-hidden="true"
                    className="h-4 w-4 text-[var(--text-muted)] ltr:rotate-180"
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {family ? (
        <FamilySheet
          client={client}
          clock={clock}
          family={family}
          locale={locale}
          onClose={() => setOpenFamily(null)}
          onRecorded={() => {
            setOpenFamily(null)
            setAttempt((n) => n + 1)
          }}
        />
      ) : null}
    </section>
  )
}

function describe(locale: Locale, row: Household): string {
  const count = row.charges.length
  if (row.oldestPeriod === null) {
    return t(locale, 'billing.cash.debts.noPeriod').replace('{{count}}', String(count))
  }
  const key = count === 1 ? 'billing.cash.debts.monthsOne' : 'billing.cash.debts.months'
  return t(locale, key).replace('{{period}}', row.oldestPeriod).replace('{{count}}', String(count))
}

/**
 * The family's open charges, and the act of taking money for some of them.
 *
 * **Several charges, one payment.** The club collects months in advance in cash — the app
 * already tells parents so (`billing.pay.cashTerm`) — so a handful of notes covers three
 * months, and recording it as three payments would invent two rows that never changed
 * hands. Ticking is the design, not a convenience, and the button carries the sum so the
 * number on the screen is compared with the number in the hand before anything is written.
 *
 * **Never queued.** Attendance is written offline and reconciled; money is not. A payment
 * recorded on a phone with no signal, in a pocket, for an hour, is a number two people
 * later disagree about — so this waits for the server and says so when there is none.
 */
function FamilySheet({
  client,
  clock,
  family,
  locale,
  onClose,
  onRecorded,
}: {
  client: CashClient
  clock: () => Date
  family: Household
  locale: Locale
  onClose: () => void
  onRecorded: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  const networkMode = useNetworkMode()
  // Everything ticked to begin with: a manager opening a family is usually about to be
  // handed what they owe, and un-ticking the one month they are not paying for is fewer
  // taps than ticking the three they are.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(family.charges.map((charge) => charge.id)),
  )
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const picked = family.charges.filter((charge) => chosen.has(charge.id))
  const total = picked.reduce((sum, charge) => sum + outstandingAgorot(charge), 0)
  const offline = networkMode === 'offline'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-family-title"
        tabIndex={-1}
        data-testid="cash-family-sheet"
        className="tw-scope max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl"
      >
        <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h2 className="truncate text-sm font-black text-[var(--fg)]" id="cash-family-title">
            <bdi>{family.title}</bdi>
          </h2>
          <span className="font-mono text-sm font-black text-[var(--danger)]">
            {formatAgorot(family.owedAgorot)}
          </span>
        </div>

        <ul className="m-0 flex list-none flex-col p-0">
          {family.charges.map((charge) => {
            const on = chosen.has(charge.id)
            return (
              <li key={charge.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-testid={`cash-charge-${charge.id}`}
                  onClick={() =>
                    setChosen((current) => {
                      const next = new Set(current)
                      if (!next.delete(charge.id)) next.add(charge.id)
                      return next
                    })
                  }
                  className="flex min-h-12 w-full items-center gap-3 border-t border-[var(--border)] px-1 text-start text-xs font-bold text-[var(--fg)]"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                      on
                        ? 'border-[var(--paid)] bg-[var(--paid)] text-[var(--on-emphasis)]'
                        : 'border-[var(--border)] text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="truncate">{chargeLabel(locale, charge)}</span>
                  <span className="ms-auto shrink-0 font-mono font-medium text-[var(--text-secondary)]">
                    {formatAgorot(outstandingAgorot(charge))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <span className="text-[11px] text-[var(--text-muted)]" data-testid="cash-selected-note">
            {picked.length === 1
              ? t(locale, 'billing.cash.family.selectedOne')
              : t(locale, 'billing.cash.family.selected').replace(
                  '{{count}}',
                  String(picked.length),
                )}
          </span>
          <span className="font-mono text-base font-black text-[var(--fg)]" data-testid="cash-selected-total">
            {formatAgorot(total)}
          </span>
        </div>

        {offline ? (
          <p className="m-0 text-[11px] font-semibold text-[var(--pending)]" data-testid="cash-offline">
            {t(locale, 'billing.cash.family.offline')}
          </p>
        ) : null}
        {failed ? (
          <p className="m-0 text-[11px] font-semibold text-[var(--danger)]" role="alert">
            {t(locale, 'billing.cash.family.failed')}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {(['cash', 'cheque'] as const).map((method) => (
            <button
              key={method}
              type="button"
              data-testid={`cash-record-${method}`}
              disabled={picked.length === 0 || saving || offline}
              onClick={() => {
                setSaving(true)
                setFailed(false)
                void client
                  .recordCash({
                    payerPersonId: family.payerPersonId,
                    amountAgorot: total,
                    chargeIds: picked.map((charge) => charge.id),
                    receivedAt: clock().toISOString(),
                    method,
                  })
                  .then(onRecorded)
                  .catch(() => {
                    setSaving(false)
                    setFailed(true)
                  })
              }}
              className={`min-h-12 w-full rounded-xl text-sm font-black transition-colors disabled:bg-[var(--disabled-surface)] disabled:text-[var(--text-muted)] ${
                method === 'cash'
                  ? 'bg-[var(--paid)] text-[var(--on-emphasis)]'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'
              }`}
            >
              {saving
                ? t(locale, 'billing.cash.family.saving')
                : t(
                    locale,
                    method === 'cash'
                      ? 'billing.cash.family.markCash'
                      : 'billing.cash.family.markCheque',
                  )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function chargeLabel(locale: Locale, charge: OpenCharge): string {
  if (charge.period_year !== null && charge.period_month !== null) {
    return `${String(charge.period_month).padStart(2, '0')}/${charge.period_year}`
  }
  return t(
    locale,
    charge.product_id ? 'billing.cash.family.chargeItem' : 'billing.cash.family.chargeOther',
  )
}
