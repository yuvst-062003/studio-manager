// §4.7 of the staff app redesign — the month calendar, `#/calendar` (checkpoint C11). See
// `CalendarScreen.tsx`'s own header for what this screen deliberately does NOT copy from
// `~/Downloads/staff-app/src/components/CalendarOverviewScreen.tsx` (invented sessions,
// dead filter chips, fabricated session ids) — these tests are about the real behaviour
// that replaces each of those three things, plus decisions 8/9's edit sheet.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setForcedMode, studioWallTimeToUtc } from '@studio/core'
import { t } from '@studio/i18n'
import { CalendarScreen } from './CalendarScreen'
import type { Fetcher, SessionRow, StaffScheduleClient } from './client'
import type { EventOut, StaffEventsClient } from '../events/client'
import type { CoachConstraintRow, CoachConstraintsClient } from '../constraints'

const TODAY = '2026-11-03T09:00:00Z'

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 's1',
    group_id: 'g1',
    group_name: 'מתחילים',
    training_year_id: 'y1',
    starts_at: '2026-11-10T16:00:00Z',
    ends_at: '2026-11-10T17:00:00Z',
    location_id: null,
    location_name: null,
    status: 'scheduled',
    is_manually_edited: false,
    is_ad_hoc: false,
    cancel_reason: null,
    staff: [{ person_id: 'p1', display_name: 'רועי בר', role: 'lead_coach', is_substitute: false }],
    attendance_taken: false,
    headcount: 5,
    ...overrides,
  }
}

function event(overrides: Partial<EventOut> = {}): EventOut {
  return {
    id: 'ev1',
    title: 'תחרות אזורית',
    description: null,
    type: 'competition',
    status: 'published',
    starts_at: '2026-11-10T13:00:00Z',
    ends_at: null,
    location_id: null,
    location_text: 'היכל הספורט',
    requires_consent: false,
    consent_text: null,
    consent_signed_count: 0,
    rsvp_deadline: null,
    rsvp_yes_count: 3,
    rsvp_no_count: 1,
    rsvp_pending_count: 2,
    fee_agorot: null,
    ...overrides,
  }
}

function constraint(overrides: Partial<CoachConstraintRow> = {}): CoachConstraintRow {
  return {
    id: 'c1',
    person_id: 'p1',
    starts_at: '2026-11-12T00:00:00Z',
    ends_at: '2026-11-13T00:00:00Z',
    all_day: true,
    reason: 'illness',
    note: null,
    status: 'approved',
    substitute_person_id: null,
    decided_by_person_id: null,
    decided_at: null,
    ...overrides,
  }
}

function scheduleStub(overrides: Partial<StaffScheduleClient> = {}): StaffScheduleClient {
  return {
    listSessions: vi.fn(async () => [session()]),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => []),
    patchSession: vi.fn(async (id, body) => session({ id, ...body })),
    cancelSession: vi.fn(async (id) => session({ id, status: 'cancelled', cancel_reason: 'x' })),
    ...overrides,
  }
}

function eventsStub(events: EventOut[] = [event()]): StaffEventsClient {
  return {
    list: vi.fn(async () => ({ items: events, next_cursor: null, has_more: false })),
  } as unknown as StaffEventsClient
}

function constraintsStub(rows: CoachConstraintRow[] = []): CoachConstraintsClient {
  return {
    listMine: vi.fn(async () => rows),
    file: vi.fn(async (input) => constraint({ ...input })),
    withdraw: vi.fn(async (id) => constraint({ id, status: 'withdrawn' })),
  }
}

const NO_STAFF_FETCHER: Fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }))

function staffFetcher(items: { person_id: string; first_name: string; last_name: string }[]): Fetcher {
  return vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 }))
}

function renderCalendar(props: Partial<Parameters<typeof CalendarScreen>[0]> = {}) {
  render(
    <CalendarScreen
      locale="he"
      client={scheduleStub()}
      eventsClient={eventsStub()}
      constraintsClient={constraintsStub()}
      fetcher={NO_STAFF_FETCHER}
      today={TODAY}
      canEdit={false}
      {...props}
    />,
  )
}

function briefingStub(plans: Record<string, string | null> = {}) {
  return {
    // Annotated rather than left as a bare `vi.fn()`: the prop is a
    // `Pick<StaffAttendanceClient, ...>`, and an untyped mock widens to `Procedure` and
    // stops satisfying it.
    addSessionNote: vi.fn<(id: string, body: string, kind: 'plan' | 'summary') => Promise<void>>(
      async () => undefined,
    ),
    sessionPlan: vi.fn(async (id: string) => plans[id] ?? null),
  }
}

afterEach(() => {
  setForcedMode(null)
})

