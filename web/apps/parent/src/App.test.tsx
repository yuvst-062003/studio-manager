import { render, screen, waitFor, within } from '@testing-library/react'
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
// walkthrough at #/install. The tests inverted with it.

const STUDIO = {
  studio_id: 'st-1',
  studio_name: 'מועדון בדיקה',
  studio_is_demo: false,
  person_id: 'p-guardian',
  roles: [] as string[],
  is_guardian: true,
}

/** The shape `useSession` needs to call this a signed-in guardian WITH access — see
 *  `features/schedule/mounted.test.tsx`'s `signedInAs`, which this mirrors. `/auth/me`
 *  carries the full shape and not only `dev_tools`: `useSession` REPLACES the refresh's
 *  state with that body and defaults a missing `access` to `{staff:false,parent:false}`,
 *  so a thinner stub signs the guardian back out and every route in this file lands on
 *  `AccessGate`'s refusal instead of the screen under test. */
const SIGNED_IN_BODY = {
  access: { staff: false, parent: true },
  studios: [STUDIO],
  active_studio_id: STUDIO.studio_id,
}

/**
 * A signed-in, authorized guardian for every URL `extra` does not claim — this file's
 * default session (see `beforeEach`). `extra` returning `null` falls through to a bare
 * `{items: []}` 200, same as the old file-wide default; most of these tests only care
 * about one or two endpoints and let this cover the rest.
 */
function stubAuthed(extra: (url: string, init?: RequestInit) => Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/auth/refresh')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 900, ...SIGNED_IN_BODY }), {
        status: 200,
      })
    }
    if (url.includes('/auth/me')) {
      return new Response(JSON.stringify({ ...SIGNED_IN_BODY, dev_tools: false }), { status: 200 })
    }
    return extra(url, init) ?? new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
}

