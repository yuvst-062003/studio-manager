import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from './App'
import type { OnboardingStatus } from './features/onboarding/doorSteps'
// Task 3b -- doors C and D now drive the redesigned wizard's real step-2 form
// (`StudentFormSheet`), the same way `JoinWizard.test.tsx` does, rather than the retired
// `SelfServeJoinFlow`'s `JoinFamilyStep` panel.
import {
  step1Copy,
  step2Copy,
  step3Copy,
  step4Copy,
  studentFormCopy,
} from './features/onboarding/wizard/copy'

// `AuthedApp`'s wizard doors render with `locale` defaulted to 'he' (its own `useState<
// Locale>('he')`), so these reference values -- read the same way `JoinWizard.test.tsx`
// does -- match what actually renders.
const STEP1_COPY = step1Copy('he')
const STEP2_COPY = step2Copy('he')
const STEP3_COPY = step3Copy('he')
const STEP4_COPY = step4Copy('he')
const STUDENT_FORM_COPY = studentFormCopy('he')

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

/** §3 Door D's test: the REAL `makeHealthClient(apiFetch)` this app builds (no injected
 *  mock, unlike the onboarding feature's own test files) hits `/api/v1/health-templates`
 *  for real through the stubbed `fetch` below, so it needs a real-shaped schema to parse
 *  rather than the file-wide `{items: []}` default. */
const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
    },
    {
      id: 'other',
      title: 'נוסף',
      questions: [
        { id: 'emergency_contact', type: 'phone' as const, label: 'טלפון חירום', required: true },
      ],
    },
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        { id: 'clause_confirmed', type: 'clause' as const, label: 'אני מאשר/ת', required: true },
      ],
    },
  ],
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

  // This test mounts the whole app and waits through two rendering passes (banner, then
  // the walkthrough it opens) and legitimately takes the better part of a second. Under
  // a loaded, full parallel test run that pushes past vitest's default 5s `testTimeout`
  // and the test times out even though nothing is hung. Give it real headroom instead of
  // a global bump that would mask an unrelated test hanging. Do not "tidy" this away.
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
  }, 15000)

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

  // Fast in isolation, but confirmed flaky under a loaded, full parallel test run --
  // mounting the whole app plus a real fetch round trip is enough to cross vitest's
  // default 5s `testTimeout` when the machine is contended, even though nothing here is
  // hung. Give it real headroom instead of a global bump that would mask an unrelated
  // test hanging. Do not "tidy" this away.
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
  }, 15000)

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

  // This test mounts the whole app, drives a session refresh, then walks the wizard's
  // real step 1 through several `userEvent` clicks -- measured as high as 2.1s under
  // ordinary machine contention. Under a loaded, full parallel test run that pushes past
  // vitest's default 5s `testTimeout` and the test times out even though nothing is
  // hung. Give it real headroom instead of a global bump that would mask an unrelated
  // test hanging. Do not "tidy" this away.
  it('returning from the OAuth callback with signed_in=1 restores the session and resumes the booking', async () => {
    // A full-page OAuth return is a fresh JS context: the in-memory token is empty, and
    // the landing never refreshes for anonymous visitors. The callback's marker is the
    // one case where a refresh is known to be worth it — without acting on it the booking
    // flow greets the freshly-signed-in parent with its sign-in step again, forever.
    // Redesign 2026-08-29: the flow no longer opens on load; the return_path carries the
    // picked group as `?book=`, and THAT reopens the flow.
    //
    // F21 (2026-09-03) rebuilt Door A onto the shared wizard, so "resumes" no longer means
    // jumping straight to a step of its own — every door's wizard opens at the SAME step 1
    // (`JoinWelcomeStep`, `join-welcome`) regardless of how it was reached. What proves this
    // is actually a resume rather than a fresh, empty booking is the GROUP surviving the
    // round trip: `initialGroupId` (carried from `?book=g1`) fires `BookingFlow`'s slot
    // fetch for g1 on mount, before any card is even ticked, and the same group is still the
    // one selected once the family step renders — never a blank pick the parent has to redo.
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
        if (url.includes('/api/v1/privacy/consents')) {
          return new Response(
            JSON.stringify({
              outstanding: [],
              policy_version: 1,
              policy_version_label: 'v1',
              policy_is_draft: false,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/public/groups/g1/trial-slots')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        if (url.includes('/api/v1/public/studios/gladiator/landing')) {
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
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(<App />)
    await waitFor(() => expect(calls.some((url) => url.includes('/auth/refresh'))).toBe(true))

    // The wizard opened on its own — no click on "הצטרפות" — proving the session restore
    // is what reopened it, not a fresh visit.
    await screen.findByTestId('join-welcome')
    // The PICKED group's slots are already being fetched, before the parent has ticked a
    // single card: `initialGroupId` carried g1 through the redirect into `BookingFlow`'s
    // mount effect, the seam `?book=` actually has to cross.
    await waitFor(() =>
      expect(calls.some((url) => url.includes('/api/v1/public/groups/g1/trial-slots'))).toBe(
        true,
      ),
    )

    // Walk the wizard's own step 1 to prove the resumed group survives all the way to
    // where a parent would actually see it, not only in an unobserved fetch.
    const user = userEvent.setup()
    await screen.findByTestId('join-welcome-terms-version')
    // One tick now gates continue, not three (owner request, 2026-09-03).
    await user.click(screen.getByTestId('join-welcome-agree-check'))
    await user.click(screen.getByTestId('join-welcome-continue'))

    await screen.findByTestId('booking-students-step')
    // Still g1 — the exact group chosen before the OAuth round trip, not merely SOME
    // group, and not a blank pick the parent is made to repeat.
    expect(screen.getByTestId('booking-row-group-0-g1')).toBeChecked()

    // The marker is one-shot: stripped so a copied URL or a later reload does not refire
    // it — while `book` survives the strip; it is what resumed the flow just now.
    expect(globalThis.location.search).toBe('?book=g1')
    globalThis.history.pushState({}, '', '/')
  }, 15000)
})

describe('P7 — the belt link resolves or refuses, never silently home', () => {
  // Both tests in this block mount the whole app and resolve a real hash route through a
  // stubbed fetch; fast in isolation but confirmed flaky under a loaded, full parallel
  // test run, where that round trip is enough to cross vitest's default 5s
  // `testTimeout` even though nothing here is hung. Give them real headroom instead of a
  // global bump that would mask an unrelated test hanging. Do not "tidy" this away.
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
  }, 15000)

  it('refuses a bare #/belts/ visibly, with a way forward', async () => {
    globalThis.location.hash = '#/belts/'
    render(<App />)
    expect(await screen.findByText(t('he', 'events.belt.noneYet'))).toBeInTheDocument()
  }, 15000)
})

