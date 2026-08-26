// Parent artboard 13b — אחרי השליחה.
//
// §5.4a step 5: 'אישור: "נתראה ביום א׳ 17:00" · [ הוסף ליומן ] · .ics'.
//
// **Nothing here promises a place in the club.** L6 — the public link's only job is a first
// lesson, and a "complete your registration" button on this screen would offer something
// nobody has granted. The next decision is the manager's (§5.4).
//
// §6.5 puts the install prompt here rather than in front of the landing page: this is the
// moment a parent is most willing, having just booked something they care about.
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BookingResult } from './landingClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

/**
 * The `.ics` §5.4a asks for, built in the browser.
 *
 * G3 — the instant is stored UTC and rendered Asia/Jerusalem everywhere else, but an ICS
 * `DTSTART` is a UTC stamp by design (`...Z`), so the calendar app does the conversion in
 * the reader's own zone. That is the one place in this product where NOT converting is
 * correct.
 */
export function icsFor(result: BookingResult): string {
  const stamp = (iso: string) => `${iso.replace(/[-:]/g, '').split('.')[0]}Z`
  // One VEVENT per child, inside one VCALENDAR. Siblings can be in different groups at
  // different hours, and a single event would put one of them in the parent's calendar
  // and silently drop the other.
  const events = (result.bookings ?? []).flatMap((booking) => {
    const start = booking.session_starts_at ? stamp(booking.session_starts_at) : ''
    return [
      'BEGIN:VEVENT',
      `SUMMARY:${result.studio_name} — ${booking.group_name}`,
      start ? `DTSTART:${start}` : '',
      'END:VEVENT',
    ]
  })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Manager//Trial//EN',
    ...events,
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function BookingConfirmed({
  result,
  locale,
}: {
  result: BookingResult
  locale: Locale
}) {
  return (
    <section style={pageStyle} aria-labelledby="booked-title" data-testid="booking-confirmed">
      <h2 id="booked-title">{t(locale, 'people.submitted.title')}</h2>
      <p>{t(locale, 'people.submitted.subtitle')}</p>

      {/* One card per child. §5.4a step 5 confirms what was actually booked, and with
          siblings in two groups there is no single group or time to confirm. */}
      {(result.bookings ?? []).map((booking, index) => (
        <Card key={booking.student_id}>
          <p>
            <bdi>{booking.student_display_name}</bdi>
          </p>
          <p data-testid={`booked-group-${index}`}>
            <bdi>{booking.group_name}</bdi>
          </p>
          {booking.session_starts_at ? (
            // G3 — stored UTC, rendered Asia/Jerusalem regardless of the reader's locale.
            <p data-testid={`booked-when-${index}`}>
              {formatDateInStudioZone(booking.session_starts_at, locale)}{' '}
              {formatTimeInStudioZone(booking.session_starts_at, locale)}
            </p>
          ) : null}
        </Card>
      ))}

      <a
        href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(result))}`}
        download="trial.ics"
        data-testid="booked-add-to-calendar"
      >
        {t(locale, 'people.trialHome.addToCalendar')}
      </a>

      <section aria-labelledby="booked-next">
        <h3 id="booked-next">{t(locale, 'people.submitted.whatNext')}</h3>
        <p data-testid="booked-bring">{t(locale, 'people.submitted.bringHint')}</p>
        {/* §6.5 — the install is part of onboarding, and this is the willing moment. */}
        <p data-testid="booked-install">{t(locale, 'people.submitted.installApp')}</p>
      </section>
    </section>
  )
}
