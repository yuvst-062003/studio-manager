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
}

export function AlertCentre({ locale, client }: AlertSectionProps) {
  const sections = useSlot<AlertSectionProps>('alert-centre')
  return (
    <section aria-labelledby="alerts-title" data-testid="alert-centre">
      <h1 id="alerts-title">{t(locale, 'people.alerts.title')}</h1>
      {sections.length === 0 ? (
        <p data-testid="alerts-empty">{t(locale, 'people.alerts.empty')}</p>
      ) : (
        sections.map(({ key, render: Section }) => (
          <Section key={key} locale={locale} client={client} />
        ))
      )}
    </section>
  )
}