beforeEach(() => {
  globalThis.localStorage?.clear()
  globalThis.location.hash = ''
  vi.stubGlobal('fetch', stubAuthed(() => null))
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

describe('parent app', () => {
  it('renders the app in a browser tab — no install wall', async () => {
    // jsdom reports display-mode: browser, the exact state that used to hit the wall.
    // The product decision: nobody is forced to install, so the tab gets the real app.
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('install-banner')).toBeInTheDocument())
    expect(screen.queryByTestId('install-walkthrough')).toBeNull()
  })

  it('nudges with a reason, and the nudge opens the walkthrough on demand', async () => {
    // §6.5 still gets its pitch — push on iOS exists only for a home-screen app — it
    // just no longer blocks. The banner's CTA routes to #/install, where the original
    // walkthrough (share-sheet steps on iOS, a real prompt on Chromium) still lives.
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
    // The other half of removing the wall: §6.1 step 2 is now reachable from a plain
    // browser tab, which is where every first-time visitor starts.
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

  it('renders no dev bar without a developer identity', () => {
    // §19.4 — 'Rendered only when the authenticated identity has is_developer.'
    render(<App />)
    expect(screen.queryByTestId('studio-dev-bar')).toBeNull()
  })
})

describe('an account with no studio at all (mirrors the dashboard app’s 2026-08-29/30 fix)', () => {
  // §6.1 says signing in is not access: "there is no path from I downloaded the app to I
  // have a studio", so any Google account can authenticate and belong to nothing. The
  // dashboard app was fixed for this twice (2026-08-29, then 2026-08-30 for the
  // zero-studio case specifically) with the SAME comment this describe block borrows —
  // "refused BEFORE the shell, not inside it: the point is that none of the doors are
  // offered, and a refusal rendered inside AppShell would still draw the nav." The parent
  // app never got that fix: `Resolve` renders `RefusalScreen` correctly, but only as the
  // DEFAULT branch deep inside `AppShell`'s consent/health/payment gates, so the title,
  // the hamburger drawer, the install banner and (once the gates resolve) the tab bar all
  // render around it. Reported from production (2026-09-02): a signed-in account with no
  // guardian rows saw the full working-looking app around "לא נמצאו תלמידים המשויכים
  // אליך", which reads as a broken deployment rather than an honest refusal.
  //
  // A signed-in account with `studios: []` / `access.parent: false` — every OTHER test in
  // this file overrides `beforeEach`'s default (an authorized guardian) to reach its
  // screen, and before the fix that override was not even necessary: the routes below
  // (`#/absence`, `#/payments/history`, `#/student/<id>`, the uPay return leg) were
  // reachable regardless of access, contradicting App.tsx's own comment that "a person
  // with no guardian row never reaches this shell".
  const NO_STUDIO = vi.fn(
    async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
  )

  it('refuses before the shell — no title, no drawer, no install banner, no tab bar', async () => {
    vi.stubGlobal('fetch', NO_STUDIO)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
    expect(screen.queryByTestId('install-banner')).toBeNull()
    expect(screen.queryByRole('button', { name: t('he', 'common.nav.menu') })).toBeNull()
    expect(screen.queryByRole('heading', { name: t('he', 'common.home.title') })).toBeNull()
  })

  it('keeps refusing a hash-typed route — the doors stay shut, not only the front one', async () => {
    vi.stubGlobal('fetch', NO_STUDIO)
    globalThis.location.hash = '#/absence'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
    expect(screen.queryByTestId('absence-screen')).toBeNull()
  })
})

describe('the P1 routes — screens that were built and rendered by nothing', () => {
  it('routes #/absence to the absence pre-report', async () => {
    globalThis.location.hash = '#/absence'
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('absence-screen')).toBeInTheDocument())
  })

  it('routes #/payments/history to the payment history screen', async () => {
    globalThis.location.hash = '#/payments/history'
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) =>
        url.includes('/me/balance')
          ? new Response(
              JSON.stringify({
                payer_person_id: 'p1',
                balance_agorot: 0,
                charged_agorot: 0,
                paid_agorot: 0,
                credit_agorot: 0,
                open_charge_count: 0,
              }),
              { status: 200 },
            )
          : null,
      ),
    )
    render(<App />)
    // What this asserts is the ROUTE — the part that was missing while
    // PaymentsSection linked here.
    await waitFor(() => expect(screen.getByTestId('payment-history')).toBeInTheDocument())
  })

  it('routes the uPay return leg to the payment-complete screen', async () => {
    globalThis.location.hash = '#/payment-complete/some-ref'
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) =>
        url.includes('/payment-complete')
          ? new Response(JSON.stringify({ status: 'pending', public_ref: null }), { status: 200 })
          : null,
      ),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('payment-complete')).toBeInTheDocument())
  })

  it('strips uPay\'s appended payload off the ref on the return leg', async () => {
    // upay-integration.md round one: 'The customer's browser is ALSO redirected to
    // returnurl with the same payload.' Our returnurl is a hash route
    // (`.../#/payment-complete/<ref>`), so anything uPay appends lands INSIDE the
    // fragment and becomes part of the ref unless it is stripped here.
    //
    // The seam, not the component: what is asserted is the `ref=` the API is actually
    // called with. `ref` is typed `uuid.UUID` on the server, so a ref carrying
    // `?providererrorcode=0&...` is a 422 — and the screen turns a 422 into LoadFailed.
    // That is a generic error screen shown to a parent who has just been charged.
    globalThis.location.hash =
      '#/payment-complete/26d61842-c618-4000-9c71-58f816d02323?providererrorcode=0&errordescription=SUCCESS&amount=600'
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) => {
        calls.push(url)
        return url.includes('/payment-complete')
          ? new Response(JSON.stringify({ status: 'pending', public_ref: null }), { status: 200 })
          : null
      }),
    )
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('payment-complete')).toBeInTheDocument())
    const asked = calls.find((url) => url.includes('/api/v1/payment-complete'))
    expect(asked).toContain('ref=26d61842-c618-4000-9c71-58f816d02323')
    expect(asked).not.toContain('providererrorcode')
  })

  it('routes #/student/<id> to the 2c card', async () => {
    globalThis.location.hash = '#/student/s1'
    render(<App />)
    // items: [] means "not this family's child" — the honest refusal, never another
    // family's card. The route resolving to the card's own screen is the assertion.
    await waitFor(() => expect(screen.getByTestId('student-card-missing')).toBeInTheDocument())
  })
})

