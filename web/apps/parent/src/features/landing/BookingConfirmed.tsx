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
import { Card, Icon } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EventCalendarButtons } from '../comms/EventCalendarButtons'
import type { BookingResult } from './landingClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

// 13b's 64px check badge on `--paid` ground — the first thing the eye lands on, and the
// one place the semantic green is a celebration rather than a ledger state.
const badgeStyle: CSSProperties = {
  inlineSize: '64px',
  blockSize: '64px',
  borderRadius: 'var(--radius-circle)',
  background: 'var(--paid)',
  color: 'var(--on-accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--text-display)',
  flex: 'none',
}

const nextRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minBlockSize: '44px',
  margin: 0,
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
  address,
  phone,
}: {
  result: BookingResult
  locale: Locale
  /** 13b draws the address on the when-line; threaded from the landing payload. */
  address?: string | null
  /** Enables the change-the-time footer's WhatsApp link. */
  phone?: string | null
}) {
  const names = (result.bookings ?? [])
    .map((booking) => booking.student_display_name)
    .filter(Boolean)
  return (
    <section style={pageStyle} aria-labelledby="booked-title" data-testid="booking-confirmed">
      <span style={badgeStyle} aria-hidden="true" data-testid="booked-badge">
        ✓
      </span>
      {/* 13b — the child's name in the HEADLINE, not only in a card below. With siblings
          every name is in it; a headline naming one child would be wrong for the other. */}
      <h2 id="booked-title">
        {names.length > 0 ? (
          <bdi>
            {t(locale, 'people.submitted.titleNamed').replace('{{names}}', names.join(' · '))}
          </bdi>
        ) : (
          t(locale, 'people.submitted.title')
        )}
      </h2>
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
            // 13b's one line: date · time · group · address.
            <p data-testid={`booked-when-${index}`}>
              {formatDateInStudioZone(booking.session_starts_at, locale)} ·{' '}
              {formatTimeInStudioZone(booking.session_starts_at, locale)} ·{' '}
              <bdi>{booking.group_name}</bdi>
              {address ? <> · <bdi>{address}</bdi></> : null}
            </p>
          ) : null}
        </Card>
      ))}

      {/* L5 — the SAME calendar control the event pages use, fed the in-browser `.ics`:
          one VEVENT per child, because siblings can book different hours. */}
      <span data-testid="booked-add-to-calendar">
        <EventCalendarButtons
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(result))}`}
          locale={locale}
        />
      </span>

      <section aria-labelledby="booked-next">
        <h3 id="booked-next">{t(locale, 'people.submitted.whatNext')}</h3>
        {/* The declaration row states a FACT — it was signed at step 3, which is also why
            13b's drawn `חתימה על ההצהרה` button is moot and absent. The artboard's
            "WhatsApp sent" row is NOT here: nothing sends a WhatsApp, and a confirmation
            must not claim one went out. */}
        <p style={nextRowStyle} data-testid="booked-health-signed">
          <Icon name="documents" size={18} />
          {t(locale, 'people.submitted.healthSigned')}
        </p>
        <p style={nextRowStyle} data-testid="booked-bring">
          <Icon name="attendance" size={18} />
          {t(locale, 'people.submitted.bringHint')}
        </p>
        {/* §6.5 — the install is part of onboarding, and this is the willing moment. */}
        <p style={nextRowStyle} data-testid="booked-install">
          <Icon name="home" size={18} />
          {t(locale, 'people.submitted.installApp')}
        </p>
      </section>

      {/* 13b's footer — need to change the time? message us. */}
      <footer data-testid="booked-footer">
        <p>{t(locale, 'people.submitted.changeTime')}</p>
        {phone ? (
          <a
            className="studio-btn"
            data-variant="secondary"
            href={`https://wa.me/${phone.replace(/[^\d+]/g, '').replace(/^0/, '972')}`}
            data-testid="booked-whatsapp"
          >
            {t(locale, 'people.landing.whatsapp')}
          </a>
        ) : null}
      </footer>
    </section>
  )
}
