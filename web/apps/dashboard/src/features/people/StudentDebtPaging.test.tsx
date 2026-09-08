// F1 of the 2026-09-08 scaling audit — the debt map's paging, at the seam.
//
// `StudentsScreen` pages `GET /charges` to build the payment column. It sent the page
// marker as `?cursor=`; `app/routers/billing.py` declares that parameter as `after`.
// **FastAPI silently discards a query parameter it does not declare** — no 422, no warning
// — so the marker never reached the server, `next_cursor` came back unchanged, and the
// `do…while (cursor)` around it re-requested page one for as long as the tab stayed open.
//
// It needs 201 open charges to appear, which is one club's first month of billing 200
// students. Below that the loop runs once and the bug is invisible.
//
// The test asserts the PARAMETER NAME rather than counting requests: a request count is
// satisfied by any accidental exit from the loop, while the name is the actual contract
// with the endpoint. The second request is the one that matters — the first carries no
// marker either way, which is why a single-page fixture proves nothing.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentsScreen } from './StudentsScreen'
import type { DashboardPeopleClient } from './peopleClient'

const calls: string[] = []

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      calls.push(path)
      if (path.startsWith('/api/v1/charges')) {
        // Two pages. The second answers only when the marker actually arrived — an
        // endpoint that never sees it keeps handing back page one, which is the bug.
        const arrived = path.includes('after=page-2')
        // **The stub gives up after a handful of pages, and that bound is load-bearing.**
        // Without it this file reproduced the defect exactly: the component sent `cursor=`,
        // the marker never arrived, `next_cursor` stayed `page-2`, and the loop ran until
        // Node exhausted its heap and the vitest worker was killed. A test that OOMs proves
        // the bug and then cannot assert anything about it.
        const exhausted = calls.filter((c) => c.startsWith('/api/v1/charges')).length > 4
        return new Response(
          JSON.stringify({
            items: arrived
              ? [{ student_id: 's2', due_date: '2999-01-01' }]
              : [{ student_id: 's1', due_date: '2000-01-01' }],
            next_cursor: arrived || exhausted ? null : 'page-2',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  }
})

function stub(): DashboardPeopleClient {
  return {
    students: vi.fn(async () => ({ items: [], next_cursor: null, has_more: false })),
  } as unknown as DashboardPeopleClient
}

beforeEach(() => {
  calls.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the students screen debt map (F1)', () => {
  it('sends the page marker under the name the endpoint declares', async () => {
    render(<StudentsScreen locale="he" client={stub()} />)

    await waitFor(() => {
      const paged = calls.filter((path) => path.startsWith('/api/v1/charges')).slice(1)
      expect(paged.length).toBeGreaterThan(0)
      // `after`, which `list_charges` declares. `cursor` is discarded in silence.
      expect(paged[0]).toContain('after=page-2')
      expect(paged[0]).not.toContain('cursor=')
    })
  })

  it('stops once the endpoint says there is no next page', async () => {
    // The other half of the same defect: the loop has no bound of its own, so it exits
    // only when the server stops handing back a cursor. With the marker discarded that
    // never happened.
    render(<StudentsScreen locale="he" client={stub()} />)
    await waitFor(() => {
      expect(calls.filter((path) => path.startsWith('/api/v1/charges'))).toHaveLength(2)
    })
    // Held for a moment, because "it has not looped YET" and "it has stopped" look the
    // same at the instant the second response lands.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.filter((path) => path.startsWith('/api/v1/charges'))).toHaveLength(2)
  })

  it('never renders a student the debt map has not answered for', async () => {
    // Not part of F1, but it is what the loop exists to produce, and a paging fix that
    // quietly dropped page two would still pass the two tests above.
    render(<StudentsScreen locale="he" client={stub()} />)
    await waitFor(() => expect(screen.getByTestId('students-screen')).toBeInTheDocument())
  })
})
