// Artboards 4d (מבחן חגורה · זכאות וקידום) and 6b (מבחני חגורה).
//
// **4d finding 2 decides the screen's whole shape.** The artboard conflates eligibility
// with the promotion decision: eligible rows arrive pre-checked and one button "confirms
// promotion" for whoever is ticked, with no exam RESULT entering anywhere. §5.9 makes a
// PASS the thing that writes the belt row. So this screen records results — a pass for the
// selected — and the promotion is what a pass does. There is no path here that awards a
// belt without a result.
//
// **4d finding 1, refused.** Promotion is gated on four things on the canvas and §5.9 names
// one. Rank and tenure are the spec's; attendance, outstanding debt and a missing health
// declaration are the artboard's, and none has a column. The debt gate would also put M6's
// balance on a screen §3.2 lets a lead coach open, which is the hard rule. Asserted as
// negatives, because a cut comes back as a column.
//
// **4d finding 6.** No confirmation and no result state, on a screen that writes belt rows
// in bulk. `events.belt.groupPromoteHint` exists and is not drawn.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ExamEligibilityScreen } from './ExamEligibilityScreen'
import type { CandidateOut, DashboardEventsClient, EventOut } from './client'

const EXAM: EventOut = {
  id: 'e1',
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
  rsvp_yes_count: 0,
  rsvp_no_count: 0,
  rsvp_pending_count: 3,
}

const WHITE = {
  id: 'r1',
  class_id: 'c1',
  name: 'לבנה',
  kyu: 6,
  order_index: 0,
  color_hex: '#FFFFFF',
  secondary_color_hex: null,
}
const YELLOW = {
  id: 'r2',
  class_id: 'c1',
  name: 'צהובה',
  kyu: 5,
  order_index: 1,
  color_hex: '#F7E017',
  secondary_color_hex: null,
}

const CANDIDATES: CandidateOut[] = [
  {
    student_id: 's1',
    student_display_name: 'דנה לוי',
    current_rank: WHITE,
    next_rank: YELLOW,
    months_at_rank: 5,
    eligible: true,
  },
  {
    student_id: 's2',
    student_display_name: 'יוסי כהן',
    current_rank: null,
    next_rank: WHITE,
    months_at_rank: null,
    eligible: true,
  },
  {
    student_id: 's3',
    student_display_name: 'רן בר',
    current_rank: YELLOW,
    next_rank: null,
    months_at_rank: 14,
    eligible: false,
  },
]

function makeClient(candidates = CANDIDATES): DashboardEventsClient {
  return {
    read: vi.fn().mockResolvedValue(EXAM),
    eligibility: vi
      .fn()
      .mockResolvedValue({ items: candidates, next_cursor: null, has_more: false }),
    recordResults: vi
      .fn()
      .mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
  } as unknown as DashboardEventsClient
}

function renderScreen(client = makeClient()) {
  render(<ExamEligibilityScreen client={client} eventId="e1" locale="he" />)
  return client
}

describe('4d — eligibility and promotion', () => {
  it('shows the tenure §5.9 names and no attendance percentage', async () => {
    renderScreen()
    expect(
      await screen.findByRole('columnheader', { name: t('he', 'events.exam.tenureAtRank') }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/נוכחות/)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('never shows a debt or a missing declaration as a blocker', async () => {
    renderScreen()
    await screen.findByRole('table')
    expect(screen.queryByText(/חוב/)).toBeNull()
    expect(screen.queryByText(/הצהרה/)).toBeNull()
    expect(screen.queryByText(/חסום/)).toBeNull()
    expect(screen.queryByText(/₪/)).toBeNull()
  })

  it('records a PASS rather than promoting without a result', async () => {
    const client = renderScreen()
    await userEvent.click(await screen.findByRole('checkbox', { name: /דנה לוי/ }))
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.exam.confirmPromotion')) }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: t('he', 'events.exam.confirmPromotion'),
      }),
    )
    // §5.9 — a pass is what writes the belt row. There is no award call on this screen.
    expect(client.recordResults).toHaveBeenCalledWith('e1', [
      { student_id: 's1', belt_rank_id: 'r2', result: 'pass', note: null },
    ])
  })

  it('confirms before an irreversible bulk write, and says what it will do', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('checkbox', { name: /דנה לוי/ }))
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.exam.confirmPromotion')) }),
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(t('he', 'events.belt.groupPromoteHint'))
  })

  it('does not let an ineligible row be selected', async () => {
    // 4d finding 5 — a blocked row's checkbox is indistinguishable from an ineligible one.
    // There is one kind of ineligible left: no rank above the one held.
    renderScreen()
    const box = await screen.findByRole('checkbox', { name: /רן בר/ })
    expect(box).toBeDisabled()
    expect(screen.getByText(t('he', 'events.exam.notEligible'))).toBeInTheDocument()
  })

  it('rings both swatches of every belt transition', async () => {
    renderScreen()
    const bars = await screen.findAllByRole('img')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('shows one swatch and no arrow for a candidate at the top of the ladder', async () => {
    // The structural difference 9d does so well: no next rank means no transition, shown
    // rather than said.
    renderScreen()
    const row = (await screen.findByRole('rowheader', { name: 'רן בר' })).closest('tr')!
    expect(within(row).getAllByRole('img')).toHaveLength(1)
  })

  it('shows a candidate with no belt as eligible for the first rung', async () => {
    // Where every child starts, and the common case at a club's first exam of the year.
    renderScreen()
    const row = (await screen.findByRole('rowheader', { name: 'יוסי כהן' })).closest('tr')!
    expect(within(row).getByRole('checkbox')).not.toBeDisabled()
    expect(within(row).getByText(t('he', 'events.belt.none'))).toBeInTheDocument()
  })

  it('renders an empty state for an exam with no candidates', async () => {
    renderScreen(makeClient([]))
    expect(await screen.findByText(t('he', 'events.exam.empty'))).toBeInTheDocument()
  })
})
