// Dashboard artboard 4b — קבוצות ומחזורים: לו״ז ומחזורים.
//
// Checkpoint 6 turned the four-column table into a grid of cards. Every assertion that
// used to name a `columnheader` now names the card fact that replaced it — the property
// each one protects is unchanged, and none of them was dropped on the way across.
//
// Belt ranges belong to a milestone that has not run (M7 / `belt_rank`, a W4 contract
// model). B3.3 ships that as a stated gap in `PageHeader`'s subtitle, not as an invented
// number or an empty, mislabelled fact — the discipline ParentHome.tsx set for artboard
// 1a. Capacity was cut from the product outright (2026-08-27, re-confirmed as D2 on
// 2026-09-10) and is not a gap at all: the prototype's occupancy bar has no denominator
// here and is not drawn.
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
  class_id: 'c-judo',
  class_name: "ג'ודו",
  training_year_id: 'y1',
  starts_at: '2026-11-17T16:30:00Z',
  ends_at: '2026-11-17T18:30:00Z',
  location_id: 'loc-1',
  location_name: 'טטאמי 1',
  status: 'scheduled' as const,
  is_manually_edited: false,
  is_ad_hoc: false,
  cancel_reason: null,
  staff: [
    {
      person_id: 'p1',
      display_name: 'לביא טמיר',
      role: 'lead_coach' as const,
      is_substitute: false,
    },
  ],
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

function renderGrid(client = stub(), groups = GROUPS) {
  render(
    <GroupsAndCycles locale="he" client={client} groups={groups} today="2026-11-03T12:00:00Z" />,
  )
  return client
}

/** The gate every test used to spell as "two rowheaders". One card per group. */
async function cardsSettle(count = 2) {
  await waitFor(() => expect(screen.getAllByTestId(/^group-card-/)).toHaveLength(count))
}

