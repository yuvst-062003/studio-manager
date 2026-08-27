// S2 — proof the in-session screens are REACHABLE, not merely built. Component tests
// render a screen directly, which is exactly the thing a coach cannot do; this renders
// `App` and navigates by the hash, the way mounted.test.tsx does for lane SCHEDULE.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, setOfflineStore } from '@studio/core'
import App from '../../App'

const STUDIO = {
  studio_id: 'st-1',
  studio_name: 'מועדון בדיקה',
  studio_is_demo: false,
  person_id: 'p-coach',
  roles: ['lead_coach'],
  is_guardian: false,
}

const SESSION = {
  id: 'ses-1',
  group_id: 'g-1',
  group_name: 'מתחילים',
  starts_at: '2026-08-27T17:00:00Z',
  ends_at: '2026-08-27T17:45:00Z',
  location_name: 'אולם א',
  status: 'scheduled',
  attendance_taken: false,
}

const ROSTER = [
  {
    student_id: 'stu-1',
    display_name: 'דנה לוי',
    belt_color_hex: null,
    belt_name: null,
    health_status: 'signed',
    derived_flags: {},
    status: 'present',
    source: 'coach',
    has_absence_report: false,
    absence_reason: null,
  },
]

function coachFetch() {
  const body = {
    access: { staff: true, parent: false },
    studios: [STUDIO],
    active_studio_id: 'st-1',
  }
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/refresh')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 900, ...body }), {
        status: 200,
      })
    }
    if (url.includes('/auth/me')) {
      return new Response(JSON.stringify({ ...body, dev_tools: false }), { status: 200 })
    }
    if (url.includes('/sync/bootstrap')) {
      return new Response(
        JSON.stringify({
          server_time: '2026-08-27T16:00:00Z',
          from_time: '2026-08-27T00:00:00Z',
          to_time: '2026-08-28T23:59:59Z',
          sessions: [SESSION],
          rosters: { 'ses-1': ROSTER },
        }),
        { status: 200 },
      )
    }
    if (url.includes('/sessions/ses-1/attendance')) {
      return new Response(JSON.stringify({ session: SESSION, roster: ROSTER }), { status: 200 })
    }
    if (url.includes('/products/handout-options')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
}

beforeEach(() => {
  setOfflineStore(memoryStore())
  globalThis.localStorage?.setItem('studio.staff.tour-seen', '1')
  vi.stubGlobal('fetch', coachFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
  setOfflineStore(null)
  globalThis.location.hash = ''
  globalThis.localStorage?.clear()
})

describe('the in-session screens (S2)', () => {
  it('reaches 9g at #/attendance/<id>/summary, with the roster it summarises', async () => {
    globalThis.location.hash = '#/attendance/ses-1/summary'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('session-summary')).toBeInTheDocument())
    expect(screen.getByTestId('summary-counts')).toBeInTheDocument()
  })

  it('reaches 11a at #/attendance/<id>/handover', async () => {
    globalThis.location.hash = '#/attendance/ses-1/handover'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('hand-over')).toBeInTheDocument())
  })

  it('reaches 9c at #/students/<id> — the card both entry points open', async () => {
    globalThis.location.hash = '#/students/stu-1'
    const base = coachFetch()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/students/stu-1/attendance')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      if (url.includes('/students/stu-1')) {
        return new Response(
          JSON.stringify({
            id: 'stu-1',
            person_id: 'per-1',
            first_name: 'דנה',
            last_name: 'לוי',
            birthdate: null,
            status: 'active',
            health_status: 'signed',
            current_belt_id: null,
            current_belt_name: null,
            current_belt_color_hex: null,
            joined_on: null,
            left_on: null,
            frozen_until: null,
            phone: null,
            email: null,
            guardians: [],
          }),
          { status: 200 },
        )
      }
      return base(input)
    })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('staff-student-card')).toBeInTheDocument())
  })
})