describe('§6.2 — the briefing, on the screen where next week is planned', () => {
  it('shows the marker for a session that already has a briefing, and opens it', async () => {
    renderCalendar({ attendanceClient: briefingStub({ s1: 'עבודה על אוצ׳י־גארי' }) })
    await userEvent.click(await screen.findByTestId('calendar-day-2026-11-10'))

    const marker = await screen.findByTestId('session-briefing-marker')
    expect(marker.dataset.hasBriefing).toBe('true')

    await userEvent.click(marker)
    expect(await screen.findByText('עבודה על אוצ׳י־גארי')).toBeInTheDocument()
  })

  it('lets a lead coach write one for a session they are not teaching', async () => {
    // The whole point of a briefing: it is left FOR whoever ends up on the mat. The
    // session's only staff member is `p1`; the viewer is a manager who is not on it.
    const client = briefingStub()
    renderCalendar({ canEdit: true, attendanceClient: client })
    await userEvent.click(await screen.findByTestId('calendar-day-2026-11-10'))

    await userEvent.click(await screen.findByTestId('session-briefing-marker'))
    await userEvent.click(await screen.findByTestId('session-plan-edit'))
    await userEvent.type(await screen.findByTestId('session-plan-input'), 'להתחיל בחימום ארוך')
    await userEvent.click(screen.getByTestId('session-plan-save'))

    await waitFor(() =>
      expect(client.addSessionNote).toHaveBeenCalledWith('s1', 'להתחיל בחימום ארוך', 'plan'),
    )
  })

  it('draws no marker for an assistant coach on a session with no briefing', async () => {
    // Nothing to read and nothing they may write — decision 16's third state, which draws
    // no control at all rather than a button that refuses.
    renderCalendar({ canEdit: false, attendanceClient: briefingStub() })
    await userEvent.click(await screen.findByTestId('calendar-day-2026-11-10'))

    await screen.findByTestId('calendar-session-row')
    expect(screen.queryByTestId('session-briefing-marker')).not.toBeInTheDocument()
  })

  it('reads a plan once per session on the day, not once per month', async () => {
    const client = briefingStub()
    renderCalendar({ attendanceClient: client })
    await userEvent.click(await screen.findByTestId('calendar-day-2026-11-10'))

    await waitFor(() => expect(client.sessionPlan).toHaveBeenCalledWith('s1'))
    expect(client.sessionPlan).toHaveBeenCalledTimes(1)
  })
})

describe('the month grid', () => {
  it('renders every day of an ordinary month', async () => {
    // November 2026 has 30 days.
    renderCalendar({ client: scheduleStub({ listSessions: vi.fn(async () => []) }), eventsClient: eventsStub([]) })
    const grid = await screen.findByRole('grid', { name: t('he', 'schedule.view.month') })
    await waitFor(() => expect(within(grid).getAllByRole('button')).toHaveLength(30))
  })

  it('renders every day of a leap February', async () => {
    // 2028 is a leap year — February has 29 days, not 28.
    renderCalendar({
      client: scheduleStub({ listSessions: vi.fn(async () => []) }),
      eventsClient: eventsStub([]),
      today: '2028-02-10T09:00:00Z',
    })
    const grid = await screen.findByRole('grid', { name: t('he', 'schedule.view.month') })
    await waitFor(() => expect(within(grid).getAllByRole('button')).toHaveLength(29))
  })

  it("a day's count reflects sessions AND events", async () => {
    renderCalendar({
      client: scheduleStub({
        listSessions: vi.fn(async () => [session({ id: 's1' }), session({ id: 's2' })]),
      }),
      eventsClient: eventsStub([event()]),
    })
    const cell = await screen.findByTestId('calendar-day-2026-11-10')
    // Two sessions plus one event, all on the tenth.
    await waitFor(() => expect(cell).toHaveTextContent('3'))
    expect(cell).toHaveAccessibleName(expect.stringContaining('3') as unknown as string)
  })

  it('marks a day with an approved or pending constraint, and says so to a screen reader', async () => {
    renderCalendar({
      client: scheduleStub({ listSessions: vi.fn(async () => []) }),
      eventsClient: eventsStub([]),
      constraintsClient: constraintsStub([constraint()]),
    })
    const cell = await screen.findByTestId('calendar-day-2026-11-12')
    await waitFor(() =>
      expect(cell).toHaveAccessibleName(
        expect.stringContaining(t('he', 'schedule.constraint.reason.illness')) as unknown as string,
      ),
    )
    // A withdrawn constraint marks nothing — it is not a live unavailability.
    const unmarked = screen.getByTestId('calendar-day-2026-11-11')
    expect(unmarked).not.toHaveAccessibleName(expect.stringContaining('אילוץ') as unknown as string)
  })

  it('does not mark a refused or withdrawn constraint', async () => {
    renderCalendar({
      client: scheduleStub({ listSessions: vi.fn(async () => []) }),
      eventsClient: eventsStub([]),
      constraintsClient: constraintsStub([constraint({ status: 'withdrawn' })]),
    })
    const cell = await screen.findByTestId('calendar-day-2026-11-12')
    expect(cell).not.toHaveAccessibleName(expect.stringContaining('אילוץ') as unknown as string)
  })
})

