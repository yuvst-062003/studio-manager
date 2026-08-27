// §6.4's dashboard: the shell, the three screens, and the §5.1 wizard both staff and
// dashboard mount.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App, { routeFromHash } from './App'

const SESSION = {
  access: { staff: true, parent: false },
  studios: [{ studio_id: 's', studio_name: 'מכבי ג׳ודו רעננה', studio_is_demo: false, roles: ['owner'] }],
  active_studio_id: 's',
  dev_tools: false,
}

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      const match = Object.keys(routes).find((key) => path.includes(key))
      if (match === undefined) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(routes[match]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

const SIGNED_IN = {
  '/auth/refresh': { access_token: 'tok', expires_in: 900, ...SESSION },
  '/auth/me': SESSION,
  // The bare hash now lands on the weekly board (design pass), so the shell tests need
  // the board's one read to answer rather than reject.
  '/api/v1/sessions': { items: [] },
}

beforeEach(() => {
  globalThis.location.hash = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('routeFromHash', () => {
  it.each([
    ['#/staff', 'staff'],
    ['#/settings', 'settings'],
    ['#/setup', 'setup'],
    // §5.15's rollover is one hash and one screen: the wizard's seven steps are its own
    // state, and `resume_at` is the only correct answer to "where was I".
    ['#/rollover', 'rollover'],
    // The design pass retired `home`: 3a/1e draw the weekly board as the manager's
    // landing, so the bare hash — and any unknown one — resolves to the board rather
    // than to the "בחרו מסך מהתפריט" page that used to land nowhere.
    ['', 'schedule'],
    ['#/nothing-here', 'schedule'],
    ['#/comms', 'comms'],
    ['#/documents', 'documents'],
    ['#/prices', 'prices'],
    ['#/reports', 'reports'],
  ])('maps %s to %s', (hash, expected) => {
    expect(routeFromHash(hash)).toBe(expected)
  })
})

describe('dashboard shell', () => {
  it('shows sign-in before a session exists', async () => {
    stubApi({
      '/auth/refresh': null,
      // Only providers whose credentials are configured come back, which is what keeps
      // an Apple button off the screen until HB-apple-developer closes.
      '/auth/providers': { items: [{ name: 'google', start_url: '/api/v1/auth/google/start' }] },
    })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.continueWithGoogle'))).toBeInTheDocument(),
    )
  })

  it('renders the studio name in the shell once signed in', async () => {
    stubApi(SIGNED_IN)
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'מכבי ג׳ודו רעננה' })).toBeInTheDocument(),
    )
  })

  it('renders no dev bar without a developer identity', async () => {
    stubApi(SIGNED_IN)
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'מכבי ג׳ודו רעננה' })).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })

  it('routes to the staff screen from the hash', async () => {
    globalThis.location.hash = '#/staff'
    stubApi({ ...SIGNED_IN, '/api/v1/staff': { items: [], groups_without_coach: [] } })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t('he', 'common.staff.title') })).toBeInTheDocument(),
    )
  })

  it('routes to the settings screen from the hash', async () => {
    globalThis.location.hash = '#/settings'
    stubApi({
      ...SIGNED_IN,
      '/api/v1/studio': {
        name: 'מכבי',
        sport: 'judo',
        address: null,
        phone: null,
        default_locale: 'he',
        parent_locales: ['he'],
        logo_url: null,
      },
    })
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: t('he', 'common.settings.title') }),
      ).toBeInTheDocument(),
    )
  })

  it('mounts §5.1 wizard, because SPEC routes the dashboard into it too', async () => {
    globalThis.location.hash = '#/setup'
    stubApi({
      ...SIGNED_IN,
      '/api/v1/setup': { steps: [], complete: false, dismissed_at: null },
    })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('setup-wizard')).toBeInTheDocument())
  })
})

describe('F10 — navigation knows who is looking', () => {
  const COACH_SESSION = {
    ...SESSION,
    studios: [
      { studio_id: 's', studio_name: 'מכבי', studio_is_demo: false, roles: ['lead_coach'] },
    ],
  }
  const COACH_SIGNED_IN = {
    '/auth/refresh': { access_token: 'tok', expires_in: 900, ...COACH_SESSION },
    '/auth/me': COACH_SESSION,
    '/api/v1/sessions': { items: [] },
  }

  it('a coach sees no money, staff, settings or rollover doors', async () => {
    stubApi(COACH_SIGNED_IN)
    render(<App />)
    await screen.findAllByRole('link', { name: t('he', 'people.student.plural') })
    expect(screen.queryByRole('link', { name: t('he', 'billing.debt.title') })).toBeNull()
    expect(screen.queryByRole('link', { name: t('he', 'common.dash.nav.staff') })).toBeNull()
    expect(screen.queryByRole('link', { name: t('he', 'common.dash.nav.rollover') })).toBeNull()
    expect(screen.queryByRole('link', { name: t('he', 'common.dash.nav.settings') })).toBeNull()
  })

  it('an owner sees the full nav, including money', async () => {
    stubApi(SIGNED_IN)
    render(<App />)
    expect(
      (await screen.findAllByRole('link', { name: t('he', 'billing.debt.title') })).length,
    ).toBeGreaterThan(0)
  })

  it('a typed #/prices refuses gracefully for a coach', async () => {
    globalThis.location.hash = '#/prices'
    stubApi(COACH_SIGNED_IN)
    render(<App />)
    expect(await screen.findByText(t('he', 'common.dash.forbidden'))).toBeInTheDocument()
  })
})

describe('F9 — the global search', () => {
  it('renders for a manager and finds a student', async () => {
    globalThis.location.hash = '#/schedule'
    stubApi({
      ...SIGNED_IN,
      '/api/v1/search': {
        students: [{ id: 'st1', name: 'דנה לוי', status: 'active' }],
        guardians: [],
        groups: [],
        staff: [],
      },
    })
    render(<App />)
    const box = await screen.findByTestId('global-search')
    const user = (await import('@testing-library/user-event')).default
    await user.type(box, 'דנה')
    const result = await screen.findByTestId('search-student-st1')
    expect(result).toHaveAttribute('href', '#/students/st1')
  })

  it('does not render for a coach — the route behind it is manager-only', async () => {
    stubApi({
      '/auth/refresh': {
        access_token: 'tok',
        expires_in: 900,
        ...SESSION,
        studios: [
          { studio_id: 's', studio_name: 'מ', studio_is_demo: false, roles: ['assistant_coach'] },
        ],
      },
      '/auth/me': {
        ...SESSION,
        studios: [
          { studio_id: 's', studio_name: 'מ', studio_is_demo: false, roles: ['assistant_coach'] },
        ],
      },
      '/api/v1/sessions': { items: [] },
    })
    render(<App />)
    await screen.findAllByRole('link', { name: t('he', 'people.student.plural') })
    expect(screen.queryByTestId('global-search')).toBeNull()
  })
})
