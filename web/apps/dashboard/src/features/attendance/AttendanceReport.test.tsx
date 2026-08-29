import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadFile } from '@studio/core'
import type { RosterRow } from '@studio/core'
import { AttendanceReport } from './AttendanceReport'
import { AttendanceSection, defaultWindow } from './AttendanceSection'
import { QuickViewRoster } from './QuickViewRoster'
import { MAX_REPORT_DAYS, consecutiveAbsences, daysBetween } from './client'
import type { AttendanceReportData, DashboardAttendanceClient, GroupRate } from './client'

// F7b's download goes through a blob and an anchor, neither of which jsdom can be asked
// about afterwards. The URL it is handed is the assertion this screen actually needs — the
// export button and the date picker sit in the same header, and the whole point of gap 3
// is that they agree.
vi.mock('@studio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/core')>()),
  downloadFile: vi.fn(() => Promise.resolve()),
}))

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

const groupRate = (overrides: Partial<GroupRate> = {}): GroupRate => ({
  group_id: 'g1',
  group_name: 'מתחילים',
  present: 3,
  absent: 1,
  unmarked: 0,
  rate_percent: 75,
  sessions: 2,
  marked_sessions: 2,
  ...overrides,
})

function makeClient(
  unmarked: unknown[] = [],
  groups: GroupRate[] = [],
): DashboardAttendanceClient {
  return {
    sessionRoster: vi.fn(),
    bulkPresent: vi.fn(),
    mark: vi.fn(),
    report: vi.fn().mockResolvedValue({
      unmarked_sessions: unmarked,
      groups,
    } as unknown as AttendanceReportData),
  }
}

