import { Bell } from 'lucide-react'

import { fill } from '@studio/core'
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
}: {
  /** The club's name. Replaces the prototype's hardcoded "מועדון ג׳ודו גלדיאטור". */
  clubName: string
  locale: Locale
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
          {/* No absence button here (owner, 2026-09-07). There were TWO reading
              "דיווח היעדרות" on this screen and they did different things: this one opened
              `#/absence` — one child, one session, picked from scratch — while the floating
              one opens the range sheet that was built to replace it, because a fortnight
              away was thirty trips through the single-session form. Two buttons with the
              same words and different behaviour is worse than either alone, and the single
              case is already better served by `נעדר/ת?` on the lesson card itself, where
              the lesson is in front of you. `#/absence` stays reachable from the calendar
              (`ChildCalendar`'s `calendar-absence`). */}

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

      {/* Trainee Filter Chips Strip */}
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
    </header>
  )
}
