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
import type { GroupOption, RegistrationRequestOut } from '../peopleClient'

export function PendingRequestsAlert({ locale, client }: AlertSectionProps) {
  const [rows, setRows] = useState<RegistrationRequestOut[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  // Which request is being decided, and into which group. §5.4 puts the group on the
  // DECISION, so it is picked here rather than read off the submission — the group a
  // parent asked for is a preference the queue renders, and the manager may override it.
  const [deciding, setDeciding] = useState<string | null>(null)
  const [chosenGroup, setChosenGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const [pending, groupList] = await Promise.all([
        client.pendingRequests().catch(() => ({ items: [] as RegistrationRequestOut[] })),
        client.groups().catch(() => ({ items: [] as GroupOption[] })),
      ])
      if (!live) return
      setRows(pending.items)
      setGroups(groupList.items)
    })()
    return () => {
      live = false
    }
  }, [client, reloads])

  async function approve(requestId: string) {
    if (!chosenGroup || busy) return
    setBusy(true)
    try {
      await client.approve(requestId, chosenGroup)
      setDeciding(null)
      setChosenGroup('')
      setReloads((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

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
                  decision rather than approving in place. It had no handler at all, so the
                  queue rendered and a manager could act on nothing in it. */}
              {deciding === row.id ? (
                <>
                  <label>
                    {t(locale, 'people.student.group')}
                    <select
                      data-testid="alert-request-group"
                      value={chosenGroup}
                      onChange={(event) => setChosenGroup(event.target.value)}
                    >
                      <option value="">—</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    data-testid="alert-request-approve-confirm"
                    disabled={!chosenGroup || busy}
                    onClick={() => void approve(row.id)}
                  >
                    {t(locale, 'people.request.approve')}
                  </Button>
                </>
              ) : (
                <Button
                  data-testid={`alert-request-approve-${row.id}`}
                  onClick={() => {
                    setDeciding(row.id)
                    setChosenGroup('')
                  }}
                >
                  {t(locale, 'people.request.approveInGroup')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
