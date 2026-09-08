// One plan, drawn the way the public landing page draws its pricing tiers.
//
// Owner decision, 2026-09-08: "basically the same plans as on the landing page — like they
// show it". So: an optional badge on the top edge, a name, a cadence line, a large price,
// a list of ticked features, and one action. `planCopy.ts` is where the words come from and
// carries the reasoning for the price-based join.
//
// ── B1: a plan is not described by a credit balance ───────────────────────────────────
//
// The old row rendered `weekly_extra_allowance` through `schedule.plan.remaining` —
// 'נותרו {{count}}' — so the 400 ₪ plan read "1 remaining" and the current 300 ₪ plan read
// "0 remaining", which is this week's spent allowance and not a property of the plan at
// all. `plan.remaining` keeps its meaning and stops being used here.
//
// ── B2: there is a word for a downgrade now ───────────────────────────────────────────
//
// The verb comes from the PRICE, which is how the server decides it too (`_is_upgrade`).
// `is_offered` goes back to meaning only what §5.1 says: a plan that would not raise this
// child's week keeps its reason line beside a button it still has.
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { planCopyFor } from '../planCopy'
import type { PlanOption } from '../trainingPlanClient'

export type PlanDirection = 'current' | 'upgrade' | 'downgrade' | 'choose'

/** Which way this plan moves the family, by price — the same comparison the server makes. */
export function directionOf(plan: PlanOption, currentAgorot: number | null): PlanDirection {
  if (plan.is_current) return 'current'
  if (currentAgorot === null) return 'choose'
  if (plan.monthly_amount_agorot > currentAgorot) return 'upgrade'
  return 'downgrade'
}

const ACTION_KEY: Record<PlanDirection, string> = {
  current: 'schedule.plan.current',
  upgrade: 'schedule.plan.upgrade',
  downgrade: 'schedule.plan.downgrade',
  choose: 'schedule.plan.choose',
}

export function PlanCard({
  plan,
  locale,
  currentAgorot,
  disabled = false,
  onChoose,
  footer,
}: {
  plan: PlanOption
  locale: Locale
  /** The plan the child is on now, in agorot, or `null` when they have none. */
  currentAgorot: number | null
  disabled?: boolean
  onChoose?: () => void
  /** The effect line, or the confirm step, rendered inside the card it belongs to. */
  footer?: ReactNode
}) {
  const copy = planCopyFor(plan, locale)
  const direction = directionOf(plan, currentAgorot)
  const isCurrent = direction === 'current'
  // The club's own recommended tier, inverted the way the landing page inverts it — but
  // never over the plan the family is already on, because "current" is the louder fact.
  const feature = copy.highlighted && !isCurrent

  return (
    <article
      data-testid={`plan-option-${plan.id}`}
      data-direction={direction}
      className={`relative rounded-3xl border p-4 pt-5 shadow-xs transition-colors ${
        feature
          ? 'bg-[#001849] dark:bg-blue-950 border-[#0056c5] text-white'
          : isCurrent
            ? 'bg-white dark:bg-slate-900 border-[#0056c5] dark:border-blue-500'
            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
      }`}
    >
      {copy.badge && !isCurrent ? (
        <span
          data-testid="plan-badge"
          className="absolute -top-2.5 start-4 px-3 py-0.5 rounded-full bg-[#ba1a1a] text-white text-[10px] font-bold shadow-md"
        >
          {copy.badge}
        </span>
      ) : null}

      <header className="text-start">
        <h3
          className={`text-lg font-bold leading-tight ${
            feature ? 'text-white' : 'text-slate-900 dark:text-slate-50'
          }`}
        >
          <bdi>{copy.title ?? plan.name}</bdi>
        </h3>
        <p
          data-testid="plan-cadence"
          className={`text-xs ${feature ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}
        >
          <bdi>{copy.cadence}</bdi>
        </p>
      </header>

      {/* Money never mirrors. `MoneyDisplay` wraps the amount in `<bdi>`; a `direction: ltr`
          wrapper or a transform would flip ₪300 to 300₪. The amount is the DATABASE's —
          `planCopy` never renders the landing page's own hardcoded price. */}
      <p className="flex items-baseline gap-1.5 mt-2 text-start">
        <span className={`text-3xl font-black ${feature ? 'text-white' : 'text-slate-900 dark:text-slate-50'}`}>
          <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
        </span>
        <span className={`text-xs ${feature ? 'text-blue-200' : 'text-slate-400'}`}>
          {t(locale, 'schedule.plan.monthly')}
        </span>
      </p>

      <ul className="mt-3 space-y-1.5 text-start">
        {copy.features.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${feature ? 'text-blue-300' : 'text-[#0056c5] dark:text-blue-400'}`}
              aria-hidden="true"
            />
            <span className={`text-xs ${feature ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}`}>
              <bdi>{line}</bdi>
            </span>
          </li>
        ))}
      </ul>

      {/* §5.1 — a plan that would not raise this child's week is SHOWN with its reason and
          keeps its button. A Group 1 parent who hears "400" in the hall and finds nothing
          in the app telephones the manager. */}
      {!plan.is_offered && !isCurrent ? (
        <p
          data-testid="plan-not-offered"
          className={`mt-2.5 text-[11px] ${feature ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {t(locale, 'schedule.plan.notOffered')}
        </p>
      ) : null}

      {isCurrent ? (
        <p
          data-testid="plan-current-chip"
          className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 text-[11px] font-bold"
        >
          {t(locale, 'schedule.plan.current')}
        </p>
      ) : (
        <button
          type="button"
          data-testid="plan-choose"
          disabled={disabled}
          onClick={onChoose}
          className={`mt-3 w-full rounded-xl py-2.5 text-xs font-bold transition-transform active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            feature
              ? 'bg-white text-[#001849]'
              : 'bg-[#0056c5] text-white'
          }`}
        >
          {t(locale, ACTION_KEY[direction])}
        </button>
      )}

      {footer}
    </article>
  )
}
