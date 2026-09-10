// §5.4a ② — "Manager sees a שיעורי ניסיון queue on the dashboard."
import { useEffect, useState } from 'react'
import { EmptyState, StatusChip } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { TrialBookingRow } from '../peopleClient'
import '../people.css'

export function UpcomingTrialsAlert({ locale, client, emptyState = 'show' }: AlertSectionProps) {
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

  // D8 — on the manager home an empty section disappears entirely, heading included.
  // Hiding only the empty state left a heading standing over nothing, which reads worse
  // than the panel did: a heading is a promise that something follows it.
  if (emptyState === 'hide' && rows.length === 0) return null

  return (
    <section aria-labelledby="alert-trials" data-testid="alert-upcoming-trials">
      <h2 id="alert-trials">{t(locale, 'people.alerts.upcomingTrials')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.trial.plural')} />
      ) : (
        <ul className="alert-queue">
          {rows.map((row) => (
            <li className="alert-queue__row" key={row.id} data-testid="alert-trial-row">
              {/* The name, the group and the date used to be three adjacent inline elements
                  with nothing between them, so they ran together into one word on screen:
                  "עמית דודגבחרת31 באוגוסט 2026" (owner report, 2026-09-10). The separator is
                  drawn by `.alert-queue__meta`, not typed into the markup — a literal "·"
                  between two elements that are already separate is punctuation a screen
                  reader reads out for no reason. */}
              <bdi className="alert-queue__name">{row.student_display_name}</bdi>
              <span className="alert-queue__meta">
                <bdi>{row.group_name}</bdi>
                <span>{formatDateInStudioZone(row.booked_at, locale)}</span>
              </span>
              {row.is_override ? (
                // §5.4a — an override is 'a deliberate, visible, countable act'. Visible is
                // this, and now it is a chip rather than a fourth word in the run-on.
                // The testid is on a wrapper, not on the chip: `StatusChip` takes exactly
                // `status` and `label` and spreads nothing, so a `data-testid` passed to it
                // is silently dropped — and TypeScript does not object, because JSX permits
                // `data-*` on a component whether or not it forwards them. The test caught
                // what the compiler could not.
                <span data-testid="alert-trial-override">
                  <StatusChip status="pending" label={t(locale, 'people.trial.override')} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
