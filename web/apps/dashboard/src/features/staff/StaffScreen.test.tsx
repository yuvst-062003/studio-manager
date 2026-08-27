// Dashboard artboard 3d — צוות.
import { render, screen, waitFor, within } from '@testing-library/react'
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

  it('shows an em dash for weekly hours and says why', async () => {
    // Not 0 — a zero is a measurement, and it would read as an idle coach rather than as
    // a number W2 has not built the source for.
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByTestId('staff-hours-cell')).toHaveTextContent(
      t('he', 'common.staff.noHours'),
    )
    expect(screen.getByTestId('staff-hours-note')).toHaveTextContent(
      t('he', 'common.staff.hoursUnknown'),
    )
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

  it('names the session-level banner as later work', async () => {
    // 3d draws 'שיעורים ללא מאמן'. A manager who knows that and sees the group-level
    // version would otherwise read it as a regression.
    stub({ items: [MANAGER], groups_without_coach: [] })
    render(<StaffScreen locale="he" />)
    expect(await screen.findByTestId('staff-sessions-note')).toHaveTextContent(
      t('he', 'common.staff.uncovered.sessionsLater'),
    )
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
