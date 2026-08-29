import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterRow } from '@studio/core'
import { AttendanceReport } from './AttendanceReport'
import { QuickViewRoster } from './QuickViewRoster'
import { consecutiveAbsences } from './client'
import type { DashboardAttendanceClient } from './client'

const WINDOW = { from: '2026-11-03', to: '2026-11-04' }

const row = (overrides: Partial<RosterRow> = {}): RosterRow => ({
  student_id: 'student-1',
  display_name: 'דנה כהן',
  belt_color_hex: null,
  belt_name: null,
  health_status: 'missing',
  derived_flags: {},
  status: 'unmarked',
  source: null,
  has_absence_report: false,
  absence_reason: null,
  ...overrides,
})

function makeClient(unmarked: unknown[] = []): DashboardAttendanceClient {
  return {
    sessionRoster: vi.fn(),
    bulkPresent: vi.fn(),
    mark: vi.fn(),
    unmarkedSessions: vi.fn().mockResolvedValue(unmarked),
  }
}

beforeEach(() => {
  document.documentElement.dir = 'rtl'
})

describe('artboard 4c — what is unmarked', () => {
  it('lists the sessions nobody marked', async () => {
    render(
      <AttendanceReport
        client={makeClient([
          {
            id: 'session-1',
            group_name: 'מתחילים',
            starts_at: '2026-11-03T15:00:00.000Z',
            coach_name: null,
            headcount: 12,
          },
        ])}
        locale="he"
        window={WINDOW}
      />,
    )
    expect(await screen.findByTestId('unmarked-session-1')).toBeInTheDocument()
  })

  it('STATES the unmarked-is-not-absence rule rather than only encoding it', async () => {
    // `4c` finding 1 — the artboard draws a strip reading present · absent · absent ·
    // unmarked · absent · unmarked and labels it *three consecutive absences*. "That is a
    // real rule, inferred from the data, stated nowhere."
    // `reports.attendance.unmarkedExcluded` exists "and this screen does not use it."
    render(<AttendanceReport client={makeClient()} locale="he" window={WINDOW} />)
    expect(await screen.findByTestId('unmarked-not-absence')).toHaveTextContent(
      'שיעורים שלא סומנו אינם נספרים כהיעדרות',
    )
  })

  it('draws the empty state, which is the goal state of the screen', async () => {
    // `4c` finding 6 — "Neither empty state is drawn, and both are the goal state." An empty
    // `ממתין לסימון` list is the club doing well; rendering nothing looks broken instead.
    render(<AttendanceReport client={makeClient([])} locale="he" window={WINDOW} />)
    expect(await screen.findByText('אין נתוני נוכחות לתקופה הזו')).toBeInTheDocument()
  })

  it('offers a mark-now action per row', async () => {
    const onMarkNow = vi.fn()
    render(
      <AttendanceReport
        client={makeClient([
          {
            id: 'session-1',
            group_name: 'מתחילים',
            starts_at: '2026-11-03T15:00:00.000Z',
            coach_name: null,
            headcount: 12,
          },
        ])}
        locale="he"
        onMarkNow={onMarkNow}
        window={WINDOW}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'סימון עכשיו' }))
    expect(onMarkNow).toHaveBeenCalledWith('session-1')
  })

  it('renders group rates as a bar with a readout', async () => {
    render(
      <AttendanceReport
        client={makeClient()}
        groups={[{ id: 'g1', name: 'מתחילים', rate: 76 }]}
        locale="he"
        window={WINDOW}
      />,
    )
    expect(await screen.findByTestId('group-rate-g1')).toHaveTextContent('76%')
  })

  it('does NOT render M9 s at-risk sidebar', async () => {
    // `4c` finding 2 — "The at-risk sidebar is M9's data on an M5 screen... Decide in the W3
    // contract whether M5 renders M9's at-risk list or whether this sidebar waits for W5 —
    // otherwise both lanes build it." W3's contract did not decide, so this lane does not
    // build it: every string in that sidebar lives in `reports`, which is M9's namespace.
    render(<AttendanceReport client={makeClient()} locale="he" window={WINDOW} />)
    await screen.findByTestId('attendance-report')
    expect(screen.queryByText('חניכים בסיכון')).not.toBeInTheDocument()
  })
})

describe('§5.14 — the at-risk streak, and why unmarked is a real state', () => {
  it('skips unmarked sessions without breaking the run', () => {
    // `4c`'s own card, verbatim: present · absent · absent · unmarked · absent · unmarked,
    // labelled *three consecutive absences*. The count only works if the unmarked squares
    // are neither counted nor treated as breaking the streak.
    expect(
      consecutiveAbsences([
        'present',
        'absent_unexcused',
        'absent_unexcused',
        'unmarked',
        'absent_unexcused',
        'unmarked',
      ]),
    ).toBe(3)
  })

  it('breaks the run on a session the child attended', () => {
    expect(consecutiveAbsences(['absent_unexcused', 'absent_unexcused', 'present'])).toBe(0)
  })

  it('counts an excused absence, because the child still did not train', () => {
    // §5.14's at-risk rule is about a child drifting away, and a parent reporting three
    // absences in a row is exactly the case a manager wants to hear about — the notice makes
    // it polite, not absent.
    expect(consecutiveAbsences(['absent_excused', 'absent_excused'])).toBe(2)
  })

  it('is zero for a child with no history at all', () => {
    expect(consecutiveAbsences([])).toBe(0)
  })

  it('is zero for a roster nobody has ever marked', () => {
    // The failure §5.14 exists to prevent: a coach who never took the register must not turn
    // every child in the group into an at-risk alert.
    expect(consecutiveAbsences(['unmarked', 'unmarked', 'unmarked'])).toBe(0)
  })
})

