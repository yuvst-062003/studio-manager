// The way back, for every screen that sits behind or beside the five tabs.
//
// **The defect this exists for.** `ParentShell` draws no app-level header, deliberately —
// each screen opens with its own chrome, so an `AppShell` title bar above them would put
// two titles on every screen. What was never noticed is that "its own chrome" was not
// built: a grep for `ArrowRight|ArrowLeft|history.back` across `features/` found NOTHING on
// the trainee card, the plan screen, belt progress, directions, the child calendar,
// privacy or payments. Seven screens, no exits.
//
// On the web that is survivable — the browser has a back button. The parent app is an
// INSTALLED PWA, where there is no browser chrome at all, and the trainee card is opened
// from a bottom sheet that closes behind it. What is left on screen is the tab bar: the
// only way out of a child's record is to jump to an unrelated tab and start again.
//
// **One component rather than a back button per screen.** Eight adopters, and eight
// hand-rolled chevrons are eight chances to point it the wrong way in a right-to-left
// document — the mistake `ParentTabBar` records already having been made once with a badge
// at `-right-1.5`. `ChevronRight` is correct here for the same reason `ChevronLeft` is
// correct on a disclosure row: in Hebrew, "onward" points left and "back" points right.
//
// **`onBack` has a real default, and it is not `history.back()` alone.** A card reached
// from a pasted link, a push notification or a cold start has no history entry of its own,
// and `history.back()` there either does nothing or leaves the app entirely. So: go back
// when there is somewhere to go, and home when there is not. A back button that does
// nothing is worse than no back button, because the parent presses it twice and then
// force-quits.
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * Did this app navigate here, or did the screen open cold?
 *
 * `history.length` is the honest signal available to a hash-routed PWA: a fresh standalone
 * launch starts at 1, and every in-app hash change pushes an entry. It is a heuristic, and
 * the failure mode is chosen deliberately — over-counting sends the parent back one screen
 * (harmless), under-counting sends them home (also harmless). Neither is a dead end.
 */
function goBack(): void {
  if (globalThis.history.length > 1) {
    globalThis.history.back()
    return
  }
  globalThis.location.hash = '#/'
}

export function ScreenHeader({
  title,
  subtitle,
  locale,
  onBack,
  action,
  testId = 'screen-header',
}: {
  title: string
  /** A second line under the title — the child a per-child screen is about, usually. */
  subtitle?: string | null
  locale: Locale
  /** Override where back goes. Defaults to `goBack` above. */
  onBack?: () => void
  /** Optional control on the far edge. Kept deliberately narrow: this is a way out, not a
   *  toolbar, and a screen that needs a toolbar should draw one under the header. */
  action?: ReactNode
  testId?: string
}) {
  return (
    // Sticky, so a long screen keeps its exit in reach. `z-30` clears the cards below and
    // stays under the tab bar's `z-40` and a sheet's `z-50` — a header floating over an
    // open dialog is the bug this ordering prevents.
    <header
      data-testid={testId}
      className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 bg-[#faf8ff]/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800"
    >
      <button
        type="button"
        data-testid={`${testId}-back`}
        onClick={onBack ?? goBack}
        // The chevron is decorative; this label is the whole accessible name. Without it
        // the control announces as "button" — SC 4.1.2, and the reason the icon is
        // `aria-hidden` rather than being given a title of its own.
        aria-label={t(locale, 'common.action.back')}
        className="w-9 h-9 -ms-1 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer shrink-0"
      >
        {/* `rtl:rotate-180` and not a swapped icon: one element, and the rotation is what
            keeps the LTR locales pointing the other way without a second import. */}
        <ChevronRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
      </button>

      <div className="flex-1 min-w-0 text-start">
        {/* THE screen's heading, and the only one. Every adopter that had an `h1` or a
            `PageHeader` of its own gave it up rather than gaining a second — two `h1`s is
            not a style question, it is a screen that announces itself twice to a screen
            reader and reads as two documents. The id is here so an adopter's
            `aria-labelledby` can point at it. */}
        <h1
          id={`${testId}-title`}
          className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight truncate"
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
