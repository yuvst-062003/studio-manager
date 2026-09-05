// The seam the repo's own verification notes ask for: a field collected at the FORM must
// be asserted all the way through `fetch -> state -> the call it produces`, not through a
// component's props built by hand. `apiFetch` and `refresh` (`@studio/core`) are mocked;
// `billingClient` is a fake object, driven the same way `SelfServeJoinFlow.test.tsx` drives
// its own billing fake.
//
// Every test below reaches step 3 by filling the REAL step-2 form (`StudentFormSheet`, all
// five parts) through `userEvent`, exactly as the task brief asks: "drive it through the
// real step-2 form rather than seeding state -- that is the point of a seam test."
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient, ChargeOut } from '../../billing/billingClient'
import type { StandingOrderLink } from '../../billing/PaymentSetup'
import type { HealthClient } from '../../health/healthClient'
import { STEP1_COPY, STEP2_COPY, STEP3_COPY, STEP4_COPY, STUDENT_FORM_COPY } from './content'
import { WizardJoinFlow } from './WizardJoinFlow'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(),
    refresh: vi.fn(async () => null),
  }
})

const TOKEN = 'tok-e2e'

const STUDIO_INFO = {
  studio_name: 'מועדון בדיקה',
  logo_url: null,
  groups: [{ id: 'g1', name: 'קבוצת בוקר', weekdays: [0, 2] }],
}

const PLAN = { id: 'plan-1', name: 'חודשי', sessionsPerWeek: 2, monthlyAmountAgorot: 30_000 }

const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
    },
  ],
}

function healthClientStub(): HealthClient {
  return {
    template: vi.fn(async () => ({ id: 'tmpl-1', version: 1, schema: HEALTH_SCHEMA })),
  } as unknown as HealthClient
}

function charge(id: string, studentId: string, amount = 30_000): ChargeOut {
  return {
    id,
    payer_person_id: 'payer-1',
    student_id: studentId,
    kind: 'tuition',
    period_year: 2026,
    period_month: 9,
    amount_agorot: amount,
    original_amount_agorot: null,
    proration_note: null,
    due_date: '2026-09-28',
    status: 'open',
    created_by: 'billing_run',
    allocated_agorot: 0,
    is_covered_elsewhere: false,
  } as ChargeOut
}

function billingClientStub(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    openCharges: vi.fn(async () => []),
    promises: vi.fn(async () => []),
    createPromise: vi.fn(async () => ({}) as never),
    balance: vi.fn(async () => ({}) as never),
    payments: vi.fn(async () => []),
    products: vi.fn(async () => []),
    createOrder: vi.fn(async () => ({ public_ref: 'order-1' }) as never),
    orderForm: vi.fn(async () => ({ action: 'https://upay.example/pay', fields: {} })),
    orderStatus: vi.fn(async () => ({}) as never),
    ...overrides,
  } as unknown as BillingClient
}

const DEFAULT_REGISTER_RESPONSE = {
  person_id: 'person-1',
  student_ids: ['s1'],
  child_student_ids: ['s1'],
  charges_created: 1,
}

/** One handler covers the three GETs every render needs (studio, price-plans) plus the
 *  register POST -- everything else answers an empty list, which nothing in these tests
 *  reads. `registerStatus`/`registerResponse` let a test choose what the write answers
 *  without rewriting the whole handler. */
function fetchHandler(options: { registerStatus?: number; registerResponse?: unknown } = {}) {
  const { registerStatus = 201, registerResponse = DEFAULT_REGISTER_RESPONSE } = options
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes(`/api/v1/public/onboarding/${TOKEN}/price-plans`)) {
      return new Response(JSON.stringify({ items: [PLAN] }), { status: 200 })
    }
    if (url.includes(`/api/v1/public/onboarding/${TOKEN}`)) {
      return new Response(JSON.stringify(STUDIO_INFO), { status: 200 })
    }
    if (url.includes(`/api/v1/onboarding/${TOKEN}/register`) && init?.method === 'POST') {
      return new Response(JSON.stringify(registerResponse), { status: registerStatus })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
}

function renderWizard(
  options: {
    billingClient?: BillingClient
    standingOrderLinks?: () => Promise<readonly StandingOrderLink[]>
  } = {},
) {
  const billingClient = options.billingClient ?? billingClientStub()
  const standingOrderLinks = options.standingOrderLinks ?? vi.fn(async () => [])
  render(
    <WizardJoinFlow
      billingClient={billingClient}
      healthClient={healthClientStub()}
      onEnterApp={vi.fn()}
      standingOrderLinks={standingOrderLinks}
      token={TOKEN}
    />,
  )
  return { billingClient, standingOrderLinks }
}

/** Drives the real step-1 and step-2 forms for ONE minor child, leaving the wizard on
 *  step 3's decision sub-view. Every field is the minimum `validation.ts` requires. */
