// §6.1 step 4 — 'tour: 3 screens, skippable: "כאן השיעורים של היום" · "לחיצה לסימון
// נוכחות" · "עובד גם בלי אינטרנט"'.
//
// Skippable is part of the spec, not a nicety: a coach opening this between two sessions
// on a mat has thirty seconds, and a tour they cannot get out of is a tour they close by
// force-quitting the app.
import { useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const SCREENS = ['common.tour.1', 'common.tour.2', 'common.tour.3'] as const

export function StaffTour({ locale, onDone }: { locale: Locale; onDone?: () => void }) {
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)

  function finish(): void {
    setDone(true)
    onDone?.()
  }

  if (done) return <section data-testid="staff-today" aria-label={t(locale, 'common.nav.today')} />

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
