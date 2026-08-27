// Artboard 7a — the manager's roundup.
//
// The tests that carry weight are the audit's own findings.
//
// **Finding 1: a draft is barely distinguished, and §4.3 makes drafts invisible to
// guardians.** On the canvas the only signal is the word טיוטה in the same grey as a price,
// on the card with the plainest border of the four. `events.status.draftHint` — אירוע
// בטיוטה אינו מוצג להורים — exists and is not drawn. Draft is the one status with a
// consequence outside the club, so it is the one status that must state it.
//
// **Finding 2: the filter taxonomy and `events.type.*` do not match.** 7a draws five chips,
// two of which (אימון מיוחד, מחנה) are not enum members, while three members (seminar,
// joint training, trip) have no chip. The enum is a CHECK constraint in revision 0008 and
// lanes never run migrations, so the enum wins and the chips are built from it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventsScreen, splitByTime } from './EventsScreen'
import type { DashboardEventsClient, EventOut } from './client'

// An ISO instant, matching `useToday()`'s return type — see EventsScreen's `now` prop.
const NOW = '2026-11-12T09:00:00Z'

function event(over: Partial<EventOut> = {}): EventOut {
  return {
    id: 'e1',
    type: 'competition',
    title: 'אליפות החורף',
    description: null,
    starts_at: '2026-11-26T08:00:00Z',
    ends_at: '2026-11-26T14:00:00Z',
    location_id: null,
    location_text: 'היכל הספורט',
    rsvp_deadline: '2026-11-19T22:00:00Z',
    fee_agorot: 8000,
    requires_consent: true,
    consent_text: 'אישור',
    status: 'published',
    targets: [],
    rsvp_yes_count: 14,
    rsvp_no_count: 3,
    rsvp_pending_count: 6,
    consent_signed_count: 0,
    ...over,
  }
}

function makeClient(rows: EventOut[]): DashboardEventsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    cancel: vi.fn(),
    registrations: vi.fn(),
    eligibility: vi.fn(),
    recordResults: vi.fn(),
    markAttendance: vi.fn(),
  } as unknown as DashboardEventsClient
}