async function addOneChildAndReachStep3(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-welcome')
  await user.click(screen.getByLabelText(STEP1_COPY.agree))
  await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

  await screen.findByTestId('join-family-step')
  await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))

  const dialog = screen.getByRole('dialog')
  // Every required field's label carries a trailing " *" badge as a sibling node
  // (`Field.tsx`'s `Label`), so the label's full accessible text is never the bare copy
  // string -- and several labels share a prefix (`שם פרטי` / `שם פרטי של ההורה`), so a
  // loose substring match is not safe either. Anchor on the whole string, with an
  // optional trailing asterisk.
  const field = (text: string) =>
    within(dialog).getByLabelText(
      new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
    )
  const fill = (text: string, value: string) => user.type(field(text), value)

  // Part 1 — student + guardian.
  await fill(STUDENT_FORM_COPY.firstName, 'נועה')
  await fill(STUDENT_FORM_COPY.lastName, 'כהן')
  await fill(STUDENT_FORM_COPY.nationalId, '100000017')
  await fill(STUDENT_FORM_COPY.birthDate, '2016-04-01')
  await fill(STUDENT_FORM_COPY.address, 'הרצל 1')
  await fill(STUDENT_FORM_COPY.city, 'תל אביב')
  await user.selectOptions(field(STUDENT_FORM_COPY.grade), 'grade_3')
  await fill(STUDENT_FORM_COPY.guardianFirstName, 'דנה')
  await fill(STUDENT_FORM_COPY.guardianLastName, 'כהן')
  await fill(STUDENT_FORM_COPY.guardianNationalId, '100000017')
  await fill(STUDENT_FORM_COPY.guardianPhone, '0501234567')
  await fill(STUDENT_FORM_COPY.guardianEmail, 'dana@example.com')
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

  // Part 2 — the one group in the fixture.
  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

  // Part 3 — the one plan in the fixture.
  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

  // Part 4 — the healthy preset clears every boolean question in one press.
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

  // Part 5 — emergency contact, health fund, attestation and signature.
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

  await user.click(screen.getByRole('button', { name: STEP2_COPY.continueToStep3 }))
}

/** From step 3's decision sub-view, chooses "now" (the default), switches to the method
 *  sub-view, sets the one child's method, and presses the final button. */
async function chooseMethodAndSubmit(user: ReturnType<typeof userEvent.setup>, method: string) {
  await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
  await user.click(screen.getByRole('radio', { name: method }))
  await user.click(screen.getByRole('button', { name: STEP3_COPY.submitNoCredit }))
}

beforeEach(() => {
  // jsdom does not implement `scrollTo` -- `StudentFormSheet.validate` calls it on a
  // failed part, which would otherwise throw and mask the real assertion failure.
  Element.prototype.scrollTo = vi.fn()
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
    scale: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
  // jsdom does not implement the Pointer Events capture API the signature pad uses.
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  localStorage.clear()
})

describe('WizardJoinFlow -- wiring submitJoin into the screens', () => {
  it('writes nothing before the final button: reaching step 3 fires no register, createPromise or createOrder', async () => {
    const user = userEvent.setup()
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchHandler()
    vi.mocked(apiFetch).mockImplementation(fetchMock)
    const { billingClient } = renderWizard()

    await addOneChildAndReachStep3(user)

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes(`/onboarding/${TOKEN}/register`)),
    ).toBe(false)
    expect(billingClient.createPromise).not.toHaveBeenCalled()
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 20000)

  it('the button writes once: posts /onboarding/{token}/register exactly once, carrying the collected child', async () => {
    const user = userEvent.setup()
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchHandler()
    vi.mocked(apiFetch).mockImplementation(fetchMock)
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => {
      const registerCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes(`/onboarding/${TOKEN}/register`) && init?.method === 'POST',
      )
      expect(registerCalls).toHaveLength(1)
    })
    const [, init] = fetchMock.mock.calls.find(
      ([url, reqInit]) =>
        String(url).includes(`/onboarding/${TOKEN}/register`) && reqInit?.method === 'POST',
    )!
    const body = JSON.parse(String(init?.body)) as { children: { first_name: string }[] }
    expect(body.children).toHaveLength(1)
    expect(body.children[0]?.first_name).toBe('נועה')
  }, 20000)

  it('the chosen method reaches the write: cash calls createPromise with that child\'s charge id and "cash", driven from the screen', async () => {
    const user = userEvent.setup()
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(fetchHandler())
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() =>
      expect(billingClient.createPromise).toHaveBeenCalledWith(['ch1'], 'cash', 0, false),
    )
  }, 20000)

  it('a failed registration keeps the family on step 3 with the error visible, and step 4 never renders', async () => {
    const user = userEvent.setup()
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(fetchHandler({ registerStatus: 500 }))
    const billingClient = billingClientStub()
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    await user.click(screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(STEP3_COPY.submitFailed)
    expect(screen.queryByText(STEP4_COPY.enterApp)).toBeNull()
    // Nothing past `register` was ever reached.
    expect(billingClient.createPromise).not.toHaveBeenCalled()
    expect(billingClient.createOrder).not.toHaveBeenCalled()
    // The family can press the button again -- it is back to its normal label, not stuck
    // disabled on "רושמים את המשפחה…".
    expect(
      screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }),
    ).toBeEnabled()
  }, 20000)

  it('registration succeeds while the promise write fails: still reaches step 4, showing the child as not recorded rather than arranged', async () => {
    const user = userEvent.setup()
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(fetchHandler())
    const billingClient = billingClientStub({
      openCharges: vi.fn(async () => [charge('ch1', 's1')]),
      createPromise: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await screen.findByText(STEP4_COPY.paymentNotRecorded)
    expect(screen.getByText(STEP4_COPY.paymentReasonWriteFailed)).toBeInTheDocument()
    expect(screen.queryByText(STEP4_COPY.paymentRecorded)).toBeNull()
  }, 20000)
})
