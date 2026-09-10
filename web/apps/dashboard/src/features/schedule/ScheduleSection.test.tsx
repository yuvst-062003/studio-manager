// The schedule vertical's own container. It exists so `App.tsx` gains exactly one route
// branch instead of four — the sub-routing between 3a, 4b, 6a and the closures panel is
// this lane's business, and App.tsx is the one file lane PEOPLE also edits.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ScheduleSection, scheduleRoute } from './ScheduleSection'
import type { ScheduleClient } from './client'
import type { ClassWizardClient } from './class-wizard/client'

const SESSION_ROW = {
  id: 's1',
  group_id: 'g1',
  group_name: 'מתחילים',
  class_id: 'c-judo',
  class_name: "ג'ודו",
  training_year_id: 'y1',
  starts_at: '2026-11-03T15:00:00Z',
  ends_at: '2026-11-03T16:00:00Z',
  location_id: null,
  location_name: null,
  status: 'scheduled' as const,
  is_manually_edited: false,
  is_ad_hoc: false,
  cancel_reason: null,
  staff: [],
  attendance_taken: false,
}

function wizardStub(): ClassWizardClient {
  return new Proxy(
    {},
    {
      get() {
        // The section routes TO the wizard; it never calls through it. A call arriving
        // here means the section grew a fetch that belongs a level down.
        return async () => {
          throw new Error('the section must not call the wizard client')
        }
      },
    },
  ) as ClassWizardClient
}

function stub(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listClasses: vi.fn(async () => [
      {
        id: 'c1',
        name: "ג'ודו",
        description: null,
        discipline: null,
        color: null,
        isActive: true,
      },
    ]),
    createClass: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    updateClass: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    listGroups: vi.fn(async () => [{ id: 'g1', name: 'מתחילים', className: "ג'ודו", classId: 'c1', isActive: true }]),
    listSessions: vi.fn(async () => []),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(async () => ({
      sessions_to_create: 0,
      sessions_to_update: 0,
      sessions_to_cancel: 0,
      sessions_protected_past: 0,
      sessions_protected_manually_edited: 0,
      sessions_protected_ad_hoc: 0,
      first_affected_date: null,
      protected_manually_edited_sessions: [],
      students_left_unscheduled: 0,
    })),
    listTrainingYears: vi.fn(async () => [
      {
        id: 'y1',
        name: 'תשפ״ז',
        starts_on: '2026-09-01',
        ends_on: '2027-06-30',
        status: 'active' as const,
      },
    ]),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 0 })),
    listHolidayPresets: vi.fn(async () => []),
    createSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    patchSession: vi.fn(async () => SESSION_ROW),
    cancelSession: vi.fn(async () => SESSION_ROW),
    addSessionNote: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    listLocations: vi.fn(async () => []),
    ...overrides,
  }
}

function renderAt(hash: string, client = stub()) {
  render(
    <ScheduleSection
      client={client}
      hash={hash}
      locale="he"
      today="2026-11-03T12:00:00Z"
      wizardClient={wizardStub()}
    />,
  )
  return client
}

describe('scheduleRoute', () => {
  it('reads the three top-level screens', () => {
    expect(scheduleRoute('#/schedule')).toEqual({ view: 'week' })
    expect(scheduleRoute('#/classes')).toEqual({ view: 'classes' })
    expect(scheduleRoute('#/closures')).toEqual({ view: 'closures' })
  })

  it('still answers #/groups, which is the hash the nav pointed at until checkpoint 6', () => {
    // The screen that hash named has been REPLACED, not deleted, and it is in real
    // bookmarks. Resolving it to the classes index is the nearest true answer; 404-ing a
    // hash the product itself published would be a dead end of our own making.
    expect(scheduleRoute('#/groups')).toEqual({ view: 'classes' })
  })

  it('reads the wizard\u2019s two hashes — create and edit', () => {
    // `new` is matched BEFORE the id pattern: a literal that looks like an id is how a
    // create route becomes a 404 for one unlucky uuid.
    expect(scheduleRoute('#/classes/new')).toEqual({ view: 'classWizard' })
    expect(scheduleRoute('#/classes/abc-123/edit')).toEqual({
      view: 'classWizard',
      classId: 'abc-123',
    })
  })

  it('reads a class id out of the class route', () => {
    expect(scheduleRoute('#/classes/abc-123')).toEqual({ view: 'classGroups', classId: 'abc-123' })
  })

  it('reads a group id out of the group route', () => {
    expect(scheduleRoute('#/groups/abc-123')).toEqual({ view: 'group', groupId: 'abc-123' })
  })

  it('falls back to the week board rather than to a blank screen', () => {
    expect(scheduleRoute('#/nonsense')).toEqual({ view: 'week' })
    expect(scheduleRoute('')).toEqual({ view: 'week' })
  })
})

