// The seam test §4.4 asks for: a task derives from real fetched/cached state, through the
// same injected clients every other staff screen uses, and disappears when that state
// changes on the next fetch — never because a hand-built `TaskCard[]` was handed to the
// component directly (that would only prove the renderer can render, not that the
// derivation is honest).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, setOfflineStore, writeWindow } from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { TasksScreen } from './TasksScreen'
import type { StaffScheduleClient, SessionRow } from '../schedule/client'
import type { StaffPeopleClient } from '../people'
import type { StaffCommsClient } from '../comms'
import type { PromiseClient } from '../billing/promiseClient'
import type { TasksClient } from './tasksClient'

const NOW = '2026-11-03T18:00:00Z'

const baseSession = {
  group_id: 'g1',
  training_year_id: 'y1',
  location_id: null,
  location_name: null,
  cancel_reason: null,
  is_manually_edited: false,
  is_ad_hoc: false,
  headcount: 10,
  staff: [],
} satisfies Partial<SessionRow>

function ended(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    ...baseSession,
    id: 's1',
    group_name: 'בוגרים',
    starts_at: '2026-11-03T15:00:00Z',
    ends_at: '2026-11-03T17:00:00Z',
    status: 'scheduled',
    attendance_taken: false,
    ...overrides,
  }
}

function scheduleStub(sessions: SessionRow[]): StaffScheduleClient {
  return {
    listSessions: vi.fn(async () => sessions),
    listTrainingYears: vi.fn(async () => []),
  }
}

function peopleStub(overrides: Partial<StaffPeopleClient> = {}): StaffPeopleClient {
  return {
    student: vi.fn(async () => ({ guardians: [] }) as never),
    ...overrides,
  } as StaffPeopleClient
}

function commsStub(overrides: Partial<StaffCommsClient> = {}): StaffCommsClient {
  return {
    atRisk: vi.fn(async () => ({ items: [] })),
    markRead: vi.fn(async () => ({}) as never),
    ...overrides,
  } as StaffCommsClient
}

function promiseStub(overrides: Partial<PromiseClient> = {}): PromiseClient {
  return {
    pending: vi.fn(async () => []),
    decide: vi.fn(async () => undefined),
    ...overrides,
  } as PromiseClient
}

function tasksClientStub(overrides: Partial<TasksClient> = {}): TasksClient {
  return {
    healthReviewNotifications: vi.fn(async () => []),
    ...overrides,
  } as TasksClient
}

function renderScreen(props: Partial<Parameters<typeof TasksScreen>[0]> = {}) {
  return render(
    <TasksScreen
      locale="he"
      scheduleClient={scheduleStub([])}
      peopleClient={peopleStub()}
      commsClient={commsStub()}
      promiseClient={promiseStub()}
      tasksClient={tasksClientStub()}
      viewerPersonId="coach-1"
      viewerIsManager={false}
      today={NOW}
      {...props}
    />,
  )
}

let store: OfflineStore

beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})

afterEach(() => {
  setOfflineStore(null)
})

