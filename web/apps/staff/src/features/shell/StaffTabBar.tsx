// Ported from the prototype's `src/components/BottomNav.tsx`, class for class — the same
// port ParentTabBar's own header describes for the parent app, applied to the staff app's
// five tabs (§3 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md).
//
// This replaces the staff app's old `@studio/ui` `TabBar` (schedule · students · events ·
// עוד) and the drawer עוד used to open. Every drawer entry has a new home; §3's table lists
// where. The drawer itself is gone — five tabs, no side menu, same move the parent app made.
//
// FOUR KNOWING DEVIATIONS from the prototype. The first three are the exact three
// ParentTabBar already made from ITS prototype, for the same reasons — a faithful port
// fixes a defect the source has for being a prototype rather than copying the defect too:
//
//   1. LINKS, NOT BUTTONS. The prototype holds the active tab in `useState` and swaps a
//      screen via `onTabChange`; this app routes on `location.hash`, so a tab is an
//      `<a href>`. That is what makes the back button, open-in-new-tab and a deep link
//      work.
//
//   2. LOGICAL PROPERTIES. The tasks badge sits at `-top-1.5 -right-2` in the prototype,
//      which in an RTL document is the wrong corner by accident. `-end-2` puts it on the
//      inline end in both directions, per .claude/rules/ui-rtl-a11y.md.
//
//   3. THE COUNT IS IN THE ACCESSIBLE NAME. The prototype's badge is a bare numeral beside
//      an icon, with nothing tying the two together for a screen reader. `aria-label`
//      carries "משימות 3" explicitly and the mark itself is `aria-hidden`.
//
//   4. A CAP AT 99. Same reasoning as ParentTabBar's updates badge: an integer with no
//      ceiling eventually pushes the label out of its slot. `99+` past that.
//
// THE FIFTH DEVIATION IS STRUCTURAL, NOT COSMETIC: the prototype gives the bar's ambient
// text colour to the `<nav>` itself (`text-slate-500` normally, `text-slate-400` when the
// timer tab is active) and lets every IDLE tab inherit it rather than setting its own colour
// — only the ACTIVE tab overrides with its own ink. That cascade is kept here rather than
// flattened into a lookup table per tab, because it is what makes deviation below correct
// for free: an idle tab in the dark bar is never coded separately, it just inherits.
//
// THE BAR'S OWN CHROME INVERSION. §3: "the bar turns dark when the timer tab is open,
// following that screen's inversion. It is the only tab whose selection changes chrome
// outside its own view." So this is driven off `active === 'timer'` directly and takes no
// separate boolean — there is no state in which the bar is dark and the timer tab is not
// the active one, and a second prop would only be a second place for that to go out of sync
// with the first.
//
// THE HOME INDICATOR'S CLEARANCE. Same physics as ParentTabBar's own note: on every iPhone
// since the X the bottom 34px of the screen belong to the home indicator, and a bar pinned
// to `bottom-0` draws its labels underneath it. The prototype handles this with
// `style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}` — a `max`, not an
// add, so on a device with a tall inset the bar's OWN padding vanishes entirely and the
// labels sit flush against the inset's edge. ParentTabBar's `pb-[calc(...)]` form is used
// here instead, deliberately not the prototype's: the inset is additional space the bar
// must clear, not a substitute for the padding it already wanted, and the `calc` form is
// what StaffShell's own clearance below multiplies out from — one shape at both sites.
// `index.html` already asks for the room with `viewport-fit=cover`; without that, `env()`
// is always 0 and this reads as a no-op.
//
// No `dark:` variant anywhere in this file. The downloaded prototype carries zero
// occurrences of it across its whole `src/` tree — this bar's only chrome inversion is the
// timer one above, not the app's light/dark theme preference. tailwind.css's own note about
// the timer screen's dark surface is about the TIMER SCREEN's content, built separately from
// this bar.
import { Calendar, CheckSquare, Settings, Timer, Users } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type StaffTab = 'schedule' | 'students' | 'timer' | 'tasks' | 'account'

/** Where each tab points. The hashes are the app's existing or newly-reserved routes —
 *  §3's table — not routes invented here. */
const HREF: Record<StaffTab, string> = {
  schedule: '#/schedule',
  students: '#/students',
  timer: '#/timer',
  tasks: '#/tasks',
  account: '#/account',
}

