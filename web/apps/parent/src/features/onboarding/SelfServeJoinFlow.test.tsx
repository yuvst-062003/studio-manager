import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { BillingClient } from '../billing/billingClient'
import type { HealthClient } from '../health/healthClient'
import type { PrivacyClient } from '../privacy/privacyClient'
import { SelfServeJoinFlow } from './SelfServeJoinFlow'

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
  acceptClubTerms: vi.fn(async () => ({}) as never),
  template: vi.fn(async () => ({ id: 'tmpl1', version: 1, schema: HEALTH_SCHEMA })),
  submit: vi.fn(async () => ({}) as never),
} as unknown as HealthClient

const billingClient = {
  openCharges: vi.fn(async () => []),
  createOrder: vi.fn(),
  orderForm: vi.fn(),
  createPromise: vi.fn(),
} as unknown as BillingClient

/** Decision 13: the typed-name fallback is gone -- drawing is the only way to sign. Fires a
 *  real pointer path on the canvas rather than typing into a field that no longer exists.
 *  `fireEvent`, not a raw `dispatchEvent`: each call is wrapped in `act()`, so the pad's
 *  `hasInk` state has actually flushed by the time the next event fires. Firing all three
 *  natively in one synchronous block leaves `pointerup`'s handler closed over the
 *  pre-update `hasInk`, and the draw never emits a signature. */
function signByDrawing() {
  const canvas = screen.getByTestId('signature-canvas')
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
}

function makePrivacyClient(): PrivacyClient {
  return {
    consents: vi.fn(async () => ({
      outstanding: [],
      policy_version: 2,
      policy_version_label: 'v2',
      policy_is_draft: false,
    })),
    grant: vi.fn(async () => ({}) as never),
  } as unknown as PrivacyClient
}

type Handlers = {
  duplicateResult?: boolean
  registerStudentIds?: string[]
  onboardingStatus?: { steps: { key: string; complete: boolean }[]; next: string | null }
  existingStudents?: { id: string; first_name: string; last_name: string }[]
  // Decision 11: the same `/api/v1/me/studio` read this component already makes for
  // `slug` also carries `logo_url` (and `name`) -- `StudioOut`'s own fields
  // (`app/schemas/studio.py`). `null`/`''` by default so the existing tests, which never
  // cared about the logo, keep passing unchanged.
  studioLogoUrl?: string | null
  studioName?: string
}

