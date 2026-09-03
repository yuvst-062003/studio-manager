// Dashboard artboard 4b — קבוצות ומחזורים: לו״ז ומחזורים.
//
// Belt ranges belong to a milestone that has not run (M7 / `belt_rank`, a W4 contract
// model). B3.3 ships that as a stated gap in `PageHeader`'s subtitle, not as an invented
// number or an empty, mislabelled column — the discipline ParentHome.tsx set for
// artboard 1a. Capacity was cut from the product outright (2026-08-27) and is not a gap
// at all.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import { GroupsAndCycles } from './GroupsAndCycles'
import type { GroupSummary, ScheduleClient } from './client'

const GROUPS: GroupSummary[] = [
  { id: 'g1', name: 'מתחילים', className: "ג'ודו", classId: 'c1', isActive: true },
  { id: 'g2', name: 'נבחרת', className: "ג'ודו", classId: 'c1', isActive: true },
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
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
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

  it('renders no capacity anywhere — the 2026-08-27 decision cut it from the product', async () => {
    // A group has no cap; 7d's 42/54 is an EVENT cap, a different thing. The old
    // "capacity comes later" promise is deleted rather than kept, because the thing it
    // promised was decided against.
    renderTable()
    await screen.findAllByRole('rowheader')
    expect(document.body.textContent ?? '').not.toMatch(/תפוסה|מלאה/)
  })

  it('says there are no groups rather than showing an empty table', async () => {
    renderTable(stub(), [])
    expect(await screen.findByText(t('he', 'schedule.groups.empty'))).toBeInTheDocument()
  })

  it('is a table with a caption and column headers', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(screen.getByRole('table')).toHaveAccessibleName(t('he', 'schedule.groups.caption'))
    // group / schedule / next / unscheduled — the belt-range column (B3.3) is cut, and
    // `renderTable` passes no `onChanged`, so the actions column (B3.4) is absent too.
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThanOrEqual(4)
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
    await waitFor(() => expect(screen.getAllByRole('rowheader').length).toBe(2))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})


