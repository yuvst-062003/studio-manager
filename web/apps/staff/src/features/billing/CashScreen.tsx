// §5.10's money, in the pocket of the person who collects it (owner, 2026-10-14: "I want
// to replace the timer with cash, and there do the cash collection").
//
// **Why a tab at all.** This club is paid in notes and cheques, handed over at the door of
// the dojo while children put their shoes on. One half of that — the requests parents send
// — has been written and working at `#/cash` since the 2026-08-27 feature pass, reachable
// only by typing a hash nobody types. The other half, who still owes what, lived on the
// dashboard a manager opens at home.
//
// **Rebuilt the same evening it shipped**, because the first version read as three empty
// boxes stacked on a zero — the owner's words: "it doesn't clear". Nothing on it was wrong
// and nothing on it was legible either. What changed, in Apple's own terms — wayfinding (a
// screen answers where I am, what is here, where I can go) and simplicity rather than
// minimalism (three empty containers are minimal; they are not simple):
//
//   * one figure at the top with a PERIOD and a NEIGHBOUR — ₪4,250, October, ₪900 up on
//     September — because a number with neither is trivia;
//   * something to DO before anybody owes anything, so the screen is never a dead end;
//   * sections carrying their count or total in the header, so the shape of the evening is
//     readable before a single row is;
//   * an empty section as one quiet line inside its own group, never a dashed box the size
//     of a card.
//
// MANAGER-ONLY, TWICE. Every endpoint behind this screen is `ManagerOrOwner`, and
// `StaffTabBar` draws no cash tab for anybody else — SPEC §13's third invariant keeps
// financial fields off coach-scoped endpoints, so a coach's app has no money in it at all.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Banknote, ChevronLeft, PiggyBank, Receipt, TrendingUp } from 'lucide-react'
import { formatAgorot, useNetworkMode } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentPromisesSection } from './PaymentPromisesSection'
import { makeCashClient } from './cashClient'
import type { CashClient, OpenCharge, RecordedPayment } from './cashClient'
import { collectedInMonth, householdsFrom } from './households'
import type { Household, NamedStudent } from './households'
import { RecordPaymentSheet } from './RecordPaymentSheet'
import { BatchPaymentSheet } from './BatchPaymentSheet'

/** Three months is where a debt stops being an oversight and becomes a conversation. */
const LATE_MONTHS = 3

