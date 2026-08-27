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
// Mounted twice now: `7d`/`12h`'s event pages (by `eventId`) and 13b's booking
// confirmation (by `href`, an in-browser `.ics` for a trial that has no event row). One
// component, two sources — L5's rule against a second calendar control.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export function eventIcsUrl(eventId: string): string {
  return `/api/v1/events/${eventId}.ics`
}

export function EventCalendarButtons({
  eventId,
  href,
  locale,
}: {
  eventId?: string
  /** Wins over `eventId` — 13b passes a `data:` URI built from the booking itself. */
  href?: string
  locale: Locale
}) {
  return (
    <a
      // `download` names the saved file. Without it the browser saves `{id}.ics`, which is a
      // filename nobody can recognise in a downloads folder. Styled as the REAL button —
      // the same `.studio-btn` face every primitive Button wears — because L5's artboard
      // draws a button, and a bare link reads as an afterthought on the page's one CTA row.
      className="studio-btn"
      data-variant="secondary"
      download="event.ics"
      href={href ?? eventIcsUrl(eventId ?? '')}
      data-testid="event-add-to-calendar"
    >
      {t(locale, 'comms.calendar.addSingleEvent')}
    </a>
  )
}
