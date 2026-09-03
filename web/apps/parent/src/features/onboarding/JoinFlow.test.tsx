import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { BillingClient } from '../billing/billingClient'
import type { HealthClient } from '../health/healthClient'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinFlow } from './JoinFlow'

// No `useSession()` mock -- F1/F10's fix means `JoinFlow` no longer calls the hook at
// all. The shell (`JoinShell` in `App.tsx`) reads it once and passes down what this
// component needs, so every render below supplies `displayName` directly, the way the
// shell would.
const DISPLAY_NAME = 'מיכל כהן'

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
        {
          id: 'emergency_contact',
          type: 'phone' as const,
          label: 'טלפון חירום',
          required: true,
        },
      ],
    },
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        {
          id: 'clause_confirmed',
          type: 'clause' as const,
          label: 'אני מאשר/ת',
          required: true,
        },
      ],
    },
  ],
}

const healthClient = {
  agreementStatus: vi.fn(async () => ({
    complete: false,
    terms_accepted: false,
    registration_complete: true,
    health_signed: false,
    club_terms_version: 1,
    registration_defaults: {},
    school_class_required: true,
  })),
  acceptClubTerms: vi.fn(async () => ({
    complete: false,
    terms_accepted: true,
    registration_complete: true,
    health_signed: false,
    club_terms_version: 1,
    registration_defaults: {},
    school_class_required: true,
  })),
  template: vi.fn(async () => ({ id: 'tmpl1', version: 1, schema: HEALTH_SCHEMA })),
  // B2 -- health no longer flushes through this client at all: it travels inside the
  // single `/register` call. Every test below that reaches a successful write asserts
  // this was never called, which is what proves the old per-kid flush is gone.
  submit: vi.fn(async () => ({}) as never),
} as unknown as HealthClient

const billingClient = {
  openCharges: vi.fn(async () => []),
  createOrder: vi.fn(),
  orderForm: vi.fn(),
  createPromise: vi.fn(),
} as unknown as BillingClient

function makePrivacyClient(): PrivacyClient {
  return {
    consents: vi.fn(async () => ({
      outstanding: ['terms', 'privacy'],
      policy_version: 1,
      policy_version_label: 'v1',
      policy_is_draft: false,
    })),
    grant: vi.fn(async () => ({
      outstanding: [],
      policy_version: 1,
      policy_version_label: 'v1',
      policy_is_draft: false,
    })),
  } as unknown as PrivacyClient
}

// C1 rebuilt step 1 as three cards (decision 10) -- terms and privacy no longer share
// one combined "app" card and tick, so this helper now ticks all three.
async function acceptWelcomeStep(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-welcome')
  await user.click(screen.getByTestId('join-welcome-terms-check'))
  await user.click(screen.getByTestId('join-welcome-privacy-check'))
  await user.click(screen.getByTestId('join-welcome-club-check'))
  await user.click(screen.getByTestId('join-welcome-continue'))
}

/** Fills the family step for one self-training adult (no separate child), the
 *  shortest path to a single local student ready for the health step. */
async function fillFamilyStepForSelf(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-family-step')
  await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
  await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
  await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
  await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')
  await user.click(screen.getByTestId('join-add-self'))
  await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
  await user.click(screen.getByTestId('join-submit'))
}

/** Signs the currently-queued kid's health declaration -- the "healthy, nothing to
 *  report" branch, same shape every existing health test in this file used. */
async function signCurrentHealthDeclaration(
  user: ReturnType<typeof userEvent.setup>,
  phone: string,
) {
  await screen.findByTestId('health-opening-question')
  await user.click(screen.getByTestId('health-opening-healthy'))
  await user.type(screen.getByLabelText(t('he', 'health.declaration.signatureTyped')), 'מיכל כהן')
  await user.type(screen.getByLabelText('טלפון חירום'), phone)
  await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
  await user.click(screen.getByTestId('health-sign-continue'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Several tests reuse the same token ('live-token-123456'), and JoinFlow persists a
  // real localStorage draft under it (decision 3). Without this, a test that never
  // reaches a successful submit (the national-id-error test, deliberately) leaves its
  // draft behind for the next test using the same token to restore by accident.
  localStorage.clear()
})

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
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
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
})