function stubFetch(handlers: Handlers = {}) {
  const {
    duplicateResult = false,
    registerStudentIds = ['st-new'],
    onboardingStatus = {
      steps: [
        { key: 'agreements', complete: false },
        { key: 'students', complete: true },
        { key: 'health', complete: true },
        { key: 'payment', complete: true },
      ],
      next: 'agreements',
    },
    existingStudents = [],
    studioLogoUrl = null,
    studioName = '',
  } = handlers
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/api/v1/me/studio')) {
        return new Response(
          JSON.stringify({ slug: 'demo-club', logo_url: studioLogoUrl, name: studioName }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo-club/groups')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }] }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo-club/price-plans')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      if (url.includes('/api/v1/me/onboarding-status')) {
        return new Response(JSON.stringify(onboardingStatus), { status: 200 })
      }
      if (url.includes('/api/v1/me/students/duplicate-check')) {
        return new Response(JSON.stringify({ duplicate: duplicateResult }), { status: 200 })
      }
      if (url.includes('/api/v1/me/students/register') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            person_id: 'p1',
            student_ids: registerStudentIds,
            charges_created: 0,
            already_registered: true,
          }),
          { status: 201 },
        )
      }
      if (url.includes('/api/v1/trial-bookings/self') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            studio_slug: 'demo-club',
            studio_name: 'מועדון הדגמה',
            students: [{ id: 'st-trial' }],
            bookings: [],
          }),
          { status: 201 },
        )
      }
      if (url.includes('/api/v1/auth/refresh')) {
        return new Response(
          JSON.stringify({
            access_token: 'tok',
            expires_in: 900,
            access: { staff: false, parent: true },
            studios: [],
            active_studio_id: 's1',
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/me/students')) {
        return new Response(
          JSON.stringify({
            items: existingStudents.map((row) => ({
              ...row,
              status: 'active',
              health_status: 'signed',
              agreement_complete: true,
            })),
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }),
  )
  return calls
}

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

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('SelfServeJoinFlow -- Doors C and D', () => {
  it('Door D shows the agreements step when the status says they are not current', async () => {
    stubFetch()
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    await screen.findByTestId('join-welcome')
  })

  // F5 -- Doors C/D share `JoinFlow.tsx`'s `pageStyle` byte-for-byte but, unlike Door B,
  // never reserved the accessibility FAB's corner at all (`.studio-a11y__fab`,
  // primitives.css, is `position: fixed` above every route including these two). The
  // fix reserves it the same way Door B does: `paddingBlockEnd: var(--a11y-fab-clearance)`,
  // the token defined once in `primitives.css` beside `.studio-a11y__fab` itself. jsdom
  // does not do real layout, so this only proves the mechanism is wired up -- see the
  // equivalent test and comment in `JoinFlow.test.tsx` for why a geometry assertion
  // would not measure anything here.
  it('reserves the FAB clearance as padding-block-end, so the corner is never covered (F5)', async () => {
    stubFetch()
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    await screen.findByTestId('join-welcome')
    const style = screen.getByTestId('join-welcome').parentElement?.getAttribute('style')
    expect(style).toContain('padding-block-end: var(--a11y-fab-clearance)')
  })

  // Decision 11 -- "the club logo appears on the welcome screen and in each popup
  // header." Doors C and D used to hardcode `logoUrl={null}` into `JoinWelcomeStep`, so
  // a parent arriving from a manager's invitation (Door C) or adding a sibling (Door D)
  // saw no logo even when the studio has one. Driven through the REAL data path: the
  // `/api/v1/me/studio` read this component already makes for `slug` (no new backend
  // route needed -- `StudioOut.logo_url` was already in that response), never a
  // hand-built prop.
  //
  // The stub deliberately answers with the AUTHENTICATED shape `StudioOut.logo_url`
  // actually has (`/api/v1/studio/logo?v=...`, `app/services/structure/logo.py`) --
  // a real browser check (Playwright, against the live dev backend) caught that pointing
  // a plain `<img>` at that path 401s, since an image tag never carries the bearer
  // token that route needs. This asserts the component does NOT forward that URL
  // verbatim: it rebuilds the loadable, unauthenticated `/public/studios/{slug}/logo`
  // path from `slug`, reading `logo_url` only as "this studio has one."
  it('Door D shows the club logo, rebuilt as the public path -- never the authenticated one the raw field carries', async () => {
    stubFetch({ studioLogoUrl: '/api/v1/studio/logo?v=1234', studioName: 'מועדון הדגמה' })
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    const logo = await screen.findByTestId('join-welcome-logo')
    expect(logo).toHaveAttribute(
      'src',
      expect.stringContaining('/api/v1/public/studios/demo-club/logo'),
    )
    expect(logo.getAttribute('src')).not.toContain('/api/v1/studio/logo')
  })

  it('Door D shows no logo when the studio has none', async () => {
    stubFetch({ studioLogoUrl: null })
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    await screen.findByTestId('join-welcome')
    expect(screen.queryByTestId('join-welcome-logo')).toBeNull()
  })

  it('Door D skips straight to the students step, with one empty panel already open, when agreements are current', async () => {
    stubFetch({
      onboardingStatus: {
        steps: [
          { key: 'agreements', complete: true },
          { key: 'students', complete: true },
          { key: 'health', complete: true },
          { key: 'payment', complete: true },
        ],
        next: null,
      },
    })
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    await screen.findByTestId('join-family-step')
    expect(screen.queryByTestId('join-welcome')).toBeNull()
    // One empty panel already open -- not the collapsed list, not a second "+" tap away.
    expect(screen.getByTestId(/^join-family-panel-/)).toBeInTheDocument()
    // Door D never shows the signer's own ת.ז./address/city/phone -- already on file.
    expect(screen.queryByLabelText(t('he', 'people.join.address'))).toBeNull()
    expect(screen.queryByLabelText(t('he', 'people.join.city'))).toBeNull()
    expect(screen.queryByTestId('join-email')).toBeNull()
  })

  // The next two tests drive the whole wizard through real `userEvent` interactions --
  // filling a student panel, submitting, and (for the trial fork) signing a health
  // declaration too -- which legitimately takes seconds. Under a loaded, full parallel
  // test run that pushes past vitest's default 5s `testTimeout` and the test times out
  // even though nothing is actually hung. Give them real headroom instead of a global
  // bump that would mask an unrelated test hanging. Do not "tidy" this away.
  it('the duplicate check refuses in the panel, before any health declaration is filled', async () => {
    stubFetch({
      duplicateResult: true,
      onboardingStatus: {
        steps: [
          { key: 'agreements', complete: true },
          { key: 'students', complete: true },
          { key: 'health', complete: true },
          { key: 'payment', complete: true },
        ],
        next: null,
      },
    })
    const user = userEvent.setup()
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    const panel = await screen.findByTestId(/^join-family-panel-/)
    // A minor by age -- the family block also renders "שם מלא"/"ת.ז.", so the CHILD's
    // own fields are addressed positionally, same as the existing F7 tests do.
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2016-04-01')
    await user.type(within(panel).getAllByLabelText(t('he', 'people.join.fullName'))[0]!, 'נועה לוי')
    await user.type(
      within(panel).getAllByLabelText(t('he', 'people.join.nationalId'))[0]!,
      '100000009',
    )
    await user.type(within(panel).getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    await screen.findByText(t('he', 'people.sibling.duplicate'))
    // Refused in the panel -- never reached the health step at all.
    expect(screen.queryByTestId('health-opening-question')).toBeNull()
    expect(healthClient.template).not.toHaveBeenCalled()
  }, 15000)

  it("Door D's trial fork writes the student as trial with no charge; the member fork prices and charges", async () => {
    const calls = stubFetch({
      onboardingStatus: {
        steps: [
          { key: 'agreements', complete: true },
          { key: 'students', complete: true },
          { key: 'health', complete: true },
          { key: 'payment', complete: true },
        ],
        next: null,
      },
    })
    const user = userEvent.setup()
    render(
      <SelfServeJoinFlow
        billingClient={billingClient}
        displayName={DISPLAY_NAME}
        door="addChild"
        healthClient={healthClient}
        locale="he"
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
      />,
    )
    const panel = await screen.findByTestId(/^join-family-panel-/)
    await user.click(within(panel).getByRole('radio', { name: t('he', 'people.join.trialChoice') }))
    await user.type(within(panel).getByLabelText(t('he', 'people.join.fullName')), 'נועה טרייל')
    await user.type(within(panel).getByLabelText(t('he', 'people.join.birthdate')), '2018-01-01')
    await user.click(within(panel).getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(within(panel).getByTestId(/^join-family-save-/))
    await user.click(screen.getByTestId('join-submit'))

    // Local queue: one trial kid, healthy branch.
    await screen.findByTestId('health-opening-question')
    await user.click(screen.getByTestId('health-opening-healthy'))
    signByDrawing()
    await user.type(screen.getByLabelText('טלפון חירום'), '0501111111')
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    await screen.findByTestId('self-serve-confirm-step')
    await user.click(screen.getByTestId('self-serve-confirm-submit'))

    await waitFor(() =>
      expect(calls.some((url) => url.includes('/api/v1/trial-bookings/self'))).toBe(true),
    )
    // Member endpoint never called -- no member row in this run.
    expect(calls.some((url) => url.includes('/api/v1/me/students/register'))).toBe(false)
  }, 15000)
})