// Task 3b -- doors C and D now share `JoinWizard` with door B, so their own tests drive the
// same real step-2 form (`StudentFormSheet`, all five parts) `JoinWizard.test.tsx` drives,
// through `#/add-child` / `?invite=` rather than a directly-rendered `JoinWizard`.
const AGREEMENTS_CURRENT_STATUS: OnboardingStatus = {
  steps: [
    { key: 'agreements', complete: true },
    { key: 'students', complete: true },
    { key: 'health', complete: true },
    { key: 'payment', complete: true },
  ],
  next: null,
}

const AGREEMENTS_NOT_CURRENT_STATUS: OnboardingStatus = {
  steps: [
    { key: 'agreements', complete: false },
    { key: 'students', complete: true },
    { key: 'health', complete: true },
    { key: 'payment', complete: true },
  ],
  next: 'agreements',
}

function chargeFixture(id: string, studentId: string, amountAgorot = 30_000) {
  return {
    id,
    payer_person_id: 'payer-1',
    student_id: studentId,
    kind: 'tuition',
    period_year: 2026,
    period_month: 9,
    amount_agorot: amountAgorot,
    original_amount_agorot: null,
    proration_note: null,
    due_date: '2026-09-28',
    status: 'open',
    created_by: 'billing_run',
    allocated_agorot: 0,
    is_covered_elsewhere: false,
  }
}

function stubCanvasAndPointerCapture() {
  Element.prototype.scrollTo = vi.fn()
  globalThis.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    scale: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  globalThis.HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
  globalThis.HTMLElement.prototype.setPointerCapture = vi.fn()
  globalThis.HTMLElement.prototype.releasePointerCapture = vi.fn()
}

