// S10 — permission boundaries are UI.
//
// The gates on `#/cash` and `#/join-link` used to FALL THROUGH: a coach following a link
// landed on the date-picker screen, which reads as a bug, not as a boundary. Now the
// boundary is said (`לא זמין בהרשאה שלך`), and 9e's drawer lists the locked capabilities
// with the footnote naming who holds them — the same show-don't-hide choice 9c already
// made for מעבר כיתה.
//
// One test per role per surface, because the matrix IS the deliverable.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, setOfflineStore } from '@studio/core'
import { t } from '@studio/i18n'
import App from './App'

function staffFetch(roles: string[]) {
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
          server_time: '2026-08-27T16:00:00Z',
          from_time: '2026-08-27T00:00:00Z',
          to_time: '2026-08-28T23:59:59Z',
          sessions: [],
          rosters: {},
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
}

beforeEach(() => {
  setOfflineStore(memoryStore())
  globalThis.localStorage?.clear()
  globalThis.localStorage?.setItem('studio.staff.tour-seen', '1')
  globalThis.location.hash = ''
})

afterEach(() => {
  setOfflineStore(null)
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

const REFUSAL = () => screen.findByText(t('he', 'common.permission.managerOnly'))

describe('S10 — the gated surfaces, per role', () => {
  it('refuses #/cash to an assistant coach, visibly', async () => {
    vi.stubGlobal('fetch', staffFetch(['assistant_coach']))
    globalThis.location.hash = '#/cash'
    render(<App />)
    expect(await REFUSAL()).toBeInTheDocument()
    expect(screen.queryByTestId('staff-payment-promises')).toBeNull()
  })

  it('refuses #/join-link to a lead coach — the reservation is managerial, not senior', async () => {
    vi.stubGlobal('fetch', staffFetch(['lead_coach']))
    globalThis.location.hash = '#/join-link'
    render(<App />)
    expect(await REFUSAL()).toBeInTheDocument()
  })

  it('gives a manager the cash screen, with no refusal in sight', async () => {
    vi.stubGlobal('fetch', staffFetch(['manager']))
    globalThis.location.hash = '#/cash'
    render(<App />)
    expect(await screen.findByTestId('staff-payment-promises')).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'common.permission.managerOnly'))).toBeNull()
  })
})

describe('the setup nudge and its door (2026-08-28)', () => {
  it('refuses #/setup to a coach, visibly — and never even asks the server', async () => {
    const fetchSpy = staffFetch(['assistant_coach'])
    vi.stubGlobal('fetch', fetchSpy)
    globalThis.location.hash = '#/setup'
    render(<App />)
    expect(await REFUSAL()).toBeInTheDocument()
    // The manager-gate is what keeps GET /setup off a coach's wire (S4's lesson).
    const setupCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes('/setup'))
    expect(setupCalls).toHaveLength(0)
  })

  it('shows a manager the unfinished-setup banner, and the resume lands in the wizard', async () => {
    const base = staffFetch(['manager'])
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/setup')) {
          return new Response(
            JSON.stringify({
              steps: [
                { key: 'studio', status: 'done' },
                { key: 'groups', status: 'pending' },
              ],
              complete: false,
              dismissed_at: '2026-08-27T10:00:00Z',
            }),
            { status: 200 },
          )
        }
        return base(input)
      }),
    )
    render(<App />)
    // waitFor rather than findBy: the shell re-keys the banner as the session settles,
    // and the assertion must survive a node being replaced mid-flight.
    await waitFor(() => expect(screen.getByTestId('setup-incomplete')).toBeInTheDocument(), {
      timeout: 3000,
    })
    await userEvent.click(screen.getByTestId('setup-incomplete-resume'))
    await waitFor(() => expect(globalThis.location.hash).toBe('#/setup'))
  })

  it('shows a coach no banner at all', async () => {
    vi.stubGlobal('fetch', staffFetch(['lead_coach']))
    render(<App />)
    await screen.findByRole('button', { name: t('he', 'common.nav.more') })
    expect(screen.queryByTestId('setup-incomplete')).toBeNull()
  })
})

describe('S10 — 9e: the drawer teaches the role', () => {
  async function openDrawer() {
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'common.nav.more') }),
    )
  }

  it('lists all three locked capabilities for an assistant coach, with the footnote', async () => {
    vi.stubGlobal('fetch', staffFetch(['assistant_coach']))
    render(<App />)
    await openDrawer()
    await waitFor(() =>
      expect(screen.getAllByTestId('permission-locked-row')).toHaveLength(3),
    )
    expect(screen.getByText(t('he', 'common.permission.footnote'))).toBeInTheDocument()
  })

  it('does not list מעבר כיתה as locked for a lead coach, because 9c gives it to them', async () => {
    vi.stubGlobal('fetch', staffFetch(['lead_coach']))
    render(<App />)
    await openDrawer()
    await waitFor(() =>
      expect(screen.getAllByTestId('permission-locked-row')).toHaveLength(2),
    )
    expect(
      screen.queryByText(t('he', 'common.permission.moveStudent')),
    ).toBeNull()
  })

  it('shows a manager no locked list at all', async () => {
    vi.stubGlobal('fetch', staffFetch(['manager']))
    render(<App />)
    await openDrawer()
    await screen.findByTestId('drawer-identity')
    expect(screen.queryByTestId('permission-boundaries')).toBeNull()
  })

  it('carries the identity block: name, role, and the classes coached', async () => {
    const fetchSpy = staffFetch(['lead_coach'])
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/groups?mine=true')) {
          return new Response(
            JSON.stringify({
              items: [
                { id: 'g1', class_id: 'c1', name: 'מתחילים', description: null, age_min: null, age_max: null, is_active: true },
                { id: 'g2', class_id: 'c1', name: 'נוער', description: null, age_min: null, age_max: null, is_active: true },
              ],
            }),
            { status: 200 },
          )
        }
        return fetchSpy(input)
      }),
    )
    render(<App />)
    await openDrawer()
    const identity = await screen.findByTestId('drawer-identity')
    expect(identity).toHaveTextContent(t('he', 'common.staff.role.lead_coach'))
    const classes = await screen.findByTestId('drawer-my-classes')
    expect(classes).toHaveTextContent(`${t('he', 'common.identity.myClasses')} 2`)
    expect(classes).toHaveTextContent('מתחילים · נוער')
  })
})
