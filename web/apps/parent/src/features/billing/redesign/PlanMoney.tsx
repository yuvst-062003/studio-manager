// What happens to the money when a parent picks a new plan.
//
// **C1 — the defect.** The confirm step asked <span>איך תרצו לשלם?</span> and offered two
// answers. "I already paid" raised a promise for a manager. "I'll pay through the app" —
// the default — recorded the change and answered "the manager will contact you about
// payment". The app's answer to *I will pay through the app* was a promise that somebody
// would telephone.
//
// It now names the family's OWN route, from `student.payment_method`, and does what that
// route actually needs. Nothing here is a third payment path: `createOrder` + `orderForm`
// + `PaymentOverlay` is the pair `ClubShop` and `ParentPayments` already open uPay with,
// and `createPromise` is the same call that raises a cash promise.
//
// ── The order of operations, and why it is not the obvious one ────────────────────────
//
// Record the change FIRST, then re-read the terms, then offer the chips.
//
// `refuse_past_ceiling` prices `credit_after = credit + prepay_months × monthly_total` from
// the PAYER's monthly total. A client that priced its chips off the chosen plan's amount
// would offer a chip meaning different money from the one the server checks — the
// disagreement at the boundary the payments spec §5.1 exists to prevent. After the change
// is recorded an upgrade has already moved `price_plan_id`, so the re-read carries the new
// total; a downgrade has not, and the months being bought are genuinely still at today's
// price. Either way the two sides agree by construction rather than by arithmetic done
// twice.
//
// The standing-order link is read after the change for the same reason and one more:
// `GET /me/standing-order-links` answers for the plan a child points at NOW, so a DOWNGRADE
// would hand over the link for the plan being left. `?plan_id=` names the plan being moved
// to.
import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { MoneyDisplay } from '@studio/ui'
import { apiFetch, formatAgorot, formatMonthLabel } from '@studio/core'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cashMonthChips, prepayHeadroomMonths } from './pay'
import type { PlanOption } from '../trainingPlanClient'

/** `student.payment_method`'s vocabulary — `payment.method`'s, not the promise's. */
export type PaymentMethod = 'upay_card' | 'cash' | 'cheque' | 'standing_order'

const METHOD_LABEL: Record<PaymentMethod, string> = {
  upay_card: 'billing.method.card',
  cash: 'billing.method.cash',
  cheque: 'billing.method.cheque',
  standing_order: 'billing.method.standingOrder',
}

const ALL_METHODS: readonly PaymentMethod[] = ['upay_card', 'cash', 'cheque', 'standing_order']

/** What the route step needs once the change is recorded. Read together, so the screen
 *  never renders half a route. */
export type MoneyContext = {
  /** The payer's OWN monthly total, re-read after the change — see the header. */
  monthlyTotalAgorot: number
  /** The club's `cash_prepay_months`. A minimum, never the whole offer. */
  cashFloorMonths: number
  creditAgorot: number
  openChargeIds: readonly string[]
  /** The new plan's mandate link, or `null` when the club has set none for it. */
  mandateUrl: string | null
}

export async function readMoneyContext(planId: string, studentId: string): Promise<MoneyContext> {
  const [termsRes, balanceRes, chargesRes, linksRes] = await Promise.all([
    apiFetch('/api/v1/me/prepay-terms'),
    apiFetch('/api/v1/me/balance'),
    apiFetch('/api/v1/me/charges?status=open'),
    apiFetch(`/api/v1/me/standing-order-links?plan_id=${planId}&student_id=${studentId}`),
  ])
  const terms = termsRes.ok
    ? ((await termsRes.json()) as { cash_prepay_months: number; monthly_total_agorot: number })
    : { cash_prepay_months: 0, monthly_total_agorot: 0 }
  const balance = balanceRes.ok
    ? ((await balanceRes.json()) as { credit_agorot?: number })
    : { credit_agorot: 0 }
  const charges = chargesRes.ok
    ? ((await chargesRes.json()) as { items: { id: string }[] })
    : { items: [] }
  const links = linksRes.ok
    ? ((await linksRes.json()) as { items: { url: string }[] })
    : { items: [] }
  return {
    monthlyTotalAgorot: terms.monthly_total_agorot,
    cashFloorMonths: terms.cash_prepay_months,
    creditAgorot: balance.credit_agorot ?? 0,
    openChargeIds: charges.items.map((row) => row.id),
    mandateUrl: links.items[0]?.url ?? null,
  }
}

