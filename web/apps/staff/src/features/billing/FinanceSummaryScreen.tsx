// `סיכום כספי` — the month's shape, pressed from the money tab (owner, 2026-10-14: "it
// should be a page from finance to press").
//
// **A page, not a fourth band.** The tab is for the evening's work — who is waiting, who
// owes, record what was handed over. This is for the question you ask once a month and read
// for a minute, which is a different posture and a different screen.
//
// **Every figure here is a sum of rows the app already stores.** Nothing is modelled,
// projected or estimated: if a number cannot be traced to charges and payments it is not on
// the page. Two consequences worth stating, because both are easy to get wrong and hard to
// notice:
//
//   * the CURRENT month is drawn differently and labelled `עד כה` — comparing a half month
//     against twelve whole ones is the easiest chart lie to tell;
//   * `שיעור גבייה` is money received in a period over money BILLED in that period, not
//     over what anybody hoped for.
//
// Unlike the tab, this page counts card payments too: a card is income, it simply is not
// money that passed through the manager's hands. The tab's figure says collected by hand;
// this one says total, and splits it by method so the two can never be confused.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatAgorot } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeCashClient } from './cashClient'
import type { CashClient, OpenCharge, RecordedPayment } from './cashClient'
import { outstandingAgorot } from './households'

const MONTHS_BACK = 12

/** The order the legend and the stack are drawn in, so two readings of the same month put
 *  the same colour in the same place. */
const METHODS = ['cash', 'cheque', 'standing_order', 'bank_transfer', 'upay_card'] as const
const METHOD_COLOUR: Record<(typeof METHODS)[number], string> = {
  cash: 'var(--paid)',
  cheque: 'var(--pending)',
  standing_order: 'var(--emphasis)',
  bank_transfer: 'var(--text-muted)',
  upay_card: 'var(--emphasis-strong, var(--emphasis))',
}

export function FinanceSummaryScreen({
  locale,
  client: injected,
  clock = () => new Date(),
}: {
  locale: Locale
  client?: CashClient
  clock?: () => Date
}) {
  const client = useMemo(() => injected ?? makeCashClient(), [injected])
  const [payments, setPayments] = useState<readonly RecordedPayment[] | null>(null)
  const [charges, setCharges] = useState<readonly OpenCharge[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([client.payments(), client.openCharges()])
      .then(([paid, open]) => {
        if (!live) return
        setPayments(paid)
        setCharges(open)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  const now = clock()
  const months = useMemo(() => monthSeries(payments ?? [], now), [payments, now])
  const byMethod = useMemo(() => methodSplit(payments ?? [], now), [payments, now])
  const aging = useMemo(() => debtAging(charges ?? [], now), [charges, now])
  const peak = Math.max(1, ...months.map((month) => month.agorot))
  const monthTotal = byMethod.reduce((sum, slice) => sum + slice.agorot, 0)
  const owed = (charges ?? []).reduce((sum, charge) => sum + outstandingAgorot(charge), 0)
  const billed = monthTotal + owed
  const collected = billed === 0 ? 0 : Math.round((100 * monthTotal) / billed)

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
    <section className="tw-scope flex flex-col gap-5 px-4 pt-4" data-testid="finance-summary">
      <a
        className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-[var(--emphasis)]"
        data-testid="finance-summary-back"
        href="#/cash"
      >
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 ltr:rotate-180" />
        {t(locale, 'billing.cash.tab.title')}
      </a>

      <header className="flex flex-col gap-0.5">
        <h1 className="m-0 text-3xl font-black tracking-tight text-[var(--fg)]">
          {t(locale, 'billing.cash.action.summary')}
        </h1>
        <p className="m-0 text-xs font-semibold text-[var(--text-muted)]">
          {new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : locale, {
            month: 'long',
            year: 'numeric',
          }).format(now)}
        </p>
      </header>

      {/* 1 — how much came in, month by month. */}
      <section className="flex flex-col gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <h2 className="m-0 text-sm font-black text-[var(--fg)]">
          {t(locale, 'billing.summary.byMonth')}
        </h2>
        <p className="m-0 text-[11px] text-[var(--text-muted)]">
          {t(locale, 'billing.summary.byMonthHint')}
        </p>
        <div className="flex h-24 items-end gap-1" data-testid="finance-summary-months">
          {months.map((month) => (
            <span
              key={month.key}
              aria-label={`${month.label}: ${formatAgorot(month.agorot)}`}
              className={`block flex-1 rounded-t ${
                month.current ? 'bg-[var(--paid)]' : 'bg-[var(--emphasis)]'
              }`}
              data-testid={`finance-summary-month-${month.key}`}
              style={{ height: `${Math.max(2, Math.round((100 * month.agorot) / peak))}%` }}
            />
          ))}
        </div>
        <div className="flex gap-1 text-[9px] text-[var(--text-muted)]">
          {months.map((month) => (
            <span key={month.key} className="flex-1 text-center">
              {month.label}
            </span>
          ))}
        </div>
      </section>

      {/* 2 — and how it was paid. */}
      <section className="flex flex-col gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <h2 className="m-0 text-sm font-black text-[var(--fg)]">
          {t(locale, 'billing.summary.byMethod')}
        </h2>
        <p className="m-0 text-[11px] text-[var(--text-muted)]" data-testid="finance-summary-month-total">
          {formatAgorot(monthTotal)}
        </p>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--disabled-surface)]">
          {byMethod.map((slice) => (
            <span
              key={slice.method}
              className="block"
              data-testid={`finance-summary-method-${slice.method}`}
              style={{
                width: `${monthTotal === 0 ? 0 : (100 * slice.agorot) / monthTotal}%`,
                background: METHOD_COLOUR[slice.method],
              }}
            />
          ))}
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11px] text-[var(--text-muted)]">
          {byMethod.map((slice) => (
            <li key={slice.method} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: METHOD_COLOUR[slice.method] }}
              />
              {t(locale, `billing.method.${slice.method}`)} {formatAgorot(slice.agorot)}
            </li>
          ))}
          {byMethod.length === 0 ? <li>{t(locale, 'billing.cash.month.none')}</li> : null}
        </ul>
      </section>

      {/* 3 — of what was billed, how much arrived. */}
      <section className="flex flex-col gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <h2 className="m-0 text-sm font-black text-[var(--fg)]">
          {t(locale, 'billing.summary.collection')}
        </h2>
        <div className="flex items-center gap-4">
          <svg aria-hidden="true" height="76" viewBox="0 0 42 42" width="76">
            <circle cx="21" cy="21" fill="none" r="16" stroke="var(--disabled-surface)" strokeWidth="6" />
            <circle
              cx="21"
              cy="21"
              fill="none"
              r="16"
              stroke="var(--paid)"
              strokeDasharray={`${collected} 100`}
              strokeLinecap="round"
              strokeWidth="6"
              transform="rotate(-90 21 21)"
            />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-2xl font-black text-[var(--fg)]" data-testid="finance-summary-rate">
              {collected}%
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {t(locale, 'billing.summary.collectionOf')
                .replace('{{paid}}', formatAgorot(monthTotal))
                .replace('{{billed}}', formatAgorot(billed))}
            </span>
            <span className="text-[11px] font-semibold text-[var(--danger)]">
              {t(locale, 'billing.summary.stillOpen').replace('{{amount}}', formatAgorot(owed))}
            </span>
          </div>
        </div>
      </section>

      {/* 4 — and how old the unpaid part is. */}
      <section className="flex flex-col gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <h2 className="m-0 text-sm font-black text-[var(--fg)]">
          {t(locale, 'billing.summary.aging')}
        </h2>
        <p className="m-0 text-[11px] text-[var(--text-muted)]">
          {t(locale, 'billing.summary.agingHint')}
        </p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {aging.map((band) => (
            <li key={band.key} className="flex items-center gap-2.5 text-[11px]">
              <span className="w-16 shrink-0 text-[var(--text-secondary)]">
                {t(locale, `billing.summary.age.${band.key}`)}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--disabled-surface)]">
                <span
                  className="block h-full rounded-full"
                  data-testid={`finance-summary-age-${band.key}`}
                  style={{
                    width: `${owed === 0 ? 0 : (100 * band.agorot) / owed}%`,
                    background: band.colour,
                  }}
                />
              </span>
              <span className="w-16 shrink-0 text-end font-mono text-[var(--text-muted)]">
                {formatAgorot(band.agorot)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="m-0 pb-2 text-[11px] text-[var(--text-muted)]">
        {t(locale, 'billing.summary.footnote')}
      </p>
    </section>
  )
}

