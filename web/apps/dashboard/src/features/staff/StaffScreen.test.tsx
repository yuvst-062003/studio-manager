// Dashboard artboard 3d — צוות.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import { StaffScreen } from './StaffScreen'

const MANAGER = {
  person_id: 'p1',
  first_name: 'נועה',
  last_name: 'מנהלת',
  email: null,
  roles: ['manager'],
  groups: [{ id: 'g1', name: 'מתחילים' }],
  weekly_hours: null,
  permissions: ['studio_settings', 'money'],
  status: 'active',
}

const INVITED = {
  person_id: null,
  // A real invited row always carries the invitation it came from — the RowActions
  // branch below reads this field to decide "resend/revoke" versus "edit roles". The
  // fixture had omitted it, which coincidentally worked before B4.4 because there was
  // no per-row test to catch the fallback it silently took (`editingRoles ===
  // member.person_id` matching `null === null`).
  invitation_id: 'inv-1',
  first_name: null,
  last_name: null,
  email: 'coach@example.invalid',
  roles: ['lead_coach'],
  groups: [],
  weekly_hours: null,
  permissions: ['own_groups', 'attendance'],
  status: 'invited',
}

// The permission catalogue's full union (app/services/structure/staff.py's
// ROLE_PERMISSIONS) — used to assert every one of them stays reachable once B4.2 moves
// them out of the table and into the role editor.
const ALL_PERMISSIONS = [
  'studio_settings',
  'staff',
  'students',
  'attendance',
  'money',
  'reports',
  'own_groups',
  'sessions',
  'events',
]

const MANAGER_NAME = 'נועה מנהלת'

function stub(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 500 })),
  )
}

