// The seam the repo's own verification notes ask for: a field collected at the FORM must
// be asserted all the way through `fetch -> state -> the call it produces`, not through a
// component's props built by hand. `billingClient` is a fake object, driven the same way
// `SelfServeJoinFlow.test.tsx` drives its own billing fake; `source` is a fake
// `JoinWizardSource` (task 3a) rather than a mocked `apiFetch` -- what door B's real
// source actually does with `apiFetch` is `wizardSources.test.ts`'s job, not this file's.
// `refresh` (`@studio/core`) is still mocked: `JoinWizard` calls it directly.
//
// Every test below reaches step 3 by filling the REAL step-2 form (`StudentFormSheet`, all
// five parts) through `userEvent`, exactly as the task brief asks: "drive it through the
// real step-2 form rather than seeding state -- that is the point of a seam test."
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingClient, ChargeOut } from '../../billing/billingClient'
import type { StandingOrderLink } from '../../billing/PaymentSetup'
import { toWizardGroup, toWizardPlan } from './adapters'
import { STEP1_COPY, STEP2_COPY, STEP3_COPY, STEP4_COPY, STUDENT_FORM_COPY } from './content'
import { Step3Payment } from './Step3Payment'
import type { RegisterResult, SubmitJoinResult } from './submitJoin'
import { emptyStudent } from './types'
import type { WizardPlan } from './types'
import type { WizardStep } from './WizardHeader'
import { JoinWizard } from './JoinWizard'
import type { JoinWizardSource, WizardCatalogue, WizardStudio } from './wizardSources'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    refresh: vi.fn(async () => null),
  }
})

const STUDIO: WizardStudio = {
  studioName: 'מועדון בדיקה',
  logoUrl: null,
  groups: [toWizardGroup({ id: 'g1', name: 'קבוצת בוקר', weekdays: [0, 2] })],
}

const PLAN: WizardPlan = toWizardPlan({
  id: 'plan-1',
  name: 'חודשי',
  sessionsPerWeek: 2,
  monthlyAmountAgorot: 30_000,
})

const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
    },
  ],
}

const CATALOGUE: WizardCatalogue = {
  plans: [PLAN],
  schema: HEALTH_SCHEMA,
  templateId: 'tmpl-1',
}

const DEFAULT_REGISTER_RESPONSE: RegisterResult = {
  person_id: 'person-1',
  student_ids: ['s1'],
  child_student_ids: ['s1'],
  charges_created: 1,
}

/** A fresh fake `JoinWizardSource` per test -- `loadStudio`/`loadCatalogue` answer the
 *  fixtures above and `register` answers `DEFAULT_REGISTER_RESPONSE` unless a test
 *  overrides it (to reject, or to answer something else). */
