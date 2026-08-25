// Parent artboard 13b — אחרי השליחה.
//
// The load-bearing test here is the negative one: L6 says the public link's only job is a
// first lesson, so nothing on this screen may promise a place in the club.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { BookingConfirmed, icsFor } from './BookingConfirmed'
import type { BookingResult } from './landingClient'

const RESULT: BookingResult = {
  studio_slug: 'judo-tel-aviv',
  studio_name: 'מועדון ג׳ודו',
  group_name: 'מתחילים',
  session_starts_at: '2026-09-06T14:00:00Z',
  students: [{ id: 'st1', first_name: 'נועה', last_name: 'לוי' }],
} as unknown as BookingResult

describe('BookingConfirmed — 13b', () => {
  it('confirms the booking', () => {
    render(<BookingConfirmed result={RESULT} locale="he" />)
    expect(
      screen.getByRole('heading', { name: t('he', 'people.submitted.title') }),
    ).toBeInTheDocument()
  })

  it('renders the group and the time', () => {
    render(<BookingConfirmed result={RESULT} locale="he" />)
    expect(screen.getByTestId('booked-group')).toHaveTextContent('מתחילים')
    expect(screen.getByTestId('booked-when')).not.toBeEmptyDOMElement()
  })

  it('names each child who was booked', () => {
    render(<BookingConfirmed result={RESULT} locale="he" />)
    expect(screen.getByText(/נועה לוי/)).toBeInTheDocument()
  })

  it('offers add-to-calendar with an accessible name', () => {
    // §5.4a step 5 — '[ הוסף ליומן ] · .ics'. An icon-only control with no name is
    // unreachable to a screen reader (.claude/rules/ui-rtl-a11y.md).
    render(<BookingConfirmed result={RESULT} locale="he" />)
    const link = screen.getByTestId('booked-add-to-calendar')
    expect(link).toHaveAccessibleName(t('he', 'people.trialHome.addToCalendar'))
    expect(link).toHaveAttribute('download', 'trial.ics')
  })

  it('tells the parent what to bring', () => {
    render(<BookingConfirmed result={RESULT} locale="he" />)
    expect(screen.getByTestId('booked-bring')).toHaveTextContent(
      t('he', 'people.submitted.bringHint'),
    )
  })

  it('offers the install here, where the parent is most willing', () => {
    // §6.5 — the install is part of onboarding. It belongs after the thing they wanted,
    // not in front of the shop window.
    render(<BookingConfirmed result={RESULT} locale="he" />)
    expect(screen.getByTestId('booked-install')).toBeInTheDocument()
  })

  it('promises no place in the club and no payment', () => {
    // L6 — 'the public link's only job is to get someone through the door for a first
    // lesson. Nobody enrols themselves.' A "complete your registration" button here would
    // offer something no manager has granted.
    render(<BookingConfirmed result={RESULT} locale="he" />)
    const text = document.body.textContent ?? ''
    expect(text).not.toContain(t('he', 'people.enrollment.add'))
    expect(text).not.toContain(t('he', 'people.convert.title'))
    expect(text).not.toContain('₪')
  })

  it('survives a booking with no session picked', () => {
    // A manager-logged phone enquiry has no session id. The screen still confirms.
    const noSession = { ...RESULT, session_starts_at: null } as unknown as BookingResult
    render(<BookingConfirmed result={noSession} locale="he" />)
    expect(screen.queryByTestId('booked-when')).toBeNull()
    expect(screen.getByTestId('booking-confirmed')).toBeInTheDocument()
  })

  it('renders no physical CSS', () => {
    const { container } = render(<BookingConfirmed result={RESULT} locale="en" />)
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

describe('icsFor', () => {
  it('builds a calendar event the phone can open', () => {
    const ics = icsFor(RESULT)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('מתחילים')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('writes DTSTART as a UTC stamp', () => {
    // G3 renders in Asia/Jerusalem everywhere else, but an ICS DTSTART is UTC by design
    // (`...Z`) and the calendar app converts in the reader's own zone. This is the one
    // place where NOT converting is the correct answer.
    expect(icsFor(RESULT)).toContain('DTSTART:20260906T140000Z')
  })

  it('omits DTSTART when no session was picked, rather than emitting a broken one', () => {
    const noSession = { ...RESULT, session_starts_at: null } as unknown as BookingResult
    const ics = icsFor(noSession)
    expect(ics).not.toContain('DTSTART')
    expect(ics).toContain('END:VCALENDAR')
  })
})
