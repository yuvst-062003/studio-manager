// Artboards 9i (אירועים בצוות) and 9d (מבחן חגורה), the staff app's two events screens.
//
// **9d finding 1 is the whole of frame 2.** The artboard's candidate rows carry no pointer
// and no handler — it is a static picture of already-computed results, so it shows the
// destination and not the mechanism. Tap-to-cycle is the natural interaction and the one
// 1c and 9f already use for attendance, and it is not drawn anywhere. It is built here.
//
// **9d finding 3 — do NOT reuse `AttendanceMark`.** Structurally identical (filled check,
// filled cross, dashed dot) and semantically a different domain: `AttendanceState` is
// present | absent | notified | unmarked, and an exam result is pass | fail | pending.
// Reusing the attendance-named component would make an exam result a kind of attendance.
//
// **9i finding 7 is a KEEPER.** Its three RSVP renderings are state-appropriate rather
// than inconsistent, unlike 12h's three. Written down as a test so nobody later "unifies"
// them into one bar that reads as 0% before anyone has been asked.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ExamResultsScreen } from './ExamResultsScreen'
import { StaffEventsScreen } from './StaffEventsScreen'
import type { CandidateOut, EventOut, StaffEventsClient } from './client'

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
  rsvp_pending_count: 2,
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
    student_display_name: 'איתי כהן',
    current_rank: YELLOW,
    next_rank: null,
    months_at_rank: 9,
    eligible: false,
  },
]

function makeClient(over: Partial<StaffEventsClient> = {}): StaffEventsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    read: vi.fn().mockResolvedValue(EXAM),
    eligibility: vi
      .fn()
      .mockResolvedValue({ items: CANDIDATES, next_cursor: null, has_more: false }),
    recordResults: vi
      .fn()
      .mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    ...over,
  } as unknown as StaffEventsClient
}

function renderResults(client = makeClient()) {
  render(<ExamResultsScreen client={client} eventId="e1" locale="he" />)
  return client
}

describe('9d — recording exam results', () => {
  it('cycles a candidate pass → fail → not marked on tap', async () => {
    // 9d finding 1 — the artboard shows the outcome and not the interaction.
    renderResults()
    const row = await screen.findByRole('button', { name: /דנה לוי/ })
    // The row holds three `img` roles -- the mark and two belt bars -- so the mark is
    // addressed by its own class, the same handle the never-AttendanceMark test uses.
    const mark = () => row.querySelector('.studio-exam-mark')
    expect(mark()).toHaveAttribute('data-result', 'pending')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'pass')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'fail')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'pending')
  })

  it('uses ExamResultMark and never AttendanceMark', async () => {
    const { container } = render(
      <ExamResultsScreen client={makeClient()} eventId="e1" locale="he" />,
    )
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(container.querySelector('.studio-attendance')).toBeNull()
    expect(container.querySelector('.studio-exam-mark')).not.toBeNull()
  })

  it('shows two swatches on a pass and one on a candidate who cannot advance', async () => {
    // The best thing on 9d: the belt visual is STRUCTURALLY different rather than
    // annotated, so "no change" is shown instead of said.
    renderResults()
    const dana = await screen.findByRole('button', { name: /דנה לוי/ })
    expect(within(dana).getAllByRole('img').filter((el) => el.classList.contains('studio-belt-bar'))).toHaveLength(2)
    const itai = screen.getByRole('button', { name: /איתי כהן/ })
    expect(within(itai).getAllByRole('img').filter((el) => el.classList.contains('studio-belt-bar'))).toHaveLength(1)
  })

  it('scopes the consequence to a pass, and confirms before saving', async () => {
    // 9d finding 4 — events.exam.passPromotesHint is better than the drawn caption: it
    // scopes the consequence to a PASS and names the promotion. Ship the key, and add the
    // confirmation an effectively irreversible write needs.
    renderResults()
    const row = await screen.findByRole('button', { name: /דנה לוי/ })
    await userEvent.click(row)
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(t('he', 'events.exam.passPromotesHint'))
  })

  it('sends every marked candidate in ONE call', async () => {
    // §5.9 step 3 is one transaction. A per-row call would leave a half-promoted roster.
    const client = renderResults()
    await userEvent.click(await screen.findByRole('button', { name: /דנה לוי/ }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: t('he', 'events.exam.save'),
      }),
    )
    expect(client.recordResults).toHaveBeenCalledTimes(1)
    expect(client.recordResults).toHaveBeenCalledWith('e1', [
      { student_id: 's1', belt_rank_id: 'r2', result: 'pass', note: null },
    ])
  })

  it('sends nothing for a candidate left unmarked', async () => {
    const client = renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(client.recordResults).not.toHaveBeenCalled()
  })

  it('offers no makeup date, because a makeup sitting has no model', async () => {
    // 9d finding 2 — two places on the artboard depend on one, and §5.9 has no column.
    renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(screen.queryByText(/מועד השלמה/)).toBeNull()
  })

  it('never says a parent will be notified, because nothing notifies yet', async () => {
    // §5.9 step 4 is M8's. events.exam.passPromotesHint deliberately says nothing about it,
    // which the artboard audit had already noticed about the drawn caption.
    renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(screen.queryByText(/הודעה|יקבלו/)).toBeNull()
  })
})

describe('9i — the staff events list', () => {
  function renderList(rows: EventOut[]) {
    const client = makeClient({
      list: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    })
    render(
      <StaffEventsScreen
        client={client}
        locale="he"
        now="2026-11-12T09:00:00Z"
        onOpen={vi.fn()}
      />,
    )
    return client
  }

  it('keeps three state-appropriate RSVP renderings', async () => {
    // 9i finding 7 — unlike 12h's three, these are correct BECAUSE they differ. Recorded so
    // nobody unifies them into one bar that reads 0% before anyone has been asked.
    renderList([
      { ...EXAM, id: 'a', title: 'טרם נשלח', rsvp_yes_count: 0, rsvp_no_count: 0, rsvp_pending_count: 0 },
      { ...EXAM, id: 'b', title: 'בתהליך', rsvp_yes_count: 12, rsvp_no_count: 2, rsvp_pending_count: 8 },
      { ...EXAM, id: 'c', title: 'הושלם', rsvp_yes_count: 20, rsvp_no_count: 2, rsvp_pending_count: 0 },
    ])
    // Nobody invited: a headcount, and no bar to read as zero per cent.
    const notSent = await screen.findByRole('article', { name: 'טרם נשלח' })
    expect(within(notSent).queryByRole('progressbar')).toBeNull()
    // In progress: a bar and a fraction.
    const inProgress = screen.getByRole('article', { name: 'בתהליך' })
    expect(within(inProgress).getByRole('progressbar')).toBeInTheDocument()
    // Everyone answered: no outstanding count to chase.
    const done = screen.getByRole('article', { name: 'הושלם' })
    expect(within(done).queryByText(new RegExp(t('he', 'events.counts.pending')))).toBeNull()
  })

  it('shows a coach no fee anywhere', async () => {
    // §3.2's hard rule. The API redacts it; this asserts the screen does not reintroduce it.
    renderList([{ ...EXAM, fee_agorot: null, title: 'תחרות' }])
    await screen.findByRole('article', { name: 'תחרות' })
    expect(screen.queryByText(/₪/)).toBeNull()
    expect(screen.queryByText(t('he', 'events.fee.free'))).toBeNull()
  })

  it('renders the empty state a coach with no events is in', async () => {
    renderList([])
    expect(await screen.findByText(t('he', 'events.list.empty'))).toBeInTheDocument()
  })
})
