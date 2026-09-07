// §5/C12 of the staff app redesign — the manager's side of §6.1's coach unavailability:
// the alert-centre card (`CoachConstraintsAlert.tsx`) and the resolution popup it opens
// (`ConstraintResolutionPopover.tsx`). Decisions 10, 11, 12.
//
// The load-bearing assertions are the ones the spec names by name: the alert is silent
// with an empty queue, the substitute picker shows the busy staff rather than hiding them,
// a refusal cannot be sent with no reason, a 422 from approve reaches the screen rather
// than being swallowed, and cancelling a session from the popup calls the real endpoint
// with the reason typed into it.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { CoachConstraintsAlert } from './CoachConstraintsAlert'
import { ConstraintResolutionPopover } from './ConstraintResolutionPopover'
import { COACH_CONSTRAINTS_ALERT_ORDER, registerCoachConstraintAlerts } from './register'
import { CoachConstraintApiError } from './coachConstraintsClient'
import type {
  CoachConstraintClient,
  CoachConstraintRow,
  StaffAvailabilityRow,
  StaffDirectoryRow,
} from './coachConstraintsClient'
import type { ScheduleClient, SessionRow } from './client'

const CONSTRAINT: CoachConstraintRow = {
  id: 'c1',
  person_id: 'p1',
  starts_at: '2026-11-03T10:00:00Z',
  ends_at: '2026-11-03T20:00:00Z',
  all_day: false,
  reason: 'illness',
  note: 'חום גבוה',
  status: 'pending',
  substitute_person_id: null,
  decided_by_person_id: null,
  decided_at: null,
}

const DIRECTORY: StaffDirectoryRow[] = [
  { person_id: 'p1', first_name: 'רון', last_name: 'כהן' },
  { person_id: 'p2', first_name: 'דנה', last_name: 'לוי' },
  { person_id: 'p3', first_name: 'עומר', last_name: 'בר' },
]

const AVAILABILITY: StaffAvailabilityRow[] = [
  { person_id: 'p2', display_name: 'דנה לוי', roles: ['assistant_coach'], available: true },
  { person_id: 'p3', display_name: 'עומר בר', roles: ['lead_coach'], available: false },
]

const SESSION_BASE = {
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  location_id: null,
  location_name: null,
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  attendance_taken: false,
}

const AFFECTED_SESSION: SessionRow = {
  ...SESSION_BASE,
  id: 's1',
  starts_at: '2026-11-03T15:00:00Z',
  ends_at: '2026-11-03T17:00:00Z',
  status: 'scheduled',
  staff: [{ person_id: 'p1', display_name: 'רון כהן', role: 'lead_coach', is_substitute: false }],
}

function makeClient(over: Partial<CoachConstraintClient> = {}): CoachConstraintClient {
  return {
    listPending: vi.fn(async () => []),
    listStaff: vi.fn(async () => DIRECTORY),
    staffAvailable: vi.fn(async () => AVAILABILITY),
    approve: vi.fn(async () => ({ ...CONSTRAINT, status: 'approved' as const })),
    refuse: vi.fn(async () => ({ ...CONSTRAINT, status: 'refused' as const })),
    ...over,
  }
}

function stubSchedule(sessions: SessionRow[] = []): ScheduleClient {
  return {
    listSessions: vi.fn(async () => sessions),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(),
    listHolidayPresets: vi.fn(async () => []),
    patchSession: vi.fn(async () => AFFECTED_SESSION),
    cancelSession: vi.fn(async () => ({ ...AFFECTED_SESSION, status: 'cancelled' as const })),
    addSessionNote: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    listLocations: vi.fn(async () => []),
    listGroups: vi.fn(async () => []),
    createSession: vi.fn(async () => AFFECTED_SESSION),
  } as unknown as ScheduleClient
}

afterEach(() => {
  clearSlot('alert-centre')
  vi.restoreAllMocks()
})

