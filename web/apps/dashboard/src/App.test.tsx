// §6.4's dashboard: the shell, the three screens, and the §5.1 wizard both staff and
// dashboard mount.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App, { routeFromHash } from './App'

const SESSION = {
  access: { staff: true, parent: false },
  studios: [
    { studio_id: 's', studio_name: 'מכבי ג׳ודו רעננה', studio_is_demo: false, roles: ['owner'] },
  ],
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
    // `DashboardSignIn` since the "Dojo Hazon" pass, not the shared `SignIn`. Asserted
    // through the link's href rather than its text, because the thing this shell is
    // responsible for is mounting the screen that names THIS app in the start URL —
    // passing "staff" here once sent a signed-in manager to the staff origin.
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') }),
      ).toHaveAttribute('href', expect.stringContaining('app=dashboard')),
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
      expect(
        screen.getByRole('heading', { name: t('he', 'common.staff.title') }),
      ).toBeInTheDocument(),
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

describe('every route the manager can reach has a door (2026-08-29)', () => {
  it('offers the manager home in the RENDERED sidebar, not only in the NAV array', async () => {
    // The sidebar is built by `sideNavGroups`, not from the NAV constant above it. Adding
    // `#/home` to the constant alone left the screen built and unreachable — which is the
    // defect the canvas audit found twelve times, and the one this screen was supposed to
    // avoid. The two lists are separate and this is what stops them drifting again.
    stubApi(SIGNED_IN)
    render(<App />)
    const link = await screen.findByRole('link', { name: t('he', 'common.dash.home.title') })
    expect(link).toHaveAttribute('href', '#/home')
  })

  it('resolves that hash to its own route rather than falling through to the board', async () => {
    expect(routeFromHash('#/home')).toBe('home')
    // And the fallback is still the board: `#/` is deliberately NOT the home yet.
    expect(routeFromHash('#/')).toBe('schedule')
  })
})

