// Artboard 9i — אירועים בצוות.
//
// **Finding 7 is a keeper, and this file is where it is written down.** 9i renders the RSVP
// count three ways and — unlike 12h's three — they are state-appropriate rather than
// inconsistent:
//
//   nobody invited yet  · a headcount, and NO bar. A bar here would read as 0% answered,
//                         which is a different and wrong claim: nobody has been asked.
//   sent, in progress   · a ProgressBar and an answered/invited fraction.
//   everyone answered   · no outstanding count, because there is nothing left to chase.
//
// Do not unify them.
//
// **A coach sees no money.** §3.2's hard rule; the API redacts `fee_agorot` and this screen
// renders no fee line at all — not even "free", which would be a claim about a price it
// cannot see.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, EmptyState, LoadFailed, ProgressBar, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { EventOut, StaffEventsClient } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }

const bodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

export function invited(event: EventOut): number {
  return event.rsvp_yes_count + event.rsvp_no_count + event.rsvp_pending_count
}

export function StaffEventsScreen({
  client,
  locale,
  now,
  onOpen,
  onOpenRoster,
  canPublish = false,
}: {
  client: StaffEventsClient
  locale: Locale
  now: string
  onOpen: (eventId: string) => void
  /** 9i's `רשימת משתתפים` — a different screen from the exam sheet. */
  onOpenRoster?: (eventId: string) => void
  /** owner / manager / lead_coach — `EventsWriter`'s set, mirrored so an assistant coach
   *  is not offered a button the server would refuse. */
  canPublish?: boolean
}) {
  const [events, setEvents] = useState<EventOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    client
      .list()
      .then((page) => {
        if (!live) return
        setEvents(page.items)
        setLoaded(true)
      })
      // F1a — a failed load must not masquerade as loaded-and-empty.
      .catch(() => live && setLoadFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  const cutoff = Date.parse(now)
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  )

  if (loadFailed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: 0 }}>{t(locale, 'events.title')}</h2>
      {/* 9i's header count — how many are still ahead. */}
      <p data-testid="events-upcoming" style={hintStyle}>
        {ordered.filter((event) => Date.parse(event.starts_at) >= cutoff).length}{' '}
        {t(locale, 'events.list.upcoming')}
      </p>

      {loaded && events.length === 0 ? (
        <EmptyState title={t(locale, 'events.list.empty')} />
      ) : null}

      {ordered.map((event) => {
        const total = invited(event)
        const answered = event.rsvp_yes_count + event.rsvp_no_count
        return (
          <Card key={event.id}>
            <article aria-label={event.title} style={bodyStyle}>
              <p style={hintStyle}>
                <StatusChip
                  label={t(locale, `events.type.${event.type}`)}
                  status="planned"
                />
              </p>
              <h3 style={titleStyle}>{event.title}</h3>
              {/* 9i — date · time · venue on every card. */}
              <p style={hintStyle} data-testid="event-when">
                {formatDateInStudioZone(event.starts_at, locale)} ·{' '}
                {formatTimeInStudioZone(event.starts_at, locale)}
                {event.location_text ? <> · <bdi>{event.location_text}</bdi></> : null}
              </p>

              {/* 9i's consent state. Signed consents against everyone invited — a family
                  that declined still signed nothing, and the count says so honestly. */}
              {event.requires_consent && total > 0 ? (
                <p style={hintStyle} data-testid="event-consents">
                  {event.consent_signed_count >= total
                    ? t(locale, 'events.consent.allSigned')
                    : t(locale, 'events.consent.count')
                        .replace('{{signed}}', String(event.consent_signed_count))
                        .replace('{{total}}', String(total))}
                </p>
              ) : null}

              {/* 9i's outstanding work — a draft's roster does not exist yet, and saying
                  so beats a zero that reads like apathy. `שליחה` publishes, which is what
                  "sending invitations" IS here: nothing goes over a wire (no mailer);
                  guardians see the event in their app. */}
              {event.status === 'draft' ? (
                <Alert iconLabel={t(locale, 'events.invites.notSent')} tone="pending">
                  <span data-testid="event-draft">{t(locale, 'events.invites.notSent')}</span>
                  {canPublish ? (
                    <Button
                      data-testid="event-send"
                      onClick={() => {
                        void client.publish(event.id).then((response) => {
                          if (response.ok) setAttempt((n) => n + 1)
                        })
                      }}
                      variant="secondary"
                    >
                      {t(locale, 'events.invites.send')}
                    </Button>
                  ) : null}
                </Alert>
              ) : null}

              {/* The three renderings. See the module docstring — they differ on purpose. */}
              {total === 0 ? (
                <p style={hintStyle}>{t(locale, 'events.roster.empty')}</p>
              ) : answered < total ? (
                <>
                  <ProgressBar
                    label={t(locale, 'events.counts.confirmed')}
                    max={total}
                    readout={`${answered}/${total}`}
                    value={answered}
                  />
                  <p style={hintStyle}>
                    {t(locale, 'events.counts.pending')} {event.rsvp_pending_count}
                  </p>
                </>
              ) : (
                <p style={hintStyle}>
                  {t(locale, 'events.counts.confirmed')} {event.rsvp_yes_count}/{total}
                </p>
              )}

              <p style={{ margin: 0 }}>
                {/* Two different destinations, said apart: the participants list for an
                    event still ahead, the result sheet for an exam already held. */}
                {Date.parse(event.starts_at) >= cutoff ? (
                  <Button
                    onClick={() => (onOpenRoster ?? onOpen)(event.id)}
                    variant="secondary"
                  >
                    {t(locale, 'events.roster.title')}
                  </Button>
                ) : (
                  <Button onClick={() => onOpen(event.id)} variant="secondary">
                    {t(locale, 'events.exam.record')}
                  </Button>
                )}
              </p>
            </article>
          </Card>
        )
      })}
    </div>
  )
}
