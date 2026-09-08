// תשלומים — the parent app's payments tab, rebuilt 2026-09-07.
//
// **It answers "do I owe money, and how do I pay it right now" — and nothing else.** What
// it replaces (`PaymentsScreen.tsx`) answered four questions at once, in four cards of
// equal weight, and the worst consequence was arithmetic: ₪208.33 owed at the top, and
// underneath it buttons offering ₪500, ₪750 and ₪3,000, none of them the debt.
//
// Three rules, and they are the whole of the rebuild:
//
//  1. **The top number is what the button charges, and it is a receipt.** REVISED
//     2026-09-08. It was "the debt, and it never moves" — a rule written against the
//     ₪208.33 case above, and one that created the mirror defect: ₪375 at the top above a
//     button charging ₪1,275, with nothing on screen explaining the gap. Both versions are
//     protecting the same thing, that a reader is never asked to assemble a total out of
//     two figures. Freezing the top number was one way; showing the sum is the other, and
//     it is the one that also answers "what am I paying FOR" — which the frozen version
//     could not, because a debt of a shop item plus a month was a single figure.
//     `debtAgorot` is still rendered, as a line inside the arithmetic.
//  2. **The button always states the real amount.** One figure, computed once, in `pay.ts`
//     where a test holds it — never a total the reader has to assemble out of two.
//  3. **When the number jumps, the screen says why.** The receipt is read off the same
//     `Ask` the button charges, and the cash side still names the CLUB as the one who set
//     the minimum. The club's rule is a floor the parent may exceed (2026-09-08), never
//     the whole offer — but it is still the club's, and the copy says so.
//
// **A family may not pay more than twelve months ahead** (2026-09-08). `headroom` mirrors
// `prepay_headroom_months` on the server, so every chip this screen offers is one
// `refuse_past_ceiling` will accept. The screen is the courtesy; the server is the rule.
//
// **הוראת קבע and צ׳קים are not here**, and their absence is the point. Both are set up
// once — a standing order moves the money by itself and cheques buy a whole season — so
// neither is a monthly decision, and neither should compete for attention every month.
// They live in פרופיל → תשלומים, under אמצעי תשלום.
//
// **The layout is step 3 of the join wizard's**, not step 4: light ground, white rounded
// cards, a summary strip and a sticky bottom button. Step 4 is dark and celebratory — it
// reports an outcome, and this screen asks for one.
import { useCallback, useMemo, useState } from 'react'
import { Banknote, ChevronLeft, CreditCard, Lock } from 'lucide-react'
import { fill } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { instalmentSplit } from '../billingClient'
import type { ChargeOut } from '../billingClient'
import {
  INSTALMENT_CHIPS,
  MONTH_CHIPS,
  askFor,
  cashMonthChips,
  coveredAgorot,
  debtAgorot,
  owedMonths,
  prepayHeadroomMonths,
  receiptLines,
} from './pay'
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

  /** Bug #16 — §5.10's second chip group. One payment by default: a split is something a
   *  family asks for, never something the screen assumes on their behalf. */
  const [instalments, setInstalments] = useState(1)

  /**
   * How many months forward this family may still buy (owner review, 2026-09-08).
   *
   * Derived from two numbers this screen already had, and mirrors
   * `prepay_headroom_months` on the server — so a chip that is offered here is one
   * `refuse_past_ceiling` will accept, rather than a second opinion about the same family.
   */
  const headroom = useMemo(
    () => prepayHeadroomMonths(creditAgorot, terms.monthlyTotalAgorot),
    [creditAgorot, terms.monthlyTotalAgorot],
  )

  /** The cash term. The club's floor is where it STARTS, not what it is: a family who
   *  wants five months of cash had no way to say so before. */
  const cashChips = useMemo(
    () => cashMonthChips(terms.cashMonths, headroom),
    [terms.cashMonths, headroom],
  )
  const [cashMonths, setCashMonths] = useState<number | null>(null)
  // `null` until the family picks, so a chip list that arrives late (the terms are a
  // fetch) does not leave the selection pinned to a stale first render.
  const chosenCashMonths = cashMonths !== null && cashChips.includes(cashMonths)
    ? cashMonths
    : (cashChips[0] ?? 0)

  /** Whether a card chip's FORWARD half would carry the family past the ceiling. Debt is
   *  never blocked — see the chip's own comment. */
  const monthsBlocked = (chip: number) => chip - Math.min(chip, owed) > headroom
  /**
   * The chip actually in force.
   *
   * The default is "the smallest chip that settles the debt", which can itself be blocked
   * for a family who is both behind and paid ahead. Without this clamp the screen would
   * open on a selection the button then charges and the server refuses — a dead end that
   * costs the parent a round trip to discover.
   */
  const effectiveMonths = monthsBlocked(months)
    ? ([...MONTH_CHIPS].reverse().find((chip) => !monthsBlocked(chip)) ?? owed)
    : months

  const debt = useMemo(() => debtAgorot(debts), [debts])
  const covered = useMemo(() => coveredAgorot(debts), [debts])
  const ask = useMemo(
    () => askFor(method, debts, effectiveMonths, terms, instalments, chosenCashMonths),
    [method, debts, effectiveMonths, terms, instalments, chosenCashMonths],
  )

  /**
   * What a charge is called. Spec §3.3, and the whole of the "what am I paying for" fix.
   *
   * `proration_note` is where BOTH shop routes write the item's name and where the billing
   * run writes its proration explanation, so it is the label when it is there. The kind is
   * the floor for a charge nothing ever named — an amount with no explanation was what the
   * old screen showed for every one of them.
   */
  const labelOf = useCallback((charge: ChargeOut) => {
    const base = charge.proration_note ?? t(locale, `billing.charge.kind.${charge.kind}`)
    const month =
      charge.period_year != null && charge.period_month != null
        ? monthLabel(charge.period_year, charge.period_month)
        : null
    return [base, month].filter(Boolean).join(' · ')
  }, [locale, monthLabel])

  const lines = useMemo(
    () => receiptLines(ask, debts, terms, labelOf),
    [ask, debts, terms, labelOf],
  )
  const chargeLines = lines.filter((line) => line.kind === 'charge')
  /** Six months of debt across three children is eighteen rows, and a wall of them is a
   *  worse answer to "what am I paying for" than a summary with a way in. */
  const [showAllLines, setShowAllLines] = useState(false)
  const collapsed = chargeLines.length > 5 && !showAllLines
  /** What each card payment comes to. `instalmentSplit` is integer arithmetic on agorot
   *  and puts the remainder on the FIRST payment, so the parts sum to the total exactly —
   *  which is why the copy names the first separately when it differs. */
  const split = useMemo(
    () => instalmentSplit(ask.totalAgorot, ask.instalments),
    [ask.totalAgorot, ask.instalments],
  )

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
        {/* ── what this payment comes to, and what it is made of ─────────────────
            The headline is the figure the BUTTON charges, and it moves with the method.

            It used to be the debt, frozen — a rule written after a screen showed ₪208.33
            above buttons offering ₪500, ₪750 and ₪3,000. That rule was protecting the
            reader from assembling a total out of two figures, and freezing the top number
            was one way to do it; showing the sum is the other, and it is the one that also
            answers "what am I paying for". The debt is still here, as a line INSIDE the
            arithmetic, where it cannot contradict the total above it. */}
        <section data-testid="pay-now" className={`${CARD} p-5`}>
          <p className="text-[13px] font-bold text-[#444650] dark:text-slate-400 text-center">
            {ask.totalAgorot > 0
              ? t(locale, 'billing.pay.nowTitle')
              : t(locale, 'billing.pay.clearTitle')}
          </p>
          <p
            data-testid="pay-now-amount"
            className={`mt-1 text-[38px] font-black tracking-tight tabular-nums text-center ${
              ask.totalAgorot > 0
                ? 'text-[#0A1938] dark:text-slate-50'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {/* `<bdi>` for the same reason `MoneyDisplay` wraps every figure: `₪208.33` in
                a right-to-left paragraph is free to reorder to `208.33₪`, and the fix for
                that — a `direction: ltr` wrapper — is what actually causes it. */}
            <bdi>{money(ask.totalAgorot)}</bdi>
          </p>

          {lines.length > 0 ? (
            <dl
              data-testid="pay-receipt"
              className="mt-4 pt-3 border-t border-[#dee2f4] dark:border-slate-800 flex flex-col gap-2"
            >
              {(collapsed ? chargeLines.slice(0, 5) : chargeLines).map((line) => (
                <div key={line.id} data-testid="pay-receipt-row" className="flex items-baseline justify-between gap-3">
                  <dt className="text-[13px] text-[#161b28] dark:text-slate-200 min-w-0">
                    {/* The child beside the label, not inside it — one carrier per fact. */}
                    {line.studentName ? (
                      <span className="text-[#444650] dark:text-slate-400">{line.studentName} · </span>
                    ) : null}
                    {line.label}
                  </dt>
                  <dd className="text-[13px] font-bold tabular-nums shrink-0 text-[#161b28] dark:text-slate-100">
                    <bdi>{money(line.amountAgorot)}</bdi>
                  </dd>
                </div>
              ))}
              {collapsed ? (
                <button
                  type="button"
                  data-testid="pay-receipt-show-all"
                  onClick={() => setShowAllLines(true)}
                  className="self-start bg-transparent border-0 p-0 text-[12px] font-bold text-[#0056c5] dark:text-blue-300 cursor-pointer hover:underline"
                >
                  {t(locale, 'billing.pay.showAll')}
                </button>
              ) : null}

              {lines
                .filter((line) => line.kind === 'forward')
                .map((line) => (
                  <div
                    key="forward"
                    data-testid="pay-receipt-forward"
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-[13px] text-[#161b28] dark:text-slate-200">
                      {plural(locale, 'billing.pay.forwardLine', line.months)}
                    </dt>
                    <dd className="text-[13px] font-bold tabular-nums shrink-0 text-[#161b28] dark:text-slate-100">
                      <bdi>{money(line.amountAgorot)}</bdi>
                    </dd>
                  </div>
                ))}

              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-[#dee2f4] dark:border-slate-800">
                <dt className="text-[13px] font-bold text-[#001849] dark:text-slate-100">
                  {t(locale, 'billing.pay.receiptTotal')}
                </dt>
                <dd
                  data-testid="pay-receipt-total"
                  className="text-[15px] font-black tabular-nums text-[#001849] dark:text-slate-100"
                >
                  <bdi>{money(ask.totalAgorot)}</bdi>
                </dd>
              </div>

              {lines
                .filter((line) => line.kind === 'remainder')
                .map((line) => (
                  // Without this the receipt is a complete-looking document that quietly
                  // omits money the family still owes.
                  <p
                    key="remainder"
                    data-testid="pay-remainder"
                    className="text-[12px] text-[#444650] dark:text-slate-400"
                  >
                    {fill(t(locale, 'billing.pay.remainder'), { total: money(line.amountAgorot) })}
                  </p>
                ))}
            </dl>
          ) : (
            <p className="mt-1 text-[12px] text-[#444650] dark:text-slate-400 text-center">
              {debt > 0 ? subtitle : t(locale, 'billing.pay.clearBody')}
            </p>
          )}

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
                const active = effectiveMonths === chip
                // The forward half of this chip — the part the ceiling is about. Debt is
                // never blocked: a family paid a year ahead who still owes an old month
                // must be able to clear it. Same predicate the server refuses on, so a
                // chip that is live here is one `refuse_past_ceiling` will accept.
                const blocked = monthsBlocked(chip)
                return (
                  <label
                    key={chip}
                    data-testid={`pay-months-${chip}`}
                    aria-disabled={blocked || undefined}
                    className={`rounded-xl py-2.5 text-center text-[15px] font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                      blocked
                        ? 'bg-[#f1f2f7] dark:bg-slate-900 text-[#a9aab4] dark:text-slate-600 cursor-not-allowed'
                        : active
                          ? 'bg-[#001849] text-white shadow-md cursor-pointer'
                          : 'bg-[#e9edff] dark:bg-slate-800 text-[#161b28] dark:text-slate-200 cursor-pointer'
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
                      disabled={blocked}
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

            {/* ── bug #16: how many payments. The card's second question, and the last
                one before the button. Below the months rather than beside them: "three
                months" and "three payments" are different things and a row of chips
                sharing a line would read as one control with two labels. */}
            <fieldset data-testid="pay-instalments" className="border-0 p-0 m-0 mt-1">
              <legend className="text-[15px] font-bold text-[#001849] dark:text-slate-100 px-1 mb-2.5">
                {t(locale, 'billing.pay.instalmentsTitle')}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {INSTALMENT_CHIPS.map((chip) => {
                  const active = instalments === chip
                  return (
                    <label
                      key={chip}
                      data-testid={`pay-instalments-${chip}`}
                      className={`cursor-pointer rounded-xl py-2.5 text-center text-[15px] font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                        active
                          ? 'bg-[#001849] text-white shadow-md'
                          : 'bg-[#e9edff] dark:bg-slate-800 text-[#161b28] dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pay-instalments"
                        // Same reason as the month chips above: a bare digit is an
                        // accessible name of "3", true of a page number and a price alike.
                        aria-label={plural(locale, 'billing.pay.instalments', chip)}
                        checked={active}
                        onChange={() => setInstalments(chip)}
                        className="sr-only"
                      />
                      <span className="tabular-nums">{chip}</span>
                    </label>
                  )
                })}
              </div>
              {ask.instalments > 1 ? (
                // Rule 2, applied to the split: the button states the whole charge, so
                // this states what one payment comes to rather than leaving a parent to
                // divide. `splitFirst` when the odd agora lands on the first — '3 of
                // ₪69.44' would be a penny short of ₪208.33, and quietly.
                <p
                  data-testid="pay-split-note"
                  className="mt-2 text-[12px] text-[#444650] dark:text-slate-400 px-1"
                >
                  {split.first === split.rest
                    ? fill(plural(locale, 'billing.pay.splitEqual', split.count), {
                        each: money(split.rest),
                      })
                    : fill(plural(locale, 'billing.pay.splitFirst', split.count - 1), {
                        first: money(split.first),
                        rest: money(split.rest),
                      })}
                </p>
              ) : null}
            </fieldset>
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
                {/* ── how many months forward. The club's number is where this STARTS.
                    It used to be the whole offer, so a family who wanted five months of
                    cash had no control on the screen to say so. */}
                {cashChips.length > 0 ? (
                  <fieldset data-testid="pay-cash-months" className="border-0 p-0 m-0 mb-1">
                    <legend className="text-[14px] font-bold text-[#001849] dark:text-slate-100 mb-2">
                      {t(locale, 'billing.pay.cashMonthsTitle')}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {cashChips.map((chip) => {
                        const active = chosenCashMonths === chip
                        return (
                          <label
                            key={chip}
                            data-testid={`pay-cash-months-${chip}`}
                            className={`cursor-pointer rounded-xl py-2 px-4 text-center text-[15px] font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                              active
                                ? 'bg-[#001849] text-white shadow-md'
                                : 'bg-[#e9edff] dark:bg-slate-800 text-[#161b28] dark:text-slate-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name="pay-cash-months"
                              // A bare digit is an accessible name of "3" — true of a page
                              // number and a price alike. This says what the digit counts.
                              aria-label={plural(locale, 'billing.pay.forwardLine', chip)}
                              checked={active}
                              onChange={() => setCashMonths(chip)}
                              className="sr-only"
                            />
                            <span className="tabular-nums">{chip}</span>
                          </label>
                        )
                      })}
                    </div>
                    {terms.cashMonths > 0 ? (
                      // Still naming the CLUB as the one who set the minimum. The screen
                      // stopped presenting the club's rule as the parent's choice, and it
                      // must not start again now that the parent has a choice beside it.
                      <p
                        data-testid="pay-cash-floor"
                        className="mt-2 text-[12px] text-[#444650] dark:text-slate-400"
                      >
                        {plural(locale, 'billing.pay.cashFloor', terms.cashMonths)}
                      </p>
                    ) : null}
                  </fieldset>
                ) : terms.monthlyTotalAgorot > 0 ? (
                  // Said out loud. Chips that are simply absent read as a screen that
                  // failed to load them.
                  <p
                    data-testid="pay-ceiling-reached"
                    className="text-[12px] text-[#444650] dark:text-slate-400 bg-[#e9edff] dark:bg-slate-800 rounded-xl p-2.5"
                  >
                    {t(locale, 'billing.pay.ceilingReached')}
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