// -- the alert-centre card ------------------------------------------------------------
describe('the coach-constraints alert', () => {
  it('renders nothing when nothing is pending', async () => {
    const client = makeClient({ listPending: vi.fn(async () => []) })
    render(<CoachConstraintsAlert client={client} locale="he" scheduleClient={stubSchedule()} />)
    await waitFor(() => expect(client.listPending).toHaveBeenCalled())
    expect(screen.queryByTestId('constraints-alert')).toBeNull()
  })

  it('shows the queue once a constraint is pending, naming who filed it', async () => {
    const client = makeClient({ listPending: vi.fn(async () => [CONSTRAINT]) })
    render(<CoachConstraintsAlert client={client} locale="he" scheduleClient={stubSchedule()} />)

    const row = await screen.findByTestId(`constraint-queue-row-${CONSTRAINT.id}`)
    // `listPending` and `listStaff` are two independent reads; the name only settles once
    // both have resolved, so this is awaited rather than asserted the instant the row itself
    // (which needs only the first) appears.
    expect(await within(row).findByText('רון כהן')).toBeInTheDocument()
    // The reason sits beside the window in one paragraph (`{window} · {reason}`), so its
    // text is split across sibling text nodes — asserted against the row's full text
    // content rather than a single-node `getByText` match.
    expect(row).toHaveTextContent(t('he', `schedule.constraint.reason.${CONSTRAINT.reason}`))
  })

  it('opens the resolution popup from the queue row', async () => {
    const client = makeClient({ listPending: vi.fn(async () => [CONSTRAINT]) })
    render(<CoachConstraintsAlert client={client} locale="he" scheduleClient={stubSchedule()} />)

    // Wait for the staff directory too, so the popup opens already knowing the filer's name
    // rather than racing it.
    await screen.findByText('רון כהן')
    await userEvent.click(screen.getByTestId(`constraint-open-${CONSTRAINT.id}`))
    expect(await screen.findByTestId('constraint-resolution-popover')).toBeInTheDocument()
    // Filed-by names the SAME person the queue row named, resolved off the same directory.
    expect(screen.getByText(t('he', 'schedule.constraint.manager.filedBy').replace('{{name}}', 'רון כהן'))).toBeInTheDocument()
  })

  it('keeps the popup open once a decision empties the background queue', async () => {
    // Approving refreshes the queue behind the popup (`onResolved`); once the real API
    // drops the now-decided row from `status=pending`, that refresh must not yank the
    // dialog away from a manager still looking at the affected sessions underneath it.
    const client = makeClient({
      listPending: vi
        .fn()
        .mockResolvedValueOnce([CONSTRAINT])
        .mockResolvedValueOnce([]),
    })
    render(<CoachConstraintsAlert client={client} locale="he" scheduleClient={stubSchedule([])} />)

    await screen.findByText('רון כהן')
    await userEvent.click(screen.getByTestId(`constraint-open-${CONSTRAINT.id}`))
    await userEvent.click(await screen.findByTestId('constraint-approve'))

    expect(await screen.findByTestId('constraint-decided')).toBeInTheDocument()
    await waitFor(() => expect(client.listPending).toHaveBeenCalledTimes(2))
    // The queue card itself is gone (nothing left pending), but the open popup survives.
    expect(screen.queryByTestId(`constraint-queue-row-${CONSTRAINT.id}`)).toBeNull()
    expect(screen.getByTestId('constraint-resolution-popover')).toBeInTheDocument()
  })

  describe('registration', () => {
    it('registers into alert-centre and into nothing else', () => {
      registerCoachConstraintAlerts(makeClient(), stubSchedule())
      expect(useSlot('alert-centre').map((entry) => entry.key)).toEqual(['schedule-coach-constraints'])
      expect(useSlot('staff-alerts')).toHaveLength(0)
    })

    it('sits between the at-risk card (15) and the health-review hold (20)', () => {
      expect(COACH_CONSTRAINTS_ALERT_ORDER).toBeGreaterThan(15)
      expect(COACH_CONSTRAINTS_ALERT_ORDER).toBeLessThan(20)
    })
  })
})

