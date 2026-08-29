// Dashboard artboard 3a — לוח שבועי עם תפריט הצד.
//
// D5: the session block "surfaces coverage and completion — is a coach assigned, is it
// cancelled, has attendance been taken — *not* registration counts."
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { WeekBoard, weekDays, weekStart } from './WeekBoard'
import { LONG_PRESS_MS } from './useLongPress'
import type { ScheduleClient, SessionRow } from './client'

const base = {
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  location_id: null,
  location_name: 'אולם א׳',
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  attendance_taken: false,
}

const TUESDAY_EVENING: SessionRow = {
  ...base,
  id: 's1',
  starts_at: '2026-11-03T15:00:00Z',
  ends_at: '2026-11-03T17:00:00Z',
  status: 'scheduled',
  staff: [{ person_id: 'p1', display_name: 'רון מאמן', role: 'lead_coach', is_substitute: false }],
}

const LATE_EVENING: SessionRow = {
  ...TUESDAY_EVENING,
  id: 's2',
  // 22:30Z on 3 November is already 4 November in Jerusalem (winter, UTC+2 → 00:30).
  starts_at: '2026-11-03T22:30:00Z',
  ends_at: '2026-11-03T23:30:00Z',
  staff: [],
}

function stub(sessions: SessionRow[] = [TUESDAY_EVENING]): ScheduleClient {
  return {
    listSessions: vi.fn(async () => sessions),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(),
    listHolidayPresets: vi.fn(async () => []),
    patchSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    cancelSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    addSessionNote: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    listLocations: vi.fn(async () => []),
    listGroups: vi.fn(async () => []),
    createSession: vi.fn(async () => TUESDAY_EVENING),
  } as unknown as ScheduleClient
}

describe('weekStart', () => {
  it('starts the week on Sunday, matching group_schedule_rule.weekday', () => {
    // A Monday-based week would put every Sunday class in the previous column, and Sunday
    // is the first training day of the week in Israel.
    expect(weekStart('2026-11-03T12:00:00Z')).toBe('2026-11-01')
    expect(weekStart('2026-11-01T12:00:00Z')).toBe('2026-11-01')
  })

  it('reads the anchor in Jerusalem, not UTC', () => {
    // 22:30Z on Saturday 7 November is already Sunday 8 November here — the first day of
    // the NEXT week, not the last of this one.
    expect(weekStart('2026-11-07T22:30:00Z')).toBe('2026-11-08')
  })

  it('gives seven consecutive days', () => {
    expect(weekDays('2026-11-01')).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ])
  })
})