/** Stubs every read door D's `JoinWizard` mount touches (`/me/onboarding-status`,
 *  `/me/studio` + its public groups/price-plans, the health template) plus the writes a
 *  registration can reach (`/me/students/register`, `/me/charges`, `/me/payment-promises`,
 *  `/payment-orders`, `/me/standing-order-links`), and returns a mutable record of what
 *  was called with what -- the seam these tests assert against, not component state. */
function stubDoorD(
  options: {
    onboardingStatus?: OnboardingStatus
    existingCharges?: readonly ReturnType<typeof chargeFixture>[]
  } = {},
) {
  const { onboardingStatus = AGREEMENTS_CURRENT_STATUS, existingCharges = [] } = options
  const state = {
    registerCalled: false,
    studentsGetCalls: 0,
    promiseBodies: [] as Record<string, unknown>[],
    orderBodies: [] as Record<string, unknown>[],
  }
  vi.stubGlobal(
    'fetch',
    stubAuthed((url, init) => {
      if (url.includes('/api/v1/me/students/register') && init?.method === 'POST') {
        state.registerCalled = true
        return new Response(
          JSON.stringify({
            person_id: 'p1',
            student_ids: ['st-new'],
            child_student_ids: ['st-new'],
            charges_created: 1,
          }),
          { status: 201 },
        )
      }
      if (url.includes('/api/v1/me/onboarding-status')) {
        return new Response(JSON.stringify(onboardingStatus), { status: 200 })
      }
      if (url.includes('/api/v1/me/charges')) {
        return new Response(JSON.stringify({ items: existingCharges }), { status: 200 })
      }
      if (url.includes('/api/v1/me/payment-promises') && init?.method === 'POST') {
        state.promiseBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return new Response(JSON.stringify({}), { status: 201 })
      }
      if (url.includes('/api/v1/payment-orders') && init?.method === 'POST') {
        state.orderBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return new Response(JSON.stringify({ public_ref: 'order-1' }), { status: 201 })
      }
      if (url.includes('/api/v1/me/standing-order-links')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      if (url.includes('/api/v1/me/students')) {
        state.studentsGetCalls += 1
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      if (url.includes('/api/v1/me/studio')) {
        return new Response(
          JSON.stringify({ slug: 'demo', name: 'מועדון בדיקה', logo_url: null }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo/groups')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'g1', name: 'מתחילים', training_weekdays: [0, 2] }] }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo/price-plans')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'plan-1', name: 'חודשי', monthly_amount_agorot: 30_000, sessions_per_week: 2 }],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/health-templates/tmpl1')) {
        return new Response(
          JSON.stringify({ id: 'tmpl1', kind: 'full', version: 1, schema: HEALTH_SCHEMA }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/health-templates')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'tmpl1', kind: 'full', version: 1 }] }),
          { status: 200 },
        )
      }
      return null
    }),
  )
  return state
}

/** Stubs Door C's own reads: `/auth/accept-invitation` (task 9b's redemption response,
 *  naming the invited student), `/me/onboarding-status`, `/me/studio` + its public
 *  groups/price-plans, the health template, and `/me/students` -- the family's OTHER
 *  children, read only by `AuthedApp`'s own `gatedChildren` effect in the background.
 *  The wizard's own step 2 (`Step2Trainees`) never reads that endpoint at all; a test
 *  that stuffs it with siblings and then asserts they never reach step 2 is pinning
 *  that construction, not working around a fetch the wizard depends on. */
function stubDoorC(
  options: {
    onboardingStatus?: OnboardingStatus
    invitedStudentId?: string
    invitedStudentName?: string
    existingStudents?: readonly { id: string; first_name: string; last_name: string }[]
  } = {},
) {
  const {
    onboardingStatus = AGREEMENTS_CURRENT_STATUS,
    invitedStudentId = 'st-invited',
    invitedStudentName = 'נועה כהן',
    existingStudents = [],
  } = options
  vi.stubGlobal(
    'fetch',
    stubAuthed((url) => {
      if (url.includes('/api/v1/auth/accept-invitation')) {
        return new Response(
          JSON.stringify({
            access_token: 'tok',
            expires_in: 900,
            ...SIGNED_IN_BODY,
            invited_student_id: invitedStudentId,
            invited_student_name: invitedStudentName,
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/me/onboarding-status')) {
        return new Response(JSON.stringify(onboardingStatus), { status: 200 })
      }
      if (url.includes('/api/v1/me/students')) {
        return new Response(
          JSON.stringify({
            items: existingStudents.map((s) => ({
              ...s,
              status: 'active',
              health_status: 'missing',
              agreement_complete: true,
            })),
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/me/studio')) {
        return new Response(
          JSON.stringify({ slug: 'demo-club', name: 'מועדון הדגמה', logo_url: null }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo-club/groups')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'g1', name: 'מתחילים', training_weekdays: [0, 2] }] }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo-club/price-plans')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'plan-1', name: 'חודשי', monthly_amount_agorot: 30_000, sessions_per_week: 2 }],
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/health-templates/tmpl1')) {
        return new Response(
          JSON.stringify({ id: 'tmpl1', kind: 'full', version: 1, schema: HEALTH_SCHEMA }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/health-templates')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'tmpl1', kind: 'full', version: 1 }] }),
          { status: 200 },
        )
      }
      return null
    }),
  )
}

/** Opens the "+" add-student dialog and fills the real step-2 form (`StudentFormSheet`,
 *  all five parts) for ONE minor child -- the same seam `JoinWizard.test.tsx`'s own
 *  `fillOneChildAndContinue` drives -- ending on the save click, back on step 2's list.
 *  Assumes step 2's family list (`join-family-step`) is already on screen. */
async function fillAndSaveOneChild(
  user: ReturnType<typeof userEvent.setup>,
  name: { firstName: string; lastName: string } = { firstName: 'דניאל', lastName: 'לוי' },
) {
  await screen.findByTestId('join-family-step')
  await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))

  const dialog = screen.getByRole('dialog')
  const field = (text: string) =>
    within(dialog).getByLabelText(
      new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
    )
  const fill = (text: string, value: string) => user.type(field(text), value)

  await fill(STUDENT_FORM_COPY.firstName, name.firstName)
  await fill(STUDENT_FORM_COPY.lastName, name.lastName)
  await fill(STUDENT_FORM_COPY.nationalId, '100000009')
  await fill(STUDENT_FORM_COPY.birthDate, '2016-04-01')
  await fill(STUDENT_FORM_COPY.address, 'הרצל 1')
  await fill(STUDENT_FORM_COPY.city, 'תל אביב')
  await user.selectOptions(field(STUDENT_FORM_COPY.grade), 'grade_3')
  await fill(STUDENT_FORM_COPY.guardianFirstName, 'דנה')
  await fill(STUDENT_FORM_COPY.guardianLastName, 'לוי')
  await fill(STUDENT_FORM_COPY.guardianNationalId, '100000017')
  await fill(STUDENT_FORM_COPY.guardianPhone, '0501234567')
  await fill(STUDENT_FORM_COPY.guardianEmail, 'dana@example.com')
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

  await fill(STUDENT_FORM_COPY.emergencyPhone, '0507654321')
  await user.selectOptions(field(STUDENT_FORM_COPY.healthFund), 'clalit')
  await user.click(
    within(dialog).getByRole('checkbox', { name: new RegExp(STUDENT_FORM_COPY.attestCheckbox) }),
  )
  const canvas = dialog.querySelector('canvas')
  if (!canvas) throw new Error('signature canvas not found')
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })

  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.save }))
}

/** `fillAndSaveOneChild`, then presses on to step 3's decision sub-view. */
async function fillOneChildAndReachStep3(
  user: ReturnType<typeof userEvent.setup>,
  name: { firstName: string; lastName: string } = { firstName: 'דניאל', lastName: 'לוי' },
) {
  await fillAndSaveOneChild(user, name)
  await user.click(screen.getByRole('button', { name: STEP2_COPY.continueToStep3 }))
}

describe('§3 Door D — #/add-child opens the shared wizard, not the old 3-field form', () => {
  // These tests drive the whole multi-step wizard through real `userEvent` interactions --
  // filling a full student panel, choosing a payment method, then confirming -- and
  // legitimately take a couple of seconds. Under a loaded, full parallel test run that
  // pushes past vitest's default 5s `testTimeout` and the test times out even though
  // nothing is hung. Give them real headroom instead of a global bump that would mask an
  // unrelated test hanging. Do not "tidy" this away.
  it('F18 replaced: the wizard writes the new child through /me/students/register and refreshes the family without a reload', async () => {
    // The old `AddSibling` (F18) wrote first/last/group_ids straight to `POST
    // /me/students` with no ת.ז., no plan, no health step and no payment step. Door D
    // replaces it wholesale: `#/add-child` now mounts `JoinWizard`, the same wizard every
    // other self-service door shares.
    const user = userEvent.setup()
    globalThis.location.hash = '#/add-child'
    stubCanvasAndPointerCapture()
    const state = stubDoorD()

    render(<App />)

    // Straight to the students step, agreements already current -- never the old form's
    // bare 3 fields, and never step 1's agreements screen either.
    await fillOneChildAndReachStep3(user)
    expect(state.registerCalled).toBe(false)

    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    const before = state.studentsGetCalls
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodCash }))
    await user.click(screen.getByRole('button', { name: STEP3_COPY.submitNoCredit }))

    await waitFor(() => expect(state.registerCalled).toBe(true))
    // Step 4's own "enter app" is what fires `onEnterApp` -- `familyJoined` bumps and
    // `AuthedApp`'s `/me/students` effect re-reads, the same seam the old test proved for
    // `AddSibling`, without a reload.
    await user.click(await screen.findByRole('button', { name: STEP4_COPY.enterApp }))
    await waitFor(() => expect(state.studentsGetCalls).toBeGreaterThan(before))
  }, 20000)

  // §5 -- "already true and breaks quietly": a family adding a fourth child must see only
  // the child THIS run added, and that child's own plan price -- never a sibling's older
  // open balance swept in beside it. `submitJoin.ts` already scopes charges to the
  // students THIS registration created (F19/decision 6); this pins that guarantee at the
  // door D seam, through the real rendered wizard, rather than only at `submitJoin`'s own
  // unit level.
  it('shows only the child being added -- a sibling’s open balance never joins the total or the write', async () => {
    const user = userEvent.setup()
    globalThis.location.hash = '#/add-child'
    stubCanvasAndPointerCapture()
    const state = stubDoorD({
      existingCharges: [
        chargeFixture('ch-new', 'st-new', 30_000),
        // An unrelated sibling's OWN older unpaid charge -- same payer, different child,
        // never created by this run.
        chargeFixture('ch-sibling', 'st-sibling', 55_000),
      ],
    })

    render(<App />)
    await fillOneChildAndReachStep3(user)

    // Step 3 lists exactly the one child being added, and the total is that child's own
    // plan price (₪300) -- never the sum with the sibling's ₪550.
    expect(document.body.textContent).toContain(`1 ${STEP3_COPY.familyCount}`)
    expect(document.body.textContent).toContain('₪300')
    expect(document.body.textContent).not.toContain('₪850')

    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodCash }))
    await user.click(screen.getByRole('button', { name: STEP3_COPY.submitNoCredit }))

    await waitFor(() => expect(state.promiseBodies.length).toBeGreaterThan(0))
    const chargeIdsUsed = [
      ...state.promiseBodies.flatMap((body) => (body.charge_ids as string[] | undefined) ?? []),
      ...state.orderBodies.flatMap((body) => (body.charge_ids as string[] | undefined) ?? []),
    ]
    expect(chargeIdsUsed).toContain('ch-new')
    expect(chargeIdsUsed).not.toContain('ch-sibling')
  }, 20000)

  // §3's "the agreements step is skipped, not absent" -- the three ways `doorSteps.ts`'s
  // `startingStep` can answer, each pinned through the real rendered wizard rather than
  // only at that module's own unit level.
  it('opens on step 2 when the status says agreements are already current', async () => {
    globalThis.location.hash = '#/add-child'
    stubCanvasAndPointerCapture()
    stubDoorD({ onboardingStatus: AGREEMENTS_CURRENT_STATUS })

    render(<App />)

    await screen.findByTestId('join-family-step')
    expect(screen.queryByTestId('join-welcome')).toBeNull()
  })

  it('opens on step 1 when the status says agreements are NOT yet current', async () => {
    globalThis.location.hash = '#/add-child'
    stubCanvasAndPointerCapture()
    stubDoorD({ onboardingStatus: AGREEMENTS_NOT_CURRENT_STATUS })

    render(<App />)

    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('join-family-step')).toBeNull()
  })

  it('opens on step 1 when the status read is still in flight (or failed) -- asking once more is the safe answer', async () => {
    globalThis.location.hash = '#/add-child'
    stubCanvasAndPointerCapture()
    // No `/me/onboarding-status` handler at all -- `stubAuthed`'s fallback 200s every
    // other URL with `{items: []}`, so this specifically answers `null` for the status
    // read the same way a network failure would.
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) => {
        if (url.includes('/api/v1/me/onboarding-status')) return new Response('', { status: 500 })
        if (url.includes('/api/v1/me/studio')) {
          return new Response(
            JSON.stringify({ slug: 'demo', name: 'מועדון בדיקה', logo_url: null }),
            { status: 200 },
          )
        }
        return null
      }),
    )

    render(<App />)

    await screen.findByTestId('join-welcome')
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

