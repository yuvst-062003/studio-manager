import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * The tuition plan a student is on, small enough to sit in a table cell.
 *
 * A club prices by how often a child trains (C11), so the plan IS a frequency: `×3` for
 * three times a week, `∞` for an open membership. That is the whole content of the badge —
 * never an amount. `price_plan.sessions_per_week` is nullable and null MEANS unlimited,
 * which is why `perWeek` is `number | null` and why the two are drawn differently rather
 * than one being treated as a missing value.
 *
 * **`undefined` is a third state and is drawn.** A student with no plan is not being billed
 * at all, which is the one thing on this badge a manager needs to act on, so it renders as
 * a marked "no plan" rather than as nothing. A read that has not finished renders nothing —
 * `loading` says which of the two silences this is.
 *
 * **It carries no money and takes no amount**, deliberately. Invariant 3 forbids financial
 * fields on coach-scoped responses; the badge is manager-only at every call site, and
 * keeping the amount out of the component means a future coach-facing caller would be
 * wrong rather than dangerous.
 *
 * The digits are wrapped so an RTL row cannot reorder them — the same rule `RangeText`
 * exists for, applied to a one-number case.
 */
export function PlanBadge({
  locale,
  perWeek,
  loading = false,
}: {
  locale: Locale
  /** Sessions a week; `null` for an open membership; `undefined` when no plan is set. */
  perWeek: number | null | undefined
  /** The plan map has not arrived yet. Renders nothing rather than a wrong answer. */
  loading?: boolean
}) {
  if (loading) return null

  if (perWeek === undefined) {
    return (
      <span
        className="studio-plan-badge"
        data-plan="none"
        data-testid="plan-badge"
        title={t(locale, 'billing.plan.badge.noneTitle')}
      >
        {/* Written out, never a bare symbol: a mark whose only meaning is its shape is
            invisible to a screen reader and ambiguous to everyone else (SC 1.4.1). */}
        <span className="studio-visually-hidden">
          {t(locale, 'billing.plan.badge.noneTitle')}
        </span>
        <span aria-hidden="true">!</span>
      </span>
    )
  }

  const label =
    perWeek === null
      ? t(locale, 'billing.plan.unlimited')
      : t(locale, 'billing.plan.perWeek').replace('{{count}}', String(perWeek))

  return (
    <span
      className="studio-plan-badge"
      data-plan={perWeek === null ? 'open' : 'counted'}
      data-testid="plan-badge"
      title={label}
    >
      <span className="studio-visually-hidden">{label}</span>
      <span aria-hidden="true" dir="ltr">
        {perWeek === null ? '∞' : `×${perWeek}`}
      </span>
    </span>
  )
}
