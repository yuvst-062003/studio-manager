// פרטי הגעה — the club's address, and one press that hands the parent to their own
// navigation app.
//
// **One הוראות הגעה button rather than two app icons** (owner review, 2026-09-06). Waze and
// Google Maps side by side asks a parent to pick an app before they have decided they want
// directions at all, and the two logos read as sponsorship. The button states the intent;
// the choice of app appears once the intent is expressed.
//
// **A disclosure, not a dialog.** This renders INSIDE `Sheet`, which already owns a focus
// trap — a second `useDialog` nested in the first would fight it, the same reason
// `ContactActions` was extracted out of `ContactSheet`. So the two links expand in place,
// with `aria-expanded`/`aria-controls` doing what a modal would have done for a screen
// reader.
//
// **Both are ordinary https links with a query, not app schemes.** `waze://` and
// `comgooglemaps://` open nothing when the app is absent — a dead tap with no error, which
// is the worst of the three outcomes. `https://waze.com/ul` and Google's `?api=1` form are
// universal links: the installed app takes them, and a browser handles them otherwise.
//
// Nothing renders without an address. A navigation link to an empty query opens a map of
// nowhere, which is worse than saying the club has not set one.
import { useId, useState } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The two universal links, given a free-text address a manager typed. */
export function routeLinks(address: string): { waze: string; maps: string } {
  const q = encodeURIComponent(address)
  return {
    // `navigate=yes` starts the route rather than only dropping a pin -- the parent pressed
    // "directions", not "show me where".
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    // Google's documented universal form. `maps.google.com/?q=` (what `DirectionsScreen`
    // used) still works but is the legacy shape and is not guaranteed to open the app.
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  }
}

export function DirectionsActions({
  address,
  locale,
}: {
  address: string | null
  locale: Locale
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 text-start space-y-2.5">
      <p className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
        <MapPin
          className="w-4 h-4 text-[#0056c5] dark:text-blue-300 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <span>{address ?? t(locale, 'people.profile.dojoNoAddress')}</span>
      </p>

      {address ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            data-testid="club-directions-open"
            onClick={() => setOpen((was) => !was)}
            className="w-full flex items-center justify-center gap-1.5 p-3 rounded-2xl bg-blue-50 dark:bg-blue-400/15 border border-blue-200 dark:border-blue-500/25 text-[#0056c5] dark:text-blue-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Navigation className="w-4 h-4" aria-hidden="true" />
            <span>{t(locale, 'people.profile.directions')}</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5" hidden={!open} id={panelId}>
            <a
              href={routeLinks(address).waze}
              target="_blank"
              rel="noreferrer"
              data-testid="club-route-waze"
              className="flex items-center justify-center p-3 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 text-sky-800 dark:text-sky-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              {t(locale, 'people.profile.routeWaze')}
            </a>
            <a
              href={routeLinks(address).maps}
              target="_blank"
              rel="noreferrer"
              data-testid="club-route-maps"
              className="flex items-center justify-center p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              {t(locale, 'people.profile.routeMaps')}
            </a>
          </div>
        </>
      ) : null}
    </div>
  )
}
