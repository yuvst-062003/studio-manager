// Ported from the prototype's `src/components/BottomNavigation.tsx`, class for class.
//
// This replaces BOTH of the parent app's old navigation surfaces at once: @studio/ui's
// `TabBar` (four tabs: home · payments · messages · profile) and the seven-entry hamburger
// drawer above it. §4 of the redesign prompt: "Four tabs, no side menu."
//
// FIVE KNOWING DEVIATIONS from the prototype. A faithful port is not a literal one, and
// the first four are each a defect the prototype has because it is a prototype. The fifth
// is not a defect at all — it is a tab the prototype was never asked to draw:
//
//   1. LINKS, NOT BUTTONS. The prototype holds the active tab in `useState` and swaps a
//      screen; this app routes on `location.hash`, so a tab is an `<a href>`. That is what
//      makes the back button, open-in-new-tab and a deep link from a push notification
//      work — the reasoning @studio/ui's own `TabBar` already carried, kept rather than
//      thrown away with the component.
//
//   2. LOGICAL PROPERTIES. The badge sits at `-top-1 -right-1.5` in the prototype, which
//      in an RTL document is the wrong corner by accident — it looks right only because
//      the bar happens to be symmetrical. `-end-1.5` puts it on the inline end in both
//      directions, per .claude/rules/ui-rtl-a11y.md.
//
//   3. THE COUNT IS IN THE ACCESSIBLE NAME. The prototype's badge is a bare numeral beside
//      a word, which a screen reader reads as "עדכונים 2" only by luck of source order and
//      says nothing about what the 2 counts. `aria-label` carries it explicitly and the
//      mark itself is `aria-hidden`, so it is announced once and not twice.
//
//   4. A CAP AT 99. The prototype's badge takes whatever integer it is handed; a parent
//      back from a month away would widen one of the fixed slots and push the labels out
//      of the bar. `99+` past that — the exact number stops being the point well before.
//
//   5. A FIFTH TAB. טכניקות — the judo technique library, built in parallel with this bar
//      and merged into it. Its own design decided it belongs in the bar rather than inside
//      another screen; `ORDER` below says where it goes and why. Nothing here hardcoded
//      four, so the cost was the entries themselves and the label check at 360px that the
//      library's spec asked for.
//
// The `dark:` variants are the prototype's, unchanged. They follow the app's own theme
// preference rather than the OS because tailwind.css redefines the `dark` variant against
// `[data-theme]`, which is what `@studio/ui`'s ThemeProvider writes — see the note there.
import { Home, ShoppingBag, Bell, User } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
// The fifth tab's glyph. Not a lucide icon and not one of `@studio/ui`'s 23 either —
// neither set has a judo technique in it, and `belts` is the nearest and already means a
// grade. It takes the same props a lucide glyph takes, so it styles from the same
// className below; `features/techniques/icon.tsx` says why it lives with its feature.
import { TechniqueIcon } from '../techniques/icon'

export type ParentTab = 'home' | 'shop' | 'updates' | 'techniques' | 'profile'

/** Where each tab points. The hashes are the app's existing routes, not new ones. */
const HREF: Record<ParentTab, string> = {
  home: '#/',
  shop: '#/shop',
  updates: '#/announcements',
  techniques: '#/techniques',
  profile: '#/profile',
}

/* The prototype gives three of the four tabs a slightly different active navy. Kept as
   written rather than unified: they are the design's, and a port that "tidies" them is a
   port that stopped being a comparison. */
const ACTIVE_INK: Record<ParentTab, string> = {
  home: 'text-[#001849] dark:text-blue-400',
  shop: 'text-[#2563eb] dark:text-blue-400',
  updates: 'text-[#1351d8] dark:text-blue-400',
  // The library is the prototype's only tab that the prototype does not have, so it has no
  // navy of its own to keep. It takes Home's, which is the bar's base ink.
  techniques: 'text-[#001849] dark:text-blue-400',
  profile: 'text-[#001849] dark:text-blue-400',
}

const ACTIVE_ICON: Record<ParentTab, string> = {
  home: 'stroke-[2.4] fill-[#001849]/10 dark:fill-blue-400/20 text-[#001849] dark:text-blue-400',
  shop: 'stroke-[2.4] fill-blue-50 dark:fill-blue-400/20 text-[#2563eb] dark:text-blue-400',
  updates: 'stroke-[2.4] fill-[#1351d8]/15 dark:fill-blue-400/20 text-[#1351d8] dark:text-blue-400',
  // No fill: the mark is two figures and four strokes, and filling the two circles turns
  // a throw into a pair of dots. The other four are closed outlines that can hold a tint.
  techniques: 'stroke-[2.4] text-[#001849] dark:text-blue-400',
  profile: 'stroke-[2.4] fill-[#001849]/10 dark:fill-blue-400/20 text-[#001849] dark:text-blue-400',
}

