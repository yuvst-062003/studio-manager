// The four doors that used to live in the account tab (owner, 2026-10-13).
//
// **Why they moved.** אירועים ותחרויות, לוח חודשי, אילוצים וזמינות and התקנת האפליקציה sat
// under "מערכת והעדפות" on the settings screen, because the account tab was the only list
// of rows this app had and a screen with no door is unreachable. None of them is a setting:
// three are the schedule seen at other ranges — the month instead of the day, the events in
// it, the days a coach cannot teach — and the fourth is how the app gets onto a phone.
//
// They hang off the schedule tab now, under the day it already shows. Nothing is deleted
// and every route is unchanged; what changes is which list they are the bottom of.
import { CalendarDays, CalendarX, ChevronLeft, Smartphone, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The account screen's own row tiles, kept identical on purpose: a row that looks like a
 *  settings row on one screen and something else on another is two idioms for one thing. */
const TILE_HUE = {
  amber: 'bg-[var(--pending-tint)] text-[var(--pending)]',
  blue: 'bg-[var(--emphasis-tint)] text-[var(--emphasis)]',
  indigo: 'bg-[var(--emphasis-tint)] text-[var(--emphasis)]',
  rose: 'bg-[var(--danger-tint)] text-[var(--danger)]',
} as const

function Row({
  href,
  icon: Icon,
  hue,
  title,
  subtitle,
}: {
  href: string
  icon: LucideIcon
  hue: keyof typeof TILE_HUE
  title: string
  subtitle: string
}) {
  return (
    <a
      href={href}
      className="p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--surface)] active:bg-[var(--disabled-surface)] transition-colors"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${TILE_HUE[hue]}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start text-start min-w-0">
          <span className="font-bold text-[var(--fg)] truncate">{title}</span>
          <span className="text-[11px] text-[var(--text-muted)] truncate">{subtitle}</span>
        </span>
      </span>
      {/* ChevronLeft, not Right: in a right-to-left document "onward" points left. */}
      <ChevronLeft className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
    </a>
  )
}

export function ScheduleTools({ locale }: { locale: Locale }) {
  return (
    <section
      aria-labelledby="schedule-tools-title"
      data-testid="schedule-tools"
      className="tw-scope flex flex-col gap-2 px-4 pb-8 pt-2"
    >
      <h2
        id="schedule-tools-title"
        className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-wide m-0"
      >
        {t(locale, 'schedule.tools.title')}
      </h2>
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--border)] shadow-xs divide-y divide-[var(--border)] overflow-hidden text-xs">
        {/* §4.7 (checkpoint C11) — the month calendar. Every staff role: reading it is open
            to any coach (decision 7), and the editing decisions 8/9 gate inside the screen
            itself, per session, not at this door. */}
        <Row
          href="#/calendar"
          icon={CalendarDays}
          hue="indigo"
          title={t(locale, 'schedule.staffCalendar.account.title')}
          subtitle={t(locale, 'schedule.staffCalendar.account.subtitle')}
        />
        {/* §4.8 / §6.1 (checkpoint C10) — filing, withdrawing and reading a coach's own
            unavailability. Not manager-gated: it is the coach filing against themself. */}
        <Row
          href="#/constraints"
          icon={CalendarX}
          hue="rose"
          title={t(locale, 'schedule.constraint.account.title')}
          subtitle={t(locale, 'schedule.constraint.account.subtitle')}
        />
        {/* Decision #4 of the redesign spec folds events into the session list, later.
            Until that lands this is the one reachable door to the events screen and its
            exam-results/roster sub-routes. */}
        <Row
          href="#/events"
          icon={Trophy}
          hue="amber"
          title={t(locale, 'events.title')}
          subtitle={t(locale, 'events.list.subtitle')}
        />
        <Row
          href="#/install"
          icon={Smartphone}
          hue="blue"
          title={t(locale, 'common.install.title')}
          subtitle={t(locale, 'common.install.why')}
        />
      </div>
    </section>
  )
}