describe('7a — the events roundup', () => {
  it('says on the card what a draft MEANS, not only that it is one', async () => {
    render(
      <EventsScreen
        client={makeClient([event({ id: 'd1', title: 'מחנה קיץ', status: 'draft' })])}
        locale="he"
        now={NOW}
        onOpen={vi.fn()}
      />,
    )
    const card = await screen.findByRole('article', { name: /מחנה קיץ/ })
    expect(within(card).getByText(t('he', 'events.status.draft'))).toBeInTheDocument()
    // 7a finding 1 — the consequence, drawn.
    expect(within(card).getByText(t('he', 'events.status.draftHint'))).toBeInTheDocument()
  })

  it('offers a filter for every enum member and none that is not one', async () => {
    render(
      <EventsScreen client={makeClient([event()])} locale="he" now={NOW} onOpen={vi.fn()} />,
    )
    const filters = await screen.findByRole('group', { name: t('he', 'events.title') })
    for (const type of [
      'competition',
      'belt_exam',
      'seminar',
      'joint_training',
      'trip',
      'other',
    ]) {
      expect(
        within(filters).getByRole('button', {
          name: new RegExp(t('he', `events.type.${type}`)),
        }),
      ).toBeInTheDocument()
    }
    // 7a finding 2 — the canvas's two non-members do not appear.
    expect(within(filters).queryByText(/אימון מיוחד/)).toBeNull()
    expect(within(filters).queryByText(/^מחנה/)).toBeNull()
  })

  it('asks the server for one type when a filter is chosen', async () => {
    const client = makeClient([event()])
    render(<EventsScreen client={client} locale="he" now={NOW} onOpen={vi.fn()} />)
    await screen.findByRole('article', { name: /אליפות החורף/ })
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.type.belt_exam')) }),
    )
    // Filtered server-side rather than in the browser: the list is cursor-paginated, so a
    // client-side filter would only ever filter the page it happens to be holding.
    expect(client.list).toHaveBeenLastCalledWith('belt_exam')
  })

  it('splits upcoming from past on the start, not on the status', () => {
    // A cancelled event next week is still upcoming — the office is still phoning about
    // it. A completed one is past because it happened, not because someone marked it.
    const past = event({ id: 'p1', starts_at: '2026-10-01T08:00:00Z', status: 'completed' })
    const soon = event({ id: 'u1', starts_at: '2026-11-26T08:00:00Z' })
    const cancelled = event({ id: 'c1', starts_at: '2026-11-20T08:00:00Z', status: 'cancelled' })
    const { upcoming, past: gone } = splitByTime([past, soon, cancelled], NOW)
    expect(upcoming.map((e) => e.id)).toEqual(['c1', 'u1'])
    expect(gone.map((e) => e.id)).toEqual(['p1'])
  })

  it('renders the empty state rather than an empty page', async () => {
    // 7a finding: not drawn on the canvas, and a studio between seasons is exactly it.
    render(<EventsScreen client={makeClient([])} locale="he" now={NOW} onOpen={vi.fn()} />)
    expect(await screen.findByText(t('he', 'events.list.empty'))).toBeInTheDocument()
  })

  it('shows a fee through MoneyDisplay and never as an interpolated string', async () => {
    render(
      <EventsScreen client={makeClient([event()])} locale="he" now={NOW} onOpen={vi.fn()} />,
    )
    const card = await screen.findByRole('article', { name: /אליפות החורף/ })
    // The primitive owns the bidi isolation; hand-built markup is where a ₪ flips in RTL.
    const money = within(card).getByText(/80/)
    expect(money.closest('.studio-money')).not.toBeNull()
  })

  it('omits the fee entirely when the server redacted it for a coach', async () => {
    // §3.2's hard rule. The API nulls it; this asserts the screen does not reintroduce a
    // placeholder that reads as "free".
    render(
      <EventsScreen
        client={makeClient([event({ fee_agorot: null })])}
        locale="he"
        now={NOW}
        onOpen={vi.fn()}
      />,
    )
    const card = await screen.findByRole('article', { name: /אליפות החורף/ })
    expect(within(card).queryByText(/₪/)).toBeNull()
    expect(within(card).queryByText(t('he', 'events.fee.free'))).toBeNull()
  })

  it('says free only when the event really is free', async () => {
    render(
      <EventsScreen
        client={makeClient([event({ fee_agorot: null, requires_consent: false })])}
        locale="he"
        now={NOW}
        onOpen={vi.fn()}
        seesMoney
      />,
    )
    const card = await screen.findByRole('article', { name: /אליפות החורף/ })
    expect(within(card).getByText(t('he', 'events.fee.free'))).toBeInTheDocument()
  })

  it('counts what has not been answered, because that is the point of the list', async () => {
    render(
      <EventsScreen client={makeClient([event()])} locale="he" now={NOW} onOpen={vi.fn()} />,
    )
    const card = await screen.findByRole('article', { name: /אליפות החורף/ })
    const bar = within(card).getByRole('progressbar')
    // 14 answered yes of 23 invited. §5.8's whole point is seeing who has NOT answered.
    expect(bar).toHaveAttribute('aria-valuenow', '14')
    expect(bar).toHaveAttribute('aria-valuemax', '23')
    expect(within(card).getByText(new RegExp(t('he', 'events.counts.pending')))).toBeInTheDocument()
  })

  it('never renders a weight or a category anywhere', async () => {
    // D9.2, asserted on the screen as well as in the namespace.
    render(
      <EventsScreen client={makeClient([event()])} locale="he" now={NOW} onOpen={vi.fn()} />,
    )
    await screen.findByRole('article', { name: /אליפות החורף/ })
    expect(screen.queryByText(/משקל/)).toBeNull()
    expect(screen.queryByText(/קטגוריה/)).toBeNull()
  })

  it('surfaces a failure instead of rendering an empty list', async () => {
    // Neither loading nor error is drawn on the canvas. An error that looked like "no
    // events" would have a manager wondering where their season went.
    const client = makeClient([])
    client.list = vi.fn().mockRejectedValue(new Error('500'))
    render(<EventsScreen client={client} locale="he" now={NOW} onOpen={vi.fn()} />)
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
    expect(screen.getByTestId('load-failed-retry')).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'events.list.empty'))).toBeNull()
  })
})
