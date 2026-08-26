// §5.4a ② — "Manager sees a שיעורי ניסיון queue on the dashboard."
import { useEffect, useState } from 'react'
import { EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { TrialBookingRow } from '../peopleClient'

export function UpcomingTrialsAlert({ locale, client }: AlertSectionProps) {
  const [rows, setRows] = useState<TrialBookingRow[]>([])

  useEffect(() => {
    let live = true
    client
      .trialBookings('pending')
      .then((body) =>
        live &&
        // `attended === null` is "the lesson has not happened yet" — the three-valued flag
        // doing its job. These are the ones still to come.
        setRows(body.items.filter((row) => row.attended == null)),
      )
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client])

  return (
    <section aria-labelledby="alert-trials" data-testid="alert-upcoming-trials">
      <h2 id="alert-trials">{t(locale, 'people.alerts.upcomingTrials')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.trial.plural')} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} data-testid="alert-trial-row">
              <bdi>{row.student_display_name}</bdi>
              <bdi>{row.group_name}</bdi>
              <span>{formatDateInStudioZone(row.booked_at, locale)}</span>
              {row.is_override ? (
                // §5.4a — an override is 'a deliberate, visible, countable act'. Visible is
                // this.
                <span data-testid="alert-trial-override">
                  {t(locale, 'people.trial.override')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
