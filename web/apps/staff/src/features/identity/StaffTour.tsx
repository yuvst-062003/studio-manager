// §6.1 step 4 — 'tour: 3 screens, skippable: "כאן השיעורים של היום" · "לחיצה לסימון
// נוכחות" · "עובד גם בלי אינטרנט"'.
//
// Skippable is part of the spec, not a nicety: a coach opening this between two sessions
// on a mat has thirty seconds, and a tour they cannot get out of is a tour they close by
// force-quitting the app.
//
// Ship-audit D6 closed two holes here. Finishing used to render an EMPTY section — the
// coach's landing page was a blank screen with a testid — and nothing recorded that the
// tour was seen, so it opened on every launch forever. It now ends where its own first
// screen points ("כאן השיעורים של היום"): the today screen, once.
import { useEffect, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const SCREENS = ['common.tour.1', 'common.tour.2', 'common.tour.3'] as const

/** localStorage, not the server: the tour is a device-level first-run, like the theme. */
export const TOUR_SEEN_KEY = 'studio.staff.tour-seen'

/** Where the tour lands — the schedule section's default view IS the today screen. */
const TODAY_ROUTE = '#/schedule'

function seen(): boolean {
  try {
    return globalThis.localStorage?.getItem(TOUR_SEEN_KEY) !== null
  } catch {
    return false
  }
}

export function StaffTour({ locale, onDone }: { locale: Locale; onDone?: () => void }) {
  const [index, setIndex] = useState(0)
  const [alreadySeen] = useState(seen)

  // A coach who has walked it goes straight to today — in an effect, because routing is
  // a side effect and firing one during render double-fires under StrictMode.
  useEffect(() => {
    if (alreadySeen) globalThis.location.hash = TODAY_ROUTE
  }, [alreadySeen])

  if (alreadySeen) return null

  function finish(): void {
    try {
      globalThis.localStorage?.setItem(TOUR_SEEN_KEY, new Date().toISOString())
    } catch {
      // Private browsing: the tour will greet them again, which beats crashing it.
    }
    onDone?.()
    globalThis.location.hash = TODAY_ROUTE
  }

  return (
    <section data-testid="staff-tour" aria-label={t(locale, 'common.tour.1')}>
      <p>{t(locale, SCREENS[index] ?? SCREENS[0])}</p>
      <button type="button" onClick={finish}>
        {t(locale, 'common.tour.skip')}
      </button>
      <button
        type="button"
        onClick={() => (index === SCREENS.length - 1 ? finish() : setIndex(index + 1))}
      >
        {t(locale, 'common.tour.next')}
      </button>
    </section>
  )
}