async function openRowActions(name: string) {
  await userEvent.click(
    await screen.findByRole('button', { name: fill(t('he', 'common.staff.rowActions'), { name }) }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('StaffScreen', () => {
  it('renders a row per staff member with their groups', async () => {
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByText('נועה מנהלת')).toBeInTheDocument()
    expect(screen.getByText('מתחילים')).toBeInTheDocument()
  })

  it('renders measured weekly hours, and an em dash only where nothing can staff', async () => {
    // F8 — the column measures now. A pending invitation stays an em dash: it staffs
    // nothing by definition, and a zero there would be a fake measurement.
    stub({
      items: [{ ...MANAGER, weekly_hours: 4.5 }, INVITED],
      groups_without_coach: [],
      sessions_without_coach: 0,
    })
    render(<StaffScreen locale="he" />)
    const cells = await screen.findAllByTestId('staff-hours-cell')
    expect(cells[0]).toHaveTextContent('4.5')
    expect(cells[1]).toHaveTextContent(t('he', 'common.staff.noHours'))
  })

  it('renders every staff role translated — owner and manager included, never a raw key', async () => {
    stub({ items: [{ ...MANAGER, roles: ['owner', 'manager'] }], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    await screen.findByText('נועה מנהלת')
    expect(screen.queryByText(/setup\.staff\.role/)).toBeNull()
    const joined = `${t('he', 'common.setup.staff.role.owner')} · ${t('he', 'common.setup.staff.role.manager')}`
    expect(screen.getByText(joined)).toBeInTheDocument()
  })

  it('identifies a pending invitation by its address rather than an empty cell', async () => {
    stub({ items: [INVITED], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByText('coach@example.invalid')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.staff.status.invited'))).toBeInTheDocument()
  })

  it('states the status in words, never by colour alone', async () => {
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByText(t('he', 'common.staff.status.active'))).toBeInTheDocument()
  })

  it('raises the banner when a group has no coach', async () => {
    stub({ items: [MANAGER], groups_without_coach: [{ id: 'g2', name: 'בוגרים' }] })
    render(<StaffScreen locale="he" />)
    const banner = await screen.findByTestId('staff-uncovered')
    expect(within(banner).getByText(/בוגרים/)).toBeInTheDocument()
  })

  it('renders the session-level count as the coverage tile\'s hint (F8), not an orphaned line', async () => {
    // Session-level coverage is a different measurement from group-level coverage — it can
    // be non-zero even while every GROUP is nominally covered (a coach out for one session,
    // say) — so it cannot live inside the Alert, which only renders when a group is
    // uncovered. The coverage tile always renders, so the count goes there as its hint.
    stub({ items: [MANAGER], groups_without_coach: [], sessions_without_coach: 2 })
    render(<StaffScreen locale="he" />)
    const stats = await screen.findByTestId('staff-stats')
    const hint = within(stats).getByText(
      t('he', 'common.staff.uncovered.sessions').replace('{n}', '2'),
    )
    expect(hint).toHaveClass('studio-stat-tile__hint')
    // The two facts sit side by side rather than in conflict: the tile still reads
    // "covered" (no group lacks a coach), and no Alert renders.
    expect(within(stats).getByText(t('he', 'common.staff.uncovered.none'))).toBeInTheDocument()
    expect(screen.queryByTestId('staff-uncovered')).toBeNull()
  })

  it('renders no session hint on the coverage tile when every session is staffed', async () => {
    stub({ items: [MANAGER], groups_without_coach: [], sessions_without_coach: 0 })
    render(<StaffScreen locale="he" />)
    const stats = await screen.findByTestId('staff-stats')
    expect(within(stats).queryByText(/שיעורים/)).toBeNull()
  })

  it('never renders a money chip for a coach', async () => {
    // §3.2's hard rule. The server already omits it; this is the screen half.
    stub({ items: [INVITED], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    await screen.findByText('coach@example.invalid')
    expect(screen.queryByText(t('he', 'common.staff.perm.money'))).toBeNull()
  })

  it('points an empty studio at the wizard rather than showing a bare table', async () => {
    stub({ items: [], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByText(t('he', 'common.staff.empty'))).toBeInTheDocument()
  })

  it('says so when the screen cannot load — and offers a real retry', async () => {
    stub({}, false)
    render(<StaffScreen locale="he" />)
    await waitFor(() => expect(screen.getByTestId('load-failed')).toBeInTheDocument())
    expect(screen.getByTestId('load-failed-retry')).toBeInTheDocument()
  })
})

describe('B4.1 — the header summary becomes three StatTiles', () => {
  it('shows people and weekly hours as tiles instead of a summary paragraph', async () => {
    stub({
      items: [{ ...MANAGER, weekly_hours: 4.5 }, INVITED],
      groups_without_coach: [],
      sessions_without_coach: 0,
    })
    render(<StaffScreen locale="he" />)
    const stats = await screen.findByTestId('staff-stats')
    // people: only MANAGER has a person_id. hours: round(4.5 + 0) = 5.
    expect(within(stats).getByText('1')).toBeInTheDocument()
    expect(within(stats).getByText('5')).toBeInTheDocument()
  })

  it('tones the coverage tile paid and says every group is covered', async () => {
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    const stats = await screen.findByTestId('staff-stats')
    const message = within(stats).getByText(t('he', 'common.staff.uncovered.none'))
    expect(message.closest('.studio-stat-tile')).toHaveAttribute('data-tone', 'paid')
  })

  it('tones the coverage tile debt when a group has no coach, same component, different tone', async () => {
    stub({ items: [MANAGER], groups_without_coach: [{ id: 'g2', name: 'בוגרים' }] })
    render(<StaffScreen locale="he" />)
    const stats = await screen.findByTestId('staff-stats')
    const message = within(stats).getByText(
      t('he', 'common.staff.uncovered.title').replace('{n}', '1'),
    )
    expect(message.closest('.studio-stat-tile')).toHaveAttribute('data-tone', 'debt')
  })

  it('keeps the Alert with per-group links, and only when coverage is incomplete', async () => {
    stub({ items: [MANAGER], groups_without_coach: [{ id: 'g2', name: 'בוגרים' }] })
    render(<StaffScreen locale="he" />)
    const banner = await screen.findByTestId('staff-uncovered')
    expect(within(banner).getByTestId('uncovered-group-g2')).toHaveAttribute('href', '#/groups/g2')
  })

  it('renders no Alert once every group is covered', async () => {
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    await screen.findByTestId('staff-stats')
    expect(screen.queryByTestId('staff-uncovered')).toBeNull()
  })
})

describe('B4.2 — permissions move out of the table and into the role editor', () => {
  it('renders no permission text while the table is closed', async () => {
    stub({
      items: [{ ...MANAGER, permissions: ALL_PERMISSIONS }],
      groups_without_coach: [],
      sessions_without_coach: 0,
    })
    render(<StaffScreen locale="he" />)
    await screen.findByText(MANAGER_NAME)
    expect(screen.queryByText(t('he', 'common.staff.perm.staff'))).toBeNull()
    expect(screen.queryByText(t('he', 'common.staff.perm.reports'))).toBeNull()
  })

  it('keeps every permission reachable from the roles panel behind ⋯ (acceptance)', async () => {
    stub({
      items: [{ ...MANAGER, permissions: ALL_PERMISSIONS }],
      groups_without_coach: [],
      sessions_without_coach: 0,
    })
    render(<StaffScreen locale="he" />)
    await openRowActions(MANAGER_NAME)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('he', 'common.staff.actions.editRoles') }),
    )
    for (const permission of ALL_PERMISSIONS) {
      expect(screen.getByText(t('he', `common.staff.perm.${permission}`))).toBeInTheDocument()
    }
  })
})

describe('B4.3 — groups use ChipList instead of a run-on string', () => {
  const NINE_GROUPS = Array.from({ length: 9 }, (_, index) => ({
    id: `g${index}`,
    name: `קבוצה ${index + 1}`,
  }))

  it('shows two group chips and a +7 for nine groups, with the rest on the overflow chip', async () => {
    stub({
      items: [{ ...MANAGER, groups: NINE_GROUPS }],
      groups_without_coach: [],
      sessions_without_coach: 0,
    })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByText('קבוצה 1')).toBeInTheDocument()
    expect(screen.getByText('קבוצה 2')).toBeInTheDocument()
    expect(screen.queryByText('קבוצה 3')).toBeNull()

    const overflow = screen.getByText(fill(t('he', 'common.chips.more'), { count: 7 }))
    const remainder = NINE_GROUPS.slice(2)
      .map((group) => group.name)
      .join(', ')
    expect(overflow).toHaveAttribute('title', remainder)
    expect(overflow).toHaveAttribute('aria-label', remainder)
  })
})

describe('B4.4 — one overflow control per row instead of stacked buttons', () => {
  it('heads the actions column "פעולות", not the invite form\'s "תפקידים" legend', async () => {
    stub({ items: [MANAGER], groups_without_coach: [], sessions_without_coach: 0 })
    render(<StaffScreen locale="he" />)
    await screen.findByText(MANAGER_NAME)
    expect(
      screen.getByRole('columnheader', { name: t('he', 'common.staff.col.actions') }),
    ).toBeInTheDocument()
  })

  it('puts סיום העסקה last, behind a separator, marked destructive', async () => {
    stub({ items: [MANAGER], groups_without_coach: [], sessions_without_coach: 0 })
    render(<StaffScreen locale="he" />)
    await openRowActions(MANAGER_NAME)
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      t('he', 'common.staff.actions.editRoles'),
      t('he', 'common.staff.actions.deactivate'),
    ])
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: t('he', 'common.staff.actions.deactivate') }),
    ).toHaveAttribute('data-destructive', 'true')
  })

  it('offers קוד חדש and ביטול הזמנה behind the same control for a pending invitation', async () => {
    stub({ items: [INVITED], groups_without_coach: [], sessions_without_coach: 0 })
    render(<StaffScreen locale="he" />)
    // A pending invitation has no Person, so `displayName` falls back to the address —
    // that IS the row's identity here, per `common.staff.rowActions`'s `{{name}}`.
    await openRowActions(INVITED.email)
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      t('he', 'common.staff.actions.resend'),
      t('he', 'common.staff.actions.revoke'),
    ])
  })
})

