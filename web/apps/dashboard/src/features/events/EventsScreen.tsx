// Artboard 7a — אירועים ותחרויות, the manager's roundup.
//
// **The filter chips come from `events.type.*`, not from the canvas** (D-M7-1). 7a draws
// five, two of which — אימון מיוחד and מחנה — are not enum members, while seminar, joint
// training and trip are members with no chip. `EVENT_TYPES` is a CHECK constraint in
// revision 0008 and a lane never runs a migration, so the enum wins and the taxonomy
// disagreement is reported rather than encoded.
//
// **Loading, error and empty are all built**, and none of the three is on the canvas. The
// error state matters most: a failed fetch that rendered the empty state would tell a
// manager their season had vanished.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EventCard } from './EventCard'
import { EVENT_TYPES } from './client'
import type { DashboardEventsClient, EventOut, EventType } from './client'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const headerStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-display)',
  fontWeight: 'var(--weight-semibold)',
  margin: 0,
}

const subtitleStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const filterRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const sectionLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

/**
 * Upcoming versus past, decided on the **start instant** rather than on `status`.
 *
 * A cancelled competition next week is still upcoming — the office is still phoning about
 * it, and it is still the row a manager needs to see. A completed one is past because it
 * happened, not because somebody remembered to mark it: `completed` is a status nothing
 * currently sets, so trusting it would file every finished event under "upcoming" forever.
 */
export function splitByTime(
  events: EventOut[],
  now: string,
): { upcoming: EventOut[]; past: EventOut[] } {
  const cutoff = Date.parse(now)
  const byStart = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  )
  return {
    upcoming: byStart.filter((event) => Date.parse(event.starts_at) >= cutoff),
    // Most recent first: a past list is read backwards from now.
    past: byStart.filter((event) => Date.parse(event.starts_at) < cutoff).reverse(),
  }
}

export function EventsScreen({
  client,
  locale,
  now,
  onOpen,
  onCreate,
  seesMoney = false,
}: {
  client: DashboardEventsClient
  locale: Locale
  /** An ISO instant, not a `Date`. Every screen in this dashboard takes `today` as a
   *  string from `useToday()`, which is stable for as long as the Jerusalem calendar day
   *  is — a `Date` built in a render body is a new value at millisecond precision on every
   *  render, and downstream that is an effect dependency. */
  now: string
  onOpen: (eventId: string) => void
  onCreate?: () => void
  /** §3.2 — whether this caller may see a price at all. The API already redacts
   *  `fee_agorot` for a coach; this decides whether "free" may be *said*, because an
   *  absent fee and a redacted one look identical on the wire. */
  seesMoney?: boolean
}) {
  const [events, setEvents] = useState<EventOut[]>([])
  const [failed, setFailed] = useState(false)
  const [type, setType] = useState<EventType | null>(null)
  // Which filter the list in state answers. Derived rather than a `loading` flag set
  // synchronously in the effect body -- that is a cascading render, and eslint's
  // `react-hooks/set-state-in-effect` is right to refuse it. Same shape as
  // features/people/StudentsScreen.tsx, which met the rule first.
  const [answered, setAnswered] = useState<string | null>(null)
  const asked = type ?? ''
  const loaded = answered === asked

  useEffect(() => {
    let live = true
    const key = type ?? ''
    client
      .list(type ?? undefined)
      .then((page) => {
        if (!live) return
        setEvents(page.items)
        setFailed(false)
        setAnswered(key)
      })
      .catch(() => {
        if (!live) return
        // The message is deliberately not the exception's: a 500's text is not copy, and
        // §11.7 keeps server detail out of a screen a manager reads.
        setEvents([])
        setFailed(true)
        setAnswered(key)
      })
    return () => {
      live = false
    }
  }, [client, type])

  const { upcoming, past } = splitByTime(events, now)

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>{t(locale, 'events.title')}</h2>
        <p style={subtitleStyle}>{t(locale, 'events.list.subtitle')}</p>
        {onCreate ? (
          <Button onClick={onCreate} variant="primary">
            {t(locale, 'events.create')}
          </Button>
        ) : null}
      </header>

      <div aria-label={t(locale, 'events.title')} role="group" style={filterRowStyle}>
        <Button
          aria-pressed={type === null}
          onClick={() => setType(null)}
          variant={type === null ? 'primary' : 'ghost'}
        >
          {t(locale, 'events.list.filterAll')}
        </Button>
        {EVENT_TYPES.map((member) => (
          <Button
            aria-pressed={type === member}
            key={member}
            onClick={() => setType(member)}
            variant={type === member ? 'primary' : 'ghost'}
          >
            {t(locale, `events.type.${member}`)}
          </Button>
        ))}
      </div>

      {/* `live` because this banner appears in response to something just done — the fetch
          that failed — which is exactly the case Alert's own docstring reserves it for.
          A static banner marked live makes a screen reader interrupt itself on every
          render, and people learn to ignore an alert that always fires. */}
      {failed ? (
        <Alert iconLabel={t(locale, 'events.form.errorTitle')} live tone="danger">
          {t(locale, 'events.form.errorTitle')}
        </Alert>
      ) : null}

      {!loaded && !failed ? (
        <p style={subtitleStyle}>{t(locale, 'events.list.loading')}</p>
      ) : null}

      {/* Only once a request has actually answered, and only when it did not fail: an
          error that rendered the empty state would tell a manager their season had
          vanished. */}
      {loaded && !failed && events.length === 0 ? (
        <EmptyState title={t(locale, 'events.list.empty')} />
      ) : null}

      {upcoming.length > 0 ? (
        <section style={listStyle}>
          <p style={sectionLabelStyle}>{t(locale, 'events.list.upcoming')}</p>
          {upcoming.map((event) => (
            <EventCard
              event={event}
              key={event.id}
              locale={locale}
              onOpen={onOpen}
              seesMoney={seesMoney}
            />
          ))}
        </section>
      ) : null}

      {past.length > 0 ? (
        <section style={listStyle}>
          <p style={sectionLabelStyle}>{t(locale, 'events.list.past')}</p>
          {past.map((event) => (
            <EventCard
              event={event}
              key={event.id}
              locale={locale}
              onOpen={onOpen}
              seesMoney={seesMoney}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}
