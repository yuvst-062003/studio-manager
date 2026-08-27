// Artboard 7c — עמוד אירוע.
//
// **D9.2 is clean on the canvas and stays clean here.** The participants table has six
// columns and none of them is משקל or קטגוריה. The audit verified the cut on the artboard;
// this verifies it in the component, because a cut comes back as a column long before
// anyone proposes reinstating the feature.
//
// The other findings that become tests:
//
// **Finding 2 — the two not-answered counts disagree**: the header button says 13 and the
// KPI card says 10. One number, computed once, from the same field.
//
// **Finding 4 — the em dash needs an accessible label.** A consent or a payment is
// meaningless until someone has said yes, and the em dash is the right model for that; a
// bare glyph is not a word a screen reader can read.
//
// **Finding 7 — the payment column is M6's data on M7's screen.** §3.2's hard rule reaches
// it: the API sends `charge_id: null` to a coach, and the column is absent rather than
// empty, because an empty money column reads as "nobody has paid".
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventPage } from './EventPage'
import type { DashboardEventsClient, EventOut, EventRegistrationOut } from './client'

const EVENT: EventOut = {
  id: 'e1',
  type: 'competition',
  title: 'אליפות מחוז השרון',
  description: null,
  starts_at: '2026-11-26T08:00:00Z',
  ends_at: '2026-11-26T14:00:00Z',
  location_id: null,
  location_text: 'היכל הספורט נתניה',
  rsvp_deadline: '2026-11-19T22:00:00Z',
  fee_agorot: 8000,
  requires_consent: true,
  consent_text: 'אישור',
  status: 'published',
  targets: [],
  rsvp_yes_count: 2,
  rsvp_no_count: 1,
  rsvp_pending_count: 2,
  consent_signed_count: 0,
}

function registration(over: Partial<EventRegistrationOut> = {}): EventRegistrationOut {
  return {
    id: 'r1',
    event_id: 'e1',
    student_id: 's1',
    student_display_name: 'דנה לוי',
    rsvp: 'yes',
    responded_by_person_id: 'p1',
    responded_at: '2026-11-13T09:00:00Z',
    consent_signed_at: '2026-11-13T09:05:00Z',
    charge_id: 'c1',
    attended: false,
    ...over,
  }
}

const ROSTER: EventRegistrationOut[] = [
  registration(),
  registration({ id: 'r2', student_id: 's2', student_display_name: 'יוסי כהן', rsvp: 'no', consent_signed_at: null, charge_id: null }),
  registration({ id: 'r3', student_id: 's3', student_display_name: 'רותם בר', rsvp: 'pending', consent_signed_at: null, charge_id: null }),
  registration({ id: 'r4', student_id: 's4', student_display_name: 'אורי דן', rsvp: 'yes', consent_signed_at: null, charge_id: null }),
  registration({ id: 'r5', student_id: 's5', student_display_name: 'מאיה גל', rsvp: 'pending', consent_signed_at: null, charge_id: null }),
]

function makeClient(roster = ROSTER, event = EVENT): DashboardEventsClient {
  return {
    read: vi.fn().mockResolvedValue(event),
    registrations: vi
      .fn()
      .mockResolvedValue({ items: roster, next_cursor: null, has_more: false }),
    markAttendance: vi.fn().mockResolvedValue({ marked: 1 }),
    cancel: vi.fn(),
  } as unknown as DashboardEventsClient
}

function renderPage(client = makeClient(), seesMoney = true) {
  render(<EventPage client={client} eventId="e1" locale="he" seesMoney={seesMoney} />)
  return client
}

describe('7c — the event page', () => {
  it('has no weight and no category column', async () => {
    renderPage()
    await screen.findByRole('table')
    expect(screen.queryByText(/משקל/)).toBeNull()
    expect(screen.queryByText(/קטגוריה/)).toBeNull()
  })

  it('names the same not-answered count in the button and in the tile', async () => {
    renderPage()
    const tile = await screen.findByRole('status', { name: t('he', 'events.counts.pending') })
    const button = screen.getByRole('button', {
      name: new RegExp(t('he', 'events.remindNonResponders')),
    })
    // Finding 2 — 13 in the button and 10 in the KPI on the canvas. One field, read twice.
    expect(within(tile).getByText('2')).toBeInTheDocument()
    expect(button.textContent).toContain('2')
  })

  it('labels the not-applicable cell rather than leaving a bare em dash', async () => {
    renderPage()
    await screen.findByRole('table')
    // A consent is meaningless until someone has said yes, so a declined and an unanswered
    // row both show one — and a screen reader needs the word, not the glyph.
    expect(
      screen.getAllByLabelText(t('he', 'events.roster.notApplicable')).length,
    ).toBeGreaterThan(0)
  })

  it('shows a payment column to a manager', async () => {
    renderPage(makeClient(), true)
    expect(
      await screen.findByRole('columnheader', {
        name: t('he', 'events.roster.columnPayment'),
      }),
    ).toBeInTheDocument()
  })

  it('shows a coach no payment column at all', async () => {
    // Absent, not empty. §3.2's hard rule nulls `charge_id` on the wire, and an empty money
    // column would read as "nobody has paid" — a worse answer than no column.
    renderPage(makeClient(), false)
    await screen.findByRole('table')
    expect(
      screen.queryByRole('columnheader', { name: t('he', 'events.roster.columnPayment') }),
    ).toBeNull()
    expect(screen.queryByText(/₪/)).toBeNull()
  })

  it('renders the empty roster state a new event is always in', async () => {
    renderPage(makeClient([]))
    expect(await screen.findByText(t('he', 'events.roster.empty'))).toBeInTheDocument()
  })

  it('is a real table with a caption and column headers', async () => {
    // §6.4 puts this in front of a manager who may be using a screen reader. A grid of divs
    // looks identical and is unreadable — the same reasoning 3b's table records.
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: t('he', 'events.rsvp.title') })).toBeInTheDocument()
    expect(table.querySelector('caption')).not.toBeNull()
  })

  it('counts what the KPI strip is for, from the roster it is showing', async () => {
    renderPage()
    const confirmed = await screen.findByRole('status', {
      name: t('he', 'events.counts.confirmed'),
    })
    // §5.8's gate: `yes` alone is not confirmed when the event wants a consent. Two rows
    // say yes and only one has signed.
    expect(within(confirmed).getByText('1')).toBeInTheDocument()
    const awaiting = screen.getByRole('status', {
      name: t('he', 'events.counts.awaitingConsent'),
    })
    expect(within(awaiting).getByText('1')).toBeInTheDocument()
  })
})