/** The prototype's own per-tab active inks, kept as written: three different colours
 *  (blue, emerald, blue again) rather than one unified active colour. A port that
 *  "tidies" them into one is a port that stopped being a comparison. */
const ACTIVE_INK: Record<StaffTab, string> = {
  schedule: 'text-blue-600',
  students: 'text-emerald-600',
  // Only ever rendered while the bar itself is dark — see the module note above.
  timer: 'text-blue-400',
  tasks: 'text-emerald-600',
  account: 'text-blue-600',
}

const LABEL_KEY: Record<StaffTab, string> = {
  schedule: 'common.tabs.staffSchedule',
  students: 'common.tabs.staffStudents',
  timer: 'common.tabs.staffTimer',
  tasks: 'common.tabs.staffTasks',
  account: 'common.tabs.staffAccount',
}

const ICONS = {
  schedule: Calendar,
  students: Users,
  timer: Timer,
  tasks: CheckSquare,
  account: Settings,
} as const

const ORDER: readonly StaffTab[] = ['schedule', 'students', 'timer', 'tasks', 'account']

/** Deviation 4. `99+` past the cap, so the one slot that can grow does not squeeze the
 *  other four. */
function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function StaffTabBar({
  active,
  locale,
  tasksBadgeCount = 0,
}: {
  active: StaffTab | null
  locale: Locale
  /** Open tasks. `0` renders nothing — an empty list is not a notification, and a badge
   *  permanently showing zero stops meaning anything. */
  tasksBadgeCount?: number
}) {
  const isTimerActive = active === 'timer'

  return (
    <nav
      aria-label={t(locale, 'common.tabs.staffBarLabel')}
      data-testid="tab-bar"
      // The ambient colour idle tabs inherit — see the module note's structural
      // deviation. `transition-colors` covers the swap when the coach opens or leaves
      // the timer.
      className={`tw-scope fixed inset-x-0 bottom-0 mx-auto max-w-md z-40 border-t shadow-2xl transition-colors duration-300 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] px-2 ${
        isTimerActive
          ? // Follows the THEME now (owner, 2026-09-07), like the timer screen it matches.
            // It used to be unconditionally dark, so a coach on the light theme got a black
            // bar under a screen that is no longer black.
            'bg-white/95 border-slate-200 text-slate-500 dark:bg-[#090d16]/95 dark:border-slate-800 dark:text-slate-400'
          : 'bg-white border-slate-200 text-slate-500'
      }`}
    >
      <div className="flex h-16 items-center justify-around">
        {ORDER.map((tab) => {
          const isActive = active === tab
          const Glyph = ICONS[tab]
          const badge = tab === 'tasks' ? tasksBadgeCount : 0
          const label = t(locale, LABEL_KEY[tab])
          const isTimerGlyph = tab === 'timer'
          return (
            <a
              key={tab}
              href={HREF[tab]}
              aria-current={isActive ? 'page' : undefined}
              // Deviation 3 — the count belongs in the name, not only in the mark.
              aria-label={badge > 0 ? `${label} ${badgeLabel(badge)}` : undefined}
              data-testid={`tab-${tab}`}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold tracking-tight transition-all cursor-pointer ${
                isActive
                  ? `${ACTIVE_INK[tab]} ${tab === 'timer' ? 'font-black' : 'font-bold'} scale-105`
                  : isTimerGlyph
                    ? 'hover:text-blue-400'
                    : 'hover:text-slate-700'
              }`}
            >
              {isTimerGlyph ? (
                // The prototype's one glyph that gets its own pill when active, not just
                // an ink change — timer is the tab that opens a whole different surface,
                // and the pill previews that before the tap.
                <div
                  className={`relative -mb-0.5 flex h-7 w-7 items-center justify-center rounded-full ${
                    isActive ? 'bg-blue-500/20 text-blue-400' : ''
                  }`}
                >
                  <Glyph className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.8} />
                </div>
              ) : (
                <div className="relative">
                  <Glyph className="h-5 w-5" strokeWidth={isActive ? 2.3 : 1.8} />
                  {badge > 0 ? (
                    <span
                      aria-hidden="true"
                      data-testid="tab-tasks-badge"
                      // Deviation 2 — `-end-2`, not the prototype's `-right-2`.
                      className="absolute -top-1.5 -end-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-sm ring-2 ring-white"
                    >
                      {badgeLabel(badge)}
                    </span>
                  ) : null}
                </div>
              )}
              <span>{label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
