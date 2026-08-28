// Dashboard artboard 3a — לוח שבועי עם תפריט הצד.
//
// D5: the session block "surfaces coverage and completion — is a coach assigned, is it
// cancelled, has attendance been taken — *not* registration counts."
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { WeekBoard, weekDays, weekStart } from './WeekBoard'
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
    render(<WeekBoard locale="he" client={stub([LATE_EVENING])} today="2026-11-03T12:00:00Z" />)
    await waitFor(() =>
      expect(screen.getByTestId('week-day-2026-11-04')).toContainElement(
        screen.getByTestId('session-block'),
      ),
    )
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
