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
import { Button, Card, EmptyState, LoadFailed, ProgressBar, StatusChip } from '@studio/ui'
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
}: {
  client: StaffEventsClient
  locale: Locale
  now: string
  onOpen: (eventId: string) => void
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
              <p style={hintStyle}>{event.location_text}</p>

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
                <Button onClick={() => onOpen(event.id)} variant="secondary">
                  {Date.parse(event.starts_at) >= cutoff
                    ? t(locale, 'events.roster.title')
                    : t(locale, 'events.exam.record')}
                </Button>
              </p>
            </article>
          </Card>
        )
      })}
    </div>
  )
}