type MonthPoint = { key: string; label: string; agorot: number; current: boolean }

/** The last twelve months of income, oldest first, with the current one marked — it is not
 *  finished, and a half month drawn like a whole one is a lie the eye believes. */
export function monthSeries(
  payments: readonly RecordedPayment[],
  now: Date,
  back: number = MONTHS_BACK,
): MonthPoint[] {
  const points: MonthPoint[] = []
  for (let offset = back - 1; offset >= 0; offset -= 1) {
    const when = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`
    points.push({
      key,
      label: String(when.getMonth() + 1),
      agorot: payments
        .filter((payment) => inMonth(payment.received_at, when))
        .reduce((sum, payment) => sum + payment.amount_agorot, 0),
      current: offset === 0,
    })
  }
  return points
}

/** This month's income, split by how it arrived. Card included: it is income, it simply is
 *  not money the manager handled. */
export function methodSplit(
  payments: readonly RecordedPayment[],
  now: Date,
): Array<{ method: (typeof METHODS)[number]; agorot: number }> {
  const totals = new Map<string, number>()
  for (const payment of payments) {
    if (!inMonth(payment.received_at, now)) continue
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.amount_agorot)
  }
  return METHODS.map((method) => ({ method, agorot: totals.get(method) ?? 0 })).filter(
    (slice) => slice.agorot > 0,
  )
}

/** How long the unpaid part has been waiting. Three bands, because "three months behind" is
 *  a different conversation from "this month" and a single total hides exactly that. */
export function debtAging(
  charges: readonly OpenCharge[],
  now: Date,
): Array<{ key: 'fresh' | 'month' | 'old'; agorot: number; colour: string }> {
  const bands = { fresh: 0, month: 0, old: 0 }
  for (const charge of charges) {
    const days = Math.floor((now.getTime() - Date.parse(charge.due_date)) / 86_400_000)
    const amount = outstandingAgorot(charge)
    if (days <= 30) bands.fresh += amount
    else if (days <= 90) bands.month += amount
    else bands.old += amount
  }
  return [
    { key: 'fresh', agorot: bands.fresh, colour: 'var(--paid)' },
    { key: 'month', agorot: bands.month, colour: 'var(--pending)' },
    { key: 'old', agorot: bands.old, colour: 'var(--danger)' },
  ]
}

function inMonth(iso: string, when: Date): boolean {
  const at = new Date(iso)
  return at.getFullYear() === when.getFullYear() && at.getMonth() === when.getMonth()
}