describe('an account with no role in the active studio (2026-08-29)', () => {
  // Found on staging. A person row existed in the club with ZERO role assignments, so
  // `SignedIn` passed and `AnyStaff` did not: `/sessions` answered 200 and classes,
  // groups, students, events, announcements, charges, reports and health-declarations all
  // answered 403. The dashboard rendered its whole shell over that and every panel showed
  // a generic error.
  //
  // The staff and parent apps have refused this case since §6.1 — each has a Resolve that
  // renders `RefusalScreen`. The dashboard had neither. F10 closed the neighbouring hole
  // ("the doors a coach's role cannot open stay out of their nav") and this is the same
  // hole one step further: a person with NO role was still offered every door.
  const NO_ROLE = {
    ...SESSION,
    studios: [
      { studio_id: 's', studio_name: 'מכבי ג׳ודו רעננה', studio_is_demo: false, roles: [] },
    ],
  }

  it('refuses instead of rendering a dashboard whose every panel 403s', async () => {
    stubApi({
      '/auth/refresh': { access_token: 'tok', expires_in: 900, ...NO_ROLE },
      '/auth/me': NO_ROLE,
      '/api/v1/sessions': { items: [] },
    })
    render(<App />)
    expect(await screen.findByTestId('dashboard-refusal')).toBeInTheDocument()
    // And the doors are gone with it.
    expect(screen.queryByRole('link', { name: t('he', 'common.dash.nav.weekly') })).toBeNull()
  })

  it('refuses somebody who belongs to NO studio at all', async () => {
    // The case the original fix missed, found in production on 2026-08-30. `hasNoRole`
    // was `membership !== undefined && membership.roles.length === 0`, so it caught a
    // person WITH a membership and no role -- and let a person with no membership at all
    // straight through, because `membership` is then `undefined` and the guard is false.
    //
    // Signing in is not access: §6.1 says "there is no path from I downloaded the app to
    // I have a studio", so any Google account can authenticate and belong to nothing. On
    // a fresh production that is EVERY first visitor, including the owner before their
    // club exists -- and what they got was the whole dashboard shell with every panel
    // failing, which reads as a broken deployment rather than an empty account.
    const NO_STUDIO = { ...SESSION, studios: [], active_studio_id: null }
    stubApi({
      '/auth/refresh': { access_token: 'tok', expires_in: 900, ...NO_STUDIO },
      '/auth/me': NO_STUDIO,
      '/api/v1/sessions': { items: [] },
    })
    render(<App />)
    expect(await screen.findByTestId('dashboard-refusal')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: t('he', 'common.dash.nav.weekly') })).toBeNull()
  })

  it('tells a refused visitor which account they are signed in as (2026-09-03)', async () => {
    // The seam, not the component: `RefusalScreen`'s own tests prove it renders an
    // `email` prop it is handed. This proves the dashboard actually hands it one, from
    // the real session — a field dropped between fetch and prop passes every test that
    // only constructs `RefusalScreen`'s props by hand.
    const NO_STUDIO = {
      ...SESSION,
      studios: [],
      active_studio_id: null,
      email: 'wrong.account@example.invalid',
    }
    stubApi({
      '/auth/refresh': { access_token: 'tok', expires_in: 900, ...NO_STUDIO },
      '/auth/me': NO_STUDIO,
      '/api/v1/sessions': { items: [] },
    })
    render(<App />)
    expect(await screen.findByTestId('dashboard-refusal')).toBeInTheDocument()
    expect(screen.getByTestId('refusal-account')).toHaveTextContent(
      'wrong.account@example.invalid',
    )
  })

  it('still renders the shell for a role that HAS access', async () => {
    // The refusal must key on "no role at all", not on "not an owner" — a lead coach has
    // a genuine, narrower dashboard and must keep it.
    const COACH = {
      ...SESSION,
      studios: [
        {
          studio_id: 's',
          studio_name: 'מכבי ג׳ודו רעננה',
          studio_is_demo: false,
          roles: ['lead_coach'],
        },
      ],
    }
    stubApi({
      '/auth/refresh': { access_token: 'tok', expires_in: 900, ...COACH },
      '/auth/me': COACH,
      '/api/v1/sessions': { items: [] },
    })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'מכבי ג׳ודו רעננה' })).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('dashboard-refusal')).toBeNull()
  })
})

describe('the global search lives in the shell header (2026-08-29)', () => {
  it('sits in the header beside the club name, not inside the page content', async () => {
    // It was rendered as a CHILD of AppShell, so it landed in <main> — floating above
    // whatever screen was showing, at a different place on every one of them, and reading
    // as part of the page rather than as part of the app. Reported as "the search option
    // is misplaced; it should be on the white bar with the club name".
    globalThis.location.hash = '#/schedule'
    stubApi(SIGNED_IN)
    render(<App />)
    const box = await screen.findByTestId('global-search')
    expect(box.closest('header')).not.toBeNull()
    expect(box.closest('main')).toBeNull()
  })
})

// -- the invited manager who has not redeemed yet -----------------------------
//
// F5's invitation is a code the manager copies off THIS app's own staff screen and hands
// over; there is no mailer anywhere in this product. The invite screen says so in as many
// words: 'קוד ההזמנה מוצג פעם אחת בלבד — שלחו אותו למוזמן. בכניסה לאפליקציה בוחרים
// "יש לי קוד הזמנה".'
//
// Until it is redeemed the invited person holds no role assignment, so `hasNoRole` is
// true and they take the refusal arm. That arm offered a link to the staff app and a
// sign-out button and nothing else — so the dashboard told an invited MANAGER to enter a
// code, then refused them the field to enter it in (2026-08-31). The staff app carries
// the same entry beneath its own refusal, for the same reason.
describe('the invited manager', () => {
  const NO_STUDIO = { ...SESSION, studios: [], active_studio_id: null }
  const REFUSED = {
    '/auth/refresh': { access_token: 'tok', expires_in: 900, ...NO_STUDIO },
    '/auth/me': NO_STUDIO,
    '/api/v1/sessions': { items: [] },
  }

  it('can enter the invitation code the staff screen told them to enter', async () => {
    stubApi(REFUSED)
    render(<App />)
    expect(await screen.findByTestId('dashboard-refusal')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }),
    ).toBeInTheDocument()
    // .claude/rules/ui-rtl-a11y.md — every input has an associated <label>.
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toBeInTheDocument()
  })

  it('redeems the typed code', async () => {
    // The seam, not the control: a rendered button and a labelled input prove nothing
    // about whether the code reaches `accept-invitation`. A button wired to nothing
    // renders identically and passes the test above.
    stubApi({ '/auth/accept-invitation': {}, ...REFUSED })
    render(<App />)
    expect(await screen.findByTestId('dashboard-refusal')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel')), {
      target: { value: 'tok-manager' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }))

    await waitFor(() => {
      const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes('/auth/accept-invitation'),
      )
      expect(call).toBeDefined()
      expect(String(call![1]?.body)).toContain('tok-manager')
    })
  })
})

