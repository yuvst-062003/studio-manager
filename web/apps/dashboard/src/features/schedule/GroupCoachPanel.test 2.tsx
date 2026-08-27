// F4.1 — the assignment the staff screen's red alert finally leads to.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupCoachPanel } from './GroupCoachPanel'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(assigned: unknown[], onAssign?: (body: unknown) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/groups/g1/staff') && init?.method === 'POST') {
        onAssign?.(JSON.parse(String(init.body)))
        return new Response(
          JSON.stringify({ id: 'gs1', person_id: 'p9', role: 'lead_coach', group_id: 'g1', from_date: '2026-08-27', to_date: null }),
          { status: 201 },
        )
      }
      if (url.includes('/groups/g1/staff')) {
        return new Response(JSON.stringify({ items: assigned }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          items: [
            { person_id: 'p9', first_name: 'רון', last_name: 'מאמן', roles: ['lead_coach'] },
          ],
          groups_without_coach: [],
          sessions_without_coach: 0,
        }),
        { status: 200 },
      )
    }),
  )
}

describe('GroupCoachPanel', () => {
  it('says the group is uncovered rather than rendering an empty list', async () => {
    stubFetch([])
    render(<GroupCoachPanel groupId="g1" locale="he" />)
    expect(await screen.findByTestId('group-coaches-empty')).toBeInTheDocument()
  })

  it('assigns a coach through POST /groups/{id}/staff with the chosen role', async () => {
    const bodies: unknown[] = []
    stubFetch([], (body) => bodies.push(body))
    render(<GroupCoachPanel groupId="g1" locale="he" />)
    await screen.findByTestId('group-coaches-empty')
    await userEvent.selectOptions(screen.getByTestId('assign-coach-person'), 'p9')
    await userEvent.click(screen.getByTestId('assign-coach-submit'))
    expect(bodies[0]).toMatchObject({ person_id: 'p9', role: 'lead_coach' })
  })
})