/** The month the family is already covered to, for the zero-headroom sentence. */
function coveredThrough(creditAgorot: number, monthlyAgorot: number, locale: Locale): string {
  const months = monthlyAgorot > 0 ? Math.floor(creditAgorot / monthlyAgorot) : 0
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + months, 1)
  return formatMonthLabel(target.getFullYear(), target.getMonth() + 1, locale)
}

export function PlanMoney({
  plan,
  locale,
  method,
  context,
  busy,
  onPickMethod,
  onPayCard,
  onPromise,
  onDone,
}: {
  plan: PlanOption
  locale: Locale
  /** `null` for a family who has never been asked. They pick here rather than being sent
   *  to another tab mid-decision — which is how a plan change gets abandoned. */
  method: PaymentMethod | null
  context: MoneyContext | null
  busy: boolean
  onPickMethod: (next: PaymentMethod) => void
  onPayCard: () => void
  onPromise: (method: 'cash' | 'cheque', prepayMonths: number) => void
  onDone: () => void
}) {
  /** What the parent actually pressed, or `null` while they have pressed nothing. */
  const [picked, setPicked] = useState<number | null>(null)

  const chips = useMemo(() => {
    if (context === null) return [] as readonly number[]
    const headroom = prepayHeadroomMonths(context.creditAgorot, context.monthlyTotalAgorot)
    return cashMonthChips(context.cashFloorMonths, headroom)
  }, [context])

  // DERIVED, not synced. The default is the first chip — the club's floor, which is the
  // answer most families give — and it falls out of the same expression that renders the
  // row rather than out of an effect that writes state back into React. An effect here
  // would cascade a render on every arrival of `chips`, which is what
  // `react-hooks/set-state-in-effect` refuses and what the rule is right about: there is no
  // external system to synchronise with, only a default.
  const months = picked ?? chips[0] ?? null

  if (method === null) {
    return (
      <div data-testid="plan-method-picker" className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-start">
        <p className="text-xs font-bold text-slate-900 dark:text-slate-50 mb-2">
          {t(locale, 'schedule.plan.route.pickMethod')}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_METHODS.map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`plan-method-${option}`}
              onClick={() => onPickMethod(option)}
              className="py-2 px-2 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t(locale, METHOD_LABEL[option])}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="plan-money"
      data-method={method}
      className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-start space-y-2"
    >
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {fill(t(locale, 'schedule.plan.route.heading'), {
          method: t(locale, METHOD_LABEL[method]),
        })}
      </p>

      {/* ── אשראי ────────────────────────────────────────────────────────────────────
          There is no proration by design: an upgrade opens the sessions now and the new
          amount is raised by the monthly run on the 1st. So in the ordinary case there is
          nothing to charge today, and a uPay order for zero agorot is a dead end at the
          provider — the screen says so instead of opening one. */}
      {method === 'upay_card' ? (
        context !== null && context.openChargeIds.length > 0 ? (
          <button
            type="button"
            data-testid="plan-pay-card"
            disabled={busy}
            onClick={onPayCard}
            className="w-full rounded-xl py-2.5 text-xs font-bold bg-[#0056c5] text-white active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
          >
            {t(locale, 'schedule.plan.route.cardPay')}
          </button>
        ) : (
          <p data-testid="plan-card-nothing-due" className="text-xs text-slate-600 dark:text-slate-300">
            {t(locale, 'schedule.plan.route.cardNothingDue')}
          </p>
        )
      ) : null}

      {/* ── מזומן ────────────────────────────────────────────────────────────────────
          The club's floor is a MINIMUM and the twelve-month ceiling beats it: a family two
          months from the cap and a club that collects three at a time is offered two. At
          zero headroom the forward offer disappears and the sentence says why. */}
      {method === 'cash' && context !== null ? (
        chips.length === 0 ? (
          <p data-testid="plan-cash-no-headroom" className="text-xs text-slate-600 dark:text-slate-300">
            {fill(t(locale, 'schedule.plan.route.cashNoHeadroom'), {
              month: coveredThrough(context.creditAgorot, context.monthlyTotalAgorot, locale),
            })}
          </p>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-900 dark:text-slate-50">
              {t(locale, 'schedule.plan.route.cashMonths')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((count) => (
                <button
                  key={count}
                  type="button"
                  data-testid={`plan-cash-months-${count}`}
                  aria-pressed={months === count}
                  onClick={() => setPicked(count)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                    months === count
                      ? 'bg-[#0056c5] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {fill(t(locale, 'schedule.plan.route.cashMonthsChip'), { count: String(count) })}
                  {' · '}
                  <bdi>{formatAgorot(count * plan.monthly_amount_agorot)}</bdi>
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="plan-cash-send"
              disabled={busy || months === null}
              onClick={() => onPromise('cash', months ?? 0)}
              className="w-full rounded-xl py-2.5 text-xs font-bold bg-[#0056c5] text-white active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
            >
              {t(locale, 'schedule.plan.route.cashSend')}
            </button>
          </>
        )
      ) : null}

      {/* ── הוראת קבע ────────────────────────────────────────────────────────────────
          C2 — the defect that costs the club money silently. `standing_order_link_url`
          hangs off the PRICE PLAN and a uPay shared link charges a fixed amount, so a plan
          change makes the signed mandate the wrong mandate, and G8 says the provider
          cannot cancel it for us. Only the payer can cancel one at their own bank, so the
          parent is told — and `PlanChange.settlement_status` stays `pending`, so the
          manager's queue remains the backstop for a family that does not. */}
      {method === 'standing_order' ? (
        <div data-testid="plan-mandate" className="space-y-2">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-50">
            {t(locale, 'schedule.plan.route.mandateTitle')}
          </p>
          <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <span className="font-bold text-[#0056c5] dark:text-blue-300">①</span>
              <span className="min-w-0">
                {t(locale, 'schedule.plan.route.mandateStepOne')}{' '}
                <bdi className="font-bold">
                  <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
                </bdi>
                {context?.mandateUrl ? (
                  <a
                    href={context.mandateUrl}
                    data-testid="plan-mandate-link"
                    // Without a target, following it navigates the app away to a third
                    // party's page and the family loses the app.
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 ms-2 font-bold text-[#0056c5] dark:text-blue-300 cursor-pointer"
                  >
                    {t(locale, 'schedule.plan.route.mandateLink')}
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span data-testid="plan-mandate-missing" className="block text-[11px] text-slate-500 mt-1">
                    {t(locale, 'schedule.plan.route.mandateMissing')}
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-[#ba1a1a]">②</span>
              <span className="min-w-0">
                {fill(t(locale, 'schedule.plan.route.mandateStepTwo'), {
                  amount:
                    context && context.monthlyTotalAgorot > 0
                      ? formatAgorot(context.monthlyTotalAgorot)
                      : '',
                })}
                <span className="block text-[11px] font-bold text-[#ba1a1a] dark:text-red-300 mt-0.5">
                  {t(locale, 'schedule.plan.route.mandateWarning')}
                </span>
              </span>
            </li>
          </ol>
          <button
            type="button"
            data-testid="plan-mandate-done"
            onClick={onDone}
            className="w-full rounded-xl py-2.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {t(locale, 'schedule.plan.route.done')}
          </button>
        </div>
      ) : null}

      {/* ── צ׳קים ────────────────────────────────────────────────────────────────────
          A season, handed over once, for the FAMILY rather than for one child. Same
          promise row and the same manager decision as cash. */}
      {method === 'cheque' && context !== null ? (
        <button
          type="button"
          data-testid="plan-cheque-send"
          disabled={busy}
          onClick={() => onPromise('cheque', Math.max(context.cashFloorMonths, 0))}
          className="w-full rounded-xl py-2.5 text-xs font-bold bg-[#0056c5] text-white active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
        >
          {t(locale, 'schedule.plan.route.chequeSend')}
        </button>
      ) : null}
    </div>
  )
}