const IDLE_INK =
  'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium'

const ICONS = {
  home: Home,
  shop: ShoppingBag,
  updates: Bell,
  techniques: TechniqueIcon,
  profile: User,
} as const

/** The tab's label key. Under `common.tabs.*` rather than `common.nav.*`: `nav.*` is the
 *  staff drawer's, which calls the same destination 'הודעות' where the parent bar says
 *  'עדכונים'. */
const LABEL_KEY: Record<ParentTab, string> = {
  home: 'common.tabs.parentHome',
  shop: 'common.tabs.parentShop',
  updates: 'common.tabs.parentUpdates',
  techniques: 'common.tabs.parentTechniques',
  profile: 'common.tabs.parentProfile',
}

// Five slots, not the prototype's four. The library's owner asked for it in the bar
// (spec §6) rather than folded into another screen, and it goes fourth — the same place
// that decision put it — so home, shop and updates keep the positions a family's thumb
// already knows and only profile shifts along.
const ORDER: readonly ParentTab[] = ['home', 'shop', 'updates', 'techniques', 'profile']

/** Deviation 4. `99+` past the cap, so one slot cannot grow and squeeze the other three. */
function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function ParentTabBar({
  active,
  locale,
  updatesBadgeCount = 0,
}: {
  active: ParentTab | null
  locale: Locale
  /** Unread updates. `0` renders nothing — an empty inbox is not a notification, and a
   *  badge showing zero is a permanent mark that stops meaning anything. */
  updatesBadgeCount?: number
}) {
  return (
    // THE HOME INDICATOR'S CLEARANCE.
    //
    // `pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]` and not `py-2.5`: on every
    // iPhone since the X the bottom 34px of the screen belong to the home indicator, and a
    // bar pinned to `bottom-0` draws its labels underneath it. `AppShell` — the shell this
    // replaced, still used by the staff app — carried
    // `calc(64px + env(safe-area-inset-bottom, 0px))` for exactly this, and the port to
    // Tailwind dropped it (2026-09-06).
    //
    // The inset is 0 on everything else, so this is not a phone-only branch — it is the
    // same expression everywhere, resolving to the old padding on a device with no
    // indicator. `index.html` already asks for the space with `viewport-fit=cover`; without
    // that, `env()` is always 0 and this reads as a no-op.
    //
    // `ParentShell` adds the same term to the clearance it holds above this bar, and the
    // wizard's two fixed footers carry it too. Written out at each site rather than shared:
    // Tailwind generates utilities by scanning source files for literal class strings, so a
    // constructed class name produces no CSS at all.
    <nav
      aria-label={t(locale, 'common.tabs.parentBarLabel')}
      data-testid="tab-bar"
      className="tw-scope fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] px-6 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.4)] transition-colors"
    >
      <div className="flex items-center justify-between">
        {ORDER.map((tab) => {
          const isActive = active === tab
          const Glyph = ICONS[tab]
          const badge = tab === 'updates' ? updatesBadgeCount : 0
          const label = t(locale, LABEL_KEY[tab])
          return (
            <a
              key={tab}
              href={HREF[tab]}
              aria-current={isActive ? 'page' : undefined}
              // Deviation 3 — the count belongs in the name, not only in the mark.
              aria-label={badge > 0 ? `${label} ${badgeLabel(badge)}` : undefined}
              data-testid={`tab-${tab}`}
              className={`flex flex-col items-center gap-1 text-[11px] transition-all cursor-pointer ${
                isActive ? `${ACTIVE_INK[tab]} font-bold` : IDLE_INK
              }`}
            >
              <div className="relative">
                <Glyph className={`w-6 h-6 ${isActive ? ACTIVE_ICON[tab] : 'stroke-[1.7]'}`} />
                {badge > 0 ? (
                  <span
                    aria-hidden="true"
                    data-testid="tab-updates-badge"
                    // Deviation 2 — `-end-1.5`, not the prototype's `-right-1.5`.
                    className="absolute -top-1 -end-1.5 bg-[#e02424] text-white rounded-full text-[10px] min-w-4 h-4 px-1 flex items-center justify-center font-bold border-2 border-white dark:border-slate-900 shadow-xs"
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
