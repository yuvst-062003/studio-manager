// תשלומים — the parent app's payments tab, rebuilt 2026-09-07.
//
// **It answers "do I owe money, and how do I pay it right now" — and nothing else.** What
// it replaces (`PaymentsScreen.tsx`) answered four questions at once, in four cards of
// equal weight, and the worst consequence was arithmetic: ₪208.33 owed at the top, and
// underneath it buttons offering ₪500, ₪750 and ₪3,000, none of them the debt.
//
// Three rules, and they are the whole of the rebuild:
//
//  1. **The top number is the debt and it never moves.** Choosing a method does not change
//     what the family owes. It is the first thing on the screen and it is the only place
//     `debtAgorot` is rendered.
//  2. **The button always states the real amount.** One figure, computed once, in `pay.ts`
//     where a test holds it — never a total the reader has to assemble out of two.
//  3. **When the number jumps, the screen says why.** The line under the chips is read off
//     the same `Ask` the button charges, and on the cash side it names the CLUB as the one
//     who chose three months. The club's rule stopped being presented as the parent's
//     choice.
//
// **הוראת קבע and צ׳קים are not here**, and their absence is the point. Both are set up
// once — a standing order moves the money by itself and cheques buy a whole season — so
// neither is a monthly decision, and neither should compete for attention every month.
// They live in פרופיל → תשלומים, under אמצעי תשלום.
//
// **The layout is step 3 of the join wizard's**, not step 4: light ground, white rounded
// cards, a summary strip and a sticky bottom button. Step 4 is dark and celebratory — it
// reports an outcome, and this screen asks for one.
import { useMemo, useState } from 'react'
import { Banknote, ChevronLeft, CreditCard, Lock } from 'lucide-react'
import { fill } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { MONTH_CHIPS, askFor, coveredAgorot, debtAgorot, owedMonths } from './pay'
import type { Ask, DebtRow, PayMethod, PayTerms } from './pay'

/** The newest payment that actually stands, projected for the strip at the foot. */
export type LastPayment = {
  amountAgorot: number
  /** ISO instant. Rendered in Asia/Jerusalem by the caller's `dateLabel`. */
  receivedAt: string
  /** An i18n key suffix under `billing.method.` — the same mapping the history screen
   *  uses, imported rather than re-spelled. */
  methodKey: string
}

export type PayScreenProps = {
  locale: Locale
  debts: readonly DebtRow[]
  terms: PayTerms
  /** What is left of money already handed over. Derived into "שולם מראש", never stored. */
  creditAgorot: number
  lastPayment: LastPayment | null
  /** §5.10's second double-payment guard, and it is a WARNING, never a block: a family who
   *  set up a mandate and then wants to clear a one-off must still have a route. */
  hasActiveSubscription: boolean
  /** A cash request already with the manager. While one is live the cash route reports it
   *  instead of offering a second the server would refuse. */
  pendingCashAgorot: number | null
  /** The last decided cash request was declined, and nothing is pending. Said out loud —
   *  silence after a decline reads as a screen that lost the request. */
  cashDeclined: boolean
  busy: boolean
  error: string | null
  money: (agorot: number) => string
  dateLabel: (iso: string) => string
  monthLabel: (year: number, month: number) => string
  onPay: (ask: Ask) => void
  onOpenHistory: () => void
}

const CARD = 'bg-white dark:bg-slate-900 rounded-2xl border border-[#dee2f4] dark:border-slate-800 shadow-xs'

