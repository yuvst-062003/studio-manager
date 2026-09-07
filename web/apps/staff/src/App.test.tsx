import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from './App'

// M0's version of this file asserted HelloProof's app name and its display-mode chip.
// M1 replaced that screen with §6.1's real first run, so the assertions moved with it
// rather than being deleted: what this file is for is "the app renders the right screen
// for the state it is in", and that question outlived the screen that used to answer it.
//
// The 2026-08-27 feature pass inverted §6.5's wall: a browser tab is a first-class way
// to use the app, and the install story is a nudge (InstallBanner) plus an on-demand
// walkthrough at #/install. §10.6's stake (pending_ops and Safari's 7-day cap) is why
// the nudge exists at all — and why it is a pitch, not a gate.

/** A signed-in, authorized coach — this file's default session (see `beforeEach`). Since
 *  `AccessGate` (2026-09-02), a session with no role assignment never reaches `AppShell`
 *  at all — so the install banner and every other test in this file need an authorized
 *  session, not just `{items: []}` for everything. `/auth/me` carries the full shape and
 *  not only `dev_tools`: `useSession` REPLACES the refresh's state with that body and
 *  defaults a missing `access` to `{staff:false,parent:false}`. */
const SIGNED_IN_BODY = {
  access: { staff: true, parent: false },
  studios: [
    {
      studio_id: 'st-1',
      studio_name: 'מועדון בדיקה',
      studio_is_demo: false,
      person_id: 'p-coach',
      roles: ['lead_coach'],
      is_guardian: false,
    },
  ],
  active_studio_id: 'st-1',
}

beforeEach(() => {
  globalThis.localStorage?.clear()
  globalThis.location.hash = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 900, ...SIGNED_IN_BODY }),
          { status: 200 },
        )
      }
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify({ ...SIGNED_IN_BODY, dev_tools: false }), {
          status: 200,
        })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

describe('staff app', () => {
  it('renders the app in a browser tab — no install wall', async () => {
    // jsdom reports display-mode: browser, the exact state that used to hit the wall.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('install-banner')).toBeInTheDocument())
    expect(screen.queryByTestId('install-walkthrough')).toBeNull()
  })

  it('nudges with a reason, and the nudge opens the walkthrough on demand', async () => {
    render(<App />)
    const cta = await screen.findByRole('button', {
      name: t('he', 'common.install.banner.cta'),
    })
    expect(screen.getByText(t('he', 'common.install.banner.text'))).toBeInTheDocument()
    cta.click()
    await waitFor(() => expect(screen.getByTestId('install-walkthrough')).toBeInTheDocument())
    expect(screen.getByText(t('he', 'common.install.why'))).toBeInTheDocument()
  })

  it('renders the sign-in screen in a tab when nobody is signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/auth/refresh')
          ? new Response('', { status: 401 })
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('sign-in')).toBeInTheDocument())
  })

  it('redirects a bare #/attendance to the schedule rather than falling through (S4.3)', async () => {
    // S4.3 — the deep-link prefix with no session id used to fall through in silence to
    // whatever Resolve rendered. The date picker on the schedule screen is where a coach
    // picks a session, so that is where the bare hash now lands, explicitly.
    globalThis.location.hash = '#/attendance'
    render(<App />)
    await waitFor(() => expect(globalThis.location.hash).toBe('#/schedule'))
  })

  it('renders no dev bar without a developer identity', () => {
    // §19.4 — 'Rendered only when the authenticated identity has is_developer.'
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
})

describe('an identity with no role assignment anywhere (mirrors the dashboard app’s 2026-08-29/30 fix)', () => {
  // Every hash-routed screen in App.tsx already re-checks `session.access.staff` for
  // itself, so a refused coach could not reach a screen behind this bug — but `Resolve`
  // rendered `RefusalScreen` only as the DEFAULT branch, deep inside `AppShell`, so the
  // title, the drawer and the (deliberately unguarded) install banner rendered around it
  // regardless. `AccessGate` (2026-09-02) closes that gap the same way the dashboard app's
  // 2026-08-29/30 fix did: refuse BEFORE the shell mounts, not inside it.
  it('refuses before the shell — no title, no drawer, no install banner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(screen.queryByTestId('install-banner')).toBeNull()
    expect(screen.queryByRole('button', { name: t('he', 'common.nav.menu') })).toBeNull()
  })
})

