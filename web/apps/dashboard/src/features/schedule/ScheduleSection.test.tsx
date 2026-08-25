// The schedule vertical's own container. It exists so `App.tsx` gains exactly one route
// branch instead of four — the sub-routing between 3a, 4b, 6a and the closures panel is
// this lane's business, and App.tsx is the one file lane PEOPLE also edits.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ScheduleSection, scheduleRoute } from './ScheduleSection'
import type { ScheduleClient } from './client'

function stub(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listGroups: vi.fn(async () => [{ id: 'g1', name: 'מתחילים', className: "ג'ודו" }]),
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
    ...overrides,
  }
}

function renderAt(hash: string, client = stub()) {
  render(
    <ScheduleSection locale="he" client={client} hash={hash} today="2026-11-03T12:00:00Z" />,
  )
  return client
}

describe('scheduleRoute', () => {
  it('reads the three top-level screens', () => {
    expect(scheduleRoute('#/schedule')).toEqual({ view: 'week' })
    expect(scheduleRoute('#/groups')).toEqual({ view: 'groups' })
    expect(scheduleRoute('#/closures')).toEqual({ view: 'closures' })
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

  it('renders 4b at #/groups', async () => {
    renderAt('#/groups')
    await waitFor(() => expect(screen.getAllByTestId('group-row')).toHaveLength(1))
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

  it('links each 4b row to its own group page', async () => {
    renderAt('#/groups')
    const link = await screen.findByRole('link', { name: /מתחילים/ })
    expect(link).toHaveAttribute('href', '#/groups/g1')
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

  it('uses no physical CSS', async () => {
    const { container } = render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/groups"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId('group-row')).toHaveLength(1))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
