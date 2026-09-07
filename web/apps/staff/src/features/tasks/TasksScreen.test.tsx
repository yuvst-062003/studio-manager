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
import { t } from '@studio/i18n'
import { TasksScreen } from './TasksScreen'
import type { StaffScheduleClient, SessionRow } from '../schedule/client'
import type { StaffPeopleClient, StudentSummary } from '../people'
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
    // §4.7's calendar (checkpoint C11) — the tasks tab never calls either; present only
    // so this stub satisfies the interface's shape.
    patchSession: vi.fn(async () => sessions[0]!),
    cancelSession: vi.fn(async () => sessions[0]!),
  }
}

function peopleStub(overrides: Partial<StaffPeopleClient> = {}): StaffPeopleClient {
  return {
    student: vi.fn(async () => ({ guardians: [] }) as never),
    // The birthday section's own fetch (`useBirthdays.ts`) — the same `search('')` call
    // `StudentsSearch.tsx` already makes. Empty by default so every test above this
    // section's own `describe` block, written before the birthday section existed,
    // keeps rendering nothing for it without having to know it now exists.
    search: vi.fn(async () => ({ items: [] })),
    ...overrides,
  } as StaffPeopleClient
}

/** A minimal `StudentSummaryOut` for the birthday tests below — every field the type
 *  requires, with `birthdate` the one callers actually vary. */
function studentSummary(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: null,
    health_status: 'signed',
    joined_on: null,
    left_on: null,
    status: 'active',
    ...overrides,
  }
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
  // The birthday section's own greeted tick lives in real `localStorage` (see
  // `birthdayGreetings.ts`), which jsdom keeps for the whole test file rather than
  // resetting per test — cleared here so one test's tick cannot leak into the next.
  globalThis.localStorage?.clear()
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

  // 2026-09-06 — ported from the deleted `features/comms/AtRiskAlert.tsx` banner (see
  // `../comms/index.ts`'s own header for why it is gone): the one-tap `tel:` dial that
  // banner gave a coach standing beside a mat now lives on this card instead, so nothing
  // was lost in folding the two surfaces into one.
  it('gives the call-parent card its own one-tap dial to the family', async () => {
    const notification = {
      id: 'n2',
      kind: 'attendance.at_risk',
      title: 'תלמיד בסיכון',
      body: 'נועה גל — 4 היעדרויות רצופות',
      created_at: NOW,
      payload: { contact_person_id: 'p2', contact_phone: '054-1234567', missed_count: 4 },
    }
    renderScreen({
      commsClient: commsStub({ atRisk: vi.fn(async () => ({ items: [notification] })) }),
    })
    const link = await waitFor(() => screen.getByTestId('task-call-call-parent:n2'))
    expect(link).toHaveAttribute('href', 'tel:054-1234567')
    expect(link).toHaveAccessibleName(t('he', 'comms.atRisk.contactParent'))
    // The tick is a separate control — §4.4's own rule that nothing here can know whether
    // the coach actually called, so dialing must not silently mark the card done.
    expect(screen.getByTestId('task-call-parent:n2')).toBeInTheDocument()
  })

  it('says so plainly on the card when the family has no number on file', async () => {
    const notification = {
      id: 'n3',
      kind: 'attendance.at_risk',
      title: 'תלמיד בסיכון',
      body: 'עומר לביא — 3 היעדרויות רצופות',
      created_at: NOW,
      payload: { contact_person_id: 'p3', missed_count: 3 },
    }
    renderScreen({
      commsClient: commsStub({ atRisk: vi.fn(async () => ({ items: [notification] })) }),
    })
    await waitFor(() => expect(screen.getByTestId('task-call-parent:n3')).toBeInTheDocument())
    expect(screen.getByTestId('task-no-phone-call-parent:n3')).toHaveTextContent(
      t('he', 'comms.atRisk.noPhone'),
    )
    expect(screen.queryByTestId('task-call-call-parent:n3')).toBeNull()
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

describe('the birthday section — decision reversed 2026-09-06', () => {
  // NOW is 2026-11-03 in the studio's own timezone (Asia/Jerusalem) — see `deriveBirthdays.ts`.
  it('surfaces a birthday row for a child whose birthdate falls this week, and not one whose does not — through the real fetch', async () => {
    renderScreen({
      peopleClient: peopleStub({
        search: vi.fn(async () => ({
          items: [
            studentSummary({ id: 'this-week', first_name: 'עדן', last_name: 'כהן', birthdate: '2015-11-03' }),
            studentSummary({ id: 'not-this-week', first_name: 'רוני', last_name: 'שגיא', birthdate: '2015-01-15' }),
          ],
        })),
      }),
    })
    await waitFor(() => expect(screen.getByTestId('birthday-row-this-week')).toBeInTheDocument())
    expect(screen.queryByTestId('birthday-row-not-this-week')).toBeNull()
  })

  it('renders nothing when no student on the roster has a birthday this week', async () => {
    renderScreen()
    // Let the (empty) fetch resolve before asserting the negative.
    await waitFor(() => expect(screen.getByTestId('staff-tasks')).toBeInTheDocument())
    expect(screen.queryByTestId('birthday-section')).toBeNull()
  })

  it('the greeted tick is a local acknowledgement that survives a reload, and never claims a message was sent', async () => {
    const search = vi.fn(async () => ({
      items: [studentSummary({ id: 'bday-1', first_name: 'תום', last_name: 'לוי', birthdate: '2015-11-03' })],
    }))
    const { unmount } = renderScreen({ peopleClient: peopleStub({ search }) })
    const tick = await waitFor(() => screen.getByTestId('birthday-tick-bday-1'))
    expect(tick).toHaveAttribute('aria-pressed', 'false')
    // Never "sent" — §4.9's own rule, restated for this tick: opening WhatsApp is not
    // proof anything was sent, so the mark is only ever about what the coach did.
    expect(tick.getAttribute('aria-label') ?? '').not.toMatch(/נשלח|sent/i)

    await userEvent.click(tick)
    expect(tick).toHaveAttribute('aria-pressed', 'true')
    unmount()

    renderScreen({ peopleClient: peopleStub({ search }) })
    const tickAfterReload = await waitFor(() => screen.getByTestId('birthday-tick-bday-1'))
    expect(tickAfterReload).toHaveAttribute('aria-pressed', 'true')
  })
})
