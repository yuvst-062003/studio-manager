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
      // The picker's source since 2026-09-09: THIS CLASS's roster, not the studio's staff.
      // The owner asked for a coach of another class to be refused *and* hidden, so the
      // list the control offers is the class roster and nothing wider.
      if (url.includes('/classes/c-judo/staff')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                person_id: 'p9',
                display_name: 'רון מאמן',
                role: 'lead_coach',
                from_date: '2026-08-27',
              },
            ],
          }),
          { status: 200 },
        )
      }
      // Any OTHER class has an empty roster. Without this the catch-all below answered
      // every class alike, which would have let the "offers nobody" test pass for the
      // wrong reason — and hidden the opposite bug just as effectively.
      if (url.includes('/classes/')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
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
    render(<GroupCoachPanel classId="c-judo" groupId="g1" locale="he" />)
    expect(await screen.findByTestId('group-coaches-empty')).toBeInTheDocument()
  })

  it('assigns a coach through POST /groups/{id}/staff with the chosen role', async () => {
    const bodies: unknown[] = []
    stubFetch([], (body) => bodies.push(body))
    render(<GroupCoachPanel classId="c-judo" groupId="g1" locale="he" />)
    await screen.findByTestId('group-coaches-empty')
    await userEvent.selectOptions(screen.getByTestId('assign-coach-person'), 'p9')
    await userEvent.click(screen.getByTestId('assign-coach-submit'))
    expect(bodies[0]).toMatchObject({ person_id: 'p9', role: 'lead_coach' })
  })

  it('offers nobody at all until the class has a roster', async () => {
    // Owner, 2026-09-09: "Refuse it, and hide it." A coach of another class is not in this
    // list, so the mistake cannot be made from the screen — and the roster panel above is
    // where the manager fixes that, which is why an empty picker is not a dead end.
    stubFetch([])
    render(<GroupCoachPanel classId="c-karate" groupId="g1" locale="he" />)
    await screen.findByTestId('group-coaches-empty')
    const options = screen
      .getByTestId('assign-coach-person')
      .querySelectorAll('option')
    expect([...options].map((option) => option.value)).toEqual([''])
  })
})