// -- the resolution popup ---------------------------------------------------------------
describe('the resolution popup', () => {
  it('lists available and unavailable staff, and marks which is which', async () => {
    const client = makeClient()
    render(
      <ConstraintResolutionPopover
        client={client}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([])}
      />,
    )

    const available = await screen.findByTestId('availability-p2')
    const unavailable = await screen.findByTestId('availability-p3')
    expect(available).toHaveAttribute('data-available', 'true')
    expect(unavailable).toHaveAttribute('data-available', 'false')
    // Marked in the accessible name too, not by colour alone — the unavailable row's own
    // label says so, and it is still a real, enabled radio (decision 12: "still selectable").
    const busyRadio = within(unavailable).getByRole('radio')
    expect(busyRadio).not.toBeDisabled()
    expect(busyRadio).toHaveAccessibleName(new RegExp(t('he', 'schedule.constraint.manager.unavailableTag')))
  })

  it('disables refuse until a reason is typed, then enables it', async () => {
    const client = makeClient()
    render(
      <ConstraintResolutionPopover
        client={client}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([])}
      />,
    )

    const refuseButton = screen.getByTestId('constraint-refuse')
    expect(refuseButton).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText(t('he', 'schedule.constraint.manager.refuseReasonLabel')),
      'כבר יש מחליף קבוע',
    )
    expect(refuseButton).toBeEnabled()

    await userEvent.click(refuseButton)
    await waitFor(() => expect(client.refuse).toHaveBeenCalledWith(CONSTRAINT.id, 'כבר יש מחליף קבוע'))
  })

  it('shows a 422 from approve rather than swallowing it', async () => {
    const client = makeClient({
      approve: vi.fn(async () => {
        throw new CoachConstraintApiError('המחליף המוצע אינו זמין בטווח הזה', 422, 'unavailable')
      }),
    })
    render(
      <ConstraintResolutionPopover
        client={client}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([])}
      />,
    )

    await userEvent.click(screen.getByTestId('constraint-approve'))

    expect(await screen.findByTestId('constraint-error')).toHaveTextContent('המחליף המוצע אינו זמין בטווח הזה')
    // Not swallowed AND not silently retried or treated as a decision: the approve/refuse
    // controls are still live, and nothing claims the constraint was decided.
    expect(screen.queryByTestId('constraint-decided')).toBeNull()
    expect(screen.getByTestId('constraint-approve')).toBeEnabled()
    expect(client.approve).toHaveBeenCalledTimes(1)
  })

  it('records the decision without touching any session — approve carries no substitute unless one is chosen', async () => {
    const client = makeClient()
    render(
      <ConstraintResolutionPopover
        client={client}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([])}
      />,
    )

    await userEvent.click(await screen.findByTestId('constraint-approve'))
    await waitFor(() => expect(client.approve).toHaveBeenCalledWith(CONSTRAINT.id, undefined))
    expect(await screen.findByTestId('constraint-decided')).toBeInTheDocument()
  })

  it('shows the sessions the window overlaps, and cancelling one calls the cancel endpoint with its reason', async () => {
    const scheduleClient = stubSchedule([AFFECTED_SESSION])
    const client = makeClient()
    render(
      <ConstraintResolutionPopover
        client={client}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={scheduleClient}
      />,
    )

    const row = await screen.findByTestId(`affected-session-${AFFECTED_SESSION.id}`)
    expect(within(row).getByText('מתחילים')).toBeInTheDocument()

    const cancelButton = within(row).getByTestId(`cancel-session-${AFFECTED_SESSION.id}`)
    expect(cancelButton).toBeDisabled()

    await userEvent.type(
      within(row).getByLabelText(t('he', 'schedule.session.cancelReason')),
      'המאמן חולה ואין מחליף',
    )
    expect(cancelButton).toBeEnabled()
    await userEvent.click(cancelButton)

    // Cancelling is confirmed, the same two-step `SessionPopover.tsx` already uses for the
    // same irreversible action.
    await userEvent.click(await screen.findByTestId(`confirm-cancel-${AFFECTED_SESSION.id}-confirm`))

    await waitFor(() =>
      expect(scheduleClient.cancelSession).toHaveBeenCalledWith(AFFECTED_SESSION.id, 'המאמן חולה ואין מחליף'),
    )
  })

  it('does not show a session outside the constraint window', async () => {
    const outside: SessionRow = {
      ...AFFECTED_SESSION,
      id: 's2',
      starts_at: '2026-11-04T15:00:00Z',
      ends_at: '2026-11-04T17:00:00Z',
    }
    render(
      <ConstraintResolutionPopover
        client={makeClient()}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([outside])}
      />,
    )

    expect(await screen.findByTestId('affected-sessions-empty')).toBeInTheDocument()
    expect(screen.queryByTestId(`affected-session-${outside.id}`)).toBeNull()
  })
})

// -- G12 ------------------------------------------------------------------------------
describe('layout', () => {
  it('uses no physical CSS properties', async () => {
    const { container } = render(
      <ConstraintResolutionPopover
        client={makeClient()}
        constraint={CONSTRAINT}
        filerName="רון כהן"
        locale="he"
        onClose={() => undefined}
        onResolved={() => undefined}
        scheduleClient={stubSchedule([AFFECTED_SESSION])}
      />,
    )
    await screen.findByTestId('constraint-resolution-popover')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})
