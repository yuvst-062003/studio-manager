// Dashboard artboard 6c — מרכז התראות: "כל מה שדורש החלטה של המנהל".
//
// A **CONTAINER** (plan §1.3, seam 4), like parent `2c`. This lane registers the alerts it
// owns — pending requests, upcoming trials, trials awaiting a decision. M4's missing
// declarations, M5's at-risk students and M6's debt and reconciliation alerts land later
// through the same registry, as one file plus one line in their own feature barrel.
//
// Hardcoding an alert this lane does not own would put another milestone's work in M3's file
// and serialize the waves the registry exists to keep parallel.
import { useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient } from './peopleClient'

/**
 * What every `alert-centre` section receives.
 *
 * A section fetches through the client it is handed rather than asking the container to
 * fetch for it — which is what lets a later lane add an alert the container has never heard
 * of, reading a table this lane does not know exists.
 */
export type AlertSectionProps = {
  locale: Locale
  client: DashboardPeopleClient
  /**
   * Whether a section with nothing in it should say so, or disappear.
   *
   * `'show'` on `#/alerts`, where a manager came to look and "nothing is waiting" is the
   * answer they came for. `'hide'` on the manager home (D8), where three empty panels
   * announcing that nothing is wrong pushed today's classes below the fold — the exact
   * "row of reassuring zeroes" the home's own attention list already refuses to draw.
   *
   * Three of the six registered sections already choose `'hide'` unconditionally, and say
   * why in their own comments: "a row that never requires a decision is how that list
   * stops being scanned." This gives the other three the same choice, per surface.
   */
  emptyState?: 'show' | 'hide'
}

/**
 * The registered sections and nothing else — no heading, no empty state.
 *
 * Split out for D8 of the 2026-09-10 redesign, which renders these on the manager home.
 * The home already owns the page's `<h1>`, and a second one inside it would give the
 * screen two titles; the empty state goes too, because on the home an empty alert list is
 * the good day rather than a thing to report. `#/alerts` keeps both — see `AlertCentre`.
 *
 * Six sections register into this slot from five different feature lanes, at fixed
 * orders. Rendering them in a second place costs one call and no lane any change at all,
 * which is the property the registry existed for.
 */
export function AlertSections({ locale, client, emptyState = 'show' }: AlertSectionProps) {
  const sections = useSlot<AlertSectionProps>('alert-centre')
  return (
    <>
      {sections.map(({ key, render: Section }) => (
        <Section key={key} client={client} emptyState={emptyState} locale={locale} />
      ))}
    </>
  )
}

export function AlertCentre({ locale, client }: AlertSectionProps) {
  const sections = useSlot<AlertSectionProps>('alert-centre')
  return (
    <section aria-labelledby="alerts-title" data-testid="alert-centre">
      <h1 id="alerts-title">{t(locale, 'people.alerts.title')}</h1>
      {sections.length === 0 ? (
        <p data-testid="alerts-empty">{t(locale, 'people.alerts.empty')}</p>
      ) : (
        <AlertSections locale={locale} client={client} />
      )}
    </section>
  )
}
