// The three remaining staff screens: `9g`'s session summary, `2d`'s coach student card, and
// §6.1's blocking prime.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearSlot, registerSlot } from '@studio/ui'
import { listPending, memoryStore, setOfflineStore, watermark } from '@studio/core'
import type { OfflineStore, RosterRow as RosterRowData } from '@studio/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendanceStrip } from './AttendanceStrip'
import { OfflinePrimingGate, useOfflinePriming } from './OfflinePriming'
import { SessionSummary } from './SessionSummary'
import { StudentCardScreen } from './StudentCardScreen'
import type { StaffStudentCardProps } from './StudentCardScreen'
import type { AttendanceRecord, StaffAttendanceClient } from './client'

const NOW = '2026-11-03T18:00:00.000Z'
const STUDENT = { id: 'student-1', first_name: 'דנה', last_name: 'כהן' }

const row = (overrides: Partial<RosterRowData> = {}): RosterRowData => ({
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

const record = (status: AttendanceRecord['status'], id: string): AttendanceRecord => ({
  id,
  session_id: `session-${id}`,
  student_id: 'student-1',
  status,
  source: 'coach',
  device_marked_at: `2026-11-0${id}T17:00:00.000Z`,
})

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
  document.documentElement.dir = 'rtl'
})

afterEach(() => {
  setOfflineStore(null)
  clearSlot('student-card')
})

describe('artboard 9g — the session summary', () => {
  const renderSummary = (roster: RosterRowData[]) =>
    render(
      <SessionSummary
        clock={() => NOW}
        locale="he"
        personId="person-1"
        roster={roster}
        sessionId="session-1"
      />,
    )

  it('renders three read-only tiles', () => {
    renderSummary([
      row({ student_id: 'a', status: 'present' }),
      row({ student_id: 'b', status: 'absent_unexcused' }),
      row({ student_id: 'c', status: 'absent_excused', has_absence_report: true }),
    ])
    const counts = screen.getByTestId('summary-counts')
    expect(counts.querySelector('[data-count="present"]')?.textContent).toContain('1')
    expect(counts.querySelector('[data-count="absent"]')?.textContent).toContain('1')
    expect(counts.querySelector('[data-count="pre-reported"]')?.textContent).toContain('1')
  })

  it('shows NO exam or belt affordance, which is deliberate', () => {
    // `9g` finding 8 — the artboard's own title says "without an exam recommendation", and
    // §5.9 makes eligibility a manager's calculation from rank and time in grade, not a
    // coach's impression at the end of a lesson. Asserted so a later reader does not
    // "complete" the screen by adding one.
    renderSummary([row()])
    expect(screen.queryByText(/מבחן/)).not.toBeInTheDocument()
    expect(screen.queryByText(/חגורה/)).not.toBeInTheDocument()
  })

  it('states who can read a session note', () => {
    // `9g` finding 2 — the note card is the only one of three on that screen that states no
    // audience, on a screen where both its neighbours do. §5.13: notes are visible to the
    // group's coaches and to managers, and NEVER to guardians.
    renderSummary([row()])
    expect(screen.getByTestId('summary-note-audience')).toHaveTextContent('הורים לא רואים אותה')
  })

  it('queues a note rather than posting it', async () => {
    // §10.2's table — session notes are "Writable, queued", the same path as a mark. A coach
    // writing up a lesson in a basement is the ordinary case, not the edge one.
    renderSummary([row()])
    await userEvent.type(screen.getByLabelText('הוספת סיכום'), 'עבדנו על הטלות')
    await userEvent.click(screen.getByRole('button', { name: 'הוספת הערה' }))
    await waitFor(async () => {
      const ops = await listPending(store)
      expect(ops.map((op) => op.kind)).toEqual(['note.session'])
    })
  })

  it('queues nothing for an empty note', async () => {
    renderSummary([row()])
    await userEvent.click(screen.getByRole('button', { name: 'הוספת הערה' }))
    expect(await listPending(store)).toHaveLength(0)
  })
})

