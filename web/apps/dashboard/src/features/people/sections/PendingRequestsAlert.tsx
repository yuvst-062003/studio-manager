// §5.4a's approval queue, as a `6c` alert.
//
// **Two display names and nothing else** (L10). `RegistrationRequestOut` carries no payload:
// an unapproved registration is a stranger's personal data about a minor, and a list
// endpoint that decrypted every row would defeat the encryption for one page load. Reading
// the full submission is a separate, audit-logged fetch.
//
// **The group is chosen HERE, on the decision** (§5.4) — not read from the submission. The
// group a parent picked is a preference; the manager may override it and the payload does
// not argue back.
import { useEffect, useState } from 'react'
import { Button, EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { AlertSectionProps } from '../AlertCentre'
import type { RegistrationRequestOut } from '../peopleClient'

export function PendingRequestsAlert({ locale, client }: AlertSectionProps) {
  const [rows, setRows] = useState<RegistrationRequestOut[]>([])

  useEffect(() => {
    let live = true
    client
      .pendingRequests()
      .then((body) => live && setRows(body.items))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client])

  return (
    <section aria-labelledby="alert-requests" data-testid="alert-pending-requests">
      <h2 id="alert-requests">{t(locale, 'people.alerts.pendingRequests')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t(locale, 'people.request.empty')} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} data-testid="alert-request-row">
              <bdi>{row.guardian_display_name}</bdi>
              <bdi>{row.child_display_name}</bdi>
              <span>{formatDateInStudioZone(row.submitted_at, locale)}</span>
              <span data-testid="alert-request-source">
                {t(locale, `people.request.source.${row.source}`)}
              </span>
              {row.matched_person_id ? (
                // §5.4a — matching is on a verified address, so the copy never claims
                // certainty: 'ייתכן שזה אותו הורה'.
                <span data-testid="alert-request-matched">
                  {t(locale, 'people.request.matchedPerson')}
                </span>
              ) : (
                <span data-testid="alert-request-new">{t(locale, 'people.request.newFamily')}</span>
              )}
              {/* §5.4 — approving is where the group is chosen, so the button opens the
                  decision rather than approving in place. */}
              <Button data-testid={`alert-request-approve-${row.id}`}>
                {t(locale, 'people.request.approveInGroup')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
