// The parent schedule vertical's container. One route today (12b), but App.tsx gets one
// branch either way — lane PEOPLE edits that file too.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleSection, isCalendarRoute } from './ScheduleSection'
import type { ParentScheduleClient } from './client'

function stub(): ParentScheduleClient {
  return { listSessions: vi.fn(async () => []) } as unknown as ParentScheduleClient
}

describe('isCalendarRoute', () => {
  it('matches #/calendar only', () => {
    expect(isCalendarRoute('#/calendar')).toBe(true)
    expect(isCalendarRoute('#/payments')).toBe(false)
    // Unlike the staff app, an unknown hash is NOT the calendar: the parent app's default
    // screen is home, which belongs to another lane. Claiming the fallback would hide it.
    expect(isCalendarRoute('')).toBe(false)
  })
})

describe('ScheduleSection (parent)', () => {
  it('draws 12b on the calendar route', async () => {
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/calendar"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('child-calendar')).toBeInTheDocument())
  })

  it('renders nothing on any other route, so home stays home', () => {
    const { container } = render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/payments"
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('never asks the server for a group — the server decides what a parent may see', async () => {
    // The guardian branch of GET /sessions narrows to the groups this parent's children
    // are enrolled in. A client that named its own scope would be a client that could name
    // someone else's.
    const client = stub()
    render(
      <ScheduleSection
        locale="he"
        client={client}
        hash="#/calendar"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(client.listSessions).toHaveBeenCalled())
    for (const [query] of vi.mocked(client.listSessions).mock.calls) {
      expect(query).not.toHaveProperty('groupId')
    }
  })
})