describe('F5 — the lifecycle', () => {
  it('creates an invitation and shows the one-time code with its instruction', async () => {
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/staff/invitations')) {
          calls.push({ url, body: JSON.parse(String(init?.body)) })
          return new Response(
            JSON.stringify({
              id: 'inv1',
              email: 'coach@example.invalid',
              expires_at: '2026-09-10T00:00:00Z',
              token: 'the-one-time-code',
            }),
            { status: 201 },
          )
        }
        return new Response(
          JSON.stringify({ items: [], groups_without_coach: [], sessions_without_coach: 0 }),
          { status: 200 },
        )
      }),
    )
    render(<StaffScreen locale="he" />)
    await userEvent.click(await screen.findByTestId('invite-open'))
    await userEvent.type(
      screen.getByLabelText(t('he', 'common.staff.invite.email')),
      'coach@example.invalid',
    )
    await userEvent.click(screen.getByTestId('invite-submit'))
    expect(await screen.findByTestId('invite-token')).toHaveTextContent('the-one-time-code')
    expect(calls[0]?.body).toMatchObject({
      email: 'coach@example.invalid',
      roles: ['lead_coach'],
    })
  })

  it('renders the sole-lead-coach refusal with the group names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/deactivate')) {
          return new Response(
            JSON.stringify({
              detail: {
                code: 'sole_lead_coach',
                message: 'reassign first',
                details: { groups: ['מתחילים'] },
              },
            }),
            { status: 409 },
          )
        }
        return new Response(
          JSON.stringify({
            items: [MANAGER],
            groups_without_coach: [],
            sessions_without_coach: 0,
          }),
          { status: 200 },
        )
      }),
    )
    render(<StaffScreen locale="he" />)
    await openRowActions(MANAGER_NAME)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('he', 'common.staff.actions.deactivate') }),
    )
    expect(await screen.findByTestId('staff-refusal')).toHaveTextContent('מתחילים')
  })
})