describe('GroupsAndCycles (4b)', () => {
  it('lists one card per group, with its class as the eyebrow', async () => {
    renderGrid()
    await cardsSettle()
    expect(screen.getByText('מתחילים')).toBeInTheDocument()
    expect(screen.getAllByText("ג'ודו")).toHaveLength(2)
  })

  it("renders each group's weekly schedule as a weekday and a time", async () => {
    // The fact that is genuinely this lane's.
    renderGrid()
    const cell = await screen.findByTestId('schedule-g1')
    expect(cell).toHaveTextContent(t('he', 'schedule.weekday.2'))
    expect(cell).toHaveTextContent('17:00')
  })

  it('says a group has no schedule rather than leaving the fact blank', async () => {
    renderGrid()
    expect(await screen.findByTestId('schedule-g2')).toHaveTextContent(
      t('he', 'schedule.rules.empty'),
    )
  })

  it('shows the next upcoming session in the studio timezone', async () => {
    renderGrid()
    // 16:30Z on 17 November is 18:30 in Jerusalem — winter, UTC+2.
    expect(await screen.findByTestId('next-g1')).toHaveTextContent('18:30')
  })

  it('says there is no next session rather than showing a dash', async () => {
    renderGrid()
    expect(await screen.findByTestId('next-g2')).toHaveTextContent(
      t('he', 'schedule.groups.noNextSession'),
    )
  })

  it('surfaces C12 where a manager browses groups, not only inside a change dialog', async () => {
    // The same number the impact dialog shows, asked of the group's CURRENT rules — a
    // preview that changes nothing and reports the present state.
    renderGrid()
    expect(await screen.findByTestId('unscheduled-g1')).toHaveTextContent('2')
  })

  it('asks for that number with apply false, so browsing 4b never writes', async () => {
    const client = renderGrid()
    await waitFor(() => expect(client.putSchedule).toHaveBeenCalled())
    for (const call of vi.mocked(client.putSchedule).mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ apply: false }))
    }
  })

  it('renders no capacity and no occupancy bar — D2 cut both from the product', async () => {
    // A group has no cap; 7d's 42/54 is an EVENT cap, a different thing. The prototype
    // draws an occupancy bar over a number we do not store, and porting the look must not
    // import the figure: no bar, no percentage, no `n/m`.
    const { container } = render(
      <GroupsAndCycles locale="he" client={stub()} groups={GROUPS} today="2026-11-03T12:00:00Z" />,
    )
    await cardsSettle()
    expect(document.body.textContent ?? '').not.toMatch(/תפוסה|מלאה/)
    expect(container.querySelector('progress')).toBeNull()
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('says there are no groups rather than showing an empty grid', async () => {
    renderGrid(stub(), [])
    expect(await screen.findByText(t('he', 'schedule.groups.empty'))).toBeInTheDocument()
  })

  it('is one NAMED list of cards — the accessible name the caption used to carry', async () => {
    renderGrid()
    await cardsSettle()
    // A grid of cards is still one collection, and it keeps the name the `<table>`'s
    // caption gave it. Losing that on the way from table to cards is the quiet kind of
    // regression §0 forbids.
    expect(screen.getByTestId('groups-grid')).toHaveAccessibleName(
      t('he', 'schedule.groups.caption'),
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('states active or archived in words on every card, never by dimming alone', async () => {
    render(
      <GroupsAndCycles
        client={stub()}
        groups={[GROUPS[0] as GroupSummary, { ...(GROUPS[1] as GroupSummary), isActive: false }]}
        locale="he"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await cardsSettle()
    const first = within(screen.getByTestId('group-card-g1'))
    const second = within(screen.getByTestId('group-card-g2'))
    expect(first.getByText(t('he', 'schedule.groups.active'))).toBeInTheDocument()
    expect(second.getByText(t('he', 'schedule.groups.archived'))).toBeInTheDocument()
  })

  it("names the next session's coach and room as the next session's, not the group's", async () => {
    // A substitute takes Tuesday and the card must not imply the group has one fixed
    // pair — the label carries the qualifier, so the value never has to.
    renderGrid()
    const fact = await screen.findByTestId('next-where-g1')
    expect(fact).toHaveTextContent('לביא טמיר')
    expect(fact).toHaveTextContent('טטאמי 1')
    expect(
      within(screen.getByTestId('group-card-g1')).getByText(
        t('he', 'schedule.groups.nextCoachRoom'),
      ),
    ).toBeInTheDocument()
  })

  it('omits the coach-and-room fact entirely when there is no next session to describe', async () => {
    renderGrid()
    await cardsSettle()
    expect(screen.queryByTestId('next-where-g2')).not.toBeInTheDocument()
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
    await cardsSettle()
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

  it('lands the manager inside the new group’s schedule page after create', async () => {
    // The form used to just close; the only way to the weekly days-and-hours editor was
    // the group’s NAME in the list, and the owner’s staging pass read that as
    // “cannot set the schedule at all”.
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
        classId="c1"
        client={stub()}
        groups={GROUPS}
        hrefForGroup={(id) => `#/groups/${id}`}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await userEvent.click(screen.getByTestId('new-group-open'))
    await userEvent.type(screen.getAllByRole('textbox')[0] as HTMLElement, 'קבוצה 1')
    // No class `<select>` any more: asking which class after the manager opened one is a
    // question with exactly one right answer.
    expect(screen.queryByTestId('new-group-class')).not.toBeInTheDocument()
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
    await cardsSettle()
    // The old ghost-button link beside the name is gone.
    expect(screen.queryByTestId('group-schedule-link-g1')).not.toBeInTheDocument()
    // The name itself is the (only) link to the group's page.
    const nameLink = screen.getByRole('link', { name: 'מתחילים' })
    expect(nameLink).toHaveAttribute('href', '#/groups/g1')
    expect(nameLink).toHaveClass('group-card__name')
    const linksToG1 = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '#/groups/g1')
    expect(linksToG1).toHaveLength(1)
  })
})

describe('B3.2 — every fact on the card is labelled by what it holds', () => {
  it('labels the facts, and never repeats the page title inside a card', async () => {
    renderGrid()
    await cardsSettle()
    const card = within(screen.getByTestId('group-card-g1'))
    // What the four column headers used to say, said once per card beside its value.
    expect(card.getByText(t('he', 'schedule.groups.weeklySchedule'))).toBeInTheDocument()
    expect(card.getByText(t('he', 'schedule.groups.nextSession'))).toBeInTheDocument()
    expect(card.getByText(t('he', 'schedule.groups.unscheduledStudents'))).toBeInTheDocument()
    // `schedule.groups.title` is the <h1> (B3.6) — a card must not repeat it.
    expect(card.queryByText(t('he', 'schedule.groups.title'))).not.toBeInTheDocument()
  })
})

describe('B3.3 — the belt range is cut until it has data', () => {
  it('renders no belt-range fact, and states the gap in the header instead', async () => {
    renderGrid()
    await cardsSettle()
    expect(screen.queryByTestId('belt-range-g1')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('group-card-g1')).queryByText(t('he', 'schedule.session.title')),
    ).not.toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.groups.beltRangeLater'))).toBeInTheDocument()
  })
})

describe('B3.4 — one overflow control per card', () => {
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
        classId="c1"
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
  }

  it('puts the ⋯ inside the card it acts on, named after that group', async () => {
    renderWithActions()
    await cardsSettle()
    const trigger = screen.getByRole('button', {
      name: fill(t('he', 'schedule.groups.rowActions'), { name: 'מתחילים' }),
    })
    // Which card a menu belongs to used to be carried by the row it sat in. On a grid it
    // has to be carried by the card, or two menus named for two groups sit loose on the
    // page with nothing tying either to its own.
    expect(trigger.closest('[data-testid="group-card-g1"]')).not.toBeNull()
  })

  it('replaces the two stacked ghost buttons with one ⋯ menu per card', async () => {
    renderWithActions()
    await cardsSettle()
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

  it('still opens the inline rename form, inside the card’s foot', async () => {
    renderWithActions()
    await cardsSettle()
    await userEvent.click(
      screen.getByRole('button', {
        name: fill(t('he', 'schedule.groups.rowActions'), { name: 'מתחילים' }),
      }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: t('he', 'schedule.groups.rename') }))
    const save = screen.getByTestId('rename-save-g1')
    expect(save).toBeInTheDocument()
    expect(save.closest('[data-testid="group-card-g1"]')).not.toBeNull()
  })

  it('sends the archive PATCH the old button used to send, from the card menu', async () => {
    renderWithActions()
    await cardsSettle()
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

describe('B3.5 — the unscheduled count is the card fact D2 left room for', () => {
  it('is labelled in full, tabular, and danger-toned through an attribute, not a colour', async () => {
    renderGrid()
    await cardsSettle()
    const card = within(screen.getByTestId('group-card-g1'))
    // The full label, not the 8rem column's abbreviation — a card has room to say it.
    expect(card.getByText(t('he', 'schedule.groups.unscheduledStudents'))).toBeInTheDocument()
    const cell = await screen.findByTestId('unscheduled-g1')
    // C12's preview reports 2 unscheduled for every group in this fixture — non-zero, so
    // the danger tone applies. It rides on `data-tone`, which the label sits beside in
    // every state, so the colour is never the only signal.
    expect(cell.closest('.group-card__fact')).toHaveAttribute('data-tone', 'danger')
  })

  it('carries no tone at all when the count is zero', async () => {
    renderGrid(stub({ putSchedule: vi.fn(async () => ({ ...PREVIEW, students_left_unscheduled: 0 })) }))
    await cardsSettle()
    const cell = await screen.findByTestId('unscheduled-g1')
    expect(cell).toHaveTextContent('0')
    expect(cell.closest('.group-card__fact')).not.toHaveAttribute('data-tone')
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
        classId="c1"
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await cardsSettle()
    expect(
      screen.getByRole('heading', { level: 1, name: t('he', 'schedule.groups.title') }),
    ).toBeInTheDocument()
    const createButton = screen.getByTestId('new-group-open')
    expect(createButton.closest('.studio-page-header__actions')).not.toBeNull()
  })

  it('carries BOTH the screen’s description and the belt-range gap, as two subtitle lines', async () => {
    // `groups.caption` is also the grid's accessible name, so the same string sits twice
    // in the DOM — scoped to the header, or `getByText` would refuse to pick between the
    // two.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    render(
      <GroupsAndCycles
        classId="c1"
        client={stub()}
        groups={GROUPS}
        locale="he"
        onChanged={() => undefined}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await cardsSettle()
    const header = screen
      .getByRole('heading', { level: 1, name: t('he', 'schedule.groups.title') })
      .closest('header')
    expect(header).not.toBeNull()
    const scoped = within(header as HTMLElement)
    expect(scoped.getByText(t('he', 'schedule.groups.caption'))).toBeInTheDocument()
    expect(scoped.getByText(t('he', 'schedule.groups.beltRangeLater'))).toBeInTheDocument()
  })

  it('renders the same two-line header on the empty state, not a bare <h2>', async () => {
    renderGrid(stub(), [])
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