describe('WeekBoard (3a)', () => {
  it('draws seven day columns', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(7))
  })

  it('files a session under its Jerusalem day, not its UTC day', async () => {
    // 22:30Z is 00:30 the NEXT day here, and almost every class is in the evening.
    // A day is no longer one element — `3a`'s grid rules the week into time rows, so the
    // day is the CELL's column. `data-day` is what still answers "filed under which day".
    const { container } = render(
      <WeekBoard locale="he" client={stub([LATE_EVENING])} today="2026-11-03T12:00:00Z" />,
    )
    await waitFor(() =>
      expect(
        container.querySelector('[role="gridcell"][data-day="2026-11-04"] [data-testid="session-block"]'),
      ).not.toBeNull(),
    )
    expect(
      container.querySelector('[role="gridcell"][data-day="2026-11-03"] [data-testid="session-block"]'),
    ).toBeNull()
  })

  it('shows the group, the time and the location on the block', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')
    expect(block).toHaveTextContent('מתחילים')
    // 15:00Z on 3 November is 17:00 in Jerusalem — winter, UTC+2.
    expect(block).toHaveTextContent('17:00')
    expect(block).toHaveTextContent('אולם א׳')
  })

  it('names the coach', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByText('רון מאמן')).toBeInTheDocument()
  })

  it('says so when no coach is assigned', async () => {
    // D5 — the block surfaces COVERAGE. §5.14's 'sessions without a coach' is this gap.
    render(
      <WeekBoard
        locale="he"
        client={stub([{ ...TUESDAY_EVENING, staff: [] }])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(await screen.findByText(t('he', 'schedule.session.noCoach'))).toBeInTheDocument()
  })

  it('marks a substitute distinctly from the regular coach', async () => {
    // `is_substitute` is a flag and not a third role, because a substitute lead coach is
    // still leading the session — so the block has to say it separately.
    render(
      <WeekBoard
        locale="he"
        client={stub([
          {
            ...TUESDAY_EVENING,
            staff: [
              { person_id: 'p2', display_name: 'נועה', role: 'lead_coach', is_substitute: true },
            ],
          },
        ])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(await screen.findByText(t('he', 'schedule.session.substitute'))).toBeInTheDocument()
  })

  it('shows a cancelled session with its translated reason, never the system token', async () => {
    render(
      <WeekBoard
        locale="he"
        client={stub([
          { ...TUESDAY_EVENING, status: 'cancelled', cancel_reason: 'system:closure' },
        ])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(
      await screen.findByText(t('he', 'schedule.session.cancelReason.closure')),
    ).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
    expect(screen.getByTestId('session-block')).toHaveAttribute('data-status', 'cancelled')
  })

  it('moves a week back and forward, and jumps to today', async () => {
    const client = stub()
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(screen.getByTestId('week-previous'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-10-25', to: '2026-10-31' }),
      ),
    )
    await userEvent.click(screen.getByTestId('week-next'))
    await userEvent.click(screen.getByTestId('week-today'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-11-01', to: '2026-11-07' }),
      ),
    )
  })

  it('says the week is empty rather than drawing seven blank boxes', async () => {
    render(<WeekBoard locale="he" client={stub([])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByText(t('he', 'schedule.today.empty'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.today.emptyHint'))).toBeInTheDocument()
  })

  it('never shows a registration count', async () => {
    // D5, verbatim: 'not registration counts'. Children are enrolled, not booking (§5.4),
    // so capacity is near-irrelevant here and a number would invite the wrong question.
    const { container } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findByTestId('session-block')
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/)
  })

  it('gives every navigation control an accessible name', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('session-block')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })

  it('marks today for a screen reader as well as visually', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(7))
    expect(screen.getByTestId('week-day-2026-11-03')).toHaveAttribute('aria-current', 'date')
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <WeekBoard locale={locale} client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findAllByTestId('session-block')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

describe('F3 — the popover a session block opens', () => {
  const rosterResponse = {
    session: { id: 's1' },
    roster: [
      {
        student_id: 'stu-1',
        display_name: 'דנה לוי',
        belt_color_hex: null,
        belt_name: null,
        health_status: 'signed',
        derived_flags: {},
        status: 'unmarked',
        source: null,
        has_absence_report: false,
        absence_reason: null,
      },
    ],
  }

  function stubFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/attendance')) {
          return new Response(JSON.stringify(rosterResponse), { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
  }

  it('clicking a block opens the popover with QuickViewRoster inside', async () => {
    stubFetch()
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(await screen.findByTestId('session-block'))
    expect(await screen.findByTestId('session-popover')).toBeInTheDocument()
    expect(await screen.findByTestId('quickview-roster')).toBeInTheDocument()
    expect(screen.getByTestId('quickview-row-stu-1')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('move sends starts_at and ends_at together, as one Jerusalem wall time', async () => {
    stubFetch()
    const client = stub()
    ;(client.patchSession as ReturnType<typeof vi.fn>).mockResolvedValue(TUESDAY_EVENING)
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(await screen.findByTestId('session-block'))
    await userEvent.click(await screen.findByTestId('popover-move'))
    expect(client.patchSession).toHaveBeenCalledWith('s1', {
      // 17:00 Jerusalem winter = 15:00Z — the prefilled values, round-tripped.
      starts_at: '2026-11-03T15:00:00.000Z',
      ends_at: '2026-11-03T17:00:00.000Z',
    })
    vi.unstubAllGlobals()
  })

  it('cancel is disabled until a reason exists — the constraint made visible', async () => {
    stubFetch()
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(await screen.findByTestId('session-block'))
    expect(await screen.findByTestId('popover-cancel')).toBeDisabled()
    await userEvent.type(screen.getByLabelText(t('he', 'schedule.session.cancelReason')), 'אין חשמל')
    expect(screen.getByTestId('popover-cancel')).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it('offers delete on an ad-hoc session only', async () => {
    stubFetch()
    render(
      <WeekBoard
        locale="he"
        client={stub([{ ...TUESDAY_EVENING, is_ad_hoc: true }])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await userEvent.click(await screen.findByTestId('session-block'))
    expect(await screen.findByTestId('popover-delete')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('never offers delete on a generated session — cancel is the answer there', async () => {
    stubFetch()
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(await screen.findByTestId('session-block'))
    await screen.findByTestId('session-popover')
    expect(screen.queryByTestId('popover-delete')).toBeNull()
    vi.unstubAllGlobals()
  })
})


describe('creating a session from the board (2026-08-28)', () => {
  it('lets the creator pick ANY staff member as the coach — the owner included', async () => {
    const user = userEvent.setup()
    const client = stub()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/staff')
          ? new Response(
              JSON.stringify({
                items: [
                  { person_id: 'p-owner', first_name: 'יובל', last_name: 'סטולין', roles: ['owner'] },
                ],
              }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    vi.mocked(client.listGroups).mockResolvedValue([
      { id: 'g1', name: 'מתחילים', classId: 'c1', isActive: true },
    ] as never)
    vi.mocked(client.listTrainingYears).mockResolvedValue([
      { id: 'y1', name: 'שנה', starts_on: '2026-09-01', ends_on: '2027-08-31', status: 'active' },
    ] as never)
    vi.mocked(client.patchSession).mockResolvedValue(TUESDAY_EVENING)
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    await user.click(await screen.findByTestId('session-create-open'))
    await user.selectOptions(await screen.findByTestId('session-create-group'), 'g1')
    // The owner appears in the coach list — no coach-role filter.
    await user.selectOptions(await screen.findByTestId('session-create-coach'), 'p-owner')
    await user.click(screen.getByTestId('session-create-submit'))
    await waitFor(() =>
      expect(client.patchSession).toHaveBeenCalledWith(TUESDAY_EVENING.id, {
        staff: [{ person_id: 'p-owner', role: 'lead_coach', is_substitute: false }],
      }),
    )
    vi.unstubAllGlobals()
  })

  it('offers the verb at all — the backend endpoint shipped with no UI calling it', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByTestId('session-create-open')).toHaveTextContent(
      t('he', 'schedule.session.create'),
    )
  })

  it('creates an ad-hoc session in the ACTIVE year, in Jerusalem wall time', async () => {
    const user = userEvent.setup()
    const client = stub()
    vi.mocked(client.listGroups).mockResolvedValue([
      { id: 'g1', name: 'מתחילים', classId: 'c1', isActive: true },
      { id: 'g9', name: 'ישן', classId: 'c1', isActive: false },
    ] as never)
    vi.mocked(client.listTrainingYears).mockResolvedValue([
      { id: 'y-old', name: 'תשפ״ה', starts_on: '2025-09-01', ends_on: '2026-08-31', status: 'closed' },
      { id: 'y1', name: 'תשפ״ו', starts_on: '2026-09-01', ends_on: '2027-08-31', status: 'active' },
    ] as never)
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    await user.click(await screen.findByTestId('session-create-open'))

    const groupSelect = await screen.findByTestId('session-create-group')
    // The retired group is not offered.
    expect(groupSelect.querySelectorAll('option')).toHaveLength(2)
    await user.selectOptions(groupSelect, 'g1')
    await user.click(screen.getByTestId('session-create-submit'))

    await waitFor(() => expect(client.createSession).toHaveBeenCalled())
    const body = vi.mocked(client.createSession).mock.calls[0]![0]
    expect(body.group_id).toBe('g1')
    // The year is RESOLVED, never asked: the active one, not the closed one.
    expect(body.training_year_id).toBe('y1')
    // 17:00 typed in Jerusalem is not 17:00Z.
    expect(body.starts_at.endsWith('17:00:00.000Z')).toBe(false)
  })

  it('says why creation is unavailable when no training year is active', async () => {
    const user = userEvent.setup()
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await user.click(await screen.findByTestId('session-create-open'))
    expect(await screen.findByTestId('session-create-no-year')).toHaveTextContent(
      t('he', 'schedule.group.noActiveYear'),
    )
  })
})

// The design pass (2026-08-29) — `3a`'s coverage strip, its block states, dated column
// headings, and the header row that replaced four stacked ones.
describe('WeekBoard · 3a', () => {
  const UNCOVERED: SessionRow = { ...TUESDAY_EVENING, id: 'u1', staff: [] }
  const CANCELLED: SessionRow = { ...TUESDAY_EVENING, id: 'c1', status: 'cancelled' }
  const MARKED: SessionRow = { ...TUESDAY_EVENING, id: 'm1', attendance_taken: true }

  it('marks an uncovered class differently from a covered one', async () => {
    // The shipped board drew a class with nobody assigned exactly like a covered one,
    // which is how two coachless classes sat unremarked on the staging capture.
    render(<WeekBoard locale="he" client={stub([UNCOVERED, MARKED])} today="2026-11-03T12:00:00Z" />)
    const blocks = await screen.findAllByTestId('session-block')
    const coverage = blocks.map((b) => b.getAttribute('data-coverage'))
    expect(coverage).toContain('uncovered')
    expect(coverage).toContain('complete')
  })

  it('counts what is missing from the week already on screen, not from a second request', async () => {
    // No coverage endpoint exists and none is needed: the sessions carry `staff` and
    // `attendance_taken`, so a second source of truth would only be able to disagree.
    render(
      <WeekBoard locale="he" client={stub([UNCOVERED, CANCELLED])} today="2026-11-03T12:00:00Z" />,
    )
    expect(await screen.findByTestId('week-missing-no-coach')).toHaveTextContent('1')
    expect(screen.getByTestId('week-missing-cancelled')).toHaveTextContent('1')
  })

  it('does not count a cancelled class as uncovered — a cancelled class needs no coach', async () => {
    render(<WeekBoard locale="he" client={stub([CANCELLED])} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('week-missing-cancelled')
    expect(screen.queryByTestId('week-missing-no-coach')).toBeNull()
  })

  it('says so when nothing is missing rather than showing an empty strip', async () => {
    render(<WeekBoard locale="he" client={stub([MARKED])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByTestId('week-missing-none')).toBeInTheDocument()
  })

  it('heads each column with its date, so a manager knows which week they are on', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    // The week of Tuesday 3 November 2026 starts on Sunday the 1st.
    const sunday = await screen.findByTestId('week-day-2026-11-01')
    expect(sunday.querySelector('.week-day__date')?.textContent).toBe('1')
  })

  it('holds a session time range in one ltr island', async () => {
    // The staging board printed `15:00–14:00`: three text children in one span, laid out
    // end-then-start by the RTL row around them.
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')
    const range = block.querySelector('.studio-range')
    expect(range).toHaveAttribute('dir', 'ltr')
    expect(range?.textContent).toBe('17:00–19:00')
  })

  it('puts the title, the week navigation and the one verb in a single header row', async () => {
    // Four stacked rows before: a title, a FULL-WIDTH create button, and three bare
    // <button> elements, none of them visibly related to the others.
    const { container } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    const header = await screen.findByRole('banner')
    expect(header).toContainElement(screen.getByTestId('week-today'))
    expect(header).toContainElement(screen.getByTestId('session-create-open'))
    // Navigation on one edge, the verb on the other — not six controls at one rank.
    expect(container.querySelector('.studio-actionbar')).toHaveAttribute('data-align', 'between')
  })

  it('rules the week into one row per start time the week actually contains', async () => {
    // NOT the artboard's fixed 16:00/17:00/18:30/20:00 — those are one club's timetable
    // drawn on one day. Derived rows mean a club training at other hours still has a row
    // for its classes to sit in.
    const early: SessionRow = { ...TUESDAY_EVENING, id: 'e1', starts_at: '2026-11-03T13:00:00Z', ends_at: '2026-11-03T14:00:00Z' }
    render(<WeekBoard locale="he" client={stub([TUESDAY_EVENING, early])} today="2026-11-03T12:00:00Z" />)
    // 13:00Z and 15:00Z are 15:00 and 17:00 in Jerusalem in November.
    expect(await screen.findByTestId('week-slot-15:00')).toBeInTheDocument()
    expect(screen.getByTestId('week-slot-17:00')).toBeInTheDocument()
  })

  it('collapses two classes at the same hour into one row, not two', async () => {
    const sameHour: SessionRow = { ...TUESDAY_EVENING, id: 'p1', starts_at: '2026-11-05T15:00:00Z', ends_at: '2026-11-05T17:00:00Z' }
    render(<WeekBoard locale="he" client={stub([TUESDAY_EVENING, sameHour])} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('week-slot-17:00')
    expect(screen.getAllByRole('rowheader')).toHaveLength(1)
  })

  it('puts a session in the cell for its day AND its time', async () => {
    const { container } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findByTestId('session-block')
    const cell = container.querySelector('[data-testid="week-cell-2026-11-03-17:00"]')
    expect(cell?.querySelector('[data-testid="session-block"]')).not.toBeNull()
  })

  it('draws an empty cell rather than nothing, so the grid stays a grid', async () => {
    const { container } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findByTestId('session-block')
    // Seven days, one slot: seven cells, six of them holding no class.
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(7)
    const saturday = container.querySelector('[data-testid="week-cell-2026-11-07-17:00"]')
    expect(saturday).not.toBeNull()
    // Empty of CLASSES — not of children. Since 2026-08-29 an empty cell also carries the
    // invisible button that starts one, which is the point of the cell being there.
    expect(saturday?.querySelector('[data-testid="session-block"]')).toBeNull()
  })
})

describe('WeekBoard · moving a class, and starting one in a slot', () => {
  it('starts a new class from an empty cell, pre-filled with that day and time', async () => {
    // Overrides `3a`'s "no add-here affordance" decision, at the owner's request
    // (2026-08-29). The cell is a button with an accessible name and no visible chrome —
    // a grid of forty visible buttons is what `3a` was right to refuse.
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const cell = await screen.findByTestId('week-slot-action-2026-11-05-17:00')
    expect(cell).toHaveAccessibleName(t('he', 'schedule.session.slot.create'))
    await userEvent.click(cell)
    expect(await screen.findByTestId('week-slot-popover')).toHaveTextContent('2026-11-05')
    expect(screen.getByTestId('week-slot-popover')).toHaveTextContent('17:00')
  })

  it('does not offer to start one in a cell that already has a class', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('session-block')
    expect(screen.queryByTestId('week-slot-action-2026-11-03-17:00')).toBeNull()
  })

  it('picks a class up on a long press and puts it down in the slot you choose', async () => {
    const client = stub()
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')

    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20))
    })
    fireEvent.pointerUp(block)

    expect(await screen.findByTestId('week-moving')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('week-slot-action-2026-11-05-17:00'))

    // The duration is carried, not recomputed: a two-hour class stays two hours.
    expect(client.patchSession).toHaveBeenCalledWith('s1', {
      starts_at: '2026-11-05T15:00:00.000Z',
      ends_at: '2026-11-05T17:00:00.000Z',
    })
  })

  it('opens the popover on a SHORT press, and not on the long one', async () => {
    // A pointerup is followed by a click however long the button was held, so without the
    // swallow the popover would open on top of the move the manager just started.
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')

    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20))
    })
    fireEvent.pointerUp(block)
    fireEvent.click(block)
    expect(screen.queryByTestId('session-popover')).toBeNull()

    // A short press still opens it — and the keyboard path is a plain click.
    await userEvent.click(screen.getByTestId('week-moving-cancel'))
    await userEvent.click(block)
    expect(await screen.findByTestId('session-popover')).toBeInTheDocument()
  })

  it('gives a held class back on Escape', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')
    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20))
    })
    fireEvent.pointerUp(block)
    await screen.findByTestId('week-moving')
    // Fired on the document: it bubbles to the window listener the board registers.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('week-moving')).toBeNull())
  })

  it('does not pick up when the finger drifts — that is a scroll, not a press', async () => {
    // A manager checking cover on a tablet would otherwise pick up a class every flick.
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')
    fireEvent.pointerDown(block, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(block, { clientX: 0, clientY: 60 })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20))
    })
    fireEvent.pointerUp(block)
    expect(screen.queryByTestId('week-moving')).toBeNull()
  })
})

describe('WeekBoard · filters (3a item 7)', () => {
  const OTHER_COACH = { person_id: 'p2', display_name: 'יוסי כהן', role: 'lead_coach' as const, is_substitute: false }
  const A: SessionRow = { ...TUESDAY_EVENING, id: 'fa', group_id: 'g1', group_name: 'מתחילים', location_name: 'אולם א׳' }
  const B: SessionRow = {
    ...TUESDAY_EVENING,
    id: 'fb',
    group_id: 'g2',
    group_name: 'מתקדמים',
    location_name: 'אולם ב׳',
    starts_at: '2026-11-05T15:00:00Z',
    ends_at: '2026-11-05T17:00:00Z',
    staff: [OTHER_COACH],
  }

  it('offers only what the week on screen actually contains', async () => {
    // Not `listGroups()`: that would offer every group the club has ever had, and picking
    // one that does not train this week would blank the board with no explanation.
    render(<WeekBoard locale="he" client={stub([A, B])} today="2026-11-03T12:00:00Z" />)
    const group = await screen.findByTestId('week-filter-group')
    const names = [...group.querySelectorAll('option')].map((o) => o.textContent)
    expect(names).toEqual([t('he', 'schedule.week.filter.all'), 'מתחילים', 'מתקדמים'])
  })

  it('hides an axis the week cannot vary — one hall means no hall filter', async () => {
    render(<WeekBoard locale="he" client={stub([A])} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('session-block')
    expect(screen.queryByTestId('week-filter-hall')).toBeNull()
  })

  it('narrows the grid to one group', async () => {
    render(<WeekBoard locale="he" client={stub([A, B])} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(2))
    await userEvent.selectOptions(screen.getByTestId('week-filter-group'), 'g2')
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(1))
    // Scoped to the block: the group name also appears as an <option> in the filter.
    expect(screen.getByTestId('session-block')).toHaveTextContent('מתקדמים')
  })

  it('narrows by coach, matching any coach on the session rather than only the lead', async () => {
    render(<WeekBoard locale="he" client={stub([A, B])} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(2))
    await userEvent.selectOptions(screen.getByTestId('week-filter-coach'), 'p2')
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(1))
  })

  it('counts what is missing from the FILTERED view, not the whole week', async () => {
    // The strip describes what is on screen. A strip that kept counting hidden classes
    // would be reporting a week the manager cannot see.
    const uncovered: SessionRow = { ...B, id: 'fc', staff: [] }
    render(<WeekBoard locale="he" client={stub([A, uncovered])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByTestId('week-missing-no-coach')).toHaveTextContent('1')
    await userEvent.selectOptions(screen.getByTestId('week-filter-group'), 'g1')
    await waitFor(() => expect(screen.queryByTestId('week-missing-no-coach')).toBeNull())
  })

  it('says the filter is too narrow rather than showing a blank grid', async () => {
    // Distinct from an empty week: the fix is to widen the filter, not to add a class.
    render(<WeekBoard locale="he" client={stub([A, B])} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(2))
    await userEvent.selectOptions(screen.getByTestId('week-filter-group'), 'g1')
    await userEvent.selectOptions(screen.getByTestId('week-filter-hall'), 'אולם ב׳')
    expect(await screen.findByText(t('he', 'schedule.week.filter.empty'))).toBeInTheDocument()
  })

  it('offers a way back to the whole week only once something is narrowed', async () => {
    render(<WeekBoard locale="he" client={stub([A, B])} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('week-filter-group')
    expect(screen.queryByTestId('week-filter-clear')).toBeNull()
    await userEvent.selectOptions(screen.getByTestId('week-filter-group'), 'g2')
    await userEvent.click(await screen.findByTestId('week-filter-clear'))
    await waitFor(() => expect(screen.getAllByTestId('session-block')).toHaveLength(2))
  })

  it('counts completed classes — the one number in the strip that is not a problem', async () => {
    const done: SessionRow = { ...A, id: 'fd', attendance_taken: true }
    render(<WeekBoard locale="he" client={stub([done])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByTestId('week-missing-completed')).toHaveTextContent('1')
  })

  it('still shows the completed count on a week with nothing missing', async () => {
    // The first version gated the whole strip on `total`, which counts only problems — so
    // a week that had gone perfectly showed "nothing missing" and hid the number proving it.
    const done: SessionRow = { ...A, id: 'fe', attendance_taken: true }
    render(<WeekBoard locale="he" client={stub([done])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByTestId('week-missing-none')).toBeInTheDocument()
    expect(screen.getByTestId('week-missing-completed')).toHaveTextContent('1')
  })
})
