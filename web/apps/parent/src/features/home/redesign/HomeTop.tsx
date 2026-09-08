import { Bell, Ticket } from 'lucide-react'

import { fill, formatAgorot } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { HomeChild } from './types'

export function HomeTop({
  clubName,
  locale,
  familyName,
  childList,
  selectedChildId,
  onSelectChild,
  onOpenNotifications,
  plan = null,
}: {
  /** The club's name. Replaces the prototype's hardcoded "מועדון ג׳ודו גלדיאטור". */
  clubName: string
  locale: Locale
  /** The selected child's plan, or `null` when there is none to show — a `lead`, a child a
   *  manager has not priced, or a failed read. Optional so a mount that predates the pill
   *  still renders a header. */
  plan?: HomePlan | null
  /** The guardian's surname, or null. When null the greeting is `schedule.home.greeting` alone —
   *  the prototype's "עונת תשפ״ה (2025/26)" season suffix has no source in this app and
   *  must NOT be rendered or invented. */
  familyName: string | null
  childList: readonly HomeChild[]
  /** null means "all children" — the prototype's 'all' sentinel. */
  selectedChildId: string | null
  onSelectChild: (id: string | null) => void
  onOpenNotifications: () => void
}) {
  const greeting = familyName ? fill(t(locale, 'schedule.home.greetingFamily'), { name: familyName }) : t(locale, 'schedule.home.greeting')



  return (
    <header className="p-4 pt-6 space-y-3">
      {/* Top Header Bar with Club Title, Absence Button & Notification Bell */}
      <div data-purpose="home-header-bar" className="flex items-center justify-between pb-0.5">
        <div className="text-start">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse"></span>
            <h1 data-testid="home-club-name" className="text-xl font-black text-[#0A1938] dark:text-slate-50 tracking-tight">
              {clubName}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{greeting}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* ── The plan, beside the bell ───────────────────────────────────────────────
           *
           * D1/D3 — home said nothing about the plan, and the plan screen had ONE link in
           * the whole signed-in app: profile tab → המתאמנים שלי sheet → the child's card →
           * the מסלול row. Three taps, on the screen a parent goes to in order to change
           * their own phone number. The upgrade offer §5.1 computes is the club's main
           * upsell.
           *
           * **A control in the header, not a card under it (owner, 2026-09-08.)** It was a
           * full-width row of its own — "the current plan should be an icon next to the
           * bell, not a full button". Two rules survive that move and shape what is left:
           * it still reads AT REST, because a bare glyph answers "what am I on?" only after
           * you have already asked it; and it still never invents a number, so a family
           * with several children and none chosen shows no amount at all.
           *
           * So the compact form keeps the PRICE and drops the caption and the chevron — the
           * price is the fact a parent recognises their plan by, and the caption said only
           * that a plan is a plan.
           *
           * D2 — it cannot come from a read home already makes. `StudentSummaryOut` omits
           * `price_plan_id` on purpose: that shape is the coach-reachable roster row, and
           * invariant 3 keeps the price off it. `GET /me/training-plans` is the
           * parent-scoped read, and `Resolve` fetches it with everything else so home keeps
           * its rule of not fetching.
           */}
          {plan ? <PlanPill locale={locale} plan={plan} /> : null}

          {/* No absence button here (owner, 2026-09-07). There were TWO reading
              "דיווח היעדרות" on this screen and they did different things: this one opened
              `#/absence` — one child, one session, picked from scratch — while the floating
              one opens the range sheet that was built to replace it, because a fortnight
              away was thirty trips through the single-session form. Two buttons with the
              same words and different behaviour is worse than either alone, and the single
              case is already better served by `נעדר/ת?` on the lesson card itself, where
              the lesson is in front of you. `#/absence` and the calendar that was its last
              link are both gone since 2026-09-08 — the range sheet and the lesson card are
              now the only two ways to report an absence, which is the point. */}

          {/* A way into עדכונים, and NOT a second unread indicator (owner, 2026-09-07).
              The red count and the ringing-bell state were removed: the tab bar already
              badges עדכונים, and two counts for one inbox means two things to keep in
              agreement and two places a stale number can sit. The tab badge is the one the
              parent sees from every screen, so it is the one that stays. */}
          <button
            type="button"
            data-testid="home-notifications"
            onClick={onOpenNotifications}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer group"
            title={t(locale, 'schedule.home.notificationsTitle')}
            aria-label={t(locale, 'schedule.home.notificationsLabel')}
          >
            <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </div>

      {/* No urgent banner (owner, 2026-09-07). It said "דרוש טיפול דחוף בהרשמה" over an
          outstanding balance or a missing declaration — neither of which is urgent in the
          sense a red alarm claims, and both of which already reach the family through
          עדכונים, which is a tab with its own badge. A permanent red block on the screen a
          parent opens to see when their child trains is an alarm that stops being read. */}

      {/* Owner-reported 2026-09-07: with ONE child this strip offered "כל הילדים 1" beside
          that child's own name — two chips selecting the identical single trainee, and a
          filter that can only ever filter to everything. Drawn only when there is more
          than one child to choose between. */}
      {childList.length > 1 ? (
      <div
        role="group"
        aria-label={t(locale, 'schedule.home.allChildren')}
        data-purpose="trainee-filters"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      >
        {/* All Children */}
        <button
          type="button"
          data-testid="home-chip-all"
          aria-pressed={selectedChildId === null}
          onClick={() => onSelectChild(null)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
            selectedChildId === null
              ? 'bg-[#001849] text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>{t(locale, 'schedule.home.allChildren')}</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
              selectedChildId === null ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {childList.length}
          </span>
        </button>

        {childList.map((child) => {
          const isActive = selectedChildId === child.id
          return (
            <button
              key={child.id}
              type="button"
              data-testid={`home-chip-${child.id}`}
              aria-pressed={isActive}
              onClick={() => onSelectChild(child.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#001849] text-white font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 font-medium hover:bg-slate-50'
              }`}
            >
              <span>{child.beltName ? `${child.firstName} (${child.beltName})` : child.firstName}</span>
              {child.beltColorHex !== null && (
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: child.beltColorHex }}
                ></span>
              )}
            </button>
          )
        })}
      </div>
      ) : null}
    </header>
  )
}

/** One child's plan, as home shows it. Every field nullable where the fact can be absent:
 *  a `lead` has no plan, and a pill drawn from an invented one is worse than no pill. */
export type HomePlan = {
  studentId: string | null
  planName: string | null
  monthlyAgorot: number | null
  /** Several children and none selected. The pill then names no amount and opens a
   *  chooser: summing two children's prices into one number would be a figure the club
   *  does not charge, and silently picking the first is a lie about whose plan it is. */
  isFamilyWide: boolean
}

function PlanPill({ locale, plan }: { locale: Locale; plan: HomePlan }) {
  /** The full sentence, and the control's accessible name. Unabbreviated: the visible face
   *  is a price, and a price alone does not say it is a plan. */
  const label = plan.isFamilyWide
    ? t(locale, 'schedule.plan.familyPill')
    : [plan.planName, plan.monthlyAgorot === null ? null : formatAgorot(plan.monthlyAgorot)]
        .filter(Boolean)
        .join(' · ')

  /**
   * What is drawn, which is deliberately less than what is said.
   *
   * The price, when there is one — it is what a parent recognises their own plan by, and it
   * fits beside a bell where "פעמיים בשבוע · ₪300" does not. `null` where no single price
   * is TRUE: a family with several children and none selected would need a sum the club
   * never charges, so the glyph stands alone and the name carries the rest.
   */
  const face =
    plan.isFamilyWide || plan.monthlyAgorot === null ? null : formatAgorot(plan.monthlyAgorot)

  return (
    <a
      href={plan.isFamilyWide || plan.studentId === null ? '#/profile' : `#/plan/${plan.studentId}`}
      data-testid="home-plan-pill"
      // Matches the bell's own shape so the two read as one cluster of controls rather than
      // a control and a leftover: same radius, same border, same surface, same press.
      title={label}
      aria-label={`${t(locale, 'schedule.plan.title')}: ${label}`}
      className="flex items-center gap-1.5 ps-2 pe-2.5 py-2.5 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer text-[#0056c5] dark:text-blue-300"
    >
      <Ticket className="w-5 h-5 shrink-0" aria-hidden="true" />
      {face === null ? null : (
        <span
          data-testid="home-plan-pill-amount"
          className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-50"
          aria-hidden="true"
        >
          <bdi>{face}</bdi>
        </span>
      )}
    </a>
  )
}