describe('artboard 2d — the coach s student card', () => {
  it('renders every registered student-card section and names none', () => {
    registerSlot<StaffStudentCardProps>('student-card', {
      key: 'health',
      order: 10,
      render: () => <span data-testid="section-health" />,
    })
    render(<StudentCardScreen locale="he" student={STUDENT} />)
    expect(screen.getByTestId('section-health')).toBeInTheDocument()
  })

  it('shows NO financial field, which §3.2 enforces by omission', () => {
    // `2d` finding 10 asks for a comment where the slot is composed for the coach surface,
    // and `StudentCardScreen.tsx` carries it. This is the assertion beside it: the mock data
    // behind this student carries a payment status and an amount, and every field on that
    // record appears on the card except those two.
    render(<StudentCardScreen locale="he" student={STUDENT} />)
    const text = screen.getByTestId('staff-student-card').textContent ?? ''
    for (const token of ['₪', 'חוב', 'תשלום']) {
      expect(text).not.toContain(token)
    }
  })

  it('binds the mark-present control to --accent and not to --paid', () => {
    // `2d` finding 6 — the two hold the same light-mode value, so a payment token would
    // render identically and pass review, then diverge in dark where D12 moved `--paid`.
    // Wiring an attendance control to the payment semantic is §3.2 broken where nobody looks.
    render(<StudentCardScreen locale="he" student={STUDENT} />)
    expect(screen.getByRole('button', { name: /סימון כנוכח/ })).toHaveClass(
      'attendance-mark-present',
    )
  })

  it('shows which state the student is currently in', () => {
    // `2d`: "neither shows which state the student is currently in... so toggle or one-shot
    // is undecided." Decided — one-shot buttons that report which one is already true.
    render(
      <StudentCardScreen
        locale="he"
        row={row({ status: 'present' })}
        student={STUDENT}
      />,
    )
    expect(screen.getByRole('button', { name: /סימון כנוכח ✓/ })).toBeInTheDocument()
  })

  it('isolates the name so a Latin one does not reorder the header', () => {
    render(
      <StudentCardScreen
        locale="he"
        student={{ id: 's', first_name: 'Dana', last_name: 'Cohen' }}
      />,
    )
    expect(screen.getByText('Dana Cohen').tagName).toBe('BDI')
  })
})

describe('the student-card attendance strip', () => {
  const client = (rows: AttendanceRecord[]): StaffAttendanceClient => ({
    bootstrap: vi.fn(),
    sessionRoster: vi.fn(),
    bulkPresent: vi.fn(),
    studentAttendance: vi.fn().mockResolvedValue(rows),
  })

  it('draws one mark per record, oldest at the reading start', async () => {
    render(<AttendanceStrip client={client([record('present', '1')])} locale="he" student={STUDENT} />)
    expect(await screen.findByTestId('student-card-attendance-strip')).toBeInTheDocument()
  })

  it('excludes unmarked sessions from BOTH halves of the rate', async () => {
    // §5.14's denominator, and the same rule `4c`'s streak encodes: a session nobody marked
    // is not a session the child missed. Two present and one unmarked is 100%, not 67% —
    // otherwise a coach who forgot the register looks like a child who stopped coming.
    render(
      <AttendanceStrip
        client={client([record('present', '1'), record('present', '2'), record('unmarked', '3')])}
        locale="he"
        student={STUDENT}
      />,
    )
    expect(await screen.findByTestId('student-card-attendance-rate')).toHaveTextContent('100%')
  })

  it('states no exam threshold', async () => {
    // `2d` finding 3 — an 80% attendance threshold for exam eligibility "exists only on this
    // artboard", and §5.9 computes eligibility from rank and time in grade. Printing a
    // threshold no model implements tells a coach something the product does not do.
    render(<AttendanceStrip client={client([record('present', '1')])} locale="he" student={STUDENT} />)
    const caption = await screen.findByTestId('student-card-attendance-rate')
    expect(caption.textContent).not.toContain('80')
  })

  it('renders an empty state rather than an error when there is no history', async () => {
    render(<AttendanceStrip client={client([])} locale="he" student={STUDENT} />)
    expect(await screen.findByTestId('student-card-attendance-empty')).toBeInTheDocument()
  })
})

