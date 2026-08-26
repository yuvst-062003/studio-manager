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
    ['', 'home'],
    ['#/nothing-here', 'home'],
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
    await waitFor(() => expect(screen.getByText('מכבי ג׳ודו רעננה')).toBeInTheDocument())
  })

  it('renders no dev bar without a developer identity', async () => {
    stubApi(SIGNED_IN)
    render(<App />)
    await waitFor(() => expect(screen.getByText('מכבי ג׳ודו רעננה')).toBeInTheDocument())
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