type Sheet = { kind: 'record'; payerPersonId: string | null } | { kind: 'batch' } | null

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
  const [payments, setPayments] = useState<readonly RecordedPayment[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [loadedStudents, setLoadedStudents] = useState<readonly NamedStudent[]>([])
  const networkMode = useNetworkMode()

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
    void Promise.all([client.openCharges(), client.payments()])
      .then(([open, paid]) => {
        if (!live) return
        setCharges(open)
        setPayments(paid)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  const households = useMemo(
    () => householdsFrom(charges ?? [], students ?? loadedStudents),
    [charges, students, loadedStudents],
  )
  const owedTotal = households.reduce((sum, row) => sum + row.owedAgorot, 0)
  const now = clock()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thisMonth = collectedInMonth(payments, now)
  const delta = thisMonth - collectedInMonth(payments, previous)

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
    <section className="tw-scope flex flex-col gap-5 px-4 pt-4" data-testid="cash-screen">
      {/* The large title, and the one figure the evening is about. */}
      <header className="flex flex-col gap-0.5">
        <h1 className="m-0 text-3xl font-black tracking-tight text-[var(--fg)]">
          {t(locale, 'billing.cash.tab.title')}
        </h1>
        <p className="m-0 text-xs font-semibold text-[var(--text-muted)]">
          {monthLabel(locale, now)}
        </p>
      </header>

      <div className="flex flex-col gap-1 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xs">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {t(locale, 'billing.cash.month.collected')}
        </span>
        <span
          className="font-mono text-4xl font-black leading-none tracking-tight text-[var(--fg)]"
          data-testid="cash-month-total"
        >
          {charges === null ? '—' : formatAgorot(thisMonth)}
        </span>
        <span
          className={`text-xs font-bold ${delta >= 0 ? 'text-[var(--paid)]' : 'text-[var(--danger)]'}`}
          data-testid="cash-month-delta"
        >
          {thisMonth === 0
            ? t(locale, 'billing.cash.month.none')
            : t(locale, 'billing.cash.month.vsPrev')
                .replace('{{delta}}', `${delta >= 0 ? '▲' : '▼'} ${formatAgorot(Math.abs(delta))}`)
                .replace('{{month}}', monthName(locale, previous))}
        </span>
      </div>

      {/* Something to do, before anybody owes anything. */}
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {t(locale, 'billing.cash.actions')}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
          <ActionRow
            hint={t(locale, 'billing.cash.action.recordHint')}
            icon={<Banknote aria-hidden="true" className="h-4 w-4" />}
            label={t(locale, 'billing.cash.action.record')}
            onClick={() => setSheet({ kind: 'record', payerPersonId: null })}
            testId="cash-open-record"
            tone="paid"
          />
          <ActionRow
            hint={t(locale, 'billing.cash.action.batchHint')}
            icon={<Receipt aria-hidden="true" className="h-4 w-4" />}
            label={t(locale, 'billing.cash.action.batch')}
            onClick={() => setSheet({ kind: 'batch' })}
            testId="cash-open-batch"
            tone="emphasis"
          />
          <ActionRow
            hint={t(locale, 'billing.cash.action.summaryHint')}
            href="#/cash/summary"
            icon={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
            label={t(locale, 'billing.cash.action.summary')}
            testId="cash-open-summary"
            tone="emphasis"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2" data-testid="cash-requests">
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {t(locale, 'billing.cash.requests.title')}
        </h2>
        <PaymentPromisesSection heading={false} locale={locale} />
      </section>

      <section className="flex flex-col gap-2" data-testid="cash-debts">
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {households.length === 0
            ? t(locale, 'billing.cash.debts.title')
            : t(locale, 'billing.cash.debts.heading').replace('{{total}}', formatAgorot(owedTotal))}
        </h2>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
          {charges !== null && households.length === 0 ? (
            <p
              className="m-0 px-3 py-3.5 text-center text-xs text-[var(--text-muted)]"
              data-testid="cash-debts-empty"
            >
              {t(locale, 'billing.cash.debts.clear')}
            </p>
          ) : null}

          {households.map((row, index) => (
            <button
              key={row.payerPersonId}
              type="button"
              aria-haspopup="dialog"
              data-testid={`cash-family-${row.payerPersonId}`}
              onClick={() => setSheet({ kind: 'record', payerPersonId: row.payerPersonId })}
              className={`flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-start transition-colors active:bg-[var(--surface)] ${
                index > 0 ? 'border-t border-[var(--border)]' : ''
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--danger-tint)] text-[var(--danger)]">
                <PiggyBank aria-hidden="true" className="h-4 w-4" />
              </span>
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
          ))}
        </div>
        {networkMode === 'offline' ? (
          <p
            className="m-0 text-[11px] font-semibold text-[var(--pending)]"
            data-testid="cash-offline-note"
          >
            {t(locale, 'billing.cash.family.offline')}
          </p>
        ) : null}
      </section>

      {sheet?.kind === 'record' ? (
        <RecordPaymentSheet
          client={client}
          clock={clock}
          households={households}
          locale={locale}
          onClose={() => setSheet(null)}
          onRecorded={() => {
            setSheet(null)
            setAttempt((n) => n + 1)
          }}
          openFor={sheet.payerPersonId}
        />
      ) : null}

      {sheet?.kind === 'batch' ? (
        <BatchPaymentSheet
          client={client}
          clock={clock}
          households={households}
          locale={locale}
          onClose={() => setSheet(null)}
          onRecorded={() => setAttempt((n) => n + 1)}
        />
      ) : null}
    </section>
  )
}

function ActionRow({
  hint,
  href,
  icon,
  label,
  onClick,
  testId,
  tone,
}: {
  hint: string
  href?: string
  icon: ReactNode
  label: string
  onClick?: () => void
  testId: string
  tone: 'paid' | 'emphasis'
}) {
  const inner = (
    <>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          tone === 'paid'
            ? 'bg-[var(--paid)] text-[var(--on-emphasis)]'
            : 'bg-[var(--emphasis-tint)] text-[var(--emphasis)]'
        }`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-bold text-[var(--fg)]">{label}</span>
        <span className="truncate text-[11px] text-[var(--text-muted)]">{hint}</span>
      </span>
      <ChevronLeft
        aria-hidden="true"
        className="ms-auto h-4 w-4 shrink-0 text-[var(--text-muted)] ltr:rotate-180"
      />
    </>
  )
  const shell =
    'flex min-h-14 w-full items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 text-start transition-colors last:border-b-0 active:bg-[var(--surface)]'

  return href ? (
    <a className={shell} data-testid={testId} href={href}>
      {inner}
    </a>
  ) : (
    <button className={shell} data-testid={testId} onClick={onClick} type="button">
      {inner}
    </button>
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

/** `אוקטובר 2026`, from the platform's own month names — no month table of our own. */
function monthLabel(locale: Locale, when: Date): string {
  return `${monthName(locale, when)} ${when.getFullYear()}`
}

function monthName(locale: Locale, when: Date): string {
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : locale, { month: 'long' }).format(when)
}