function fakeSource(overrides: Partial<JoinWizardSource> = {}): JoinWizardSource {
  return {
    loadStudio: vi.fn(async () => STUDIO),
    loadCatalogue: vi.fn(async () => CATALOGUE),
    register: vi.fn(async () => DEFAULT_REGISTER_RESPONSE),
    ...overrides,
  }
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

function renderWizard(
  options: {
    billingClient?: BillingClient
    standingOrderLinks?: () => Promise<readonly StandingOrderLink[]>
    source?: JoinWizardSource
    startAtStep?: WizardStep
    prefillFirstRowName?: string
  } = {},
) {
  const billingClient = options.billingClient ?? billingClientStub()
  const standingOrderLinks = options.standingOrderLinks ?? vi.fn(async () => [])
  const source = options.source ?? fakeSource()
  render(
    <JoinWizard
      billingClient={billingClient}
      source={source}
      onEnterApp={vi.fn()}
      standingOrderLinks={standingOrderLinks}
      startAtStep={options.startAtStep}
      prefillFirstRowName={options.prefillFirstRowName}
    />,
  )
  return { billingClient, standingOrderLinks, source }
}

/** Fills the real step-2 form (`StudentFormSheet`, all five parts) for ONE minor child and
 *  presses through to step 3's decision sub-view. Assumes step 2's family list is already
 *  on screen. Every field is the minimum `validation.ts` requires. */
async function fillOneChildAndContinue(user: ReturnType<typeof userEvent.setup>) {
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

/** Drives the real step-1 agreement, then `fillOneChildAndContinue`, leaving the wizard on
 *  step 3's decision sub-view for a run that opened at step 1 (door B's default). */
async function addOneChildAndReachStep3(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-welcome')
  await user.click(screen.getByLabelText(STEP1_COPY.agree))
  await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))
  await fillOneChildAndContinue(user)
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

describe('JoinWizard -- wiring submitJoin into the screens', () => {
  it('writes nothing before the final button: reaching step 3 fires no register, createPromise or createOrder', async () => {
    const user = userEvent.setup()
    const { billingClient, source } = renderWizard()

    await addOneChildAndReachStep3(user)

    expect(source.register).not.toHaveBeenCalled()
    expect(billingClient.createPromise).not.toHaveBeenCalled()
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 20000)

  it('the button writes once: calls source.register exactly once, carrying the collected child', async () => {
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    const { source } = renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => expect(source.register).toHaveBeenCalledTimes(1))
    const registerMock = vi.mocked(source.register)
    const [payload] = registerMock.mock.calls[0]!
    expect(payload.children).toHaveLength(1)
    expect(payload.children[0]?.first_name).toBe('נועה')
  }, 20000)

  it('the chosen method reaches the write: cash calls createPromise with that child\'s charge id and "cash", driven from the screen', async () => {
    const user = userEvent.setup()
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
    const source = fakeSource({
      register: vi.fn(async () => {
        throw new Error('500')
      }),
    })
    const billingClient = billingClientStub()
    renderWizard({ source, billingClient })

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

  it('F5: "already arranged" removes the card option entirely, and submitting reaches createPromise, never createOrder', async () => {
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    // "כן, התשלום כבר הוסדר מראש" -- the arranged-with-the-coach choice.
    await user.click(
      screen.getByRole('radio', { name: new RegExp(STEP3_COPY.decisionArrangedTitle) }),
    )
    await user.click(screen.getByRole('button', { name: STEP3_COPY.reportArranged }))

    // No אשראי option anywhere on the methods screen -- not disabled, absent.
    expect(screen.queryByRole('radio', { name: STEP3_COPY.methodCredit })).toBeNull()
    // The footer follows: with no chargeable child left on credit, the button never
    // offers a card charge.
    expect(screen.queryByText(new RegExp(STEP3_COPY.submitWithCredit))).toBeNull()
    const submit = screen.getByRole('button', { name: STEP3_COPY.submitNoCredit })

    await user.click(submit)

    await waitFor(() => expect(billingClient.createPromise).toHaveBeenCalled())
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 20000)

  // Task 3a: doors C and D open past the agreements screen when the family's consents are
  // already current (`doorSteps.ts::startingStep`), and the register payload must say so
  // (`AgreementService.accept_club_terms` treats a redundant `club_terms_accepted: true`
  // as a duplicate, not a mistake) -- asserted through the seam `register` actually
  // receives, not by reading `agreed` off component state.
  it('startAtStep={2} opens on step 2 directly, and the register body it eventually posts carries club_terms_accepted: true', async () => {
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    const { source } = renderWizard({ billingClient, startAtStep: 2 })

    await screen.findByTestId('join-family-step')
    expect(screen.queryByTestId('join-welcome')).toBeNull()

    await fillOneChildAndContinue(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => expect(source.register).toHaveBeenCalledTimes(1))
    const registerMock = vi.mocked(source.register)
    const [payload] = registerMock.mock.calls[0]!
    expect(payload.club_terms_accepted).toBe(true)
  }, 20000)
})

// F2 (fix round 1) — an unsigned mandate row used to expose "open the form" only as an
// accessible name, with nothing on screen telling a SIGHTED family the row is tappable.
// `Step3Payment` is presentational and the mandates checklist is entirely internal state
// (reached only by what `onSubmit` resolves with), so this renders it directly rather
// than driving the whole wizard through a real registration just to reach the checklist.
describe('Step3Payment -- the mandates checklist (F2 fix round 1)', () => {
  const PLAN: WizardPlan = {
    id: 'plan-1',
    title: 'חודשי',
    subtitle: '',
    pricePerMonthAgorot: 30_000,
    features: [],
  }

  it('an unsigned mandate row shows its open-the-form text visibly, not only as an accessible name', async () => {
    const user = userEvent.setup()
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', planId: PLAN.id })
    const result: SubmitJoinResult = {
      personId: 'person-1',
      outcomes: [
        {
          draftId: 'c1',
          name: 'איתי לוי',
          method: 'standing_order',
          amountAgorot: 30_000,
          state: 'mandate_pending',
        },
      ],
      checkout: null,
      checkoutUnavailable: false,
      mandates: [
        { draftId: 'c1', studentId: 's1', name: 'איתי לוי', amountAgorot: 30_000, url: 'https://upay.example/link' },
      ],
    }

    render(
      <Step3Payment
        students={[student]}
        plans={[PLAN]}
        methods={{ c1: 'standing_order' }}
        onMethodChange={() => {}}
        onBack={() => {}}
        onSubmit={async () => result}
        onDone={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    await user.click(screen.getByRole('button', { name: STEP3_COPY.submitNoCredit }))

    const row = await screen.findByRole('button', {
      name: `${STEP3_COPY.mandateOpen} — איתי לוי`,
    })
    // The accessible name (asserted above) is not enough on its own -- F2's finding was
    // that nothing on screen told a SIGHTED parent the row was tappable. The visible
    // text has to be there too, and in the link-blue the rest of the screen uses for it.
    expect(within(row).getByText(STEP3_COPY.mandateOpen)).toBeVisible()
  })
})