beforeEach(() => {
  document.documentElement.dir = 'rtl'
  vi.mocked(downloadFile).mockClear()
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
        client={makeClient([], [groupRate({ rate_percent: 76 })])}
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

// ── the per-group rate, which was built and wired to nothing ────────────────────────
describe('artboard 4c — the per-group rate', () => {
  it('renders the rate the API serves rather than an empty state', async () => {
    // The gap this closes: `groups` defaulted to `[]` and every caller took the default, so
    // the card that `4c` draws as name · bar · percentage had never once had a number in it.
    render(
      <AttendanceReport
        client={makeClient([], [groupRate({ group_id: 'g7', group_name: 'מתקדמים', rate_percent: 64 })])}
        locale="he"
        window={WINDOW}
      />,
    )
    expect(await screen.findByTestId('group-rate-g7')).toHaveTextContent('64%')
    expect(screen.getByRole('progressbar', { name: 'מתקדמים' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    )
  })

  it('shows the coverage the percentage was computed over', async () => {
    // 100% over one marked register out of nine is a different fact from 100% over nine,
    // and a bar alone cannot tell them apart. §5.14's whole point is that a forgotten
    // register is not data — so the screen says how much data there was.
    render(
      <AttendanceReport
        client={makeClient([], [groupRate({ marked_sessions: 1, sessions: 9 })])}
        locale="he"
        window={WINDOW}
      />,
    )
    expect(await screen.findByTestId('group-coverage-g1')).toHaveTextContent('1')
    expect(screen.getByTestId('group-coverage-g1')).toHaveTextContent('9')
  })

  it('draws NO bar for a group nobody marked, rather than a bar at zero', async () => {
    // 0% is a claim about children who did not come. "Nobody said" is not that claim, and a
    // zero-length bar would put the club's least-reported group where its worst-attended
    // one belongs.
    render(
      <AttendanceReport
        client={makeClient([], [groupRate({ rate_percent: null, present: 0, absent: 0, marked_sessions: 0 })])}
        locale="he"
        window={WINDOW}
      />,
    )
    expect(await screen.findByTestId('group-no-rate-g1')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('states that the percentage excludes unmarked registers', async () => {
    // The same rule the unmarked list states, applied to the number beside it. A percentage
    // whose denominator is unstated is a percentage someone will quote wrongly.
    render(<AttendanceReport client={makeClient([], [groupRate()])} locale="he" window={WINDOW} />)
    expect(await screen.findByTestId('rate-basis')).toHaveTextContent(
      'האחוז מחושב מתוך שיעורים שסומנו בלבד',
    )
  })
})

// ── the window, which was hard-coded ────────────────────────────────────────────────
describe('artboard 4c — the range the manager chose', () => {
  it('asks the API for the window it was handed', async () => {
    const client = makeClient()
    render(<AttendanceReport client={client} locale="he" window={WINDOW} />)
    await waitFor(() => expect(client.report).toHaveBeenCalledWith(WINDOW))
  })

  it('refetches when the picker moves the range', async () => {
    const client = makeClient()
    const onWindowChange = vi.fn()
    const { rerender } = render(
      <AttendanceReport
        client={client}
        locale="he"
        onWindowChange={onWindowChange}
        window={WINDOW}
      />,
    )
    await waitFor(() => expect(client.report).toHaveBeenCalledWith(WINDOW))

    const next = { from: '2026-10-01', to: '2026-10-31' }
    rerender(
      <AttendanceReport
        client={client}
        locale="he"
        onWindowChange={onWindowChange}
        window={next}
      />,
    )
    await waitFor(() => expect(client.report).toHaveBeenCalledWith(next))
  })

  it('adopts the shared DateRangePicker rather than growing its own', async () => {
    // `9b`'s primitive already pairs two date fields, sizes them alike and refuses an end
    // before its start. A second control on this screen would have to re-earn all of that
    // in two directions and three locales.
    render(
      <AttendanceReport
        client={makeClient()}
        locale="he"
        onWindowChange={vi.fn()}
        window={WINDOW}
      />,
    )
    // Two native date inputs with real labels — `9b`'s primitive, not a hand-rolled pair.
    // That it reports changes and refuses an inverted range is its own file's business; what
    // this screen owes is the current window in its fields. The section test below proves
    // the other end of the wire.
    const from = await screen.findByLabelText('מתאריך')
    expect(from).toHaveAttribute('type', 'date')
    expect(from).toHaveValue(WINDOW.from)
    expect(screen.getByLabelText('עד תאריך')).toHaveValue(WINDOW.to)
  })

  it('renders no picker at all when the caller owns no range state', async () => {
    // The control is offered only where somebody can act on it. A picker whose changes went
    // nowhere would be worse than none.
    render(<AttendanceReport client={makeClient()} locale="he" window={WINDOW} />)
    await screen.findByTestId('attendance-report')
    expect(screen.queryByLabelText('מתאריך')).toBeNull()
  })

  it('refuses a range longer than the export allows instead of firing a request that 422s', async () => {
    const client = makeClient()
    render(
      <AttendanceReport
        client={client}
        locale="he"
        onWindowChange={vi.fn()}
        window={{ from: '2020-01-01', to: '2026-11-04' }}
      />,
    )
    expect(await screen.findByTestId('range-too-long')).toBeInTheDocument()
    expect(client.report).not.toHaveBeenCalled()
  })
})

// ── the CSV, which followed a window nobody chose ───────────────────────────────────
describe('artboard 4c — the export follows the picker', () => {
  it('exports the chosen range, not the one the screen was born with', async () => {
    const next = { from: '2026-09-01', to: '2026-09-30' }
    render(
      <AttendanceReport
        client={makeClient()}
        locale="he"
        onWindowChange={vi.fn()}
        window={next}
      />,
    )
    await userEvent.click(await screen.findByTestId('attendance-export'))
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      '/api/v1/exports/attendance?from=2026-09-01&to=2026-09-30',
      'attendance-2026-09-01-2026-09-30.csv',
    )
  })

  it('does not offer a CSV for a range the export would refuse', async () => {
    render(
      <AttendanceReport
        client={makeClient()}
        locale="he"
        onWindowChange={vi.fn()}
        window={{ from: '2020-01-01', to: '2026-11-04' }}
      />,
    )
    await screen.findByTestId('range-too-long')
    expect(screen.getByTestId('attendance-export')).toBeDisabled()
  })
})

describe('the range arithmetic the guard stands on', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-11-03', '2026-11-04')).toBe(1)
    expect(daysBetween('2026-11-03', '2026-11-03')).toBe(0)
  })

  it('is not an hour short across a DST boundary', () => {
    // Israel moves the clock on 2026-03-27. A span computed from local midnights loses an
    // hour there, and an hour lost is a day lost the moment it rounds — which would let a
    // 401-day range through the guard and straight into the export's 422.
    expect(daysBetween('2026-03-26', '2026-03-28')).toBe(2)
  })

  it('sits exactly on the bound the export enforces', () => {
    expect(daysBetween('2025-09-30', '2026-11-04')).toBe(MAX_REPORT_DAYS)
  })
})

describe('the section that mounts it', () => {
  it('defaults to the week that has already happened', () => {
    // Was "the last 7 days plus tomorrow". Tomorrow was always inert — a lesson that has not
    // ended cannot be late — and the server now says so explicitly, so the default window
    // stops claiming otherwise.
    expect(defaultWindow('2026-11-03T21:30:00.000Z')).toEqual({
      from: '2026-10-27',
      to: '2026-11-03',
    })
  })

  it('reads today in the studio zone, not in UTC', () => {
    // 22:30 UTC on the 14th is 00:30 on the 15th in Asia/Jerusalem. A window computed off
    // `toISOString()` puts the manager a day behind their own club for two hours every
    // night.
    expect(defaultWindow('2026-03-14T22:30:00.000Z').to).toBe('2026-03-15')
  })

  it('hands the picker its own state so the range actually moves', async () => {
    render(<AttendanceSection locale="he" today="2026-11-03T12:00:00.000Z" />)
    const from = await screen.findByLabelText('מתאריך')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-10-01')
    await waitFor(() => expect(from).toHaveValue('2026-10-01'))
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
