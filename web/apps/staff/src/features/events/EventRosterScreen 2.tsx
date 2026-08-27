// 9i's `רשימת משתתפים` — who is coming, who has not answered, whose consent is signed.
//
// A separate screen from `ExamResultsScreen` on purpose: the participants list is about an
// event still AHEAD (chasing answers), the result sheet is about one already held. Routing
// both from `#/events/<id>` made every future event open an exam sheet whose eligibility
// read had nothing to say.
//
// **No money.** `EventRegistrationOut` carries `charge_id` and no amount, and this screen
// renders neither — §3.2's rule is kept by omission, same as the events list.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState, LoadFailed, StatusChip } from '@studio/ui'
import { useNetworkMode } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { EventRegistrationOut, StaffEventsClient } from './client'

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  minBlockSize: '44px',
}

function rsvpTone(rsvp: EventRegistrationOut['rsvp']): 'paid' | 'cancelled' | 'pending' {
  if (rsvp === 'yes') return 'paid'
  if (rsvp === 'no') return 'cancelled'
  return 'pending'
}

export function EventRosterScreen({
  client,
  eventId,
  locale,
}: {
  client: StaffEventsClient
  eventId: string
  locale: Locale
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [rows, setRows] = useState<EventRegistrationOut[] | null>(null)
  const [requiresConsent, setRequiresConsent] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.registrations(eventId)])
      .then(([event, page]) => {
        if (!live) return
        setRequiresConsent(event.requires_consent)
        setRows(page.items)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, eventId, attempt])

  if (failed) {
    return (
      <LoadFailed
        offline={networkMode !== 'online'}
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <section aria-labelledby="event-roster-title" data-testid="event-roster">
      <h1 id="event-roster-title">{t(locale, 'events.roster.title')}</h1>
      {rows === null ? null : rows.length === 0 ? (
        <EmptyState title={t(locale, 'events.roster.empty')} />
      ) : (
        <ul style={listStyle}>
          {rows.map((row) => (
            <li key={row.id} style={rowStyle} data-testid="event-roster-row">
              <bdi>{row.student_display_name}</bdi>
              <StatusChip
                label={t(locale, `events.rsvp.${row.rsvp}`)}
                status={rsvpTone(row.rsvp)}
              />
              {/* The consent chip exists only when the event asks for one — a chip that
                  said "not applicable" on every seminar row would be noise. Timestamp
                  presence only, never contents (§14). */}
              {requiresConsent ? (
                <StatusChip
                  label={t(
                    locale,
                    row.consent_signed_at ? 'events.consent.signed' : 'events.consent.pending',
                  )}
                  status={row.consent_signed_at ? 'paid' : 'pending'}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
