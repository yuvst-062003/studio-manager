// §5/C12 of the staff app redesign — the dashboard's alert-centre card for §6.1's coach
// unavailability. Decision 11, verbatim: "An alert in the existing alert centre when a
// constraint is filed", opening the resolution popup (`ConstraintResolutionPopover.tsx`).
//
// Follows `AtRiskAlert.tsx`'s own fill pattern exactly: nothing renders while the queue is
// empty (return `null`, not an empty-state card — "a row that never requires a decision is
// how that list stops being scanned"), a manager without the role gets a 403 from
// `GET /coach-constraints?status=pending`, which is swallowed into an empty queue the same
// way `AtRiskAlert` swallows its own role-gated read, and the section is registered from its
// own file (`register.ts`) rather than by reopening `AlertCentre.tsx`.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card } from '@studio/ui'
import { t, plural } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ConstraintResolutionPopover, constraintWindowLabel, nameFromDirectory } from './ConstraintResolutionPopover'
import type { ScheduleClient } from './client'
import type { CoachConstraintClient, CoachConstraintRow, StaffDirectoryRow } from './coachConstraintsClient'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  justifyContent: 'space-between',
}

export function CoachConstraintsAlert({
  client,
  scheduleClient,
  locale,
}: {
  client: CoachConstraintClient
  scheduleClient: ScheduleClient
  locale: Locale
}) {
  const [rows, setRows] = useState<CoachConstraintRow[]>([])
  const [directory, setDirectory] = useState<StaffDirectoryRow[]>([])
  // The open popup is held by VALUE, not by looking its id up in `rows` on every render.
  // Approving or refusing bumps `version` to refresh the background queue, and once the
  // real API drops a decided row from `status=pending` that refresh would otherwise yank
  // the dialog out from under a manager who is still cancelling or moving one of the
  // affected sessions — a decision and a session action are independent (§5's own rule),
  // so finishing one must not close the view onto the other.
  const [openConstraint, setOpenConstraint] = useState<CoachConstraintRow | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    client
      .listPending()
      .then((items) => live && setRows(items))
      .catch(() => live && setRows([]))
    client
      .listStaff()
      .then((items) => live && setDirectory(items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, version])

  // Nothing rather than an empty card — the same rule `AtRiskAlert.tsx` states: a queue
  // with nothing pending is not something a manager needs to see every time they open
  // the alert centre. A popup already open stays open even as the queue behind it empties.
  if (rows.length === 0 && openConstraint === null) return null

  return (
    <section aria-labelledby="constraints-alert-title" data-testid="constraints-alert">
      {rows.length > 0 ? (
        <>
          <h2 id="constraints-alert-title">{t(locale, 'schedule.constraint.manager.alertTitle')}</h2>
          <p>{plural(locale, 'schedule.constraint.manager.pendingCount', rows.length)}</p>
          <ul style={{ ...sectionStyle, listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => {
              const name = nameFromDirectory(directory, row.person_id)
              return (
                <Card key={row.id}>
                  <div data-testid={`constraint-queue-row-${row.id}`} style={rowStyle}>
                    <div>
                      <p style={{ fontWeight: 'var(--weight-medium)', margin: 0 }}>
                        <bdi>{name}</bdi>
                      </p>
                      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        {constraintWindowLabel(row, locale)} ·{' '}
                        {t(locale, `schedule.constraint.reason.${row.reason}`)}
                      </p>
                    </div>
                    <Button data-testid={`constraint-open-${row.id}`} onClick={() => setOpenConstraint(row)}>
                      {t(locale, 'schedule.constraint.manager.open')}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </ul>
        </>
      ) : null}

      {openConstraint ? (
        <ConstraintResolutionPopover
          client={client}
          constraint={openConstraint}
          filerName={nameFromDirectory(directory, openConstraint.person_id)}
          locale={locale}
          onClose={() => setOpenConstraint(null)}
          onResolved={() => setVersion((n) => n + 1)}
          scheduleClient={scheduleClient}
        />
      ) : null}
    </section>
  )
}

/**
 * Adapter for the `alert-centre` slot — the same shape `AtRiskAlert.tsx`'s
 * `makeAtRiskSection` uses. The slot's renderer only ever receives `{ locale }` (or
 * `AlertSectionProps`, which a section may ignore) from `AlertCentre.tsx`, so a section
 * needing its own clients closes over them here rather than expecting the container to
 * supply the schedule vertical's clients it has never heard of.
 */
export function makeCoachConstraintsSection(client: CoachConstraintClient, scheduleClient: ScheduleClient) {
  return function CoachConstraintsSection({ locale }: { locale: Locale }) {
    return <CoachConstraintsAlert client={client} locale={locale} scheduleClient={scheduleClient} />
  }
}
