import { Bell, Plus } from 'lucide-react'

import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { HomeChild, HomeUrgent } from './types'

export function HomeTop({
  clubName,
  locale,
  familyName,
  childList,
  selectedChildId,
  onSelectChild,
  urgent,
  debtLabel,
  onUrgentAction,
  onReportAbsence,
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
  urgent: HomeUrgent
  /** urgent.debtAgorot already formatted as money by the caller, e.g. "₪320". null when
   *  there is no debt. Never divide agorot in this file. */
  debtLabel: string | null
  onUrgentAction: () => void
  onReportAbsence: () => void
  onOpenNotifications: () => void
}) {
  const greeting = familyName ? fill(t(locale, 'schedule.home.greetingFamily'), { name: familyName }) : t(locale, 'schedule.home.greeting')

  const debtPart = debtLabel !== null ? fill(t(locale, 'schedule.home.urgentDebt'), { amount: debtLabel }) : null
  const healthCount = urgent.childrenNeedingDeclaration.length
  const healthPart =
    healthCount === 1
      ? fill(t(locale, 'schedule.home.urgentHealthOne'), { name: urgent.childrenNeedingDeclaration[0] ?? '' })
      : healthCount >= 2
        ? fill(t(locale, 'schedule.home.urgentHealthMany'), { count: healthCount })
        : null
  const urgentDetail = [debtPart, healthPart]
    .filter((part): part is string => part !== null)
    .join(t(locale, 'schedule.home.urgentSeparator'))

  // Decided by what the banner can actually SAY, not by what the caller knows. Keying this
  // off `urgent.debtAgorot` — which is what it first did — let a family with a debt and no
  // formatted label render a red banner whose detail line was empty: an alarm with no
  // reason in it, which is worse than no alarm.
  const isUrgent = urgentDetail !== ''


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
          {/* Report Absence Button */}
          <button
            type="button"
            data-testid="home-report-absence"
            onClick={onReportAbsence}
            className="flex items-center gap-1.5 bg-[#0A1938] hover:bg-[#152a55] text-white text-xs font-bold px-3 py-2 rounded-2xl shadow-xs active:scale-95 transition-all cursor-pointer"
            title={t(locale, 'schedule.home.reportAbsence')}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>{t(locale, 'schedule.home.reportAbsence')}</span>
          </button>

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

      {/* Urgent Action Banner */}
      {isUrgent && (
        <div
          data-testid="home-urgent-banner"
          data-purpose="urgent-alert"
          className="bg-[#ffdad6] text-slate-900 rounded-3xl p-4 shadow-xs flex items-center justify-between gap-3 border border-red-200/70 transition-all duration-200"
        >
          {/* Action CTA Button */}
          <button
            type="button"
            data-testid="home-urgent-cta"
            onClick={onUrgentAction}
            className="bg-[#ba1a1a] text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs hover:bg-red-800 active:scale-95 transition-transform shrink-0 cursor-pointer"
          >
            {t(locale, 'schedule.home.urgentCta')}
          </button>

          {/* Alert Content */}
          <div className="text-start flex-1">
            <div className="flex items-center justify-end gap-1.5 font-bold text-[#ba1a1a] text-sm">
              <span>{t(locale, 'schedule.home.urgentTitle')}</span>
              <span className="inline-flex items-center justify-center w-5 h-5 bg-[#ba1a1a] text-white rounded-full text-xs font-bold">
                !
              </span>
            </div>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-tight mt-1 font-normal">{urgentDetail}</p>
          </div>
        </div>
      )}

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
