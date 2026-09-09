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
// 2026-09-09 — THE BAR NO LONGER TOUCHES THE BOTTOM EDGE (owner's pick, from a rendered
// comparison of four directions). Two things changed and they are separable:
//
//   SHAPE. It floats: inset from both sides, lifted clear of the home indicator, and
//   translucent, so the schedule keeps running underneath it. That is Apple's iOS 26
//   system language and the nav Instagram shipped in February 2026. The glass is held at
//   /75 rather than the /95 it replaced, and keeps a hairline border: `backdrop-filter`
//   cannot adapt to what scrolls beneath it the way Apple's material does, so the opacity
//   is the whole of the contrast guarantee and it is deliberately conservative. Anything
//   thinner needs measuring against a real screen, not taste.
//
//   SIGNAL. The active glyph goes OUTLINE TO SOLID, and a capsule slides behind it. The
//   swap is the convention Instagram, Threads, X, YouTube and Spotify all trained families
//   on — filled means you are here — and it does the work colour alone was doing badly:
//   in dark mode the old active state was one blue against near-black.
//
// Two consequences worth naming. `ACTIVE_INK` is now ONE colour rather than the
// prototype's three: with a capsule and a solid glyph carrying the state, three near-identical
// navies were an inconsistency with nothing left to justify it. And the row is a
// five-column GRID rather than `justify-between`, because the capsule is positioned
// arithmetically off the active index — content-width slots would put it under the wrong
// tab, and equal columns also give every tab the same 44px target instead of handing the
// widest label the most room.
//
// The shells did NOT change. `ParentShell`'s `pb-[calc(7rem+…)]` already clears a floating
// bar with room to spare, and it is what keeps the LAST row reachable; content still passes
// under the glass mid-scroll, which is the only time the blur is doing anything.
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

/* ONE active colour. The prototype's three (`#001849`, `#2563eb`, `#1351d8`) were kept
   verbatim while the port was still a comparison; the capsule and the solid glyph now carry
   the active state, so three near-identical navies are a difference nobody can see and
   nobody chose. `#0056c5` is the app's own brand blue — the one `--brand` the rest of the
   product already uses — rather than a fourth navy invented here. */
const ACTIVE_INK = 'text-[#0056c5] dark:text-blue-300'

/* Outline → solid. `fill-current` closes the four lucide marks; `TechniqueIcon` takes a
   `solid` prop instead, because filling two figures and four open strokes turns a throw
   into a blot — see its own comment. */
const ACTIVE_GLYPH = 'fill-current stroke-[1.6]'

/* A step darker than the `slate-400` this replaced. The bar is translucent now, so an idle
   label sits over whatever scrolled under it rather than over flat white, and 400 was the
   lightest that ever passed 4.5:1 against a fixed ground. */
const IDLE_INK =
  'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'

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
  // -1 when no tab matches — a route outside the bar, which `active: ParentTab | null`
  // already allowed. The capsule is not rendered at all then, rather than parked under
  // the first tab claiming a page nobody is on.
  const activeIndex = active === null ? -1 : ORDER.indexOf(active)

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
      // FLOATING, AND THE CLEARANCE THAT MAKES IT SAFE.
      //
      // `bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]` — the 12px gap is what
      // makes it read as floating, and the inset is added to it rather than substituted
      // for it: on every iPhone since the X the bottom 34px belong to the home indicator,
      // and a bar that used the inset AS its gap sits flush against it on exactly the
      // devices that have one. The inset is 0 everywhere else, so this is one expression
      // and not a phone-only branch. `index.html` asks for the room with
      // `viewport-fit=cover`; without that `env()` is always 0 and this reads as 12px.
      //
      // `inset-x-3` with `max-w-md mx-auto`: the 12px inset bounds it on a phone, the
      // max-width centres it on anything wider.
      className="tw-scope fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] inset-x-3 max-w-md mx-auto rounded-[26px] border border-slate-900/10 dark:border-white/10 bg-white/75 dark:bg-slate-900/70 backdrop-blur-xl backdrop-saturate-150 px-1.5 py-2 z-40 shadow-[0_10px_30px_rgba(2,6,23,0.16),0_1px_2px_rgba(2,6,23,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-colors"
    >
      {/* A GRID, not `justify-between`. The capsule below is placed off the active INDEX,
          so the slots have to be equal for it to land under the right tab — and equal
          slots also give every tab the same 44px target rather than handing the widest
          label the most room. */}
      <div className="relative grid grid-cols-5">
        {activeIndex >= 0 ? (
          <span
            aria-hidden="true"
            data-testid="tab-indicator"
            // `inset-inline-start`, not a `translateX`: transforms are not
            // direction-aware, and .claude/rules/ui-rtl-a11y.md asks for logical
            // properties. This one is correct in RTL and LTR without a sign to flip.
            //
            // Inline `style` and not a Tailwind class, because the offset is COMPUTED —
            // Tailwind generates utilities by scanning for literal class strings, so a
            // constructed `start-[40%]` would produce no CSS at all. The same trap the
            // clearance note above the shell warns about.
            className="pointer-events-none absolute inset-y-0 w-1/5 rounded-2xl bg-[#0056c5]/10 dark:bg-white/10 transition-[inset-inline-start] duration-300 ease-out motion-reduce:transition-none"
            style={{ insetInlineStart: `${activeIndex * 20}%` }}
          />
        ) : null}
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
              className={`relative z-10 flex flex-col items-center gap-1 py-1 text-[11px] transition-colors cursor-pointer ${
                isActive ? `${ACTIVE_INK} font-bold` : IDLE_INK
              }`}
            >
              <div className="relative">
                {tab === 'techniques' ? (
                  <TechniqueIcon
                    className={`w-6 h-6 ${isActive ? 'stroke-[2.6]' : 'stroke-[1.7]'}`}
                    solid={isActive}
                  />
                ) : (
                  <Glyph className={`w-6 h-6 ${isActive ? ACTIVE_GLYPH : 'stroke-[1.7]'}`} />
                )}
                {badge > 0 ? (
                  <span
                    aria-hidden="true"
                    data-testid="tab-updates-badge"
                    // Deviation 2 — `-end-1.5`, not the prototype's `-right-1.5`. The ring
                    // is the GLASS colour rather than a flat white, or the badge would
                    // carry a white halo over a translucent bar.
                    className="absolute -top-1 -end-1.5 bg-[#e02424] text-white rounded-full text-[10px] min-w-4 h-4 px-1 flex items-center justify-center font-bold border-2 border-white/80 dark:border-slate-900/80 shadow-xs"
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