describe('the door to the schedule editor (2026-08-28)', () => {
  afterEach(() => {
    globalThis.location.hash = ''
    vi.unstubAllGlobals()
  })

  it('lands the manager inside the new group\u2019s schedule page after create', async () => {
    // The form used to just close; the only way to the weekly days-and-hours editor was
    // the group\u2019s NAME in the table, and the owner\u2019s staging pass read that as
    // \u201ccannot set the schedule at all\u201d.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'g-new', name: 'קבוצה 1' }), { status: 201 })
        }
        if (String(input).includes('/classes')) {
          return new Response(JSON.stringify({ items: [{ id: 'c1', name: "ג'ודו" }] }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(
      <GroupsAndCycles
        locale="he"
        client={stub()}
        groups={GROUPS}
        today="2026-11-03T12:00:00Z"
        hrefForGroup={(id) => `#/groups/${id}`}
        onChanged={() => undefined}
      />,
    )
    await userEvent.click(screen.getByTestId('new-group-open'))
    await userEvent.type(screen.getAllByRole('textbox')[0] as HTMLElement, 'קבוצה 1')
    await waitFor(() =>
      expect(screen.getByRole('combobox').querySelectorAll('option').length).toBeGreaterThan(1),
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1')
    await userEvent.click(screen.getByTestId('new-group-submit'))
    await waitFor(() => expect(globalThis.location.hash).toBe('#/groups/g-new'))
  })

  it('B3.1 — the group name IS the door, with no second link-button beside it', async () => {
    render(
      <GroupsAndCycles
        locale="he"
        client={stub()}
        groups={GROUPS}
        today="2026-11-03T12:00:00Z"
        hrefForGroup={(id) => `#/groups/${id}`}
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    // The old ghost-button link beside the name is gone.
    expect(screen.queryByTestId('group-schedule-link-g1')).not.toBeInTheDocument()
    // The name itself is the (only) link to the group's page.
    const nameLink = screen.getByRole('link', { name: 'מתחילים' })
    expect(nameLink).toHaveAttribute('href', '#/groups/g1')
    expect(nameLink).toHaveClass('groups-table__name')
    const linksToG1 = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '#/groups/g1')
    expect(linksToG1).toHaveLength(1)
  })
})

describe('B3.2 — the identity column header names what it holds', () => {
  it('heads the column "קבוצה", not the page title repeated a third time', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(
      screen.getByRole('columnheader', { name: t('he', 'schedule.groups.col.name') }),
    ).toBeInTheDocument()
    // `schedule.groups.title` is the <h1> now (B3.6) — a column header must not repeat it.
    expect(
      screen.queryByRole('columnheader', { name: t('he', 'schedule.groups.title') }),
    ).not.toBeInTheDocument()
  })
})

describe('B3.3 — the belt-range column is cut until it has data', () => {
  it('renders no belt-range column, and states the gap in the header instead', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(
      screen.queryByRole('columnheader', { name: t('he', 'schedule.session.title') }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('belt-range-g1')).not.toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.groups.beltRangeLater'))).toBeInTheDocument()
  })
})

describe('B3.4 — one overflow control per row, headed "actions"', () => {
  // `onChanged` turns on the classes fetch (for the create form's <select>) and
  // `patchGroup`'s PATCH — both go through `apiFetch`, i.e. the real global `fetch`.
  // Stubbed here the same way the "door to the schedule editor" tests above stub it,
  // so no test in this block makes a real network call.
  let patchCalls: { method?: string; body?: string }[]

  beforeEach(() => {
    patchCalls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patchCalls.push({ method: init.method, body: init.body as string })
          return new Response('{}', { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderWithActions() {
    render(
      <GroupsAndCycles
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
  }

  it('heads the column "פעולות", not the create-group button’s own label', async () => {
    renderWithActions()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(
      screen.getByRole('columnheader', { name: t('he', 'schedule.groups.col.actions') }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: t('he', 'schedule.groups.create') }),
    ).not.toBeInTheDocument()
  })

  it('replaces the two stacked ghost buttons with one ⋯ menu per row', async () => {
    renderWithActions()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(screen.queryByTestId('rename-g1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('retire-g1')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', {
      name: fill(t('he', 'schedule.groups.rowActions'), { name: 'מתחילים' }),
    })
    await userEvent.click(trigger)
    expect(
      screen.getByRole('menuitem', { name: t('he', 'schedule.groups.rename') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: t('he', 'schedule.groups.retire') }),
    ).toBeInTheDocument()
  })

  it('still opens the inline rename form, which replaces the row’s cells', async () => {
    renderWithActions()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    await userEvent.click(
      screen.getByRole('button', {
        name: fill(t('he', 'schedule.groups.rowActions'), { name: 'מתחילים' }),
      }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.groups.rename') }))
    expect(screen.getByTestId('rename-save-g1')).toBeInTheDocument()
  })

  it('sends the archive PATCH the old button used to send, from the row menu', async () => {
    renderWithActions()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    await userEvent.click(
      screen.getByRole('button', {
        name: fill(t('he', 'schedule.groups.rowActions'), { name: 'מתחילים' }),
      }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.groups.retire') }))
    await waitFor(() =>
      expect(
        patchCalls.some(
          (call) => call.method === 'PATCH' && call.body === JSON.stringify({ is_active: false }),
        ),
      ).toBe(true),
    )
  })
})

describe('B3.5 — the unscheduled column is shorter and right-aligned', () => {
  it('heads it "ללא יום" and right-aligns the tabular-numeral, danger-toned count', async () => {
    renderTable()
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    const columnHeader = screen.getByRole('columnheader', {
      name: t('he', 'schedule.groups.col.unscheduledShort'),
    })
    expect(columnHeader).toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: t('he', 'schedule.groups.unscheduledStudents') }),
    ).not.toBeInTheDocument()
    const cell = await screen.findByTestId('unscheduled-g1')
    expect(cell).toHaveClass('groups-table__unscheduled')
    // The header end-aligns too, with the SAME class the count uses — a right-aligned
    // number under a start-aligned header floats away from the label that names it.
    expect(columnHeader.querySelector('.groups-table__align-end')).not.toBeNull()
    expect(cell).toHaveClass('groups-table__align-end')
    // C12's preview reports 2 unscheduled for every group in this fixture — non-zero, so
    // the `--danger` tone still applies.
    expect(cell.getAttribute('style') ?? '').toContain('var(--danger)')
  })
})

describe('B3.6 — one PageHeader row: title, a two-line subtitle, and the create button in actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the title as the page heading and the create button inside the header’s actions', async () => {
    // `onChanged` turns on the classes fetch, which goes through the real global
    // `fetch` — stubbed so this test makes no real network call.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    render(
      <GroupsAndCycles
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(
      screen.getByRole('heading', { level: 1, name: t('he', 'schedule.groups.title') }),
    ).toBeInTheDocument()
    const createButton = screen.getByTestId('new-group-open')
    expect(createButton.closest('.studio-page-header__actions')).not.toBeNull()
  })

  it('carries BOTH the screen’s description and the belt-range gap, as two subtitle lines', async () => {
    // `groups.caption` is also `Table`'s (hidden, A5) accessible name, so the same
    // string sits twice in the DOM — scoped to the header, or `getByText` would refuse
    // to pick between the two.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    render(
      <GroupsAndCycles
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    const header = screen
      .getByRole('heading', { level: 1, name: t('he', 'schedule.groups.title') })
      .closest('header')
    expect(header).not.toBeNull()
    const scoped = within(header as HTMLElement)
    expect(scoped.getByText(t('he', 'schedule.groups.caption'))).toBeInTheDocument()
    expect(scoped.getByText(t('he', 'schedule.groups.beltRangeLater'))).toBeInTheDocument()
  })

  it('renders the same two-line header on the empty state, not a bare <h2>', async () => {
    renderTable(stub(), [])
    const header = screen
      .getByRole('heading', { level: 1, name: t('he', 'schedule.groups.title') })
      .closest('header')
    expect(header).not.toBeNull()
    const scoped = within(header as HTMLElement)
    expect(scoped.getByText(t('he', 'schedule.groups.caption'))).toBeInTheDocument()
    expect(scoped.getByText(t('he', 'schedule.groups.beltRangeLater'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.groups.empty'))).toBeInTheDocument()
  })
})
