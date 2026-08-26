// §5.12's per-event add button.
//
// > "**Per-event add button.** Events additionally expose a single-event `.ics` download for
// > parents who want the competition in their calendar without subscribing to everything."
//
// **The endpoint already exists.** M7 shipped `GET /events/{id}.ics` and
// `app/services/events/ics.py` renders it. This is the control that reaches it, and nothing
// more — building a second renderer here would give one product two answers about what a
// VEVENT looks like.
//
// **A plain `<a download>`, not a fetch.** The response is a file, the browser knows what to
// do with `text/calendar`, and a JS download path would need a blob, an object URL and a
// revoke — three things to get wrong for no gain. It also keeps working with JS disabled and
// on a long-press "open in".
//
// **STOP AND TELL: this is not mounted.** Its home is `7d`/`12h`, which live in
// `web/apps/parent/src/features/events/` — lane EVENTS' directory, with no slot registered in
// either container. Built, tested and exported here; mounting it is a separate conversation.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const linkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--fg)',
  display: 'inline-flex',
  // §6.2's 44px floor. A parent taps this on a phone, one-handed, at a competition.
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-2)',
  border: 'var(--border-width-hairline) solid var(--border)',
}

export function eventIcsUrl(eventId: string): string {
  return `/api/v1/events/${eventId}.ics`
}

export function EventCalendarButtons({ eventId, locale }: { eventId: string; locale: Locale }) {
  return (
    <a
      // `download` names the saved file. Without it the browser saves `{id}.ics`, which is a
      // filename nobody can recognise in a downloads folder.
      download="event.ics"
      href={eventIcsUrl(eventId)}
      style={linkStyle}
      data-testid="event-add-to-calendar"
    >
      {t(locale, 'comms.calendar.addSingleEvent')}
    </a>
  )
}