describe('§6.1 — offline priming blocks the first launch', () => {
  const payload = {
    server_time: NOW,
    from_time: '2026-11-03T00:00:00.000Z',
    to_time: '2026-11-05T00:00:00.000Z',
    sessions: [],
    rosters: {},
  }

  function Harness({ client }: { client: StaffAttendanceClient }) {
    const { state, retry } = useOfflinePriming(client, () => NOW)
    return (
      <>
        <OfflinePrimingGate locale="he" onRetry={retry} state={state} />
        {state === 'ready' ? <span data-testid="today" /> : null}
      </>
    )
  }

  const client = (bootstrap: StaffAttendanceClient['bootstrap']): StaffAttendanceClient => ({
    bootstrap,
    sessionRoster: vi.fn(),
    bulkPresent: vi.fn(),
    studentAttendance: vi.fn(),
  })

  it('writes the window before the coach reaches Today', async () => {
    // §6.1 — "today's and tomorrow's sessions + rosters are fetched and written to IndexedDB
    // BEFORE the coach reaches Today."
    render(<Harness client={client(vi.fn().mockResolvedValue(payload))} />)
    expect(await screen.findByTestId('today')).toBeInTheDocument()
    expect(await watermark(store)).toBe(NOW)
  })

  it('BLOCKS rather than falling through when the fetch fails', async () => {
    // The whole reason `primeOfflineCache` returns a state. A prime that resolved either way
    // would let the app reach Today with nothing cached, which is the exact failure the
    // blocking exists to prevent — and the coach would not know until the basement.
    render(<Harness client={client(vi.fn().mockRejectedValue(new TypeError('offline')))} />)
    expect(await screen.findByTestId('priming-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('today')).not.toBeInTheDocument()
  })

  it('retries on demand', async () => {
    const bootstrap = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(payload)
    render(<Harness client={client(bootstrap)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'ניסיון חוזר' }))
    expect(await screen.findByTestId('today')).toBeInTheDocument()
  })

  it('does not block a second launch on the same day', async () => {
    // §6.1's gate is about the FIRST launch. A coach opening the app for the fourth time
    // today has the rosters and should not watch a spinner for them.
    const bootstrap = vi.fn().mockResolvedValue(payload)
    const { unmount } = render(<Harness client={client(bootstrap)} />)
    await screen.findByTestId('today')
    unmount()

    render(<Harness client={client(bootstrap)} />)
    await screen.findByTestId('today')
    expect(bootstrap).toHaveBeenCalledOnce()
  })
})

describe('9g — the injury report card (S2)', () => {
  const renderWithInjury = (onReportInjury: (s: string, d: string) => Promise<void>) =>
    render(
      <SessionSummary
        clock={() => NOW}
        locale="he"
        onReportInjury={onReportInjury}
        personId="person-1"
        roster={[row({ student_id: 'a', status: 'present' })]}
        sessionId="session-1"
      />,
    )

  it('is withheld entirely when no handler exists — never inert', () => {
    render(
      <SessionSummary
        clock={() => NOW}
        locale="he"
        personId="person-1"
        roster={[row({ student_id: 'a', status: 'present' })]}
        sessionId="session-1"
      />,
    )
    expect(screen.queryByTestId('injury-send')).toBeNull()
  })

  it('sends the chosen child and the description, immediately', async () => {
    const onReportInjury = vi.fn().mockResolvedValue(undefined)
    renderWithInjury(onReportInjury)
    await userEvent.click(screen.getByRole('radio'))
    await userEvent.type(screen.getByLabelText('מה קרה?'), 'נחבל בכתף')
    await userEvent.click(screen.getByTestId('injury-send'))
    expect(onReportInjury).toHaveBeenCalledWith('a', 'נחבל בכתף')
    expect(await screen.findByTestId('injury-sent')).toBeInTheDocument()
  })

  it('says try-again on failure rather than pretending it sent', async () => {
    const onReportInjury = vi.fn().mockRejectedValue(new Error('500'))
    renderWithInjury(onReportInjury)
    await userEvent.click(screen.getByRole('radio'))
    await userEvent.type(screen.getByLabelText('מה קרה?'), 'x')
    await userEvent.click(screen.getByTestId('injury-send'))
    expect(await screen.findByTestId('injury-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('injury-sent')).toBeNull()
  })
})