describe('artboard 1e — the Quick View roster', () => {
  it('scrolls rather than clipping', () => {
    // `1e` finding 2 — "the popover's roster is clipped, not scrollable, with no scroll
    // affordance. A group larger than fits has nowhere to go."
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        roster={[row()]}
      />,
    )
    expect(screen.getByTestId('quickview-list')).toHaveClass('quickview__list')
  })

  it('shows the absent count the artboard s summary drops', () => {
    // `1e` finding 5 — "the summary omits the absent count entirely, though absences are in
    // the roster." It is the number a manager opened the popover to find.
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        roster={[
          row({ student_id: 'a', status: 'present' }),
          row({ student_id: 'b', status: 'absent_unexcused' }),
          row({ student_id: 'c', status: 'unmarked' }),
        ]}
      />,
    )
    const summary = screen.getByTestId('quickview-summary')
    expect(summary).toHaveTextContent('נוכח')
    expect(summary).toHaveTextContent('נעדר')
    expect(summary).toHaveTextContent('לא סומן')
  })

  it('cycles a row on click', async () => {
    const onMark = vi.fn()
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={onMark}
        roster={[row({ status: 'unmarked' })]}
      />,
    )
    await userEvent.click(screen.getByTestId('quickview-row-student-1'))
    expect(onMark).toHaveBeenCalledWith('student-1', 'present')
  })

  it('does not cycle a parent s advance notice', async () => {
    // §10.5 — the server refuses it, and the screen agrees so the row does not flash a value
    // the next refresh takes back.
    const onMark = vi.fn()
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={onMark}
        roster={[row({ status: 'absent_excused', has_absence_report: true })]}
      />,
    )
    await userEvent.click(screen.getByTestId('quickview-row-student-1'))
    expect(onMark).not.toHaveBeenCalled()
    expect(screen.getByTestId('quickview-note-student-1')).toHaveTextContent('הודיעו מראש')
  })

  it('says the bulk button will not overwrite a parent report', () => {
    // `9f` finding 1, on the dashboard. `1e` draws the same button.
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        roster={[row()]}
      />,
    )
    expect(screen.getByTestId('quickview-bulk-hint')).toHaveTextContent(
      'לא ידרוס דיווחי הורים או סימונים קיימים',
    )
  })

  it('closes through a real button with an accessible name', async () => {
    // `1e` finding 3 — "The × has no handler and there is no backdrop. Dismissal is
    // undecided." Decided, and named: `common` carries only `nav.closeMenu`, which is the
    // drawer's.
    const onClose = vi.fn()
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={onClose}
        onMark={vi.fn()}
        roster={[row()]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'סגירת התצוגה המהירה' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('gives every mark an accessible name rather than colour alone', () => {
    // `1e` — notified and unmarked share `--pending` and differ only by solid vs dashed and
    // cross vs dot. SC 1.4.1 needs the name as well as the shape.
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        roster={[row({ status: 'absent_excused' })]}
      />,
    )
    expect(screen.getByLabelText('נעדר בהצדקה')).toBeInTheDocument()
  })
})

// ── the plan badge on a roster row (2026-08-29) ─────────────────────────────────────
describe('the plan badge never reaches a coach', () => {
  it('draws the badge when the caller supplies plans', () => {
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        plans={{ frequencies: { s1: 3 }, names: { s1: 'x' }, loading: false }}
        roster={[row({ student_id: 's1', display_name: 'דנה לוי' })]}
      />,
    )
    expect(screen.getByTestId('plan-badge')).toHaveTextContent('×3')
  })

  it('renders NO badge at all when plans are absent — which is a coach', () => {
    // §3.2's hard rule: coaches never see money, and `price_plan_id` is what invariant 3's
    // detector treats as a financial field. The permission lives with the caller, so a
    // coach's roster has no plan data in it to leak rather than having some it must
    // remember to hide. Passing nothing is the whole mechanism, and this is that test.
    render(
      <QuickViewRoster
        locale="he"
        onBulkPresent={vi.fn()}
        onClose={vi.fn()}
        onMark={vi.fn()}
        roster={[row({ student_id: 's1', display_name: 'דנה לוי' })]}
      />,
    )
    expect(screen.queryByTestId('plan-badge')).toBeNull()
  })
})