// The dashboard mounted `ThemeProvider` from the start — so a preference stored by
// another app applied here — but never rendered a control to CHANGE it. It is the only
// app that passed no `drawerFooter`, and at sidebar widths the drawer's own trigger is
// hidden by `.studio-shell--sidenav .studio-shell__drawer-button { display: none }`, so
// even the footer it did not pass would have been out of reach on the surface this app is
// built for. The preference therefore sat at its `'system'` default for good, which is
// how a manager on a dark OS ended up with a dark dashboard and no way out
// (reported 2026-09-01).
describe('the dashboard can be switched between light, dark and system', () => {
  // A coach's session, repeated here rather than reached for across describes: this block
  // asserts the switch is NOT a permission, so it needs a viewer who holds none.
  const COACH = {
    ...SESSION,
    studios: [
      { studio_id: 's', studio_name: 'מכבי', studio_is_demo: false, roles: ['lead_coach'] },
    ],
  }
  const COACH_IN = {
    '/auth/refresh': { access_token: 'tok', expires_in: 900, ...COACH },
    '/auth/me': COACH,
    '/api/v1/sessions': { items: [] },
  }

  it('offers the switch in the sidebar, the desktop door', async () => {
    stubApi(SIGNED_IN)
    render(<App />)
    const nav = within(await screen.findByTestId('side-nav'))
    for (const key of ['light', 'dark', 'system'] as const) {
      expect(nav.getByRole('radio', { name: t('he', `common.theme.${key}`) })).toBeInTheDocument()
    }
  })

  it('reports the resolved mode in words, never by position alone', async () => {
    // 3f's rule for this screen and 2e's for the drawer: לכל מתג יש תווית מצב. "System"
    // selected is exactly the case where the label is load-bearing — the choice does not
    // tell you which of the two you got.
    stubApi(SIGNED_IN)
    render(<App />)
    const nav = within(await screen.findByTestId('side-nav'))
    fireEvent.click(nav.getByRole('radio', { name: t('he', 'common.theme.dark') }))
    expect(nav.getByText(t('he', 'common.theme.state.dark'))).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('offers it in the drawer too, so it is not reachable at exactly one width', async () => {
    // The sidebar is hidden under 1024px and the drawer trigger is hidden above it. A
    // control in only one of them is a control half the viewports cannot reach — which is
    // the invariant AppShell's own comment states.
    stubApi(SIGNED_IN)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: t('he', 'common.nav.menu') }))
    const drawer = within(await screen.findByRole('dialog'))
    expect(
      drawer.getByRole('radio', { name: t('he', 'common.theme.system') }),
    ).toBeInTheDocument()
  })

  it('offers it to a coach as well — it is a preference, not a permission', async () => {
    stubApi(COACH_IN)
    render(<App />)
    const nav = within(await screen.findByTestId('side-nav'))
    expect(nav.getByRole('radio', { name: t('he', 'common.theme.light') })).toBeInTheDocument()
  })
})