describe('§3 Door C — /?invite=<token> opens the shared wizard, not the old gate stack', () => {
  afterEach(() => {
    globalThis.history.pushState({}, '', '/')
  })

  it('mounts the wizard, never the old ConsentGate/HealthGate screens, for a freshly invited parent', async () => {
    // `AccessGate` has already redeemed the token and reloaded the session by the time
    // any of this renders (its own test file covers that half) -- `access.parent` is
    // true from the first `/auth/refresh`. What is under test here is App.tsx's OWN
    // fork: with `?invite=` still on the URL and nothing agreed to yet, the OLD
    // ConsentGate/HealthGate/PaymentSetupGate stack must never render at all.
    window.history.replaceState(null, '', '/?invite=tok-123')
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) => {
        // task 9b -- `AccessGate` redeems the token itself (it is no longer gated on
        // `!access.parent`, so it fires here too) and the invited student now comes
        // from THIS response, not from `/me/students`.
        if (url.includes('/api/v1/auth/accept-invitation')) {
          return new Response(
            JSON.stringify({
              access_token: 'tok',
              expires_in: 900,
              ...SIGNED_IN_BODY,
              invited_student_id: 'st-stub',
              invited_student_name: 'תום ישראלי',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/onboarding-status')) {
          return new Response(
            JSON.stringify({
              steps: [
                { key: 'agreements', complete: false },
                { key: 'students', complete: false },
                { key: 'health', complete: true },
                { key: 'payment', complete: true },
              ],
              next: 'agreements',
            }),
            { status: 200 },
          )
        }
        return null
      }),
    )

    render(<App />)

    await screen.findByTestId('join-welcome')
    // Never the old per-step gates -- this is the wizard's OWN step 1, not a screen
    // asking about an existing child's consent/health/payment one gate at a time.
    expect(screen.queryByTestId('gated-children-loading')).toBeNull()
  })

  // §3's "one row pre-filled": the manager's stub name, seeded into the FIRST child this
  // run adds and nowhere else -- `JoinWizard`'s own `firstStudentDefaults` (task 3a) is
  // applied only while the family list is empty, so a SECOND child added in the same run
  // starts from a blank panel same as door B/D.
  it('prefills the manager\'s stub name into the first child added, and only the first', async () => {
    window.history.replaceState(null, '', '/?invite=tok-123')
    stubCanvasAndPointerCapture()
    vi.stubGlobal(
      'fetch',
      stubAuthed((url) => {
        // task 9b -- the prefilled name now comes from the redemption response, not
        // from `/me/students`'s "exactly one row" heuristic (deleted with the bug it
        // only ever half-covered).
        if (url.includes('/api/v1/auth/accept-invitation')) {
          return new Response(
            JSON.stringify({
              access_token: 'tok',
              expires_in: 900,
              ...SIGNED_IN_BODY,
              invited_student_id: 'st-stub',
              invited_student_name: 'נועה כהן',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/onboarding-status')) {
          return new Response(
            JSON.stringify({
              steps: [
                { key: 'agreements', complete: false },
                { key: 'students', complete: false },
                { key: 'health', complete: true },
                { key: 'payment', complete: true },
              ],
              next: 'agreements',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st-stub',
                  first_name: 'נועה',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'missing',
                  agreement_complete: false,
                },
              ],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/studio')) {
          return new Response(
            JSON.stringify({ slug: 'demo-club', name: 'מועדון הדגמה', logo_url: null }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/public/studios/demo-club/groups')) {
          return new Response(
            JSON.stringify({ items: [{ id: 'g1', name: 'מתחילים', training_weekdays: [0, 2] }] }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/public/studios/demo-club/price-plans')) {
          return new Response(
            JSON.stringify({
              items: [{ id: 'plan-1', name: 'חודשי', monthly_amount_agorot: 30_000, sessions_per_week: 2 }],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/health-templates/tmpl1')) {
          return new Response(
            JSON.stringify({ id: 'tmpl1', kind: 'full', version: 1, schema: HEALTH_SCHEMA }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/health-templates')) {
          return new Response(
            JSON.stringify({ items: [{ id: 'tmpl1', kind: 'full', version: 1 }] }),
            { status: 200 },
          )
        }
        return null
      }),
    )
    const user = userEvent.setup()

    render(<App />)

    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    await screen.findByTestId('join-family-step')
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    const dialog = screen.getByRole('dialog')
    const field = (text: string) =>
      within(dialog).getByLabelText(
        new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
      )

    // The prefilled row: first and last name already filled, before anything is typed.
    expect(field(STUDENT_FORM_COPY.firstName)).toHaveValue('נועה')
    expect(field(STUDENT_FORM_COPY.lastName)).toHaveValue('כהן')

    // Complete the rest of the panel (not first/last name -- already correct) so this
    // child actually joins the list, which is what makes the SECOND dialog's defaults
    // come from `students[0]` rather than the door's own prefill (Step2Trainees.tsx).
    const fill = (text: string, value: string) => user.type(field(text), value)
    await fill(STUDENT_FORM_COPY.nationalId, '100000009')
    await fill(STUDENT_FORM_COPY.birthDate, '2016-04-01')
    await fill(STUDENT_FORM_COPY.address, 'הרצל 1')
    await fill(STUDENT_FORM_COPY.city, 'תל אביב')
    await user.selectOptions(field(STUDENT_FORM_COPY.grade), 'grade_3')
    await fill(STUDENT_FORM_COPY.guardianFirstName, 'דנה')
    await fill(STUDENT_FORM_COPY.guardianLastName, 'כהן')
    await fill(STUDENT_FORM_COPY.guardianNationalId, '100000017')
    await fill(STUDENT_FORM_COPY.guardianPhone, '0501234567')
    await fill(STUDENT_FORM_COPY.guardianEmail, 'noa@example.com')
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

    await fill(STUDENT_FORM_COPY.emergencyPhone, '0507654321')
    await user.selectOptions(field(STUDENT_FORM_COPY.healthFund), 'clalit')
    await user.click(
      within(dialog).getByRole('checkbox', { name: new RegExp(STUDENT_FORM_COPY.attestCheckbox) }),
    )
    const canvas = dialog.querySelector('canvas')
    if (!canvas) throw new Error('signature canvas not found')
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.save }))

    // The second child added in the SAME run starts from a blank panel -- the prefill is
    // a starting point for the first row only, never a value that reappears.
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    const secondDialog = screen.getByRole('dialog')
    expect(
      within(secondDialog).getByLabelText(new RegExp(`^${STUDENT_FORM_COPY.firstName}\\s*\\*?$`)),
    ).toHaveValue('')
  }, 15000)

  // task 9b -- the exact case that was broken: a returning family whose OTHER children
  // are already fully onboarded (`next: null`) used to have the wizard never open at
  // all for the child this link named, because the old gate asked "does this FAMILY
  // still need onboarding" instead of "does the student this invitation named still
  // need registering". `AGREEMENTS_CURRENT_STATUS` is exactly that family-wide "nothing
  // outstanding" answer, and it doubles as the "opens on step 2" half of §3's own rule.
  it('opens the wizard on step 2 even when /me/onboarding-status reports nothing outstanding', async () => {
    window.history.replaceState(null, '', '/?invite=tok-123')
    stubDoorC({ onboardingStatus: AGREEMENTS_CURRENT_STATUS })

    render(<App />)

    await screen.findByTestId('join-family-step')
    expect(screen.queryByTestId('join-welcome')).toBeNull()
  })

  it('opens on step 1 when the invited family\'s consents are NOT current', async () => {
    window.history.replaceState(null, '', '/?invite=tok-123')
    stubDoorC({ onboardingStatus: AGREEMENTS_NOT_CURRENT_STATUS })

    render(<App />)

    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('join-family-step')).toBeNull()
  })

  // §4's own rule -- "not their other children" -- and §2's mechanism: the pre-filled
  // name is whatever `POST /accept-invitation` named, chosen BY ID, never a guess from
  // `/me/students` (deleted with the "exactly one row" heuristic this replaces). Three
  // existing siblings are seeded on the account specifically to prove the choice does
  // not come from that list at all -- Step2Trainees never reads it (see `stubDoorC`).
  it('a family with three existing children sees only the invited child, pre-filled by id, on step 2', async () => {
    window.history.replaceState(null, '', '/?invite=tok-123')
    stubCanvasAndPointerCapture()
    stubDoorC({
      invitedStudentId: 'st-invited-sibling',
      invitedStudentName: 'נועה כהן',
      existingStudents: [
        { id: 'st-1', first_name: 'אורי', last_name: 'לוי' },
        { id: 'st-2', first_name: 'מאיה', last_name: 'לוי' },
        { id: 'st-3', first_name: 'יובל', last_name: 'לוי' },
      ],
    })
    const user = userEvent.setup()

    render(<App />)

    await screen.findByTestId('join-family-step')
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    const dialog = screen.getByRole('dialog')
    const field = (text: string) =>
      within(dialog).getByLabelText(
        new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
      )

    // Chosen by id, not by position in `/me/students` -- which the wizard's own step 2
    // never reads (Step2Trainees builds THIS run's own list from nothing).
    expect(field(STUDENT_FORM_COPY.firstName)).toHaveValue('נועה')
    expect(field(STUDENT_FORM_COPY.lastName)).toHaveValue('כהן')

    const fill = (text: string, value: string) => user.type(field(text), value)
    await fill(STUDENT_FORM_COPY.nationalId, '100000009')
    await fill(STUDENT_FORM_COPY.birthDate, '2016-04-01')
    await fill(STUDENT_FORM_COPY.address, 'הרצל 1')
    await fill(STUDENT_FORM_COPY.city, 'תל אביב')
    await user.selectOptions(field(STUDENT_FORM_COPY.grade), 'grade_3')
    await fill(STUDENT_FORM_COPY.guardianFirstName, 'דנה')
    await fill(STUDENT_FORM_COPY.guardianLastName, 'כהן')
    await fill(STUDENT_FORM_COPY.guardianNationalId, '100000017')
    await fill(STUDENT_FORM_COPY.guardianPhone, '0501234567')
    await fill(STUDENT_FORM_COPY.guardianEmail, 'noa@example.com')
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

    await fill(STUDENT_FORM_COPY.emergencyPhone, '0507654321')
    await user.selectOptions(field(STUDENT_FORM_COPY.healthFund), 'clalit')
    await user.click(
      within(dialog).getByRole('checkbox', { name: new RegExp(STUDENT_FORM_COPY.attestCheckbox) }),
    )
    const canvas = dialog.querySelector('canvas')
    if (!canvas) throw new Error('signature canvas not found')
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.save }))

    // Step 2's own list, once this run's one child is saved into it: exactly one card,
    // and the three existing siblings never reach this screen at all.
    const familyStep = screen.getByTestId('join-family-step')
    const cards = within(familyStep).getAllByRole('heading', { level: 3 })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('נועה כהן')
    for (const siblingName of ['אורי', 'מאיה', 'יובל']) {
      expect(document.body.textContent).not.toContain(siblingName)
    }
  }, 20000)
})

// נגישות: on the public surfaces, off the signed-in ones (owner review, 2026-09-06).
//
// The floating button came to rest ON TOP of the בית tab at phone widths, so Home could not
// be pressed from the bar. `.studio-a11y__fab` publishes an `--a11y-fab-clearance` for
// exactly that and the redesigned Tailwind bar does not read it. Moving the control into
// פרופיל → הגדרות solves it — but the same move could quietly drop a legally required
// statement from the pages a stranger sees, so BOTH halves are pinned here.
describe('where the accessibility button lives', () => {
  it('floats on the sign-in screen, where a visitor has no profile to go to', async () => {
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
    // Not "no accessibility menu anywhere" — פרופיל → הגדרות carries it, and
    // `ProfileScreen.test.tsx` proves that row opens the real panel.
    expect(screen.queryByTestId('a11y-open')).toBeNull()
  })
})
