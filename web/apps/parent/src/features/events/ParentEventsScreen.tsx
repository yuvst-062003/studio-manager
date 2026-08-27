// Artboard 12h — אירועים ותחרויות, the parent's list.
//
// **Finding 1: three cards, three renderings of the same three states.** RSVP is two
// buttons on one card, a chip on another and unstyled trailing text on a third; consent is
// a banner on one unanswered card and absent from the other; payment never gets a status
// treatment at all. Porting three treatments as three variants encodes the inconsistency.
// One card, and the STATE decides the copy.
//
// **Finding 7: person.** Every `events.rsvp.*` key is third-person — טרם ענו, "they have
// not answered" — and every string on this screen is second-person, addressed to the
// family. `rsvp.awaitingYourAnswer`, `youConfirmed` and `youDeclined` are the parent's
// forms, and this is the screen they exist for.
//
// **Finding 4: card 3's dashed border has no explanation on the canvas** — a treatment with
// no meaning. There is no undeclared treatment here: every card's state is named in words.
//
// **A draft never appears.** §4.3, filtered server-side by `/me/events`; the screen agrees
// rather than relying on it.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, LoadFailed, MoneyDisplay, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { deadlinePassed } from './client'
import type { ParentEventOut, ParentEventsClient } from './client'

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

/**
 * One line per state, in the parent's own person. The single rendering finding 1 asks for.
 *
 * A confirmed row says so; an answered-but-unsigned row is NOT confirmed and says what is
 * still missing, which is the gate §5.8 states and the canvas never expresses.
 */
export function rsvpLine(row: ParentEventOut, locale: Locale): string {
  if (row.registration.rsvp === 'no') return t(locale, 'events.rsvp.youDeclined')
  if (row.confirmed) return t(locale, 'events.rsvp.youConfirmed')
  if (row.registration.rsvp === 'yes') return t(locale, 'events.consent.pending')
  return t(locale, 'events.rsvp.awaitingYourAnswer')
}

export function ParentEventsScreen({
  client,
  locale,
  now,
  onOpen,
}: {
  client: ParentEventsClient
  locale: Locale
  now: string
  onOpen: (eventId: string, studentId: string) => void
}) {
  const [rows, setRows] = useState<ParentEventOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    client
      .myEvents()
      .then((page) => {
        if (!live) return
        setRows(page.items)
        setLoaded(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  const awaiting = rows.filter((row) => row.registration.rsvp === 'pending').length

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: 0 }}>{t(locale, 'events.title')}</h2>
      {awaiting > 0 ? (
        <p style={hintStyle}>
          {t(locale, 'events.rsvp.awaitingYourAnswer')} · {awaiting}
        </p>
      ) : null}

      {loaded && rows.length === 0 ? (
        <EmptyState title={t(locale, 'events.list.empty')} />
      ) : null}

      {rows.map((row) => (
        <Card key={row.registration.id}>
          <article aria-label={row.event.title} style={bodyStyle}>
            <p style={hintStyle}>
              <StatusChip
                label={t(locale, `events.type.${row.event.type}`)}
                status="planned"
              />{' '}
              {row.registration.student_display_name}
            </p>
            <h3 style={titleStyle}>{row.event.title}</h3>
            <p style={hintStyle}>
              {row.event.location_text}
              {row.event.fee_agorot !== null ? (
                <>
                  {' · '}
                  <MoneyDisplay
                    agorot={row.event.fee_agorot}
                    label={t(locale, 'events.fee.label')}
                  />
                </>
              ) : null}
            </p>

            {/* One rendering per state, in words. */}
            <p style={hintStyle}>{rsvpLine(row, locale)}</p>
            {deadlinePassed(row.event, now) ? (
              <p style={hintStyle}>{t(locale, 'events.rsvp.deadlinePassed')}</p>
            ) : null}

            <p style={{ margin: 0 }}>
              <Button
                onClick={() => onOpen(row.event.id, row.registration.student_id)}
                variant="secondary"
              >
                {t(locale, 'events.rsvp.title')}
              </Button>
            </p>
          </article>
        </Card>
      ))}
    </div>
  )
}
