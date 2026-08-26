// One event, as 7a's upcoming card and 9i's staff card both draw it.
//
// **The draft treatment is 7a finding 1, fixed.** On the canvas a draft's only signal is
// the word טיוטה in the same secondary grey as a price, on the card with the plainest
// border of the four — while an invitations-not-sent card gets a dashed border. Draft is
// the one status whose consequence reaches outside the club (§4.3 hides it from every
// guardian), so it is the one status that must say so. `events.status.draftHint` exists,
// says exactly that, and the canvas does not draw it. It is drawn here.
//
// **The type chip is categorical, not a status.** Five artboards ask whether those are the
// same control; `ChipStatus` has six members and none of them is an event type, so a
// `StatusChip` here would be claiming a state. It is a plain tag — text alone, no colour,
// which is what 7a already does and is the right restraint under D3.
import type { CSSProperties } from 'react'
import { Button, Card, MoneyDisplay, ProgressBar, StatusChip } from '@studio/ui'
import type { ChipStatus } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EventDateBadge } from './EventDateBadge'
import type { EventOut } from './client'

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  flex: '1 1 auto',
  minInlineSize: 0,
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const metaStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const tagStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--fg) 8%, transparent)',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--fg)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
  paddingBlock: '2px',
  paddingInline: 'var(--space-2)',
}

const draftHintStyle: CSSProperties = {
  color: 'var(--pending)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

/**
 * §4.3's four statuses, mapped onto the six `ChipStatus` has.
 *
 * None of them is an event status, so every one of these is an approximation and the gap
 * is reported rather than worked around by adding a member to a package this lane does not
 * own. `draft` takes `planned` because that is the one member meaning "not yet in effect";
 * the *consequence* of being a draft is carried by text beneath, where it belongs.
 */
export function chipStatusFor(status: EventOut['status']): ChipStatus {
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'paid'
  if (status === 'draft') return 'planned'
  return 'pending'
}

/** Everyone the event reached, whether or not they have answered. */
export function invitedCount(event: EventOut): number {
  return event.rsvp_yes_count + event.rsvp_no_count + event.rsvp_pending_count
}

export function EventCard({
  event,
  locale,
  onOpen,
  seesMoney,
}: {
  event: EventOut
  locale: Locale
  onOpen: (eventId: string) => void
  seesMoney: boolean
}) {
  const invited = invitedCount(event)
  return (
    <Card>
      {/* `article` with the title as its accessible name: 7a's cards are a list of things,
          and a screen reader needs to be able to move between them by name. */}
      <article aria-label={event.title} style={rowStyle}>
        <EventDateBadge startsAt={event.starts_at} />
        <div style={bodyStyle}>
          <p style={metaStyle}>
            <span style={tagStyle}>{t(locale, `events.type.${event.type}`)}</span>
            <StatusChip
              label={t(locale, `events.status.${event.status}`)}
              status={chipStatusFor(event.status)}
            />
          </p>
          <h3 style={titleStyle}>{event.title}</h3>
          <p style={metaStyle}>
            {event.location_text ? <span>{event.location_text}</span> : null}
            {/* NULL is a free event and zero is not — a zero-fee event would create a zero
                charge and a receipt for nothing. A coach's response has the fee redacted to
                null too, so "free" may only be said when this caller can see money at all;
                otherwise the line is simply absent, rather than reading as free. */}
            {event.fee_agorot !== null ? (
              <MoneyDisplay
                agorot={event.fee_agorot}
                label={t(locale, 'events.fee.label')}
              />
            ) : seesMoney ? (
              <span>{t(locale, 'events.fee.free')}</span>
            ) : null}
            {event.requires_consent ? (
              <span>{t(locale, 'events.consent.required')}</span>
            ) : null}
          </p>

          {/* §5.8's point is seeing who has NOT answered, so the bar measures confirmed
              against invited and the caption names the outstanding count. `9i` keeps three
              state-appropriate renderings of this and records that they are deliberate;
              7a has one, and this is it. */}
          {invited > 0 ? (
            <>
              <ProgressBar
                label={t(locale, 'events.counts.confirmed')}
                max={invited}
                readout={`${event.rsvp_yes_count}/${invited}`}
                value={event.rsvp_yes_count}
              />
              <p style={metaStyle}>
                <span>
                  {t(locale, 'events.counts.pending')} {event.rsvp_pending_count}
                </span>
                <span>
                  {t(locale, 'events.counts.declined')} {event.rsvp_no_count}
                </span>
              </p>
            </>
          ) : null}

          {/* 7a finding 1 — the consequence of being a draft, which the canvas never draws. */}
          {event.status === 'draft' ? (
            <p style={draftHintStyle}>{t(locale, 'events.status.draftHint')}</p>
          ) : null}

          <p style={{ margin: 0 }}>
            <Button onClick={() => onOpen(event.id)} variant="secondary">
              {event.status === 'draft'
                ? t(locale, 'events.form.saveDraft')
                : t(locale, 'events.roster.title')}
            </Button>
          </p>
        </div>
      </article>
    </Card>
  )
}
