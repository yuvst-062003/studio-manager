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
// 2026-09-09 — FLOATING GLASS, matching the parent app (owner's pick, both apps at once).
// `ParentTabBar`'s header carries the full argument for the shape and the signal; what
// follows is only what is DIFFERENT here, and both differences are this bar's own design
// rather than an omission:
//
//   THE PER-TAB INKS STAY. The parent bar collapsed three near-identical navies into one,
//   because nobody could see the difference. This bar's blue/emerald alternation is not
//   that: it is visible, it is the prototype's, and flattening it would be a design change
//   nobody asked for. So the capsule takes the ACTIVE TAB'S OWN tint and the split survives
//   the redesign intact.
//
//   THREE GLYPHS TAKE NO FILL. The active state elsewhere goes outline-to-solid, and lucide
//   ships no solid variants — which only matters for a mark whose meaning lives INSIDE its
//   outline. `Calendar` is a frame around a grid, `Timer` a circle around two hands,
//   `CheckSquare` a box around a tick: fill any of them and the interior strokes vanish into
//   the fill and the glyph becomes a rounded block. `Users` and `Settings` are silhouettes
//   and survive it. So `SOLID_OK` says which, per glyph, and the capsule plus the weight
//   carries the other three — the same reason the parent app's judo mark fills only its
//   heads.
//
// THE TIMER INVERSION SURVIVES. §3's rule — the bar follows the timer screen's chrome when
// that tab is open — is now dark GLASS against light glass rather than a flat fill, which
// is the same rule expressed in the new material.
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
 *  "tidies" them into one is a port that stopped being a comparison — and the 2026-09-09
 *  redesign kept them for the reason its note gives. */
const ACTIVE_INK: Record<StaffTab, string> = {
  schedule: 'text-blue-600 dark:text-blue-300',
  students: 'text-emerald-600 dark:text-emerald-300',
  // Only ever rendered while the bar itself is dark — see the module note above.
  timer: 'text-blue-500 dark:text-blue-400',
  tasks: 'text-emerald-600 dark:text-emerald-300',
  account: 'text-blue-600 dark:text-blue-300',
}

/** The capsule behind the active tab, tinted to that tab's own ink so the blue/emerald
 *  split survives. Literal class strings, never constructed: Tailwind generates utilities
 *  by scanning source files, so `bg-${colour}-600/10` would produce no CSS at all. */
const ACTIVE_CAPSULE: Record<StaffTab, string> = {
  schedule: 'bg-blue-600/10 dark:bg-blue-300/15',
  students: 'bg-emerald-600/10 dark:bg-emerald-300/15',
  timer: 'bg-blue-500/10 dark:bg-blue-400/20',
  tasks: 'bg-emerald-600/10 dark:bg-emerald-300/15',
  account: 'bg-blue-600/10 dark:bg-blue-300/15',
}

/** Whether the active glyph may be FILLED, per glyph — see the module note. A mark whose
 *  meaning lives inside its outline loses that meaning to a fill. */
const SOLID_OK: Record<StaffTab, boolean> = {
  // A frame around a date grid. Filled, the grid disappears and it is a rounded block.
  schedule: false,
  // Two silhouettes. Fills cleanly.
  students: true,
  // A circle around two hands. Filled, it is a dot.
  timer: false,
  // A box around a tick. Filled, the tick goes with it.
  tasks: false,
  // A gear. The centre circle is cut by the fill rule, so it survives as a solid gear.
  account: true,
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
  // -1 when no tab matches — `active: StaffTab | null` already allowed a route outside the
  // bar. The capsule is then not rendered at all, rather than parked under the first tab
  // claiming a screen nobody is on.
  const activeIndex = active === null ? -1 : ORDER.indexOf(active)

  return (
    <nav
      aria-label={t(locale, 'common.tabs.staffBarLabel')}
      data-testid="tab-bar"
      // Floating, and the clearance that makes it safe — `ParentTabBar`'s own note carries
      // the argument for adding `env(safe-area-inset-bottom)` to the 12px gap rather than
      // substituting it. One shape at both sites, as the note above already required.
      //
      // `transition-colors` still covers the timer swap, which is now a change of glass
      // rather than of fill.
      className={`tw-scope fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] inset-x-3 mx-auto max-w-md rounded-[26px] border px-1.5 py-2 z-40 backdrop-blur-xl backdrop-saturate-150 shadow-[0_10px_30px_rgba(2,6,23,0.16),0_1px_2px_rgba(2,6,23,0.08)] transition-colors duration-300 ${
        isTimerActive
          ? // Follows the THEME now (owner, 2026-09-07), like the timer screen it matches.
            // It used to be unconditionally dark, so a coach on the light theme got a black
            // bar under a screen that is no longer black.
            'bg-white/75 border-slate-900/10 text-slate-500 dark:bg-[#090d16]/70 dark:border-white/10 dark:text-slate-400 dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
          : 'bg-white/75 border-slate-900/10 text-slate-500 dark:bg-slate-900/70 dark:border-white/10 dark:text-slate-400 dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]'
      }`}
    >
      {/* A GRID, not `justify-around`: the capsule is placed off the active INDEX, so the
          slots must be equal for it to land under the right tab. */}
      <div className="relative grid grid-cols-5 items-center">
        {activeIndex >= 0 && active !== null ? (
          <span
            aria-hidden="true"
            data-testid="tab-indicator"
            // `inset-inline-start`, not `translateX`: transforms are not direction-aware,
            // and .claude/rules/ui-rtl-a11y.md asks for logical properties. Inline `style`
            // because the offset is COMPUTED — Tailwind scans for literal class strings, so
            // a constructed `start-[40%]` would generate no CSS at all.
            className={`pointer-events-none absolute inset-y-0 w-1/5 rounded-2xl transition-[inset-inline-start] duration-300 ease-out motion-reduce:transition-none ${ACTIVE_CAPSULE[active]}`}
            style={{ insetInlineStart: `${activeIndex * 20}%` }}
          />
        ) : null}
        {ORDER.map((tab) => {
          const isActive = active === tab
          const Glyph = ICONS[tab]
          const badge = tab === 'tasks' ? tasksBadgeCount : 0
          const label = t(locale, LABEL_KEY[tab])
          return (
            <a
              key={tab}
              href={HREF[tab]}
              aria-current={isActive ? 'page' : undefined}
              // Deviation 3 — the count belongs in the name, not only in the mark.
              aria-label={badge > 0 ? `${label} ${badgeLabel(badge)}` : undefined}
              data-testid={`tab-${tab}`}
              className={`relative z-10 flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold tracking-tight transition-colors cursor-pointer ${
                isActive
                  ? `${ACTIVE_INK[tab]} ${tab === 'timer' ? 'font-black' : 'font-bold'}`
                  : 'hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Glyph
                  className={`h-5 w-5 ${isActive && SOLID_OK[tab] ? 'fill-current' : ''}`}
                  strokeWidth={isActive ? 2.3 : 1.8}
                />
                {badge > 0 ? (
                  <span
                    aria-hidden="true"
                    data-testid="tab-tasks-badge"
                    // Deviation 2 — `-end-2`, not the prototype's `-right-2`. The ring is
                    // the GLASS colour rather than a flat white, or the badge would carry a
                    // white halo over a translucent bar.
                    className="absolute -top-1.5 -end-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-sm ring-2 ring-white/80 dark:ring-slate-900/80"
                  >
                    {badgeLabel(badge)}
                  </span>
                ) : null}
              </div>
              <span>{label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
