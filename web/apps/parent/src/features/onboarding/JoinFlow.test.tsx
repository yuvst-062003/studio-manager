import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { BillingClient } from '../billing/billingClient'
import type { HealthClient } from '../health/healthClient'
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
} as unknown as HealthClient

const billingClient = {
  openCharges: vi.fn(async () => []),
  createOrder: vi.fn(),
  orderForm: vi.fn(),
  createPromise: vi.fn(),
} as unknown as BillingClient

afterEach(() => {
  vi.unstubAllGlobals()
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
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await screen.findByTestId('join-terms-step')
    expect(screen.queryByText(t('he', 'people.join.title'))).toBeNull()
    expect(screen.queryByTestId('join-form')).toBeNull()
    expect(screen.queryByTestId('join-family-step')).toBeNull()
    expect(screen.getByTestId('join-onboarding-rail')).toBeInTheDocument()
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 2 מתוך 5')
    expect(screen.getByTestId('join-onboarding-rail-terms')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByTestId('join-onboarding-rail-family')).not.toHaveAttribute(
      'aria-current',
      'step',
    )

    await user.click(screen.getByRole('checkbox', { name: t('he', 'health.clubTerms.accept') }))
    await user.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    await screen.findByTestId('join-family-step')
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 3 מתוך 5')
    expect(screen.getByTestId('join-onboarding-rail-family')).toHaveAttribute(
      'aria-current',
      'step',
    )
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[0]!, '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.phone'))[0]!, '0548123456')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.fullName'))[2]!, 'דנה כהן')
    await user.type(screen.getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[2]!, '100000009')
    await user.type(screen.getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

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

  it('can step back from club terms to consent', async () => {
    const user = userEvent.setup()
    const onBackToConsent = vi.fn()
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
        onBackToConsent={onBackToConsent}
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await screen.findByTestId('join-terms-step')
    await user.click(screen.getByTestId('onboarding-wizard-back'))
    expect(onBackToConsent).toHaveBeenCalledTimes(1)
  })
})
