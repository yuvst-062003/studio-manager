// The parent app's own frame, ported from the prototype's `App.tsx` — its outer ground,
// its `#app-wrapper` phone column, and the tab bar docked to the bottom of it.
//
// **This replaces @studio/ui's `AppShell` for this app, and only for this app.** Staff and
// dashboard keep it. The redesign deletes the two things `AppShell` exists to draw:
//
//   - THE DRAWER. §4: "Four tabs, no side menu." Every one of its seven destinations has a
//     home in the new design — see docs/design/parent-app-shell-map.md for the table.
//   - THE HEADER. The prototype has no app-level header; each screen opens with its own
//     chrome (Home with the club header, Profile with the family header). Keeping
//     `AppShell`'s title bar above them would put two titles on every screen.
//
// What `AppShell` also carried and this shell keeps: the dev bar above everything (§19.4
// draws it there, and a bar that pushes the app down is a bar you cannot mistake for part
// of the product).
//
// What it carried and this shell does NOT: the studio switcher. It moves to Profile with
// the rest of the account controls, where §4 puts them — a family enrolled in two clubs is
// rare, and switching between them is an account action, not a per-screen one.
import type { ReactNode } from 'react'
import { ParentTabBar } from './ParentTabBar'
import type { ParentTab } from './ParentTabBar'

export function ParentShell({
  activeTab,
  updatesBadgeCount,
  devBar,
  tabBar = true,
  children,
}: {
  /** `null` on a screen that is behind or beside the four tabs — a student card, the
   *  privacy screen, a uPay return. The bar still shows; nothing in it is current. */
  activeTab: ParentTab | null
  updatesBadgeCount?: number
  devBar?: ReactNode
  /** §6.1's two blocking gates hide the bar: "no other screen is reachable" includes the
   *  bar that reaches them. The wizard hides it for the same reason. */
  tabBar?: boolean
  children: ReactNode
}) {
  return (
    <>
      {devBar}
      <div className="tw-scope bg-slate-100 dark:bg-black min-h-screen flex justify-center selection:bg-blue-200 transition-colors duration-200">
        <div
          id="app-wrapper"
          className="w-full max-w-md bg-[#faf8ff] dark:bg-slate-950 min-h-screen flex flex-col relative shadow-xl border-x border-slate-200/80 dark:border-slate-800/80 transition-colors duration-200"
        >
          {/* THE BAR'S CLEARANCE LIVES HERE, ONCE.
           *
           * In the prototype every screen carries its own `pb-28` (the shop `pb-32`),
           * because there is no shell between them and the fixed bar. There is one here, so
           * the padding is hoisted to it and a ported screen drops its own — repeating it
           * would double the gap, and four copies of a magic number is four places for it
           * to drift from the bar's actual height.
           *
           * `pb-28` is the prototype's own value, not a recomputed one. */}
          <main className={tabBar ? 'flex-1 flex flex-col pb-28' : 'flex-1 flex flex-col'}>
            {children}
          </main>
          {tabBar ? (
            <ParentTabBar active={activeTab} updatesBadgeCount={updatesBadgeCount} />
          ) : null}
        </div>
      </div>
    </>
  )
}
