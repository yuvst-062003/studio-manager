// Artboard 6b — מבחני חגורה, the exam roundup.
//
// **Finding 4 is the one worth keeping.** 6b's draft treatment is BETTER than 7a's: it says
// *why* the draft is incomplete (טיוטה — טרם נקבעו תנאים) where 7a says only טיוטה. Use
// 6b's, and add `events.status.draftHint`, which neither artboard draws.
//
// **Finding 2.** The create panel is drawn pre-filled with the highlighted exam's values
// while titled "new exam". A create form that opens populated with another exam's data is a
// bug waiting to be reported.
//
// **Finding 1, refused.** The panel makes eligibility configurable on three axes §5.9 does
// not have — a minimum attendance percentage, a block on debt or a missing document, and an
// exam fee tied to a catalogue item. None has a column, and 6b's own audit says the
// decision belonged in the W4 contract commit, which did not make it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ExamsScreen } from './ExamsScreen'
import type { DashboardEventsClient, EventOut } from './client'

function exam(over: Partial<EventOut> = {}): EventOut {
  return {
    id: 'x1',
    type: 'belt_exam',
    title: 'מבחן סתיו',
    description: null,
    starts_at: '2026-11-26T15:00:00Z',
    ends_at: '2026-11-26T17:00:00Z',
    location_id: null,
    location_text: 'אולם א׳',
    rsvp_deadline: null,
    fee_agorot: null,
    requires_consent: false,
    consent_text: null,
    status: 'published',
    targets: [],
    rsvp_yes_count: 9,
    rsvp_no_count: 0,
    rsvp_pending_count: 8,
    ...over,
  }
}

function makeClient(rows: EventOut[]): DashboardEventsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    create: vi.fn().mockResolvedValue({ id: 'x9' }),
  } as unknown as DashboardEventsClient
}

const NOW = '2026-11-12T09:00:00Z'

function renderScreen(rows: EventOut[] = [exam()]) {
  const client = makeClient(rows)
  render(<ExamsScreen client={client} locale="he" now={NOW} onOpen={vi.fn()} />)
  return client
}

describe('6b — the exam roundup', () => {
  it('asks the server only for belt exams', async () => {
    const client = renderScreen()
    await screen.findByRole('article', { name: /מבחן סתיו/ })
    // A roundup of exams is a filtered event list, not a second list. One endpoint.
    expect(client.list).toHaveBeenCalledWith('belt_exam')
  })

  it('says why a draft is a draft, not only that it is one', async () => {
    // 6b finding 4 — this artboard's draft copy is better than 7a's, and neither draws the
    // consequence.
    renderScreen([exam({ id: 'd1', title: 'מבחן אביב', status: 'draft' })])
    const card = await screen.findByRole('article', { name: /מבחן אביב/ })
    expect(within(card).getByText(t('he', 'events.status.draftWhy'))).toBeInTheDocument()
    expect(within(card).getByText(t('he', 'events.status.draftHint'))).toBeInTheDocument()
  })

  it('opens the create panel blank rather than pre-filled with another exam', async () => {
    // 6b finding 2.
    renderScreen()
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'events.exam.new') }),
    )
    expect(screen.getByLabelText(t('he', 'events.form.name'))).toHaveValue('')
  })

  it('offers no eligibility-condition fields', async () => {
    // 6b finding 1 — three axes §5.9 does not have.
    renderScreen()
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'events.exam.new') }),
    )
    expect(screen.queryByText(/נוכחות מינימלית/)).toBeNull()
    expect(screen.queryByText(/חסימה/)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('creates an exam as a belt_exam, whatever else the form says', async () => {
    const client = renderScreen()
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'events.exam.new') }),
    )
    await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'מבחן חורף')
    await userEvent.type(
      screen.getByLabelText(t('he', 'events.form.startsAt')),
      '2026-12-10T17:00',
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    // §5.9 — a belt exam IS an event with type='belt_exam', and the server refuses results
    // on anything else. The type is not a choice on this screen.
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'belt_exam' }),
    )
  })

  it('renders the empty state a club is in most of the year', async () => {
    renderScreen([])
    expect(await screen.findByText(t('he', 'events.exam.empty'))).toBeInTheDocument()
  })
})