// -- docs/design "Gladiator Manager Sign In" (2026-09-01) -----------------------------
//
// The seam, not the component. `ManagerSignIn.test.tsx` proves the screen; these prove the
// SHELL reaches for it and routes the two hashes its footer links to. A field asserted only
// on the component is a field that can be dropped in between and still pass every test.
describe('the manager sign-in, as the staff shell mounts it', () => {
  const anonymous = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/refresh')) return new Response('', { status: 401 })
        if (url.includes('/auth/providers')) {
          return new Response(
            JSON.stringify({ items: [{ name: 'google', start_url: '/api/v1/auth/google/start' }] }),
            { status: 200 },
          )
        }
        if (url.includes('/privacy/policy')) {
          return new Response(
            JSON.stringify({
              policy_version: 0,
              policy_version_label: '0.1-draft',
              policy_is_draft: true,
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

  it('shows an anonymous visitor the manager screen, not the split screen', async () => {
    anonymous()
    render(<App />)
    // The club badge is the element only this screen has; `sign-in` is on both.
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.manager.badge'))).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('link', { name: t('he', 'common.auth.manager.signInWithGoogle') }),
    ).toHaveAttribute('href', expect.stringContaining('app=staff'))
  })

  it('opens the terms IN THIS APP, without a session', async () => {
    // The whole point of the route: the reader deciding whether to sign in is anonymous,
    // so a legal screen behind the shell would be a link that bounces back to sign-in.
    anonymous()
    globalThis.location.hash = '#/terms'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('legal-screen')).toBeInTheDocument())
    expect(screen.getByTestId('policy-document')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'reports.privacy.terms.title'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'reports.privacy.policy.title'))).toBeNull()
  })

  it('opens the privacy policy on its own hash, and tells the reader it is a draft', async () => {
    anonymous()
    globalThis.location.hash = '#/privacy-policy'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('legal-screen')).toBeInTheDocument())
    expect(screen.getByText(t('he', 'reports.privacy.policy.title'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'reports.privacy.terms.title'))).toBeNull()
    // The banner is data — `GET /privacy/policy` is public so this screen can render it
    // rather than quietly implying the text is final.
    await waitFor(() =>
      expect(screen.getByTestId('policy-draft-notice')).toBeInTheDocument(),
    )
  })

  it('does not let the legal hashes reach §16’s operator queue', async () => {
    // `#/privacy` is the manager-gated operator screen and `#/privacy-policy` is a public
    // document. A prefix match between them would put a privacy QUEUE behind a footer link.
    anonymous()
    globalThis.location.hash = '#/privacy-policy'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('legal-screen')).toBeInTheDocument())
    expect(screen.queryByTestId('privacy-operator')).toBeNull()
  })
})

// נגישות: on the public surfaces, off the signed-in ones — the same call the parent app
// made (owner review, 2026-09-06; see `web/apps/parent/src/App.tsx`'s comment beside its
// own `AccessibilityMenu` mount). The floating button came to rest ON TOP of the first tab
// at phone widths, clipping לוח זמנים's label to "נים" and leaving that tab unpressable.
// Moving the control into the account tab (`AccountScreen.tsx`, covered directly in
// `AccountScreen.test.tsx` — see that file's own header for why it is not proved here
// through `App`) solves it without adding clearance padding to the bar itself.
describe('where the accessibility button lives', () => {
  it('floats on the sign-in screen, where a visitor has no account screen to go to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/auth/refresh')
          ? new Response('', { status: 401 })
          : new Response(JSON.stringify({ items: [] }), { status: 200 }),
      ),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('sign-in')).toBeInTheDocument())
    expect(screen.getByTestId('a11y-open')).toBeInTheDocument()
  })

  it('does not float over the signed-in app, where it covered the first tab', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    // Not "no accessibility menu anywhere" — the account tab carries it as a row.
    expect(screen.queryByTestId('a11y-open')).toBeNull()
  })
})

