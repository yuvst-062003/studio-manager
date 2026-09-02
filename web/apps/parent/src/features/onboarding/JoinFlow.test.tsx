import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { BillingClient } from '../billing/billingClient'
import type { HealthClient } from '../health/healthClient'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinFlow } from './JoinFlow'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => ({
      status: 'signed-in',
      access: { parent: true, staff: false },
      studios: [],
      activeStudioId: null,
      devTools: false,
      actingAsPersonId: null,
      actingAsLabel: null,
      activeStudioName: null,
      displayName: 'מיכל כהן',
      reload: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
    }),
  }
})

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

async function acceptWelcomeStep(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-welcome')
  await user.click(screen.getByTestId('join-welcome-app-check'))
  await user.click(screen.getByTestId('join-welcome-club-check'))
  await user.click(screen.getByTestId('join-welcome-continue'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Several tests reuse the same token ('live-token-123456'), and JoinFlow now persists
  // a real sessionStorage draft under it (Phase 5). Without this, a test that never
  // reaches a successful completion (the national-id-error test, deliberately) leaves
  // its draft behind for the next test using the same token to restore by accident.
  sessionStorage.clear()
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
  it('walks the family through terms and registration, then hands back to the app', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    let submittedBody: unknown = null
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
          submittedBody = JSON.parse(String(init.body))
          return new Response(
            JSON.stringify({
              person_id: 'p1',
              student_ids: ['st1'],
              charges_created: 1,
              already_registered: false,
            }),
            { status: 201 },
          )
        }
        if (url.includes('/api/v1/me/students')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'st1',
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
        healthClient={healthClient}
        locale="he"
        onComplete={onComplete}
        privacyClient={makePrivacyClient()}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await screen.findByTestId('join-welcome')
    expect(screen.queryByText(t('he', 'people.join.title'))).toBeNull()
    expect(screen.queryByTestId('join-form')).toBeNull()
    expect(screen.queryByTestId('join-family-step')).toBeNull()
    expect(screen.getByTestId('join-onboarding-rail')).toBeInTheDocument()
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 1 מתוך 4')
    expect(screen.getByTestId('join-onboarding-rail-welcome')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByTestId('join-onboarding-rail-family')).not.toHaveAttribute(
      'aria-current',
      'step',
    )

    await acceptWelcomeStep(user)

    await screen.findByTestId('join-family-step')
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 2 מתוך 4')
    expect(screen.getByTestId('join-onboarding-rail-family')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')
    await user.click(screen.getByTestId('join-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.join.fullName'))[2]!, 'דנה כהן')
    await user.type(screen.getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[2]!, '100000009')
    await user.type(screen.getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

    // Nothing owed (openCharges resolves []) and no health draft to flush (this child
    // is already `agreement_complete`), so the wizard lands straight on the done
    // screen -- which still needs its own explicit "enter the app" press.
    await user.click(await screen.findByTestId('join-done-enter'))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(submittedBody).toMatchObject({
      first_name: 'מיכל',
      last_name: 'כהן',
      phone: '0548123456',
      signer: {
        national_id: '100000017',
        address: 'הרצל 12',
        city: 'רעננה',
        relation: 'mother',
      },
      children: [
        {
          first_name: 'דנה',
          last_name: 'כהן',
          birthdate: '2016-03-14',
          group_ids: ['g1'],
          self_student: false,
          national_id: '100000009',
          grade: 'ד',
        },
      ],
    })
    expect(screen.queryByTestId('join-done')).toBeNull()
  })

  it('shows the national-id-specific message when the server rejects the id', async () => {
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
    await user.click(screen.getByTestId('join-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.join.fullName'))[2]!, 'דנה כהן')
    await user.type(screen.getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[2]!, '100000009')
    await user.type(screen.getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

    await screen.findByText(t('he', 'people.join.nationalIdInvalid'))
    expect(screen.queryByText(t('he', 'common.error.generic'))).toBeNull()
  })

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

  it('advances the health queue from local drafts, never from the server, reaches payment, and flushes both drafts exactly once on "enter the app"', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    // The mocked /me/students response NEVER reports either kid as 'signed' -- that is
    // exactly what proves the queue advance is computed locally (from healthDrafts),
    // not re-derived from a server read that the deferred model never triggers.
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
            JSON.stringify({ student_ids: ['st1', 'st2'] }),
            { status: 201 },
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
                  health_status: 'missing',
                },
                {
                  id: 'st2',
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
    await user.click(screen.getByTestId('join-add-self'))
    await user.click(
      screen.getAllByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' })[0]!,
    )
    await user.click(screen.getByTestId('join-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.join.fullName'))[2]!, 'דנה כהן')
    await user.type(screen.getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[2]!, '100000009')
    await user.type(screen.getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(
      screen.getAllByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' })[1]!,
    )
    await user.click(screen.getByTestId('join-submit'))

    // Kid 1 (the self row).
    await screen.findByTestId('health-opening-question')
    await user.click(screen.getByTestId('health-opening-healthy'))
    await user.type(
      screen.getByLabelText(t('he', 'health.declaration.signatureTyped')),
      'מיכל כהן',
    )
    await user.type(screen.getByLabelText('טלפון חירום'), '0501111111')
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    // Still on the health step -- kid 2's turn -- even though /me/students never
    // changed either kid's health_status server-side.
    await screen.findByTestId('health-opening-question')
    expect(screen.queryByTestId('join-payment-step')).toBeNull()

    await user.click(screen.getByTestId('health-opening-healthy'))
    await user.type(
      screen.getByLabelText(t('he', 'health.declaration.signatureTyped')),
      'מיכל כהן',
    )
    await user.type(screen.getByLabelText('טלפון חירום'), '0502222222')
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    // billingClient.openCharges resolves [] (this file's default mock), so PaymentSetup
    // reports nothing owed and the wizard advances straight through the payment step to
    // the done screen -- which must still flush both kids' drafts once "enter the app"
    // is pressed. (The payment step itself is not asserted here: with charges resolving
    // near-instantly, it never sits still long enough to reliably observe.)
    await screen.findByTestId('join-done-step')
    expect(healthClient.submit).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('join-done-enter'))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(healthClient.submit).toHaveBeenCalledTimes(2)
    expect(healthClient.submit).toHaveBeenCalledWith(
      'st1',
      expect.objectContaining({ template_id: 'tmpl1' }),
    )
    expect(healthClient.submit).toHaveBeenCalledWith(
      'st2',
      expect.objectContaining({ template_id: 'tmpl1' }),
    )
  })

  it('a failed flush leaves the done screen up, with an error, and never calls onComplete', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const failingHealthClient = {
      ...healthClient,
      submit: vi.fn(async () => {
        throw new Error('boom')
      }),
    } as unknown as HealthClient
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
          return new Response(JSON.stringify({ student_ids: ['st1'] }), { status: 201 })
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
        healthClient={failingHealthClient}
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
    await user.click(screen.getByTestId('join-add-self'))
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

    await user.click(await screen.findByTestId('health-opening-healthy'))
    await user.type(
      screen.getByLabelText(t('he', 'health.declaration.signatureTyped')),
      'מיכל כהן',
    )
    await user.type(screen.getByLabelText('טלפון חירום'), '0501111111')
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    await user.click(await screen.findByTestId('join-done-enter'))

    await screen.findByText(t('he', 'people.join.done.flushFailed'))
    expect(screen.getByTestId('join-done-screen')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('persists the family draft to sessionStorage as it is typed, and restores it on a same-tab return', async () => {
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
      const saved = sessionStorage.getItem(`join-draft:${token}`)
      expect(saved).not.toBeNull()
      const parsed = JSON.parse(saved!) as { family: { signerNationalId: string; address: string } }
      expect(parsed.family.signerNationalId).toBe('100000017')
      expect(parsed.family.address).toBe('הרצל 12')
    })

    unmount()
    cleanup()

    render(
      <JoinFlow
        billingClient={billingClient}
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
})
