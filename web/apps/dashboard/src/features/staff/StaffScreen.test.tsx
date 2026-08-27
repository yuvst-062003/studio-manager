// Dashboard artboard 3d — צוות.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  first_name: null,
  last_name: null,
  email: 'coach@example.invalid',
  roles: ['lead_coach'],
  groups: [],
  weekly_hours: null,
  permissions: ['own_groups', 'attendance'],
  status: 'invited',
}

function stub(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 500 })),
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

  it('says every group is covered rather than showing nothing', async () => {
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByTestId('staff-covered')).toHaveTextContent(
      t('he', 'common.staff.uncovered.none'),
    )
  })

  it('renders the session-level banner from a measurement (F8)', async () => {
    // 3d draws 'שיעורים ללא מאמן' and the number is real now.
    stub({ items: [MANAGER], groups_without_coach: [], sessions_without_coach: 2 })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByTestId('staff-sessions-uncovered')).toHaveTextContent('2')
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
    await userEvent.type(screen.getByLabelText(t('he', 'common.staff.invite.email')), 'coach@example.invalid')
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
    await userEvent.click(await screen.findByTestId(`deactivate-${MANAGER.person_id}`))
    expect(await screen.findByTestId('staff-refusal')).toHaveTextContent('מתחילים')
  })
})
