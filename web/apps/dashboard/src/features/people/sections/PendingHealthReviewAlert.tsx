// Task 4b — the manager's queue for a hold task 4a's health gate created.
//
// Task 4a made the backend hold a flagged child: their enrolment is `pending`, no charge
// is raised, and the family is told the club will make contact. Nothing showed a manager
// that this had happened, so the family was told to expect a call nobody knew to make.
// This is the queue that closes that gap, in the alert centre a manager already reads.
//
// **No health answers here, in any form.** `answers_yes` is a COUNT the server computed --
// the questions and the answers themselves stay behind the health permission boundary, on
// the child's own declaration screen, which checks the manager's grant. A count on this row
// is what tells them whether to open it; it is deliberately the only thing this row knows.
//
// Approving charges a family, exactly like the trial section's convert and lost buttons --
// so it takes a second press, the same reveal-then-confirm shape, reusing that pattern
// rather than a `window.confirm`.
import { useEffect, useState } from 'react'
import { Button, EmptyState, MoneyDisplay } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { PendingReviewRow } from '../peopleClient'

export function PendingHealthReviewAlert({ locale, client, emptyState = 'show' }: AlertSectionProps) {
  const [rows, setRows] = useState<PendingReviewRow[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    client
      .pendingHealthReviews()
      .then((body) => live && setRows(body.items))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client, version])

  const settle = (work: Promise<unknown>) => {
    setBusy(true)
    void work
      .then(() => {
        setConfirmingId(null)
        // A refetch, not a local splice -- a stale list that disagrees with the server
        // is how a manager approves the same child twice.
        setVersion((n) => n + 1)
      })
      .finally(() => setBusy(false))
  }

  // D8 — on the manager home an empty section disappears entirely, heading included.
  // Hiding only the empty state left a heading standing over nothing, which reads worse
  // than the panel did: a heading is a promise that something follows it.
  if (emptyState === 'hide' && rows.length === 0) return null

  return (
    <section
      aria-labelledby="alert-pending-health-review-title"
      data-testid="alert-pending-health-review"
    >
      <h2 id="alert-pending-health-review-title">
        {t(locale, 'people.alerts.pendingHealthReview')}
      </h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.alerts.pendingHealthReview.empty')} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.enrollment_id} data-testid="alert-pending-health-row">
              <bdi>{row.student_name}</bdi>
              <span>{row.group_name}</span>
              {row.plan_name ? <span>{row.plan_name}</span> : null}
              {row.monthly_amount_agorot != null ? (
                <MoneyDisplay
                  agorot={row.monthly_amount_agorot}
                  label={row.plan_name ?? undefined}
                />
              ) : null}
              <span>
                {t(locale, 'people.alerts.pendingHealthReview.waitingSince')}{' '}
                {formatDateInStudioZone(row.started_on, locale)}
              </span>
              {/* A count, never the questions or the answers -- see the file header. */}
              <span data-testid={`alert-pending-health-answers-${row.enrollment_id}`}>
                {row.answers_yes} {t(locale, 'people.alerts.pendingHealthReview.answersYes')}
              </span>
              <Button
                data-testid={`alert-pending-health-approve-${row.enrollment_id}`}
                onClick={() => setConfirmingId(row.enrollment_id)}
              >
                {t(locale, 'people.alerts.pendingHealthReview.approve')}
              </Button>
              {confirmingId === row.enrollment_id ? (
                <Button
                  data-testid={`alert-pending-health-approve-confirm-${row.enrollment_id}`}
                  disabled={busy}
                  onClick={() => settle(client.approvePendingReview(row.enrollment_id))}
                >
                  {t(locale, 'people.alerts.pendingHealthReview.approveConfirm')}
                </Button>
              ) : null}
              {/* Not a write -- a phone call. Nothing clickable when there is no number,
                  rather than a dead `tel:` link. */}
              {row.guardian_phone ? (
                <a
                  data-testid={`alert-pending-health-contact-${row.enrollment_id}`}
                  href={`tel:${row.guardian_phone}`}
                >
                  {t(locale, 'people.alerts.pendingHealthReview.contact')}
                  {row.guardian_name ? (
                    <>
                      {' — '}
                      <bdi>{row.guardian_name}</bdi>
                    </>
                  ) : null}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
