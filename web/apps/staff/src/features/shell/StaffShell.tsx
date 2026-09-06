// The staff app's own frame, ported from the prototype's `App.tsx` — its outer ground, its
// phone column, and the tab bar docked to the bottom of it. Mirrors `ParentShell` (see that
// file's own header for the fuller argument); this note only states what is the same and
// what is different for THIS app.
//
// **This replaces @studio/ui's `AppShell` for this app, and only for this app** — §3 of
// docs/superpowers/specs/2026-09-06-staff-app-redesign.md. The dashboard keeps `AppShell`.
// The redesign deletes the two things it exists to draw:
//
//   - THE DRAWER. Five tabs, no side menu. Every drawer entry has a new home — the account
//     tab absorbs the whole thing, per §3's "where every current destination goes" table.
//   - THE HEADER. Each screen opens with its own chrome, same as the parent app.
//
// What `AppShell` also carried and this shell keeps: the dev bar above everything (§19.4
// draws it there — a bar that pushes the app down is a bar nobody mistakes for the product).
//
// What THIS shell hosts and `ParentShell` does not: `NetworkStatus` and `StaffAlerts`,
// §3's tree lists them right below the dev bar, both "unchanged" — they are the coach's own
// offline machinery and conflict/at-risk surfaces, and §6.1 walks a coach into a basement,
// so they must be visible from every screen the shell wraps, not just the ones that remember
// to mount them. They arrive as `ReactNode` PROPS rather than being rendered from a client
// this file constructs: `NetworkStatus` needs nothing but `locale`, but `StaffAlerts` needs
// a `StaffCommsClient`, and a shell that imported that type would need to know about a
// feature slice it has no other reason to. `App.tsx` already builds both elements today —
// this just gives them a fixed place to land instead of a hand-placed pair of lines on every
// screen that needs them.
import type { ReactNode } from 'react'
import type { Locale } from '@studio/i18n'
import { StaffTabBar } from './StaffTabBar'
import type { StaffTab } from './StaffTabBar'

export function StaffShell({
  activeTab,
  locale,
  tasksBadgeCount,
  devBar,
  networkStatus,
  staffAlerts,
  tabBar = true,
  children,
}: {
  /** `null` on a screen that is behind or beside the five tabs — a student card, the
   *  privacy operator queue, a session roster opened from the schedule. The bar still
   *  shows; nothing in it is current. */
  activeTab: StaffTab | null
  locale: Locale
  tasksBadgeCount?: number
  devBar?: ReactNode
  /** §5/S5's offline strip. Rendered above `children` so it is visible from every screen
   *  the shell wraps, not only the ones that remember to mount it themselves. */
  networkStatus?: ReactNode
  /** The `registerSlot('staff-alerts', …)` container — sync conflicts, at-risk cards.
   *  Same placement reasoning as `networkStatus` above. */
  staffAlerts?: ReactNode
  /** A refusal or a gate reachable from no tab hides the bar — the same reasoning
   *  `ParentShell`'s own `tabBar` prop states: a screen with no other screen reachable
   *  includes the bar that reaches them. */
  tabBar?: boolean
  children: ReactNode
}) {
  return (
    <>
      {devBar}
      <div className="tw-scope w-full min-h-[100dvh] bg-[#f3f6fb] flex justify-center text-slate-800 transition-colors duration-200">
        <div
          id="app-wrapper"
          className="w-full max-w-md min-h-[100dvh] bg-[#f6f9fd] flex flex-col relative shadow-xl border-x border-slate-200/80 transition-colors duration-200"
        >
          {/* THE BAR'S CLEARANCE LIVES HERE, ONCE — same reasoning as `ParentShell`.
           *
           * The prototype repeats `pb-28` on every one of its five screens because there is
           * no shell between them and the fixed bar; hoisted here, a ported screen drops its
           * own copy. `pb-28` is the prototype's own value (it is what every screen but the
           * unavailability one already used); the `env(safe-area-inset-bottom)` term is not
           * — the bar grew by the home indicator's height, so its clearance had to. See
           * `StaffTabBar`'s own header for why this is an additive `calc`, not the
           * prototype's `max`. */}
          <main
            className={
              tabBar
                ? 'flex-1 flex flex-col pb-[calc(7rem+env(safe-area-inset-bottom,0px))]'
                : 'flex-1 flex flex-col'
            }
          >
            {networkStatus}
            {staffAlerts}
            {children}
          </main>
          {tabBar ? (
            <StaffTabBar active={activeTab} locale={locale} tasksBadgeCount={tasksBadgeCount} />
          ) : null}
        </div>
      </div>
    </>
  )
}