describe('§6.1 step 5 — the consent gate is actually MOUNTED', () => {
  /** The whole point of this block. HB-w6-health-gate-unmounted is in this repo's history
   *  because a gate can be perfect in its own test file and gate nothing, and
   *  `StaffConsentGate.test.tsx` renders the component directly — which proves the component
   *  and says nothing about the shell. These two tests render `<App />`. */
  const outstanding = (url: string) =>
    url.includes('/privacy/consents')
      ? new Response(
          JSON.stringify({
            policy_version: 2,
            policy_version_label: '2',
            policy_is_draft: false,
            required: ['terms', 'privacy'],
            outstanding: ['terms', 'privacy'],
            records: [],
          }),
          { status: 200 },
        )
      : null

  it('holds the whole shell — tab bar included — for a coach who has signed nothing', async () => {
    const base = globalThis.fetch as unknown as (input: RequestInfo | URL) => Promise<Response>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => outstanding(String(input)) ?? base(input)),
    )
    render(<App />)

    await waitFor(() => expect(screen.getByTestId('staff-consent-gate')).toBeInTheDocument())
    // Not merely hidden. The bar is what reaches every other screen, and a bar drawn beside
    // the gate is a bar a fast finger uses before the gate has been answered.
    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument()
  })

  it('does not hold a coach who has already signed both', async () => {
    // The default stub answers `{items: []}` for every unrecognised URL, which
    // `readConsentState` reads as "cannot tell" — and the gate stands aside on that, which
    // is the behaviour every other test in this file has been relying on without saying so.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('staff-consent-gate')).not.toBeInTheDocument()
  })
})

describe('revision 0025 — the emergency-contact step is MOUNTED, and only for assistants', () => {
  /** Same reasoning as the consent block above: a step nobody mounts asks nobody anything.
   *  `EmergencyContactStep.test.tsx` renders the component, which proves the component. */
  const asRole = (role: string) => ({
    ...SIGNED_IN_BODY,
    studios: [{ ...SIGNED_IN_BODY.studios[0], roles: [role] }],
  })

  const stubFor = (role: string, profile: Record<string, unknown>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/refresh')) {
          return new Response(
            JSON.stringify({ access_token: 'tok', expires_in: 900, ...asRole(role) }),
            { status: 200 },
          )
        }
        if (url.includes('/auth/me')) {
          return new Response(JSON.stringify({ ...asRole(role), dev_tools: false }), {
            status: 200,
          })
        }
        if (url.includes('/me/profile')) {
          return new Response(JSON.stringify(profile), { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

  it('asks an assistant coach who has nobody on file', async () => {
    stubFor('assistant_coach', { emergency_contact_name: null })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId('emergency-contact-step')).toBeInTheDocument(),
    )
  })

  it('never asks a lead coach', async () => {
    stubFor('lead_coach', { emergency_contact_name: null })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('emergency-contact-step')).not.toBeInTheDocument()
  })

  it('stops asking an assistant who already answered', async () => {
    stubFor('assistant_coach', { emergency_contact_name: 'רונית גולן' })
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('emergency-contact-step')).not.toBeInTheDocument()
  })

  it('lets the app through once postponed', async () => {
    stubFor('assistant_coach', { emergency_contact_name: null })
    render(<App />)
    await screen.findByTestId('emergency-contact-step')

    await userEvent.click(screen.getByTestId('emergency-skip'))

    await waitFor(() => expect(screen.getByTestId('tab-bar')).toBeInTheDocument())
  })
})