describe('L6 — the anonymous landing touches no session', () => {
  it('loading /t/<slug> signed out issues zero authenticated requests', async () => {
    globalThis.history.pushState({}, '', '/t/gladiator')
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return new Response(
          JSON.stringify({
            studio_name: 'גלדיאטור',
            slug: 'gladiator',
            logo_url: null,
            default_locale: 'he',
            headline: null,
            about: null,
            address: null,
            photo_urls: [],
            groups: [],
          }),
          { status: 200 },
        )
      }),
    )
    render(<App />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    // The wall stands in front of BOOKING, never in front of reading: no refresh, no
    // me-reads, nothing carrying credentials — the public read only.
    expect(calls.every((url) => url.includes('/public/'))).toBe(true)
    expect(calls.some((url) => url.includes('/auth/refresh'))).toBe(false)
    globalThis.history.pushState({}, '', '/')
  })

  // The seam, not the prop: PublicLanding's own test hands the picker in by name, which
  // would still pass if App stopped passing it. This mounts the real route, so it fails
  // if §6.1's control goes missing OR drifts back out of the header — the shape of the
  // bug it was written for (it rendered loose above the hero, unstyled).
  it('mounts the language picker inside the landing header, from the real route', async () => {
    globalThis.history.pushState({}, '', '/t/gladiator')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              studio_name: 'גלדיאטור',
              slug: 'gladiator',
              logo_url: null,
              default_locale: 'he',
              headline: null,
              about: null,
              address: null,
              photo_urls: [],
              groups: [],
            }),
            { status: 200 },
          ),
      ),
    )
    render(<App />)
    const header = await screen.findByTestId('landing-header')
    const picker = within(header).getByTestId('landing-lang')
    // Each language named in its own language (ENDONYM) — someone who cannot read the
    // current locale still has to find theirs.
    expect(within(picker).getByRole('button', { name: 'Русский' })).toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'עברית' })).toBeInTheDocument()
    globalThis.history.pushState({}, '', '/')
  })

  it('returning from the OAuth callback with signed_in=1 restores the session and resumes the booking', async () => {
    // A full-page OAuth return is a fresh JS context: the in-memory token is empty, and
    // the landing never refreshes for anonymous visitors. The callback's marker is the
    // one case where a refresh is known to be worth it — without acting on it the booking
    // flow greets the freshly-signed-in parent with its sign-in step again, forever.
    // Redesign 2026-08-29: the flow no longer opens on load; the return_path carries the
    // picked group as `?book=`, and THAT reopens the flow at the child form.
    globalThis.history.pushState({}, '', '/t/gladiator?book=g1&signed_in=1')
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.includes('/auth/refresh')) {
          return new Response(
            JSON.stringify({
              access_token: 't-landing',
              expires_in: 900,
              access: { parent: false, staff: false },
              studios: [],
              active_studio_id: null,
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            studio_name: 'גלדיאטור',
            slug: 'gladiator',
            logo_url: null,
            default_locale: 'he',
            headline: null,
            about: null,
            address: null,
            photo_urls: [],
            groups: [
              {
                id: 'g1',
                name: 'מתחילים',
                description: null,
                age_min: null,
                age_max: null,
                training_weekdays: [],
                training_times: [],
              },
            ],
          }),
          { status: 200 },
        )
      }),
    )
    render(<App />)
    await waitFor(() => expect(calls.some((url) => url.includes('/auth/refresh'))).toBe(true))
    await waitFor(() => expect(screen.getByTestId('booking-children')).toBeInTheDocument())
    // The marker is one-shot: stripped so a copied URL or a later reload does not refire
    // it — while `book` survives the strip; it is what resumed the flow just now.
    expect(globalThis.location.search).toBe('?book=g1')
    globalThis.history.pushState({}, '', '/')
  })
})

describe('P7 — the belt link resolves or refuses, never silently home', () => {
  it('completes a single-segment link from the child’s belt history', async () => {
    globalThis.location.hash = '#/belts/st1'
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) =>
        url.includes('/students/st1/belts')
          ? new Response(
              JSON.stringify({
                items: [
                  {
                    id: 'a1',
                    student_id: 'st1',
                    belt_rank_id: 'r1',
                    class_id: 'c9',
                    belt_rank_name: 'צהובה',
                    color_hex: '#f5d000',
                    secondary_color_hex: null,
                    awarded_on: '2026-05-01',
                    awarded_by_person_id: null,
                    event_id: null,
                    note: null,
                  },
                ],
              }),
              { status: 200 },
            )
          : null,
      ),
    )
    render(<App />)
    await waitFor(() => expect(globalThis.location.hash).toBe('#/belts/st1/c9'))
  })

  it('refuses a bare #/belts/ visibly, with a way forward', async () => {
    globalThis.location.hash = '#/belts/'
    render(<App />)
    expect(await screen.findByText(t('he', 'events.belt.noneYet'))).toBeInTheDocument()
  })
})