describe('ScheduleSection', () => {
  it('renders 3a at #/schedule', async () => {
    renderAt('#/schedule')
    expect(await screen.findByText(t('he', 'schedule.week.title'))).toBeInTheDocument()
  })

  it('renders the classes index at #/classes', async () => {
    renderAt('#/classes')
    await waitFor(() => expect(screen.getAllByTestId(/^class-card-/)).toHaveLength(1))
    // And NOT the group cards: groups live one level down now.
    expect(screen.queryAllByTestId(/^group-card-/)).toHaveLength(0)
  })

  it("renders one class's groups at #/classes/<id>", async () => {
    renderAt('#/classes/c1')
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))
    // Named by the CLASS, with a way back up.
    expect(screen.getByRole('heading', { name: "ג'ודו" })).toBeInTheDocument()
    expect(screen.getByTestId('groups-back')).toHaveAttribute('href', '#/classes')
  })

  it('names the class even when it has no groups to take a name from', async () => {
    // The manager who most needs the screen to say which class they opened is the one
    // whose class is still empty. Reading the class beats deriving its name from a group
    // that does not exist.
    renderAt(
      '#/classes/c2',
      stub({
        listClasses: vi.fn(async () => [
          {
            id: 'c2',
            name: 'קרב מגע',
            description: null,
            discipline: null,
            color: null,
            isActive: true,
          },
        ]),
        listGroups: vi.fn(async () => []),
      }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'קרב מגע' }),
    ).toBeInTheDocument()
  })

  it('shows only the groups of the class in the hash', async () => {
    renderAt(
      '#/classes/c2',
      stub({
        listGroups: vi.fn(async () => [
          { id: 'g1', name: 'מתחילים', className: "ג'ודו", classId: 'c1', isActive: true },
          { id: 'g2', name: 'מבוגרים', className: 'קרב מגע', classId: 'c2', isActive: true },
        ]),
      }),
    )
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))
    expect(screen.getByTestId('group-card-g2')).toBeInTheDocument()
  })

  it('renders the closure calendar at #/closures', async () => {
    renderAt('#/closures')
    expect(await screen.findByTestId('holiday-presets')).toBeInTheDocument()
  })

  it('renders 6a for one group at #/groups/<id>', async () => {
    renderAt('#/groups/g1')
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'מתחילים' })).toBeInTheDocument()
  })

  it('links each group card to its own group page', async () => {
    renderAt('#/classes/c1')
    const link = await screen.findByRole('link', { name: /מתחילים/ })
    expect(link).toHaveAttribute('href', '#/groups/g1')
  })

  it('links each class card to that class’s groups', async () => {
    renderAt('#/classes')
    const link = await screen.findByRole('link', { name: "ג'ודו" })
    expect(link).toHaveAttribute('href', '#/classes/c1')
  })

  it('says so when the group id in the hash matches no group', async () => {
    // A stale bookmark is the ordinary way to arrive here, and a blank page is the worst
    // available answer.
    renderAt('#/groups/gone')
    expect(await screen.findByText(t('he', 'schedule.groups.empty'))).toBeInTheDocument()
  })

  it('does not fetch the group list for the week board', async () => {
    // 3a needs sessions, not groups. Fetching a roster to draw a calendar is a request a
    // manager pays for on every week they page through.
    const client = renderAt('#/schedule')
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    expect(client.listGroups).not.toHaveBeenCalled()
  })

  it('waits for the closure panel’s training year rather than guessing one', async () => {
    const client = renderAt('#/closures')
    await waitFor(() => expect(client.listClosures).toHaveBeenCalledWith('y1'))
  })

  it('says there is no active year rather than rendering closures against nothing', async () => {
    renderAt('#/closures', stub({ listTrainingYears: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.group.noActiveYear'))).toBeInTheDocument()
  })

  it('refetches the table when `today` changes, by one millisecond or by a day', async () => {
    // **A characterization test, and the justification for `useToday`.** Measured, not
    // assumed: a one-millisecond change to `today` re-runs the table's effect and costs
    // `1 + 3N` requests, `N` of them sequentially awaited previews.
    //
    // That is correct behaviour — a new day really does change which session is "next" —
    // and it is exactly why `App.tsx` must not hand this a fresh `new Date().toISOString()`
    // on every render. The guarantee that it does not lives in `useToday.test.ts`.
    const client = stub()
    const { rerender } = render(
      <ScheduleSection
        client={client}
        hash="#/classes/c1"
        locale="he"
        today="2026-11-03T12:00:00Z"
        wizardClient={wizardStub()}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))
    const before = vi.mocked(client.putSchedule).mock.calls.length

    rerender(
      <ScheduleSection
        client={client}
        hash="#/classes/c1"
        locale="he"
        today="2026-11-03T12:00:00.001Z"
        wizardClient={wizardStub()}
      />,
    )
    await waitFor(() =>
      expect(vi.mocked(client.putSchedule).mock.calls.length).toBeGreaterThan(before),
    )
  })

  it('does not refetch when nothing its effects depend on has changed', async () => {
    // The other half of the pair. On its own this is nearly trivial — once loaded, `groups`
    // is a stable state reference — but together with the test above it states the contract
    // the caller has to meet: stable inputs in, no requests out.
    const client = stub()
    const view = (
      <ScheduleSection
        client={client}
        hash="#/classes/c1"
        locale="he"
        today="2026-11-03T12:00:00Z"
        wizardClient={wizardStub()}
      />
    )
    const { rerender } = render(view)
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))

    // The cards appearing means the GROUPS arrived; the schedule preview is a second,
    // later request, and this used to read its count the moment the first one landed. Under
    // load that read `0` and the setup assertion below failed before the test had begun —
    // `expected 0 to be greater than 0`. Wait for the call this test is actually about.
    await waitFor(() => expect(vi.mocked(client.putSchedule).mock.calls.length).toBeGreaterThan(0))

    const groupCalls = vi.mocked(client.listGroups).mock.calls.length
    const previewCalls = vi.mocked(client.putSchedule).mock.calls.length

    rerender(view)
    rerender(view)
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))

    expect(vi.mocked(client.listGroups).mock.calls).toHaveLength(groupCalls)
    expect(vi.mocked(client.putSchedule).mock.calls).toHaveLength(previewCalls)
  })


  it('uses no physical CSS', async () => {
    const { container } = render(
      <ScheduleSection
        client={stub()}
        hash="#/classes/c1"
        locale="he"
        today="2026-11-03T12:00:00Z"
        wizardClient={wizardStub()}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(1))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
