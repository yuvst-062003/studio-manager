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
import { SessionSummarySheet } from './SessionSummarySheet'
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

describe('artboard 9g — the session summary, as a popup (owner, 2026-10-13)', () => {
  // The screen it replaced carried three cards and ONE RADIO PER STUDENT for the injury
  // report. The owner's redesign is two boxes: how the lesson was, and anything specific —
  // no roster in the dialog at all. `SessionSummarySheet`'s own header carries the rest.
  const renderSummary = (
    roster: RosterRowData[],
    over: { onReportSomething?: (description: string) => Promise<void> } = {},
  ) =>
    render(
      <SessionSummarySheet
        clock={() => NOW}
        locale="he"
        personId="person-1"
        roster={roster}
        sessionId="session-1"
        onClose={() => {}}
        onReportSomething={over.onReportSomething}
      />,
    )

  it('is a dialog, not a screen', () => {
    renderSummary([row()])
    const sheet = screen.getByTestId('session-summary-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
  })

  it('counts present and absent in one line rather than three tiles', () => {
    renderSummary([
      row({ student_id: 'a', status: 'present' }),
      row({ student_id: 'b', status: 'absent_unexcused' }),
      row({ student_id: 'c', status: 'absent_excused', has_absence_report: true }),
    ])
    expect(screen.getByTestId('summary-counts')).toHaveTextContent('1')
  })

  it('names no student anywhere — that is the whole point of the redesign', () => {
    renderSummary([row({ student_id: 'a', display_name: 'נועה לוי' })], {
      onReportSomething: async () => {},
    })
    expect(screen.queryByText('נועה לוי')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows NO exam or belt affordance, which is deliberate', () => {
    // `9g` finding 8 — §5.9 makes eligibility a manager's calculation from rank and time in
    // grade, not a coach's impression at the end of a lesson.
    renderSummary([row()])
    expect(screen.queryByText(/מבחן/)).not.toBeInTheDocument()
    expect(screen.queryByText(/חגורה/)).not.toBeInTheDocument()
  })

  it('states who can read a session note', () => {
    // `9g` finding 2 — §5.13: notes are visible to the group's coaches and to managers, and
    // NEVER to guardians.
    renderSummary([row()])
    expect(screen.getByTestId('summary-note-audience')).toHaveTextContent('הורים לא רואים אותה')
  })

  it('says the second box goes to the manager and not to the parents', () => {
    renderSummary([row()], { onReportSomething: async () => {} })
    expect(screen.getByTestId('summary-odd-audience')).toHaveTextContent('ההורים לא מקבלים')
  })

  it('queues the note rather than posting it', async () => {
    // §10.2's table — session notes are "Writable, queued", the same path as a mark.
    renderSummary([row()])
    await userEvent.type(screen.getByTestId('summary-note'), 'עבדנו על הטלות')
    await userEvent.click(screen.getByTestId('summary-save'))
    await waitFor(async () => {
      const ops = await listPending(store)
      expect(ops.map((op) => op.kind)).toEqual(['note.session'])
    })
  })

  it('queues nothing when both boxes are empty, and offers nothing to press', async () => {
    renderSummary([row()])
    expect(screen.getByTestId('summary-save')).toBeDisabled()
    expect(await listPending(store)).toHaveLength(0)
  })

  it('sends the specific thing immediately, with no student id', async () => {
    const onReportSomething = vi.fn(async () => {})
    renderSummary([row()], { onReportSomething })

    await userEvent.type(screen.getByTestId('summary-odd'), 'ילד החליק על מזרן רטוב')
    await userEvent.click(screen.getByTestId('summary-save'))

    await waitFor(() => expect(onReportSomething).toHaveBeenCalledWith('ילד החליק על מזרן רטוב'))
  })

  it('withholds the second box when the container cannot send it', () => {
    renderSummary([row()])
    expect(screen.queryByTestId('summary-odd')).not.toBeInTheDocument()
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
    addSessionNote: vi.fn(),
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
    addSessionNote: vi.fn(),
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

  it('waits for the session to resolve before its first bootstrap call (S4.2)', async () => {
    // The prime used to fire on mount, racing /auth/refresh — four 401'd bootstrap calls
    // per cold start. `enabled` is the session gate: nothing until the session resolves,
    // then exactly one call.
    function GatedHarness({ client, enabled }: { client: StaffAttendanceClient; enabled: boolean }) {
      const { state } = useOfflinePriming(client, () => NOW, enabled)
      return state === 'ready' ? <span data-testid="today" /> : null
    }
    const bootstrap = vi.fn().mockResolvedValue(payload)
    const { rerender } = render(<GatedHarness client={client(bootstrap)} enabled={false} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(bootstrap).not.toHaveBeenCalled()

    rerender(<GatedHarness client={client(bootstrap)} enabled={true} />)
    await screen.findByTestId('today')
    expect(bootstrap).toHaveBeenCalledOnce()
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

describe('9g — the specific-thing box, which replaced the injury card (S2)', () => {
  // It used to be a card with one radio per student plus a description, and sending it told
  // the manager AND that child's guardians. The owner cut the radios (2026-10-13): the box
  // takes words alone, and without a child there is nobody but the managers to tell — the
  // manager phones the family, which is what they did anyway. The three rules that survived
  // the cut are the three below.
  const renderWithOdd = (onReportSomething: (d: string) => Promise<void>) =>
    render(
      <SessionSummarySheet
        clock={() => NOW}
        locale="he"
        onReportSomething={onReportSomething}
        onClose={() => {}}
        personId="person-1"
        roster={[row({ student_id: 'a', status: 'present' })]}
        sessionId="session-1"
      />,
    )

  it('is withheld entirely when no handler exists — never inert', () => {
    render(
      <SessionSummarySheet
        clock={() => NOW}
        locale="he"
        onClose={() => {}}
        personId="person-1"
        roster={[row({ student_id: 'a', status: 'present' })]}
        sessionId="session-1"
      />,
    )
    expect(screen.queryByTestId('summary-odd')).toBeNull()
  })

  it('sends the description immediately, and names no child', async () => {
    const onReportSomething = vi.fn().mockResolvedValue(undefined)
    renderWithOdd(onReportSomething)
    await userEvent.type(screen.getByTestId('summary-odd'), 'נחבל בכתף')
    await userEvent.click(screen.getByTestId('summary-save'))
    expect(onReportSomething).toHaveBeenCalledWith('נחבל בכתף')
    expect(onReportSomething).toHaveBeenCalledTimes(1)
  })

  it('says try-again on failure rather than pretending it sent', async () => {
    const onReportSomething = vi.fn().mockRejectedValue(new Error('500'))
    renderWithOdd(onReportSomething)
    await userEvent.type(screen.getByTestId('summary-odd'), 'x')
    await userEvent.click(screen.getByTestId('summary-save'))
    expect(await screen.findByTestId('summary-odd-failed')).toBeInTheDocument()
    expect(screen.queryByTestId('summary-odd-sent')).toBeNull()
  })
})