export function PayScreen({
  locale,
  debts,
  terms,
  creditAgorot,
  lastPayment,
  hasActiveSubscription,
  pendingCashAgorot,
  cashDeclined,
  busy,
  error,
  money,
  dateLabel,
  monthLabel,
  onPay,
  onOpenHistory,
}: PayScreenProps) {
  const owed = useMemo(() => owedMonths(debts), [debts])
  const [method, setMethod] = useState<PayMethod>('card')
  /**
   * The chip that settles the debt, and nothing smaller.
   *
   * A default of 1 would have a family owing two months read a top line of ₪500 above a
   * button charging ₪250 — the exact "two figures to assemble" this screen exists to stop.
   * Above six the chips cannot settle it in one go, so the largest is offered and the line
   * under them says what the remainder buys.
   */
  const [months, setMonths] = useState(
    () => MONTH_CHIPS.find((chip) => chip >= owed) ?? Math.max(...MONTH_CHIPS),
  )

  const debt = useMemo(() => debtAgorot(debts), [debts])
  const covered = useMemo(() => coveredAgorot(debts), [debts])
  const ask = useMemo(() => askFor(method, debts, months, terms), [method, debts, months, terms])

  // The subtitle under the debt: which month, and whose. Both are DATA — the separator is
  // punctuation, so nothing here is a sentence a translator would need.
  const periods = useMemo(() => {
    const keys = new Map<string, { year: number; month: number }>()
    for (const { charge } of debts) {
      // `== null` and not `=== null`: the generated `ChargeOut` declares these optional
      // as well as nullable, so a strict check leaves `undefined` through and the map is
      // then keyed `undefined-undefined`.
      const { period_year: year, period_month: month } = charge
      if (year == null || month == null) continue
      keys.set(`${year}-${month}`, { year, month })
    }
    return [...keys.values()].sort((a, b) => a.year - b.year || a.month - b.month)
  }, [debts])
  const names = useMemo(
    () => [...new Set(debts.map((row) => row.studentName).filter(Boolean))],
    [debts],
  )
  const subtitle = [
    periods.length === 1
      ? monthLabel(periods[0]!.year, periods[0]!.month)
      : periods.length > 1
        ? plural(locale, 'billing.pay.months', periods.length)
        : '',
    names.join(', '),
  ]
    .filter(Boolean)
    .join(' · ')

  const cashPending = pendingCashAgorot !== null
  const payable = ask.totalAgorot > 0 && !(method === 'cash' && cashPending)

  return (
    <div
      data-testid="pay-screen"
      // Cleared for the sticky footer AND the tab bar under it. `100dvh` rather than
      // `100vh`: Safari measures the latter as though its own toolbar were not there.
      className="flex flex-col min-h-[100dvh] pb-[calc(11rem+env(safe-area-inset-bottom,0px))] bg-[#faf8ff] dark:bg-slate-950"
    >
      <header className="px-5 pt-8 pb-3">
        <h1 className="text-2xl font-black text-[#0A1938] dark:text-slate-50 tracking-tight leading-none">
          {t(locale, 'billing.pay.title')}
        </h1>
      </header>

      <main className="px-5 flex flex-col gap-4">
        {/* ── the debt. One number, and nothing on this screen moves it ─────────── */}
        <section data-testid="pay-owed" className={`${CARD} p-5 text-center`}>
          <p className="text-[13px] font-bold text-[#444650] dark:text-slate-400">
            {debt > 0 ? t(locale, 'billing.pay.owed') : t(locale, 'billing.pay.clearTitle')}
          </p>
          <p
            data-testid="pay-owed-amount"
            className={`mt-1 text-[38px] font-black tracking-tight tabular-nums ${
              debt > 0 ? 'text-[#ba1a1a] dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {/* `<bdi>` for the same reason `MoneyDisplay` wraps every figure: `₪208.33` in
                a right-to-left paragraph is free to reorder to `208.33₪`, and the fix for
                that — a `direction: ltr` wrapper — is what actually causes it. */}
            <bdi>{money(debt)}</bdi>
          </p>
          <p className="mt-1 text-[12px] text-[#444650] dark:text-slate-400">
            {debt > 0 ? subtitle : t(locale, 'billing.pay.clearBody')}
          </p>
          {covered > 0 ? (
            // A row greyed out beside a total that counts it is a contradiction with
            // nothing on screen explaining it. This names the part already in motion.
            <p
              data-testid="pay-covered"
              className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl py-1.5 px-2"
            >
              {fill(t(locale, 'billing.pay.covered'), { total: money(covered) })}
            </p>
          ) : null}
        </section>

        {hasActiveSubscription ? (
          // §5.10's second guard, read BEFORE a route is chosen. A warning, never a block.
          <p
            data-testid="pay-standing-order-warning"
            role="status"
            className="text-[12px] leading-relaxed text-[#001849] dark:text-blue-200 bg-[#0056c5]/10 border border-[#0056c5]/20 rounded-xl p-3"
          >
            {t(locale, 'billing.standingOrder.activeWarning')}
          </p>
        ) : null}

        {/* ── how ─────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-2.5 border-0 p-0 m-0">
          {/* A `legend`, not an `h2` beside the group: the chips are radios, and a heading
              that merely sits above them names nothing a screen reader can hear. */}
          <legend className="text-[15px] font-bold text-[#001849] dark:text-slate-100 px-1 mb-2.5">
            {t(locale, 'billing.pay.howTitle')}
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { key: 'card' as const, Icon: CreditCard, label: 'billing.pay.methodCard' },
                { key: 'cash' as const, Icon: Banknote, label: 'billing.pay.methodCash' },
              ]
            ).map(({ key, Icon, label }) => {
              const active = method === key
              return (
                <label
                  key={key}
                  data-testid={`pay-method-${key}`}
                  className={`cursor-pointer rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                    active
                      ? 'bg-[#001849] text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 text-[#161b28] dark:text-slate-200 border border-[#dee2f4] dark:border-slate-800 shadow-xs'
                  }`}
                >
                  <input
                    type="radio"
                    name="pay-method"
                    checked={active}
                    onChange={() => setMethod(key)}
                    className="sr-only"
                  />
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-[14px] font-bold">{t(locale, label)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {method === 'card' ? (
          /* ── how many months. The card's question, and only the card's ───────── */
          <fieldset
            data-testid="pay-months"
            className="flex flex-col gap-2.5 border-0 p-0 m-0"
          >
            <legend className="text-[15px] font-bold text-[#001849] dark:text-slate-100 px-1 mb-2.5">
              {t(locale, 'billing.pay.monthsTitle')}
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {MONTH_CHIPS.map((chip) => {
                const active = months === chip
                return (
                  <label
                    key={chip}
                    data-testid={`pay-months-${chip}`}
                    className={`cursor-pointer rounded-xl py-2.5 text-center text-[15px] font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                      active
                        ? 'bg-[#001849] text-white shadow-md'
                        : 'bg-[#e9edff] dark:bg-slate-800 text-[#161b28] dark:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pay-months"
                      // The visible label is a bare digit, which is an accessible name of
                      // "3" — true of a page number, a quantity and a price alike. The
                      // spoken name says what the digit counts.
                      aria-label={plural(locale, 'billing.pay.months', chip)}
                      checked={active}
                      onChange={() => setMonths(chip)}
                      className="sr-only"
                    />
                    <span className="tabular-nums">{chip}</span>
                  </label>
                )
              })}
            </div>
            {ask.forwardMonths > 0 ? (
              // Rule 3: the number jumped, and this is the reason — a line to read, not
              // arithmetic to do. Read off the same `Ask` the button charges.
              <p
                data-testid="pay-forward-note"
                className="text-[12px] text-[#444650] dark:text-slate-400 px-1"
              >
                {plural(locale, 'billing.pay.forward', ask.forwardMonths)}
              </p>
            ) : null}
          </fieldset>
        ) : (
          /* ── cash. The club's rule, said as the club's ───────────────────────── */
          <section data-testid="pay-cash" className={`${CARD} p-4 flex flex-col gap-1`}>
            {cashPending ? (
              <>
                <p className="text-[14px] font-bold text-[#001849] dark:text-slate-100">
                  {t(locale, 'billing.cash.pendingTitle')}
                </p>
                <p
                  data-testid="pay-cash-pending"
                  className="text-[12px] text-[#444650] dark:text-slate-400"
                >
                  {t(locale, 'billing.cash.requested')}
                </p>
                <p className="text-[16px] font-black text-[#001849] dark:text-slate-100">
                  <bdi>{money(pendingCashAgorot)}</bdi>
                </p>
              </>
            ) : (
              <>
                {cashDeclined ? (
                  <p
                    data-testid="pay-cash-declined"
                    role="alert"
                    className="text-[12px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-xl p-2.5"
                  >
                    {t(locale, 'billing.cash.declined')}
                  </p>
                ) : null}
                {ask.forwardMonths > 0 ? (
                  <p
                    data-testid="pay-cash-term"
                    className="text-[13px] font-bold text-[#001849] dark:text-slate-100"
                  >
                    {plural(locale, 'billing.pay.cashTerm', ask.forwardMonths)}
                  </p>
                ) : null}
                <p className="text-[12px] text-[#444650] dark:text-slate-400">
                  {t(locale, 'billing.cash.instructions')}
                </p>
                <p className="text-[12px] text-[#444650] dark:text-slate-400">
                  {t(locale, 'billing.pay.cashNote')}
                </p>
              </>
            )}
          </section>
        )}

        {/* ── שולם מראש · התשלום האחרון · כל התשלומים ──────────────────────────── */}
        <section data-testid="pay-strip" className={`${CARD} p-4 flex flex-col gap-2.5`}>
          {creditAgorot > 0 ? (
            <div
              data-testid="pay-paid-ahead"
              className="flex items-center justify-between gap-2"
            >
              <span className="text-[12px] text-[#444650] dark:text-slate-400">
                {t(locale, 'billing.pay.paidAhead')}
              </span>
              <span className="text-[14px] font-bold text-emerald-700 dark:text-emerald-300">
                <bdi>{money(creditAgorot)}</bdi>
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-[#444650] dark:text-slate-400">
              {t(locale, 'billing.pay.lastPayment')}
            </span>
            {lastPayment ? (
              <span
                data-testid="pay-last-payment"
                className="text-[13px] font-bold text-[#161b28] dark:text-slate-100 text-end"
              >
                <bdi>{money(lastPayment.amountAgorot)}</bdi>
                {' · '}
                {t(locale, `billing.method.${lastPayment.methodKey}`)}
                {' · '}
                {dateLabel(lastPayment.receivedAt)}
              </span>
            ) : (
              <span
                data-testid="pay-no-payments"
                className="text-[13px] text-[#757681] dark:text-slate-500"
              >
                {t(locale, 'billing.pay.noPayments')}
              </span>
            )}
          </div>
          <button
            type="button"
            data-testid="pay-all-payments"
            onClick={onOpenHistory}
            // `bg-transparent border-0 p-0` on purpose: without them the user agent draws
            // its own button — a grey bordered box the width of the card, which reads as a
            // disabled text field rather than as the link this is.
            className="flex items-center gap-1 self-start bg-transparent border-0 p-0 text-[13px] font-bold text-[#0056c5] dark:text-blue-300 cursor-pointer hover:underline"
          >
            {t(locale, 'billing.pay.allPayments')}
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>

        {error ? (
          <p
            data-testid="pay-error"
            role="alert"
            className="text-[13px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl p-3"
          >
            {error}
          </p>
        ) : null}
      </main>

      {/* ── the button. It states what it charges, always ───────────────────────── */}
      <footer
        // Above the tab bar, and above the home indicator under it. Same expression as
        // בית's floating button and the shop's cart bar, so all three rise and fall with
        // the bar together — `app-viewport.test.ts` scans for exactly this.
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] inset-x-0 z-30 px-4"
      >
        <div className="max-w-md mx-auto flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="pay-button"
            disabled={busy || !payable}
            onClick={() => onPay(ask)}
            className={`h-13 py-3.5 w-full rounded-2xl text-white text-[16px] font-bold shadow-2xl transition-all ${
              busy || !payable
                ? 'bg-[#757681] cursor-not-allowed'
                : 'bg-[#001849] hover:bg-[#0056c5] active:scale-[0.99] cursor-pointer'
            }`}
          >
            {busy
              ? t(locale, 'billing.pay.working')
              : !payable
                ? t(locale, 'billing.pay.nothingPayable')
                : fill(
                    t(
                      locale,
                      method === 'card' ? 'billing.pay.payCard' : 'billing.pay.payCash',
                    ),
                    { total: money(ask.totalAgorot) },
                  )}
          </button>
          {method === 'card' ? (
            <span className="flex items-center justify-center gap-1.5 text-[11px] text-[#444650] dark:text-slate-400">
              <Lock className="w-3.5 h-3.5 text-[#0056c5]" aria-hidden="true" />
              {t(locale, 'billing.pay.secureNote')}
            </span>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
