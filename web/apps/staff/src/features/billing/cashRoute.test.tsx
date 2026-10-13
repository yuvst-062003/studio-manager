// Proof the money tab is REACHABLE and GATED, not merely built (owner, 2026-10-14: "I want
// to replace the timer with cash… managers and owner only"). A component test renders the
// screen directly, which is the one thing neither a manager nor a coach can do: this mounts
// `App` and reads the bar, so the gate is checked where it actually lives — the shell
// computing `canSeeCash` from the signed-in roles and the route refusing on its own.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, setOfflineStore } from '@studio/core'
import { t } from '@studio/i18n'
import App from '../../App'

function appFetch(roles: string[]) {
  const body = {
    access: { staff: true, parent: false },
    studios: [
      {
        studio_id: 'st-1',
        studio_name: 'מועדון בדיקה',
        studio_is_demo: false,
        person_id: 'p-1',
        roles,
        is_guardian: false,
      },
    ],
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
          server_time: '2026-10-14T06:00:00Z',
          from_time: '2026-10-14T00:00:00Z',
          to_time: '2026-10-15T23:59:59Z',
          sessions: [],
          rosters: {},
        }),
        { status: 200 },
      )
    }
    if (url.includes('/charges')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'c-1',
              payer_person_id: 'p-7',
              student_id: 's-1',
              kind: 'tuition',
              period_year: 2026,
              period_month: 9,
              amount_agorot: 30000,
              allocated_agorot: 0,
              due_date: '2026-09-01',
              status: 'open',
            },
          ],
          next_cursor: null,
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 })
  })
}

beforeEach(() => {
  setOfflineStore(memoryStore())
})

afterEach(() => {
  vi.unstubAllGlobals()
  setOfflineStore(null)
  globalThis.location.hash = ''
  globalThis.localStorage?.clear()
})

describe('the cash tab, from the app a manager actually opens', () => {
  it('offers the tab and opens the screen behind it', async () => {
    vi.stubGlobal('fetch', appFetch(['manager']))
    globalThis.location.hash = '#/cash'
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('cash-screen')).toBeInTheDocument())
    expect(screen.getByTestId('tab-cash')).toHaveAttribute('href', '#/cash')
    // The family on the debts band comes from the route's own read, not from a fixture
    // handed to the component — the seam this file exists to check.
    expect(await screen.findByTestId('cash-family-p-7')).toBeInTheDocument()
  })

  it('draws no cash tab for a coach, and refuses the screen behind it', async () => {
    vi.stubGlobal('fetch', appFetch(['lead_coach']))
    globalThis.location.hash = '#/cash'
    render(<App />)

    // `EmptyState` draws the refusal without forwarding a testid, so this reads the
    // sentence a coach actually sees — S10's "restricted, said out loud".
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.permission.managerOnly'))).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('tab-cash')).toBeNull()
    expect(screen.queryByTestId('cash-screen')).toBeNull()
  })

  it('keeps the timer reachable, from the schedule rather than a tab', async () => {
    vi.stubGlobal('fetch', appFetch(['manager']))
    globalThis.location.hash = '#/'
    render(<App />)

    expect(await screen.findByTestId('open-timer')).toHaveAttribute('href', '#/timer')
    expect(screen.queryByTestId('tab-timer')).toBeNull()
  })
})
