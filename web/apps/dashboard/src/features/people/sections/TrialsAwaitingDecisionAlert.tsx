// §5.4a ⑤ — the trials that have happened and still need a manager's decision.
//
// `attended === true` AND `outcome === 'pending'`. A booking with `attended === null` is
// deliberately excluded: the lesson has not happened, so there is nothing to decide, and
// listing it here would put a decision in front of somebody who cannot make it yet.
import { useEffect, useState } from 'react'
import { Button, EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { TrialBookingRow } from '../peopleClient'

export function TrialsAwaitingDecisionAlert({ locale, client }: AlertSectionProps) {
  const [rows, setRows] = useState<TrialBookingRow[]>([])

  useEffect(() => {
    let live = true
    client
      .trialBookings('pending')
      .then((body) => live && setRows(body.items.filter((row) => row.attended === true)))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client])

  return (
    <section aria-labelledby="alert-decisions" data-testid="alert-trials-awaiting">
      <h2 id="alert-decisions">{t(locale, 'people.alerts.trialsAwaitingDecision')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.trial.outcome.pending')} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} data-testid="alert-decision-row">
              <bdi>{row.student_display_name}</bdi>
              <span>{formatDateInStudioZone(row.booked_at, locale)}</span>
              {/* §5.4a ⑤ — two outcomes, and `lost` is a real one rather than an absence.
                  Both are offered, because a queue with only the happy path is a queue that
                  never empties. */}
              <Button data-testid={`alert-convert-${row.student_id}`}>
                {t(locale, 'people.trial.convert')}
              </Button>
              <Button variant="ghost" data-testid={`alert-lost-${row.student_id}`}>
                {t(locale, 'people.convert.markLost')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