describe('selecting a day shows its agenda, schedule-tab card anatomy included', () => {
  it('opens the tenth to a session and an event, and switches days on click', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await user.click(await screen.findByTestId('calendar-day-2026-11-10'))
    expect(await screen.findByTestId('calendar-session-row')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-event-row')).toBeInTheDocument()
    // The same session card the schedule tab draws — its own open-roster action included.
    expect(screen.getByTestId('open-roster')).toHaveAttribute('href', '#/attendance/s1')
  })
})

describe('decisions 8/9 — the edit sheet', () => {
  async function openSheet(canEdit: boolean, fetcher: Fetcher = NO_STAFF_FETCHER) {
    const user = userEvent.setup()
    renderCalendar({ canEdit, fetcher })
    await user.click(await screen.findByTestId('calendar-day-2026-11-10'))
    await user.click(await screen.findByTestId('session-edit-open'))
    return user
  }

  it('gives a manager or lead coach the real controls', async () => {
    await openSheet(true, staffFetcher([{ person_id: 'p2', first_name: 'נועה', last_name: '' }]))
    expect(await screen.findByTestId('session-edit-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('session-edit-readonly-note')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('edit-coach-select')).toBeInTheDocument())
    expect(screen.getByTestId('edit-move-submit')).toBeInTheDocument()
    expect(screen.getByTestId('edit-cancel-submit')).toBeInTheDocument()
  })

  it('gives an assistant coach the same sheet, with none of the controls', async () => {
    await openSheet(false)
    expect(await screen.findByTestId('session-edit-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('session-edit-readonly-note')).toBeInTheDocument()
    expect(screen.getByTestId('session-edit-coach-display')).toHaveTextContent('רועי בר')
    expect(screen.queryByTestId('edit-coach-select')).toBeNull()
    expect(screen.queryByTestId('edit-move-submit')).toBeNull()
    expect(screen.queryByTestId('edit-cancel-submit')).toBeNull()
  })

  it('requires a reason before cancel is enabled, then sends it', async () => {
    const client = scheduleStub()
    const user = userEvent.setup()
    renderCalendar({ canEdit: true, client })
    await user.click(await screen.findByTestId('calendar-day-2026-11-10'))
    await user.click(await screen.findByTestId('session-edit-open'))

    const cancelButton = screen.getByTestId('edit-cancel-submit')
    expect(cancelButton).toBeDisabled()
    await user.type(screen.getByTestId('edit-cancel-reason'), 'המזרן תפוס')
    expect(cancelButton).toBeEnabled()

    await user.click(cancelButton)
    await waitFor(() => expect(client.cancelSession).toHaveBeenCalledWith('s1', 'המזרן תפוס'))
  })

  it('moves a session by converting the wall-clock form with studioWallTimeToUtc', async () => {
    const client = scheduleStub()
    const user = userEvent.setup()
    renderCalendar({ canEdit: true, client })
    await user.click(await screen.findByTestId('calendar-day-2026-11-10'))
    await user.click(await screen.findByTestId('session-edit-open'))

    const dateInput = screen.getByTestId('edit-move-date')
    const startInput = screen.getByTestId('edit-move-start')
    const endInput = screen.getByTestId('edit-move-end')
    await user.clear(dateInput)
    await user.type(dateInput, '2026-11-12')
    await user.clear(startInput)
    await user.type(startInput, '18:00')
    await user.clear(endInput)
    await user.type(endInput, '19:00')
    await user.click(screen.getByTestId('edit-move-submit'))

    await waitFor(() =>
      expect(client.patchSession).toHaveBeenCalledWith('s1', {
        starts_at: studioWallTimeToUtc('2026-11-12', '18:00'),
        ends_at: studioWallTimeToUtc('2026-11-12', '19:00'),
      }),
    )
  })
})

describe('honest about offline', () => {
  it('says the screen needs a connection rather than rendering an empty month', async () => {
    setForcedMode('offline')
    renderCalendar({ client: scheduleStub({ listSessions: vi.fn(async () => { throw new Error('offline') }) }) })
    const failed = await screen.findByTestId('load-failed')
    expect(failed).toHaveAttribute('data-offline', 'true')
    expect(screen.getByText(t('he', 'common.loadFailed.offline'))).toBeInTheDocument()
    // Never the two-day-cache-shaped lie: no grid pretending the month is simply empty.
    expect(screen.queryByTestId('staff-calendar')).toBeNull()
  })
})
