// Dashboard artboard 4b — קבוצות ומחזורים: תפוסה, טווח חגורות ולו״ז.
//
// Two of those three columns belong to milestones that have not run: belts are M7 and the
// roster is M3. They ship as stated gaps, not as invented numbers — the discipline
// ParentHome.tsx set for artboard 1a.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { GroupsAndCycles } from './GroupsAndCycles'
import type { GroupSummary, ScheduleClient } from './client'

const GROUPS: GroupSummary[] = [
  { id: 'g1', name: 'מתחילים', className: "ג'ודו" },
  { id: 'g2', name: 'נבחרת', className: "ג'ודו" },
]

const RULES = [
  {
    id: 'r1',
    group_id: 'g1',
    weekday: 2,
    start_time: '17:00:00',
    end_time: '19:00:00',
    location_id: null,
    effective_from: '2026-09-01',
  },
]

const SESSION = {
  id: 's1',
  group_id: 'g1',
  group_name: 'מתחילים',
  training_year_id: 'y1',
  starts_at: '2026-11-17T16:30:00Z',
  ends_at: '2026-11-17T18:30:00Z',
  location_id: null,
  location_name: null,
  status: 'scheduled' as const,
  is_manually_edited: false,
  is_ad_hoc: false,
  cancel_reason: null,
  staff: [],
  attendance_taken: false,
}

const PREVIEW = {
  sessions_to_create: 0,
  sessions_to_update: 0,
  sessions_to_cancel: 0,
  sessions_protected_past: 0,
  sessions_protected_manually_edited: 0,
  sessions_protected_ad_hoc: 0,
  first_affected_date: null,
  protected_manually_edited_sessions: [],
  students_left_unscheduled: 2,
}

function stub(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listSessions: vi.fn(async ({ groupId }: { groupId?: string }) =>
      groupId === 'g1' ? [SESSION] : [],
    ),
    getSchedule: vi.fn(async (groupId: string) => (groupId === 'g1' ? RULES : [])),
    putSchedule: vi.fn(async () => PREVIEW),
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
    ...overrides,
  } as unknown as ScheduleClient
}

function renderTable(client = stub(), groups = GROUPS) {
  render(
    <GroupsAndCycles locale="he" client={client} groups={groups} today="2026-11-03T12:00:00Z" />,
  )
  return client
}

describe('GroupsAndCycles (4b)', () => {
  it('lists one row per group, with its class', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByTestId('group-row')).toHaveLength(2))
    expect(screen.getByText('מתחילים')).toBeInTheDocument()
    expect(screen.getAllByText("ג'ודו")).toHaveLength(2)
  })

  it("renders each group's weekly schedule as a weekday and a time", async () => {
    // The column that is genuinely this lane's.
    renderTable()
    const cell = await screen.findByTestId('schedule-g1')
    expect(cell).toHaveTextContent(t('he', 'schedule.weekday.2'))
    expect(cell).toHaveTextContent('17:00')
  })

  it('says a group has no schedule rather than leaving the cell blank', async () => {
    renderTable()
    expect(await screen.findByTestId('schedule-g2')).toHaveTextContent(
      t('he', 'schedule.rules.empty'),
    )
  })

  it('shows the next upcoming session in the studio timezone', async () => {
    renderTable()
    // 16:30Z on 17 November is 18:30 in Jerusalem — winter, UTC+2.
    expect(await screen.findByTestId('next-g1')).toHaveTextContent('18:30')
  })

  it('says there is no next session rather than showing a dash', async () => {
    renderTable()
    expect(await screen.findByTestId('next-g2')).toHaveTextContent(
      t('he', 'schedule.groups.noNextSession'),
    )
  })

  it('surfaces C12 where a manager browses groups, not only inside a change dialog', async () => {
    // The same number the impact dialog shows, asked of the group's CURRENT rules — a
    // preview that changes nothing and reports the present state.
    renderTable()
    expect(await screen.findByTestId('unscheduled-g1')).toHaveTextContent('2')
  })

  it('asks for that number with apply false, so browsing 4b never writes', async () => {
    const client = renderTable()
    await waitFor(() => expect(client.putSchedule).toHaveBeenCalled())
    for (const call of vi.mocked(client.putSchedule).mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ apply: false }))
    }
  })

  it('states that the belt range arrives with M7 rather than rendering an empty cell', async () => {
    renderTable()
    expect(
      (await screen.findAllByText(t('he', 'schedule.groups.beltRangeComesLater')))[0],
    ).toBeInTheDocument()
  })

  it('states that capacity arrives with the roster rather than inventing a number', async () => {
    renderTable()
    expect(
      (await screen.findAllByText(t('he', 'schedule.groups.capacityComesLater')))[0],
    ).toBeInTheDocument()
  })

  it('says there are no groups rather than showing an empty table', async () => {
    renderTable(stub(), [])
    expect(await screen.findByText(t('he', 'schedule.groups.empty'))).toBeInTheDocument()
  })

  it('is a table with a caption and column headers', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByTestId('group-row')).toHaveLength(2))
    expect(screen.getByRole('table')).toHaveAccessibleName(t('he', 'schedule.groups.caption'))
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(5)
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <GroupsAndCycles
        locale={locale}
        client={stub()}
        groups={GROUPS}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId('group-row').length).toBe(2))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