describe('JoinFlow', () => {
  // Several tests below drive the whole multi-step wizard through real `userEvent`
  // interactions -- typing a full family/student panel, signing a health declaration,
  // reaching the confirm gate, sometimes twice over for two students -- and legitimately
  // take a couple of seconds each. Under a loaded, full parallel test run that pushes
  // past vitest's default 5s `testTimeout` and a perfectly fine test times out even
  // though nothing is hung. Each such test carries an explicit, generous per-test
  // timeout for that reason; do not "tidy" those away, and do not raise the global
  // default instead -- that would hide a real hang in some unrelated fast test.
  it('writes nothing through steps 1-3, then fires exactly one write from step 4 carrying the family, health and club terms together', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    let registerCalls = 0
    let submittedBody: unknown = null
    let studioActive = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: 'parent@example.invalid',
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          registerCalls += 1
          submittedBody = JSON.parse(String(init.body))
          studioActive = true
          return new Response(
            JSON.stringify({
              person_id: 'p1',
              student_ids: ['st1'],
              charges_created: 0,
              already_registered: false,
            }),
            { status: 201 },
          )
        }
        if (url.includes('/api/v1/auth/refresh') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              access_token: 'tok-after-refresh',
              expires_in: 900,
              access: { staff: false, parent: true },
              studios: studioActive
                ? [{ studio_id: 's1', studio_name: 'מועדון הדגמה', studio_is_demo: false, person_id: 'p1', roles: [], is_guardian: true }]
                : [],
              active_studio_id: studioActive ? 's1' : null,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          if (!studioActive) return new Response('', { status: 401 })
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
                  first_name: 'מיכל',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'signed',
                  agreement_complete: true,
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        onComplete={onComplete}
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await fillFamilyStepForSelf(user)

    // Step 2's submit must not have written anything -- decision 2.
    expect(registerCalls).toBe(0)

    // Step 3: signs locally, still nothing written.
    await signCurrentHealthDeclaration(user, '0501111111')
    expect(registerCalls).toBe(0)
    expect(healthClient.submit).not.toHaveBeenCalled()

    // Step 4's own gate -- confirm, not the payment methods screen (wave D's).
    await screen.findByTestId('join-confirm-step')
    expect(registerCalls).toBe(0)
    await user.click(screen.getByTestId('join-confirm-submit'))

    // The write, and reaching the real payment step behind it (openCharges resolves
    // [], so PaymentSetup reports nothing owed and the wizard advances to done).
    await screen.findByTestId('join-done-step')
    expect(registerCalls).toBe(1)
    expect(healthClient.submit).not.toHaveBeenCalled()

    expect(submittedBody).toMatchObject({
      first_name: 'מיכל',
      last_name: 'כהן',
      club_terms_accepted: true,
      signer: { national_id: '100000017', address: 'הרצל 12', city: 'רעננה' },
      children: [
        {
          first_name: 'מיכל',
          last_name: 'כהן',
          self_student: true,
          health: expect.objectContaining({ template_id: 'tmpl1' }),
        },
      ],
    })

    await user.click(await screen.findByTestId('join-done-enter'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  }, 15000)

  // F9 -- "a brand-new family is registered but never signs or pays." Their session had
  // no active studio (nobody belonged to a club at sign-in); before this fix `/register`
  // succeeded and the very next read, `/me/students`, ran on the STALE token and 401'd
  // "no active studio" -- the fix reloads the session (`refresh()`) BEFORE that read.
  // Asserted on the real network call sequence (real `apiFetch`/`refresh`, only `fetch`
  // itself is stubbed), not by mocking `/me/students` to hand back data -- that would
  // prove the component can render a list, not that the session gap is closed.
  it('F9 -- reloads the session before /me/students, so /me/students never sees a stale-token 401', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          calls.push('register')
          // The write itself is what creates this family's first membership --
          // mirroring `_build_session`'s real fallback (app/routers/identity.py):
          // the studio only becomes resolvable AFTER this call returns. The access
          // token already in the browser (minted at sign-in, before any membership
          // existed) still carries none of this -- it is not reissued by this call.
          return new Response(JSON.stringify({ student_ids: ['st1'] }), { status: 201 })
        }
        if (url.includes('/api/v1/auth/refresh') && init?.method === 'POST') {
          calls.push('refresh')
          // The real endpoint re-derives the active studio from the DATABASE, not
          // from whatever token was presented -- so a refresh AFTER the write above
          // always comes back correctly scoped, regardless of what was stale before it.
          return new Response(
            JSON.stringify({
              access_token: 'tok-scoped-to-studio',
              expires_in: 900,
              access: { staff: false, parent: true },
              studios: [
                {
                  studio_id: 's1',
                  studio_name: 'מועדון הדגמה',
                  studio_is_demo: false,
                  person_id: 'p1',
                  roles: [],
                  is_guardian: true,
                },
              ],
              active_studio_id: 's1',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          // The real `TenantSessionDep` decodes `studio_id` OUT OF THE PRESENTED
          // TOKEN (`app/core/tenancy.py`) -- it does not re-query the database for
          // "does this identity have a studio now." A request carrying anything other
          // than the freshly-refreshed, studio-scoped token is exactly the stale
          // caller F9 describes, and fails closed with a 401.
          const headers = init?.headers as Record<string, string> | undefined
          if (headers?.Authorization !== 'Bearer tok-scoped-to-studio') {
            calls.push('me/students:401')
            return new Response(JSON.stringify({ detail: { code: 'no_active_studio' } }), {
              status: 401,
            })
          }
          calls.push('me/students:ok')
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
                  first_name: 'דנה',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'missing',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await fillFamilyStepForSelf(user)
    await signCurrentHealthDeclaration(user, '0501111111')
    await screen.findByTestId('join-confirm-step')
    await user.click(screen.getByTestId('join-confirm-submit'))

    // Reaches the done step -- proving the family's own new children were actually
    // found (an empty/failed `/me/students` read would have left `PaymentSetup`
    // reading `students=[]`, indistinguishable from "nothing to configure").
    await screen.findByTestId('join-done-step')

    expect(calls).toContain('refresh')
    expect(calls).toContain('me/students:ok')
    // The proof: /me/students is never asked before the session carries the new
    // studio. A pre-fix JoinFlow called `refreshStudents()` immediately after
    // `register` with no reload in between, so this would contain 'me/students:401'.
    expect(calls).not.toContain('me/students:401')
    expect(calls.indexOf('refresh')).toBeLessThan(calls.indexOf('me/students:ok'))
  }, 15000)

  it('shows the national-id-specific message when the server rejects the id, on the confirm gate', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          return new Response(
            JSON.stringify({
              detail: { code: 'national_id_invalid', field: 'signer_national_id' },
            }),
            { status: 422 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await fillFamilyStepForSelf(user)
    await signCurrentHealthDeclaration(user, '0501111111')
    await screen.findByTestId('join-confirm-step')
    await user.click(screen.getByTestId('join-confirm-submit'))

    await screen.findByText(t('he', 'people.join.nationalIdInvalid'))
    expect(screen.queryByText(t('he', 'common.error.generic'))).toBeNull()
    // Never advanced past the confirm gate on a failed write.
    expect(screen.getByTestId('join-confirm-step')).toBeInTheDocument()
  }, 15000)

  it('the first step has no back button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('onboarding-wizard-back')).toBeNull()
  })

  // C1/F2 -- §6 adds `logo_url` to `OnboardingInfoOut`, and `JoinWelcomeStep` renders it
  // on the welcome screen (decision 11). Driven through the actual response shape the
  // public onboarding fetch answers with, not a hand-built `logoUrl` prop -- proving the
  // seam `fetch -> JoinInfo -> JoinWelcomeStep` actually carries the field, rather than
  // silently dropping it the way it was dropped before this piece threaded it through.
  it('threads logo_url from the public onboarding response into the welcome step', async () => {
    const logoUrl = '/api/v1/public/studios/demo-club/logo'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
              logo_url: logoUrl,
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    const logo = await screen.findByTestId('join-welcome-logo')
    expect(logo).toHaveAttribute('src', expect.stringContaining(logoUrl))
  })

  // F1 -- `JoinWelcomeStep` used to call its own `useSession()`, so back-navigation
  // remounted it and it restarted at `status: 'loading'`, which its render treated as
  // "not signed in" and showed a sign-in wall for one tick before flipping back. Fixed
  // by moving the sign-in fork to the shell (`JoinShell`, `App.tsx`) and removing the
  // hook call from this step entirely -- this test mounts the flow the way the shell
  // does (already signed in, via the `displayName` prop, never `useSession()`), so the
  // symptom -- a sign-in wall flashing on back-navigation -- has nothing left to trigger
  // it from. Asserted as the SYMPTOM, not the absence of an import: step 1 renders
  // synchronously on back-navigation, and `SignIn`'s own testid never appears.
  it('renders step 1 immediately on back-navigation, never a sign-in wall (F1)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await screen.findByTestId('join-family-step')

    // `getAllByTestId`, not `getByTestId`: `JoinFamilyStep` (not this piece's file --
    // see the prompt's file list) renders the chrome's own back button AND
    // `WizardNavButtons`'s, both under the same testid. Either one triggers the same
    // `onBack`.
    await user.click(screen.getAllByTestId('onboarding-wizard-back')[0]!)

    // Step 1, right away -- not a loading gap, not a sign-in wall.
    expect(screen.getByTestId('join-welcome')).toBeInTheDocument()
    expect(screen.queryByTestId('sign-in')).toBeNull()
    expect(screen.getByTestId('join-welcome-terms-check')).toBeInTheDocument()
  })

  // F5 -- `welcome` and `family` used to render bare (no `pageStyle` container), while
  // `health`, `payment` and `done` were each wrapped individually. The primary button on
  // the unwrapped two landed flush in the corner, underneath the accessibility FAB, and
  // Playwright could not click it. Fixed by computing every step's content once and
  // wrapping it in exactly ONE place -- asserted here by checking the padding actually
  // lands on the DOM, not by re-reading the source.
  it('wraps steps 1 and 2 in the same padded container as the later steps (F5)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    // Checked against the raw `style` attribute rather than `toHaveStyle` -- jsdom's CSS
    // engine does not resolve `var(...)` custom properties, so a computed-style
    // assertion reads back "0" for every one of them regardless of what was actually
    // set. The attribute is what real browsers (and Playwright, per §"LOOK AT IT")
    // receive, and it is what proves the wrapper is there.
    await screen.findByTestId('join-welcome')
    expect(screen.getByTestId('join-welcome').parentElement?.getAttribute('style')).toContain(
      'padding: var(--space-4)',
    )

    await acceptWelcomeStep(user)
    await screen.findByTestId('join-family-step')
    expect(
      screen.getByTestId('join-family-step').parentElement?.getAttribute('style'),
    ).toContain('padding: var(--space-4)')
  })

  it('advances the health queue from local drafts for both kids, then writes both declarations in the same single request', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    let registerCalls = 0
    let submittedBody: unknown = null
    let studioActive = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          registerCalls += 1
          submittedBody = JSON.parse(String(init.body))
          studioActive = true
          return new Response(JSON.stringify({ student_ids: ['st1', 'st2'] }), { status: 201 })
        }
        if (url.includes('/api/v1/auth/refresh')) {
          return new Response(
            JSON.stringify({
              access_token: 'tok',
              expires_in: 900,
              access: { staff: false, parent: true },
              studios: [],
              active_studio_id: studioActive ? 's1' : null,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
                  first_name: 'מיכל',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'signed',
                  agreement_complete: true,
                },
                {
                  id: 'st2',
                  first_name: 'דנה',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'signed',
                  agreement_complete: true,
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        onComplete={onComplete}
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await screen.findByTestId('join-family-step')
    await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')
    // F6 -- each student is its own panel now: open, fill, save, then the next.
    await user.click(screen.getByTestId('join-add-self'))
    let panel = screen.getByTestId(/^join-family-panel-/)
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    await user.click(screen.getByTestId('join-add-child'))
    panel = screen.getByTestId(/^join-family-panel-/)
    // Index [0]: a fresh row defaults to "minor" until a birthdate says otherwise, so
    // the family block's own "שם מלא" is already on screen alongside the child's own.
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'דנה כהן')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000009',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    // Kid 1 (the self row). Local queue advance -- the mocked /me/students above
    // reports BOTH kids already 'signed', which would end the queue instantly if it
    // were consulted; it never is until the write.
    await signCurrentHealthDeclaration(user, '0501111111')

    // Still local, kid 2's turn.
    await screen.findByTestId('health-opening-question')
    expect(screen.queryByTestId('join-confirm-step')).toBeNull()
    expect(registerCalls).toBe(0)

    await signCurrentHealthDeclaration(user, '0502222222')

    await screen.findByTestId('join-confirm-step')
    expect(registerCalls).toBe(0)
    expect(healthClient.submit).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('join-confirm-submit'))

    await screen.findByTestId('join-done-step')
    expect(registerCalls).toBe(1)
    expect(healthClient.submit).not.toHaveBeenCalled()
    const body = submittedBody as { children: { health?: unknown }[] }
    expect(body.children).toHaveLength(2)
    expect(body.children[0]?.health).toEqual(expect.objectContaining({ template_id: 'tmpl1' }))
    expect(body.children[1]?.health).toEqual(expect.objectContaining({ template_id: 'tmpl1' }))

    await user.click(screen.getByTestId('join-done-enter'))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  }, 15000)

  // -- wave E / F19 / decision 6 ---------------------------------------------------
  it('scopes health and payment to the students THIS run created, never the whole family', async () => {
    // A RETURNING family: `/me/students` (read after the write, via `refresh()`) reports
    // an EXISTING sibling who already owes money, alongside the new student this
    // submission just created. Before the fix, `JoinFlow` handed `PaymentSetup` every
    // row `/me/students` returned; decision 6 says it must hand it only what THIS run's
    // `register()` response (`student_ids`) says it created.
    const user = userEvent.setup()
    const onComplete = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: 'parent@example.invalid',
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          // ONLY the new child -- an existing sibling ('st-existing') is not part of
          // what this submission created, even though the family already has one.
          return new Response(JSON.stringify({ student_ids: ['st-new'] }), { status: 201 })
        }
        if (url.includes('/api/v1/auth/refresh') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              access_token: 'tok-after-refresh',
              expires_in: 900,
              access: { staff: false, parent: true },
              studios: [
                {
                  studio_id: 's1',
                  studio_name: 'מועדון הדגמה',
                  studio_is_demo: false,
                  person_id: 'p1',
                  roles: [],
                  is_guardian: true,
                },
              ],
              active_studio_id: 's1',
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          // The WHOLE family: the pre-existing sibling AND the new child.
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st-existing',
                  first_name: 'דנה',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'signed',
                  agreement_complete: true,
                },
                {
                  id: 'st-new',
                  first_name: 'מיכל',
                  last_name: 'כהן',
                  status: 'active',
                  health_status: 'signed',
                  agreement_complete: true,
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    // Both children owe money -- if the sibling's charge is ever shown, the scoping
    // fix has not landed.
    vi.mocked(billingClient.openCharges).mockResolvedValueOnce([
      { id: 'c-existing', student_id: 'st-existing', amount_agorot: 30_000 } as never,
      { id: 'c-new', student_id: 'st-new', amount_agorot: 30_000 } as never,
    ])

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        onComplete={onComplete}
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await fillFamilyStepForSelf(user)
    await signCurrentHealthDeclaration(user, '0501111111')
    await screen.findByTestId('join-confirm-step')
    await user.click(screen.getByTestId('join-confirm-submit'))

    await screen.findByTestId('payment-setup')
    // One answer for the family (the sibling's charge would make this "multiple").
    await user.click(screen.getByTestId('setup-method-cash'))

    await screen.findByTestId('setup-row-st-new')
    expect(screen.queryByTestId('setup-row-st-existing')).toBeNull()
  }, 15000)

  it('a failed write keeps the family on the confirm gate, with an error, and never reaches done', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          return new Response(JSON.stringify({ detail: { code: 'refused' } }), { status: 422 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        onComplete={onComplete}
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await fillFamilyStepForSelf(user)
    await signCurrentHealthDeclaration(user, '0501111111')

    await screen.findByTestId('join-confirm-step')
    await user.click(screen.getByTestId('join-confirm-submit'))

    await screen.findByText(t('he', 'common.error.generic'))
    expect(screen.getByTestId('join-confirm-step')).toBeInTheDocument()
    expect(screen.queryByTestId('join-done-step')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  }, 15000)

  it('persists the family draft to localStorage as it is typed, and restores it on a same-tab return', async () => {
    const user = userEvent.setup()
    const token = 'draft-token-654321'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(`/api/v1/public/onboarding/${token}`)) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    const { unmount } = render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token={token}
      />,
    )

    await acceptWelcomeStep(user)
    await screen.findByTestId('join-family-step')
    await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')

    await waitFor(() => {
      // localStorage, not sessionStorage (decision 3) -- a closed-tab simulation
      // clears sessionStorage first to prove the draft does not live there.
      const saved = localStorage.getItem(`join-draft:${token}`)
      expect(saved).not.toBeNull()
      const parsed = JSON.parse(saved!) as { family: { signerNationalId: string; address: string } }
      expect(parsed.family.signerNationalId).toBe('100000017')
      expect(parsed.family.address).toBe('הרצל 12')
    })
    expect(sessionStorage.getItem(`join-draft:${token}`)).toBeNull()

    // The closed-tab simulation itself: sessionStorage really would be gone at this
    // point in a real browser; localStorage (what the draft actually lives in) is not
    // touched by it.
    sessionStorage.clear()

    unmount()
    cleanup()

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token={token}
      />,
    )

    await acceptWelcomeStep(user)
    const restoredField = await screen.findByLabelText(t('he', 'people.join.nationalId'))
    await waitFor(() => expect(restoredField).toHaveValue('100000017'))
    expect(screen.getByLabelText(t('he', 'people.join.address'))).toHaveValue('הרצל 12')
  })

  // F7 -- "Assert the seam": driven through the real submit function
  // (`submitRegistration`, fired by the confirm gate's button), not a hand-built props
  // object, all the way from step 2's panels to the actual request body. Two full
  // student panels plus two signed health declarations -- see the note above.
  it('F7 -- two students in one submission reach the real register body with DIFFERENT other_parent data', async () => {
    const user = userEvent.setup()
    let submittedBody: { children: { other_parent: { first_name: string } | null }[] } | null =
      null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          submittedBody = JSON.parse(String(init.body)) as typeof submittedBody
          return new Response(JSON.stringify({ student_ids: ['st1', 'st2'] }), { status: 201 })
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await acceptWelcomeStep(user)
    await screen.findByTestId('join-family-step')
    await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')

    // First minor -- names its own second parent.
    await user.click(screen.getByTestId('join-add-child'))
    let panel = screen.getByTestId(/^join-family-panel-/)
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'דנה')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-01-01')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000009',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[1]!, 'דוד כהן')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    // Second minor -- "same as previous" defaults on; untick it and type a different name.
    await user.click(screen.getByTestId('join-add-child'))
    panel = screen.getByTestId(/^join-family-panel-/)
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'יוסי')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2017-06-01')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000058',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ב')
    await user.click(within(panel).getByTestId(/^join-family-same-as-previous-/))
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[1]!, 'שרה לוי')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))

    await user.click(screen.getByTestId('join-submit'))

    await signCurrentHealthDeclaration(user, '0501111111')
    await signCurrentHealthDeclaration(user, '0502222222')

    await screen.findByTestId('join-confirm-step')
    await user.click(screen.getByTestId('join-confirm-submit'))

    await waitFor(() => expect(submittedBody).not.toBeNull())
    const body = submittedBody!
    expect(body.children).toHaveLength(2)
    expect(body.children[0]?.other_parent?.first_name).toBe('דוד')
    expect(body.children[1]?.other_parent?.first_name).toBe('שרה')
    expect(body.children[0]?.other_parent?.first_name).not.toBe(
      body.children[1]?.other_parent?.first_name,
    )
  }, 15000)
})
