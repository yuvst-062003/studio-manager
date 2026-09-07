// The staff schedule vertical, which has one destination since 9b was deleted (2026-09-07)
// — so there is no router here any more, and no route tests either.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleSection } from './ScheduleSection'
import type { StaffScheduleClient } from './client'

function stub(): StaffScheduleClient {
  return {
    listSessions: vi.fn(async () => []),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => []),
  } as unknown as StaffScheduleClient
}

describe('ScheduleSection (staff)', () => {
  it('draws 9a/1d היום on the schedule route', async () => {
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-today')).toBeInTheDocument())
  })


  it('offers exactly one calendar door from היום', async () => {
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        today="2026-11-03T12:00:00Z"
      />,
    )
    // ONE calendar door, not two (owner, 2026-09-07). The header used to carry
    // `open-date-picker` -> 9b beside this one, and a header that offers the same errand
    // twice makes a coach choose before they can do it. This is the month grid, which shows
    // what is happening beyond tomorrow — the reason a coach opens a calendar at all.
    const open = await screen.findByTestId('open-month-calendar')
    expect(open).toHaveAccessibleName()
    expect(open).toHaveAttribute('href', '#/calendar')
    expect(screen.queryByTestId('open-date-picker')).not.toBeInTheDocument()
  })


  it('uses no physical CSS', async () => {
    const { container } = render(
      <ScheduleSection
        locale="he"
        client={stub()}
        today="2026-11-03T12:00:00Z"
      />,
    )
    await screen.findByTestId('staff-today')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