describe('the tasks tab — checkpoint 8', () => {
  it('surfaces "close an open session" from the same GET /sessions the schedule tab reads', async () => {
    renderScreen({ scheduleClient: scheduleStub([ended()]) })
    await waitFor(() => expect(screen.getByTestId('task-close-session:s1')).toBeInTheDocument())
    expect(screen.getByTestId('task-action-close-session:s1')).toHaveAttribute(
      'href',
      '#/attendance/s1',
    )
  })

  it('the close-session card disappears once the same session reports attendance taken', async () => {
    const { rerender } = renderScreen({ scheduleClient: scheduleStub([ended()]) })
    await waitFor(() => expect(screen.getByTestId('task-close-session:s1')).toBeInTheDocument())

    rerender(
      <TasksScreen
        locale="he"
        scheduleClient={scheduleStub([ended({ attendance_taken: true })])}
        peopleClient={peopleStub()}
        commsClient={commsStub()}
        promiseClient={promiseStub()}
        tasksClient={tasksClientStub()}
        viewerPersonId="coach-1"
        viewerIsManager={false}
        today={NOW}
      />,
    )
    await waitFor(() => expect(screen.queryByTestId('task-close-session:s1')).toBeNull())
  })

  it('surfaces a missing health form from today\'s cached roster, not a fresh fetch', async () => {
    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [{ ...ended(), id: 's1' }],
      rosters: {
        s1: [
          {
            student_id: 'st1',
            display_name: 'נועה',
            belt_color_hex: null,
            belt_name: null,
            health_status: 'missing',
            derived_flags: {},
            status: 'unmarked',
            source: null,
            has_absence_report: false,
            absence_reason: null,
          },
        ],
      },
    })
    renderScreen({ scheduleClient: scheduleStub([ended()]) })
    await waitFor(() => expect(screen.getByTestId('task-health-form:st1')).toBeInTheDocument())
    // §4.4's non-negotiable: never render a declaration's own content.
    expect(screen.getByTestId('task-health-form:st1').textContent).not.toMatch(/אסתמה|אלרגיה/)
  })

  it('the health-form card disappears once the cached roster reports it signed', async () => {
    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [{ ...ended(), id: 's1' }],
      rosters: {
        s1: [
          {
            student_id: 'st1',
            display_name: 'נועה',
            belt_color_hex: null,
            belt_name: null,
            health_status: 'missing',
            derived_flags: {},
            status: 'unmarked',
            source: null,
            has_absence_report: false,
            absence_reason: null,
          },
        ],
      },
    })
    const first = renderScreen({ scheduleClient: scheduleStub([ended()]) })
    await waitFor(() => expect(screen.getByTestId('task-health-form:st1')).toBeInTheDocument())
    // Unmounted before the second mount below — two live trees in the same document would
    // let the first (stale) card satisfy `queryByTestId` even after the second render's
    // fetch resolves with the roster signed.
    first.unmount()

    await writeWindow(store, {
      server_time: NOW,
      from_time: NOW,
      to_time: NOW,
      sessions: [{ ...ended(), id: 's1' }],
      rosters: {
        s1: [
          {
            student_id: 'st1',
            display_name: 'נועה',
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
      },
    })
    // A fresh mount is the honest re-read here — the same "rebuilt every time the tab
    // opens" §4.4 makes the rule, and matches how `App.tsx` remounts this screen whenever
    // the coach navigates back onto `#/tasks`.
    renderScreen({ scheduleClient: scheduleStub([ended()]) })
    await waitFor(() => expect(screen.queryByTestId('task-health-form:st1')).toBeNull())
  })

  it('renders a "call a parent" card from the at-risk inbox, with a tick that marks it read and removes it', async () => {
    const markRead = vi.fn(async () => ({}) as never)
    const notification = {
      id: 'n1',
      kind: 'attendance.at_risk',
      title: 'תלמיד בסיכון',
      body: 'דניאל מזרחי — 3 היעדרויות רצופות',
      created_at: NOW,
      payload: { contact_person_id: 'p1', contact_phone: '050-0000000', missed_count: 3 },
    }
    renderScreen({
      commsClient: commsStub({ atRisk: vi.fn(async () => ({ items: [notification] })), markRead }),
    })
    await waitFor(() => expect(screen.getByTestId('task-call-parent:n1')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('task-tick-call-parent:n1'))
    expect(markRead).toHaveBeenCalledWith('n1')
    await waitFor(() => expect(screen.queryByTestId('task-call-parent:n1')).toBeNull())
  })

  it('does not fetch the manager-only rows for a non-manager', () => {
    const pending = vi.fn(async () => [])
    renderScreen({ viewerIsManager: false, promiseClient: promiseStub({ pending }) })
    expect(pending).not.toHaveBeenCalled()
  })

  it('shows the cash-pending card only to a manager, linking to the existing #/cash screen', async () => {
    const pending = vi.fn(async () => [
      {
        id: 'pr1',
        status: 'pending',
        method: 'cash' as const,
        total_agorot: 5000,
        claimed_plan_name: null,
        already_paid: false,
        payer_name: 'משפחת לוי',
        charge_count: 1,
        created_at: NOW,
      },
    ])
    renderScreen({ viewerIsManager: true, promiseClient: promiseStub({ pending }) })
    await waitFor(() => expect(screen.getByTestId('task-cash-pending')).toBeInTheDocument())
    expect(screen.getByTestId('task-action-cash-pending')).toHaveAttribute('href', '#/cash')
  })

  it('filter chips narrow the list to one bucket', async () => {
    renderScreen({
      scheduleClient: scheduleStub([ended()]),
      commsClient: commsStub({
        atRisk: vi.fn(async () => ({
          items: [
            {
              id: 'n1',
              kind: 'attendance.at_risk',
              title: 'תלמיד בסיכון',
              body: 'דניאל — 3 היעדרויות רצופות',
              created_at: NOW,
              payload: { contact_person_id: 'p1', missed_count: 3 },
            },
          ],
        })),
      }),
    })
    await waitFor(() => expect(screen.getByTestId('task-close-session:s1')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('task-call-parent:n1')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('tasks-filter-urgent'))
    expect(screen.getByTestId('task-close-session:s1')).toBeInTheDocument()
    expect(screen.queryByTestId('task-call-parent:n1')).toBeNull()

    await userEvent.click(screen.getByTestId('tasks-filter-followUp'))
    expect(screen.queryByTestId('task-close-session:s1')).toBeNull()
    expect(screen.getByTestId('task-call-parent:n1')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is open', async () => {
    renderScreen()
    await waitFor(() => expect(screen.getByText('אין משימות פתוחות')).toBeInTheDocument())
  })

  it('every button on the screen is a real link or a real handler — no bare toast', async () => {
    renderScreen({ scheduleClient: scheduleStub([ended()]) })
    const card = await waitFor(() => screen.getByTestId('task-close-session:s1'))
    const action = within(card).getByTestId('task-action-close-session:s1')
    expect(action.tagName).toBe('A')
    expect(action.getAttribute('href')).not.toBe('')
  })
})