describe('12g — adding a sibling refreshes the family it just grew', () => {
  it('refetches /me/students once the child is added, instead of waiting for a reload', async () => {
    // AddSibling calls `onAdded` on a successful submit, but the shell never passed it
    // one — the family queue kept showing the roster from before the add until the
    // parent reloaded the tab by hand. The seam is the wiring, not the component: the
    // component's own tests already cover that `onAdded` fires.
    const user = userEvent.setup()
    globalThis.location.hash = '#/add-child'
    let studentsGetCalls = 0
    vi.stubGlobal(
      'fetch',
      stubAuthed((url, init) => {
        if (url.includes('/api/v1/me/students')) {
          if ((init?.method ?? 'GET') === 'POST') {
            return new Response(JSON.stringify({ id: 'st-new' }), { status: 201 })
          }
          studentsGetCalls += 1
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        if (url.includes('/api/v1/me/studio')) {
          return new Response(JSON.stringify({ slug: 'demo' }), { status: 200 })
        }
        if (url.includes('/api/v1/public/studios/demo/groups')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'g1',
                  name: 'מתחילים',
                  description: null,
                  age_min: null,
                  age_max: null,
                  training_weekdays: [],
                },
              ],
            }),
            { status: 200 },
          )
        }
        return null
      }),
    )
    render(<App />)
    await screen.findByTestId('sibling-group-g1')
    const before = studentsGetCalls

    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'דניאל')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'לוי')
    await user.click(screen.getByTestId('sibling-group-g1'))
    await user.click(screen.getByTestId('sibling-submit'))

    await screen.findByTestId('sibling-submitted')
    await waitFor(() => expect(studentsGetCalls).toBeGreaterThan(before))
  })
})

describe('B1 -- the join shell decides sign-in-or-wizard, not step 1 (F1)', () => {
  const JOIN_TOKEN = 'live-token-123456'
  const JOIN_INFO = {
    studio_name: 'מועדון הדגמה',
    slug: 'demo-club',
    logo_url: '/api/v1/public/studios/demo-club/logo',
    email: null,
    groups: [],
  }

  it('a signed-out visitor gets the shell\'s sign-in wall, with the club name and logo -- never step 1\'s', async () => {
    globalThis.history.pushState({}, '', `/join/${JOIN_TOKEN}`)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/refresh')) {
          // Anonymous: `refresh()` treats any non-2xx as "nobody is signed in".
          return new Response(JSON.stringify({ detail: 'no session' }), { status: 401 })
        }
        if (url.includes(`/api/v1/public/onboarding/${JOIN_TOKEN}`)) {
          return new Response(JSON.stringify(JOIN_INFO), { status: 200 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(<App />)

    // The seam: fetch -> state -> component. The logo's `src` is built from the SAME
    // `logo_url` the wire body carried (via `apiUrl`), not a hand-built prop -- proving
    // the field actually reaches the DOM rather than being dropped between the fetch and
    // the render.
    const wall = await screen.findByTestId('join-sign-in-wall')
    expect(within(wall).getByText(JOIN_INFO.studio_name)).toBeInTheDocument()
    const logo = within(wall).getByTestId('join-wall-logo')
    expect(logo).toHaveAttribute('src', expect.stringContaining(JOIN_INFO.logo_url))
    expect(logo).toHaveAttribute('alt', JOIN_INFO.studio_name)

    // Step 1 never renders for a signed-out visitor -- the shell is the sole authority
    // on this fork now.
    expect(screen.queryByTestId('join-welcome')).toBeNull()

    globalThis.history.pushState({}, '', '/')
  })

  it('a signed-in visitor reaches the wizard directly, never the shell\'s sign-in wall', async () => {
    globalThis.history.pushState({}, '', `/join/${JOIN_TOKEN}`)
    vi.stubGlobal('fetch', stubAuthed((url) => {
      if (url.includes(`/api/v1/public/onboarding/${JOIN_TOKEN}`)) {
        return new Response(JSON.stringify(JOIN_INFO), { status: 200 })
      }
      return null
    }))

    render(<App />)

    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('join-sign-in-wall')).toBeNull()

    globalThis.history.pushState({}, '', '/')
  })
})
