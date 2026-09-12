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
import { t } from '@studio/i18n'
import type { BillingClient, ChargeOut } from '../../billing/billingClient'
import type { MandateLink } from '../../billing/billingClient'
import { toWizardGroup, toWizardPlan } from './adapters'
import { VALIDATION_COPY } from './validation'
import { paymentFrameCopy, step1Copy, step2Copy, step3Copy, step4Copy, studentFormCopy, wizardFlowCopy } from './copy'
import { Step1Agreements } from './Step1Agreements'
import { Step3Payment } from './Step3Payment'
import type { RegisterResult, SubmitJoinResult } from './submitJoin'
import { SETTLED_CLOSE_MS } from '../../billing/PaymentSettled'
import { emptyStudent } from './types'
import type { WizardPlan } from './types'
import type { WizardStep } from './WizardHeader'
import { JoinWizard } from './JoinWizard'
import { RegisterCodeError } from './wizardSources'
import type { JoinWizardSource, WizardCatalogue, WizardStudio } from './wizardSources'

// The wizard renders in Hebrew by default in these tests -- see `renderWizard`'s
// `locale="he"` below -- so the assertions below read the same reference values `t('he', …)`
// resolves to, rather than the deleted `content.ts` constants they used to import.
const STEP1_COPY = step1Copy('he')
const STEP2_COPY = step2Copy('he')
const STEP3_COPY = step3Copy('he')
const FRAME_COPY = paymentFrameCopy('he')
const STEP4_COPY = step4Copy('he')
const STUDENT_FORM_COPY = studentFormCopy('he')

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
  clubTermsVersion: null,
  belts: [{ id: 'belt-white', name: 'חגורה לבנה' }],
  slug: 'demo-club',
}

const PLAN: WizardPlan = toWizardPlan({
  id: 'plan-1',
  name: 'חודשי',
  sessionsPerWeek: 2,
  monthlyAmountAgorot: 30_000,
})

// **Shaped like the template the app actually ships**, clause question included. It was
// one boolean and nothing else, and that omission is the whole reason nothing here caught
// the wizard being unable to complete a registration at all: the real `full` template
// carries a `clause` question, `PartHealth` rendered it as a text box, and the server
// refused every submission with `answers_incomplete: clause_confirmed`. A fixture that is
// simpler than production is a fixture that tests a product nobody runs.
const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
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
    standingOrderLinks?: () => Promise<readonly MandateLink[]>
    source?: JoinWizardSource
    startAtStep?: WizardStep
    prefillFirstRowName?: string
  } = {},
) {
  const billingClient = options.billingClient ?? billingClientStub()
  const standingOrderLinks = options.standingOrderLinks ?? vi.fn(async () => [])
  const source = options.source ?? fakeSource()
  const view = render(
    <JoinWizard
      locale="he"
      billingClient={billingClient}
      source={source}
      onEnterApp={vi.fn()}
      standingOrderLinks={standingOrderLinks}
      startAtStep={options.startAtStep}
      prefillFirstRowName={options.prefillFirstRowName}
    />,
  )
  return { billingClient, standingOrderLinks, source, unmount: view.unmount }
}

/** Confirms the club's health declaration on part 4.
 *
 *  Its own helper because three separate fill sequences in this file need it, and because
 *  the clause is not answered the way the questions above it are: it is DERIVED from those
 *  answers, so it is always a tick and never a typed value. */
async function tickClause(user: ReturnType<typeof userEvent.setup>, root: HTMLElement) {
  await user.click(within(root).getByTestId('wizard-declaration-clause').querySelector('input')!)
}

/** Fills the real step-2 form (`StudentFormSheet`, all five parts) for ONE minor child and
 *  presses through to step 3's decision sub-view. Assumes step 2's family list is already
 *  on screen. Every field is the minimum `validation.ts` requires. */
async function fillOneChildAndContinue(
  user: ReturnType<typeof userEvent.setup>,
  /** 2026-09-06's optional fields. Off by default so every existing test still drives the
   *  minimum the form requires, which is what they are about. */
  extras: { aliyah?: boolean; secondParent?: boolean } = {},
) {
  const dialog = await fillUpToHealthPart(user, extras)
  const field = (text: string) =>
    within(dialog).getByLabelText(
      new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
    )
  const fill = (text: string, value: string) => user.type(field(text), value)

  await tickClause(user, dialog)
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

/** Parts 1 to 3, then the healthy preset on part 4 — stopping with the club's declaration
 *  NOT yet confirmed, which is the state the clause tests are about. Split out of the
 *  filler above rather than duplicated: the part tabs validate on the way forward, so
 *  there is no jumping to part 4 with part 1 empty. */
async function fillUpToHealthPart(
  user: ReturnType<typeof userEvent.setup>,
  extras: { aliyah?: boolean; secondParent?: boolean } = {},
) {
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
  if (extras.aliyah) {
    await fill(STUDENT_FORM_COPY.aliyahYear, '2014')
    await fill(STUDENT_FORM_COPY.guardianAliyahYear, '1998')
  }
  if (extras.secondParent) {
    await user.click(within(dialog).getByTestId('other-parent-add'))
    await fill(STUDENT_FORM_COPY.otherParentFirstName, 'סרגיי')
    await fill(STUDENT_FORM_COPY.otherParentLastName, 'כהן')
    await fill(STUDENT_FORM_COPY.otherParentNationalId, '100000033')
    await fill(STUDENT_FORM_COPY.otherParentPhone, '0527654321')
  }
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

  // Part 2 — the one group in the fixture.
  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

  // Part 3 — the one plan in the fixture.
  await user.click(within(dialog).getByRole('radio'))
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

  // Part 4 — the healthy preset clears every boolean question in one press. The club's own
  // declaration is deliberately NOT confirmed here; the caller does that.
  await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
  return dialog
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

  it('the wizard survives being thrown away and reopened: the child, the step and the chosen method all come back', async () => {
    // The 2026-09-12 report, as a test. A manager filled this in on a phone BROWSER (not the
    // installed app), the tab was reclaimed while he was away from it, and everything was
    // gone -- he typed the whole registration a second time. `JoinWizard` held every one of
    // these in `useState` and persisted none of them.
    //
    // **Remount rather than reload**, because that is what a reclaimed tab actually does to
    // React: the module stays, the component tree is rebuilt from nothing. Anything the
    // wizard did not write down is what the family loses.
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    const { unmount } = renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodStandingOrder }))

    unmount()
    renderWizard({ billingClient })

    // Back on step 3, not on an empty step 1. (`subView` is Step3Payment's own state and
    // legitimately restarts at the decision question -- the child cards live behind it.)
    await user.click(await screen.findByRole('button', { name: STEP3_COPY.continueToPay }))

    // The child he typed is still there, and so is the method he picked.
    expect(screen.getByText('נועה כהן')).toBeInTheDocument()
    expect(
      (screen.getByRole('radio', { name: STEP3_COPY.methodStandingOrder }) as HTMLInputElement)
        .checked,
    ).toBe(true)
  }, 30000)

  it('a draft from another join link is never restored into this one', async () => {
    // A shared family phone: one link opened and abandoned, another opened after it.
    // Handing the second family the first one's children would be worse than losing them.
    const user = userEvent.setup()
    const { unmount } = renderWizard()
    await addOneChildAndReachStep3(user)
    unmount()

    // Same device, different door -- `draftScope` defaults to 'me' here, and door B above
    // scoped its draft to the token.
    localStorage.setItem(
      'studio.join.wizardDraft.v1',
      JSON.stringify({
        savedAt: Date.now(),
        scope: 'some-other-token',
        step: 3,
        agreed: true,
        students: [{ id: 'x', firstName: 'לא', lastName: 'שלי' }],
        methods: {},
        alreadyArranged: false,
      }),
    )
    renderWizard()
    expect(screen.queryByText('לא שלי')).toBeNull()
  }, 30000)

  it('nothing is chosen by default, and the family cannot submit until they answer', async () => {
    // The other half of the same defect. `?? \'credit\'` made "chose card" and "answered
    // nothing" one value, so a reloaded screen looked ready to pay and billed a card.
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    const { source } = renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))

    expect(
      (screen.getByRole('radio', { name: STEP3_COPY.methodCredit }) as HTMLInputElement).checked,
    ).toBe(false)
    const submit = screen.getByRole('button', { name: STEP3_COPY.chooseMethodFirst })
    expect(submit).toBeDisabled()

    await user.click(submit)
    expect(source.register).not.toHaveBeenCalled()
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 30000)

  it('standing order chosen from the screen is promised, and opens no card order', async () => {
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodStandingOrder)

    await waitFor(() =>
      expect(billingClient.createPromise).toHaveBeenCalledWith(['ch1'], 'standing_order', 0, false),
    )
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 30000)

  it('cheque chosen from the screen is promised as cheque, not as something else', async () => {
    const user = userEvent.setup()
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ billingClient })

    await addOneChildAndReachStep3(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCheque)

    await waitFor(() =>
      expect(billingClient.createPromise).toHaveBeenCalledWith(['ch1'], 'cheque', 0, false),
    )
    expect(billingClient.createOrder).not.toHaveBeenCalled()
  }, 30000)

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
    //: Card is CHOSEN, not assumed. The screen stopped pre-selecting it on 2026-09-12 and
    //: the footer is held until every chargeable child has an answer, so a test that skips
    //: this is now testing a button it cannot press.
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodCredit }))
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

  // Gap 1 -- `OnboardingService` refuses a malformed ת.ז. with a 422 carrying
  // `detail.code = 'national_id_invalid'`. Both sources throw the same `RegisterCodeError`
  // for it (`wizardSources.ts`); this is the one place that reads the code back and shows
  // the family which field it belongs to, instead of the one generic message every other
  // failure gets.
  it('a registration failing with national_id_invalid shows that specific message, not the generic one', async () => {
    const user = userEvent.setup()
    const source = fakeSource({
      register: vi.fn(async () => {
        throw new RegisterCodeError('national_id_invalid')
      }),
    })
    const billingClient = billingClientStub()
    renderWizard({ source, billingClient })

    await addOneChildAndReachStep3(user)
    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    //: Card is CHOSEN, not assumed. The screen stopped pre-selecting it on 2026-09-12 and
    //: the footer is held until every chargeable child has an answer, so a test that skips
    //: this is now testing a button it cannot press.
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodCredit }))
    await user.click(screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(STEP3_COPY.submitFailedNationalId)
    expect(alert).not.toHaveTextContent(STEP3_COPY.submitFailed)
  }, 20000)

  // Gap 3 -- the seam the repo's own verification notes ask for: `toRegisterPayload` builds
  // the whole submission, but nothing before this drove more than one child through the
  // REAL step-2 form and asserted on the request body it produces. Two groups and two plans
  // (rather than the shared fixture's one of each) so a field a bug copied from child 1
  // instead of reading from child 2 -- group_ids, price_plan_id -- has somewhere to show up
  // wrong, not just somewhere to coincidentally agree.
  it('two children, driven through the real step-2 form, produce two distinct entries in the register payload', async () => {
    const user = userEvent.setup()
    const twoGroupStudio: WizardStudio = {
      ...STUDIO,
      groups: [STUDIO.groups[0]!, toWizardGroup({ id: 'g2', name: 'קבוצת ערב', weekdays: [1, 3] })],
    }
    const twoPlanCatalogue: WizardCatalogue = {
      ...CATALOGUE,
      plans: [
        PLAN,
        toWizardPlan({
          id: 'plan-2',
          name: 'דו-שבועי',
          sessionsPerWeek: 3,
          monthlyAmountAgorot: 45_000,
        }),
      ],
    }
    const source = fakeSource({
      loadStudio: vi.fn(async () => twoGroupStudio),
      loadCatalogue: vi.fn(async () => twoPlanCatalogue),
    })
    const billingClient = billingClientStub()
    renderWizard({ source, billingClient })

    const fieldIn = (root: HTMLElement, text: string) =>
      within(root).getByLabelText(
        new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
      )
    const drawSignature = (root: HTMLElement) => {
      const canvas = root.querySelector('canvas')
      if (!canvas) throw new Error('signature canvas not found')
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
    }

    // Step 1.
    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    // Step 2 -- child 1: nothing is prefilled yet, every field is typed.
    await screen.findByTestId('join-family-step')
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    let dialog = screen.getByRole('dialog')

    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.firstName), 'נועה')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.lastName), 'כהן')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.nationalId), '100000017')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.birthDate), '2016-04-01')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.address), 'הרצל 1')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.city), 'תל אביב')
    await user.selectOptions(fieldIn(dialog, STUDENT_FORM_COPY.grade), 'grade_3')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.guardianFirstName), 'דנה')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.guardianLastName), 'כהן')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.guardianNationalId), '100000017')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.guardianPhone), '0501234567')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.guardianEmail), 'dana@example.com')
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

    // Part 2 -- the FIRST of the two groups.
    await user.click(within(dialog).getAllByRole('radio')[0]!)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

    // Part 3 -- the FIRST of the two plans.
    await user.click(within(dialog).getAllByRole('radio')[0]!)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

    // Part 4 -- healthy.
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
    await tickClause(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

    // Part 5.
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.emergencyPhone), '0507654321')
    await user.selectOptions(fieldIn(dialog, STUDENT_FORM_COPY.healthFund), 'clalit')
    await user.click(
      within(dialog).getByRole('checkbox', { name: new RegExp(STUDENT_FORM_COPY.attestCheckbox) }),
    )
    drawSignature(dialog)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.save }))

    // Step 2 -- child 2. Guardian, address, city and emergency phone are seeded from
    // child 1 by `Step2Trainees`'s own family-default behaviour (§5.6), so only what is
    // genuinely per-child gets typed here -- exactly the fields a copy-instead-of-its-own
    // bug would otherwise silently share with child 1.
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    dialog = screen.getByRole('dialog')

    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.firstName), 'איתן')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.lastName), 'לוי')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.nationalId), '200000008')
    await user.type(fieldIn(dialog, STUDENT_FORM_COPY.birthDate), '2014-02-10')
    await user.selectOptions(fieldIn(dialog, STUDENT_FORM_COPY.grade), 'grade_5')
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next1 }))

    // Part 2 -- the SECOND group -- proves `group_ids` is this child's own choice, not
    // child 1's carried over.
    await user.click(within(dialog).getAllByRole('radio')[1]!)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))

    // Part 3 -- the SECOND plan, same reasoning for `price_plan_id`.
    await user.click(within(dialog).getAllByRole('radio')[1]!)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))

    // Part 4 -- healthy preset, then ONE answer flipped to "yes": this child is flagged
    // for manager review and child 1 is not, so the health block reaching the payload is
    // provably this child's own answers.
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
    await user.click(within(dialog).getByRole('radio', { name: STUDENT_FORM_COPY.answerYes }))
    // The declaration is confirmed AFTER the answer, not before: the clause is derived from
    // the answers, so flipping one clears a tick made against the old set. That is the
    // point of the rule, and doing it in this order is what a family actually does.
    await tickClause(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

    // Part 5 -- a different health fund from child 1's, same reasoning again.
    await user.selectOptions(fieldIn(dialog, STUDENT_FORM_COPY.healthFund), 'maccabi')
    await user.click(
      within(dialog).getByRole('checkbox', { name: new RegExp(STUDENT_FORM_COPY.attestCheckbox) }),
    )
    drawSignature(dialog)
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.save }))

    await user.click(screen.getByRole('button', { name: STEP2_COPY.continueToStep3 }))

    // Step 3 -- child 2 is awaiting manager review (flagged above), so only child 1 has a
    // payment-method radio. Card is picked explicitly because there is no default any
    // more; this test is about the payload `register` receives, not the payment outcome.
    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    //: Card is CHOSEN, not assumed. The screen stopped pre-selecting it on 2026-09-12 and
    //: the footer is held until every chargeable child has an answer, so a test that skips
    //: this is now testing a button it cannot press.
    await user.click(screen.getByRole('radio', { name: STEP3_COPY.methodCredit }))
    await user.click(screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }))

    await waitFor(() => expect(source.register).toHaveBeenCalledTimes(1))
    const [payload] = vi.mocked(source.register).mock.calls[0]!

    expect(payload.children).toHaveLength(2)
    const child1 = payload.children[0]!
    const child2 = payload.children[1]!

    expect(child1.first_name).toBe('נועה')
    expect(child1.last_name).toBe('כהן')
    expect(child1.birthdate).toBe('2016-04-01')
    expect(child1.group_ids).toEqual(['g1'])
    expect(child1.price_plan_id).toBe('plan-1')
    expect(child1.health?.template_id).toBe('tmpl-1')
    expect(child1.health?.answers.asthma).toBe(false)
    expect(child1.health?.answers.health_fund).toBe('clalit')

    expect(child2.first_name).toBe('איתן')
    expect(child2.last_name).toBe('לוי')
    expect(child2.birthdate).toBe('2014-02-10')
    expect(child2.group_ids).toEqual(['g2'])
    expect(child2.price_plan_id).toBe('plan-2')
    expect(child2.health?.template_id).toBe('tmpl-1')
    expect(child2.health?.answers.asthma).toBe(true)
    expect(child2.health?.answers.health_fund).toBe('maccabi')

    // The signer -- present once, carrying the guardian's own details (shared by both
    // children, per the form's own §5.6 behaviour), never one child's own.
    expect(payload.first_name).toBe('דנה')
    expect(payload.last_name).toBe('כהן')
    expect(payload.signer.national_id).toBe('100000017')
    expect(payload.signer.address).toBe('הרצל 1')
    expect(payload.signer.city).toBe('תל אביב')
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

  // A price is the most load-bearing number on this screen and nothing above renders one
  // built from a source's raw `loadCatalogue()` output rather than a hand-built `WizardPlan`
  // -- `wizardSources.test.ts` proved a source that skips the wire's snake_case ->
  // `PlanOption` mapping hands `toWizardPlan` `undefined`, which `formatShekels` turns into
  // the literal string "NaN" on screen. This drives the real wizard with `fakeSource()`'s
  // already-correctly-mapped catalogue (`PLAN`, built through `toWizardPlan` above) and
  // asserts the rendered total actually names ₪300 and never "NaN" -- the render-level half
  // of that guarantee, closing the hole a unit test on the adapter alone cannot close.
  it('reaching step 3 renders the real shekel price for the collected child, never "NaN"', async () => {
    const user = userEvent.setup()
    renderWizard()

    await addOneChildAndReachStep3(user)

    // 30_000 agorot (the fixture `PLAN`'s price) -> ₪300/month once `formatShekels` rounds
    // it. Checked against the whole rendered page rather than one queried element: the
    // total badge and the per-child breakdown both show this figure, and either one
    // showing "NaN" instead is the defect this test exists to catch.
    expect(document.body.textContent).not.toContain('NaN')
    expect(document.body.textContent).toContain('₪300')
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

// The trial, which used to be a way OUT of the wizard (2026-09-11).
//
// Task 10 item 3 gave step 2 a text link to `/t/{slug}`, the club's public booking page.
// It was a hard navigation: a parent who wanted one child enrolled and a second trying a
// lesson pressed it, lost the wizard, lost every answer typed into it, and landed on a
// page that knows nothing about the family. The owner's report is the case that breaks —
// "a parent would want to register one kid with payment and second with trial".
//
// So the trial is a per-child choice at step 3 now, beside the four payment methods,
// and step 2 carries a sentence pointing at it rather than a door out.
describe('Step2Trainees -- the trial is a choice, not a way out', () => {
  it('offers no link away from the wizard', async () => {
    const user = userEvent.setup()
    renderWizard()

    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    await screen.findByTestId('join-family-step')
    // The trial is a second ADD BUTTON now, beside the one that adds a member...
    expect(screen.getByTestId('step2-add-trial')).toHaveTextContent(STEP2_COPY.tryFirst)
    // ...and nothing on this step navigates to the public booking page.
    expect(screen.queryByTestId('step2-try-first-link')).toBeNull()
    const escapes = screen
      .queryAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').startsWith('/t/'))
    expect(escapes, 'step 2 must not offer a door out of the wizard').toHaveLength(0)
  })

  it('says so even when the source has no slug, because the choice no longer needs one', async () => {
    const user = userEvent.setup()
    const source = fakeSource({ loadStudio: vi.fn(async () => ({ ...STUDIO, slug: null })) })
    renderWizard({ source })

    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    await screen.findByTestId('join-family-step')
    // The old link was rendered only when a slug was known, because it WAS a URL. Adding
    // a trial child is internal now, so a door with no slug offers exactly the same thing.
    expect(screen.getByTestId('step2-add-trial')).toBeInTheDocument()
  })
})

// Task 10 item 4 -- the duplicate-name warning comes back. `checkDuplicate` is
// `JoinWizardSource`'s own optional field (`undefined` on door B); wired into the student
// form's save. It only ever WARNS -- a parent may genuinely have two children with
// similar names, and a failed check must not block a registration.
describe('StudentFormSheet -- the duplicate-check warning (task 10 item 4)', () => {
  it('a duplicate-check hit warns on save and still lets the family continue', async () => {
    const user = userEvent.setup()
    const checkDuplicate = vi.fn(async () => true)
    const source = fakeSource({ checkDuplicate })
    const billingClient = billingClientStub({ openCharges: vi.fn(async () => [charge('ch1', 's1')]) })
    renderWizard({ source, billingClient })

    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    // Drive the real step-2 form through to the final save button, one step short of the
    // shared helper (which would click save itself) so this test controls that click.
    await screen.findByTestId('join-family-step')
    await user.click(screen.getByRole('button', { name: STEP2_COPY.addStudent }))
    const dialog = screen.getByRole('dialog')
    const field = (text: string) =>
      within(dialog).getByLabelText(
        new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`),
      )
    const fill = (text: string, value: string) => user.type(field(text), value)

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
    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next2 }))
    await user.click(within(dialog).getByRole('radio'))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next3 }))
    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.healthYes }))
    await tickClause(user, dialog)
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

    // The check ran with what was just typed, and the sheet is still open, warning.
    await waitFor(() => expect(checkDuplicate).toHaveBeenCalledWith('נועה', 'כהן', '2016-04-01'))
    const warning = await within(dialog).findByTestId('duplicate-warning')
    expect(warning).toHaveTextContent(STUDENT_FORM_COPY.duplicateWarningTitle)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // "Continue anyway" saves without asking again.
    await user.click(within(dialog).getByTestId('duplicate-continue'))
    await screen.findByTestId('join-family-step')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(checkDuplicate).toHaveBeenCalledTimes(1)

    // The rest of the wizard is unaffected -- the family still reaches step 3 and submits.
    await user.click(screen.getByRole('button', { name: STEP2_COPY.continueToStep3 }))
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)
    await waitFor(() => expect(source.register).toHaveBeenCalledTimes(1))
  }, 20000)

  it('a miss is silent -- no warning, the sheet just closes', async () => {
    const user = userEvent.setup()
    const checkDuplicate = vi.fn(async () => false)
    const source = fakeSource({ checkDuplicate })
    renderWizard({ source })

    await addOneChildAndReachStep3(user)

    expect(checkDuplicate).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('duplicate-warning')).toBeNull()
  }, 20000)

  it('a failed check is silent rather than blocking -- the endpoint being down does not stop the registration', async () => {
    const user = userEvent.setup()
    const checkDuplicate = vi.fn(async () => {
      throw new Error('502')
    })
    const source = fakeSource({ checkDuplicate })
    renderWizard({ source })

    // Reaching step 3 at all proves the rejected check never blocked the save.
    await addOneChildAndReachStep3(user)

    expect(checkDuplicate).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('duplicate-warning')).toBeNull()
  }, 20000)

  it("door B's fake source has no checkDuplicate -- the save skips the check entirely, never crashing on a missing function", async () => {
    const user = userEvent.setup()
    // `fakeSource()` with no override -- exactly door B's `tokenSource`, which carries no
    // `checkDuplicate` at all (`wizardSources.ts`).
    renderWizard()

    await addOneChildAndReachStep3(user)
    expect(screen.queryByTestId('duplicate-warning')).toBeNull()
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

  it('a parent who closes the card frame WITHOUT paying does not reach the done step', async () => {
    // Owner-reported 2026-09-07: open the checkout iframe, pay nothing, close it, and the
    // wizard advanced to step 4 as though the money had arrived.
    //
    // `PaymentFrame` distinguishes the two outcomes and always did: `onComplete` fires
    // only when OUR OWN return page posts a completion ref back, after uPay says yes.
    // `onClose` is the X in the corner. They were wired to one handler whose comment
    // called that deliberate — so dismissing the frame counted as having paid.
    const user = userEvent.setup()
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', planId: PLAN.id })
    const result: SubmitJoinResult = {
      personId: 'person-1',
      outcomes: [
        {
          draftId: 'c1',
          name: 'איתי לוי',
          method: 'credit',
          amountAgorot: 30_000,
          state: 'card_pending',
        },
      ],
      checkout: { action: 'https://upay.example/checkout', fields: {} },
      checkoutRef: 'order-1',
      checkoutUnavailable: false,
      mandates: [],
    }
    const onDone = vi.fn()

    render(
      <Step3Payment
        locale="he"
        students={[student]}
        plans={[PLAN]}
        methods={{ c1: 'credit' }}
        onMethodChange={() => {}}
        onBack={() => {}}
        onSubmit={async () => result}
        onDone={onDone}
        orderStatus={async () => ({ status: 'pending' }) as never}
      />,
    )

    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    // The footer appends the amount — `submitWithCredit (₪300)` — so match the stem.
    await user.click(screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }))

    // The frame is open. Close it with no completion message ever arriving.
    const frameClose = await screen.findByRole('button', { name: FRAME_COPY.close })
    await user.click(frameClose)

    expect(onDone).not.toHaveBeenCalled()
  })

  it('a bit payment finishes the wizard even though no completion message ever arrives', async () => {
    // The other half of the test above, and the defect the first live payment exposed
    // (2026-09-11). `onComplete` fires only when uPay navigates the frame back to OUR
    // origin -- which the bit route never does. It ends on `app.upay.co.il/API6/bit/
    // return.php`, the frame goes white, and a family who HAD paid was left with the X as
    // their only move, which `dismissFrame` reads as not having paid.
    //
    // No message is posted anywhere in this test. The frame watches the order row, which
    // is the one authority true on every route uPay takes.
    //
    // **This is the seam, not the hook.** `useSettledOrder` has its own tests; what is
    // proven here is the wiring nothing else covers -- that `submitJoin`'s `checkoutRef`
    // reaches `PaymentFrame`, and that a settled order runs `completeFrame` rather than
    // `dismissFrame`. A field carried in a type and dropped on the way would pass every
    // test either side of this one.
    const user = userEvent.setup()
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', planId: PLAN.id })
    const result: SubmitJoinResult = {
      personId: 'person-1',
      outcomes: [
        {
          draftId: 'c1',
          name: 'איתי לוי',
          method: 'credit',
          amountAgorot: 30_000,
          state: 'card_pending',
        },
      ],
      checkout: { action: 'https://upay.example/checkout', fields: {} },
      checkoutRef: 'order-1',
      checkoutUnavailable: false,
      mandates: [],
    }
    const onDone = vi.fn()
    // `expected_amount_agorot` is not optional on the wire, and the moment prints it —
    // `formatAgorot` refuses `undefined` by design (G2), so a mock without it is a broken
    // mock rather than a defect worth softening the guard for.
    const orderStatus = vi.fn(
      async () => ({ status: 'paid', expected_amount_agorot: 30_000 }) as never,
    )

    render(
      <Step3Payment
        locale="he"
        students={[student]}
        plans={[PLAN]}
        methods={{ c1: 'credit' }}
        onMethodChange={() => {}}
        onBack={() => {}}
        onSubmit={async () => result}
        onDone={onDone}
        orderStatus={orderStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: STEP3_COPY.continueToPay }))
    await user.click(
      screen.getByRole('button', { name: new RegExp(STEP3_COPY.submitWithCredit) }),
    )

    // The frame asks once on mount, so this needs no timer at all. What appears is the
    // OUTCOME, in place of uPay's page -- the family is told they paid before the frame
    // goes anywhere.
    const settled = await screen.findByTestId('payment-settled')
    expect(settled).toHaveAttribute('data-status', 'paid')
    expect(orderStatus).toHaveBeenCalledWith('order-1')

    // And then, and only then, the wizard moves on.
    await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: SETTLED_CLOSE_MS * 3 })
  })

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
      checkoutRef: null,
      checkoutUnavailable: false,
      mandates: [
        { draftId: 'c1', studentId: 's1', name: 'איתי לוי', amountAgorot: 30_000, url: 'https://upay.example/link' },
      ],
    }

    render(
      <Step3Payment
        locale="he"
        students={[student]}
        plans={[PLAN]}
        methods={{ c1: 'standing_order' }}
        onMethodChange={() => {}}
        onBack={() => {}}
        onSubmit={async () => result}
        onDone={() => {}}
        orderStatus={async () => ({ status: 'pending' }) as never}
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

// Task 6 -- the wizard's copy moved out of `content.ts` and into the shared `people`
// namespace, translated into English and Russian beside the Hebrew. Nothing above this
// point ever executes the English (or Russian) file: every assertion renders `locale="he"`
// and reads its own reference strings back from `step*Copy('he')`. Without a test that
// actually renders a non-Hebrew locale, `en/people.ts` could go half-empty -- every missing
// key would fall back to Hebrew (`translate`'s own rule) and nothing here would go red.
describe('Step1Agreements -- renders in English when given locale="en" (task 6)', () => {
  it('shows the English heading, lead, FAQ title and continue button, and none of the Hebrew', () => {
    const en = step1Copy('en')
    const he = step1Copy('he')

    render(
      <Step1Agreements locale="en" agreed={false} onAgreedChange={() => {}} onContinue={() => {}} />,
    )

    expect(screen.getByText(en.heading)).toBeInTheDocument()
    expect(screen.getByText(en.lead)).toBeInTheDocument()
    expect(screen.getByText(en.faqTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.continue })).toBeInTheDocument()

    // Proof the locale actually switched the rendered strings, not merely that the English
    // ones happen to also be present alongside the Hebrew originals.
    expect(screen.queryByText(he.heading)).toBeNull()
    expect(screen.queryByText(he.lead)).toBeNull()
  })
})

// Gap 2 -- `OnboardingInfoOut.club_terms_version` is live off the server's own constant,
// and step 1 is the screen where the consent ledger records one, so the family should be
// able to see which version they are agreeing to. `wizardSources.test.ts` covers the read
// itself (`tokenSource.loadStudio` maps it, `studioSource.loadStudio` always answers
// `null`); these two cover the render.
describe('Step1Agreements -- no version number on a document (owner, 2026-09-08)', () => {
  it('shows the document, not its edition', () => {
    // The owner asked for the document and not its version. A number beside a title is an
    // internal fact wearing a badge: it tells a family nothing, and this product has
    // shipped an unwanted version number before (CLAUDE.md's verification notes).
    //
    // `CLUB_TERMS_VERSION` is untouched and still load-bearing — it gates consent, is
    // recorded against every grant, and a mismatch is still rejected. Only the display is
    // gone.
    render(
      <Step1Agreements
        locale="he"
        agreed={false}
        onAgreedChange={() => {}}
        onContinue={() => {}}
      />,
    )

    // The copy entry is gone too, so there is no string left to render by accident.
    expect(screen.queryByText(/גרסת נוסח|גרסה/, { exact: false })).toBeNull()
    // The document itself is still reachable, which is the thing that matters.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})

// A failed READ has a way out of it. Before 2026-09-06 neither of these two failures had
// one: each rendered a red sentence and nothing else, so a family whose first request lost
// the connection was left on a dead screen with a join link behind them -- and a browser
// refresh is not the escape it looks like, because this app registers a service worker that
// can serve the same failure from cache. `tools/__tests__/load-failed-recovery.test.ts` is
// the file-level guard for this rule; these are the behaviours it cannot see.
describe('JoinWizard -- a failed read is recoverable, not a dead end', () => {
  it('offers a retry when the studio read fails, and the retry re-reads and recovers', async () => {
    const user = userEvent.setup()
    const loadStudio = vi
      .fn<JoinWizardSource['loadStudio']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(STUDIO)
    renderWizard({ source: fakeSource({ loadStudio }) })

    // The failure, and the way out of it beside the message.
    const retry = await screen.findByTestId('wizard-load-retry')
    expect(screen.getByRole('alert')).toHaveTextContent(wizardFlowCopy('he').loadFailed)

    await user.click(retry)

    // A real re-fetch, not a reload: the same source is asked again and step 1 renders.
    await screen.findByTestId('join-welcome')
    expect(loadStudio).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('wizard-load-failed')).toBeNull()
  })

  it('offers a retry when step 2\'s catalogue read fails, and the retry recovers into the form', async () => {
    const user = userEvent.setup()
    const loadCatalogue = vi
      .fn<JoinWizardSource['loadCatalogue']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CATALOGUE)
    renderWizard({ source: fakeSource({ loadCatalogue }) })

    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))

    await user.click(await screen.findByTestId('wizard-load-retry'))

    await screen.findByTestId('join-family-step')
    expect(loadCatalogue).toHaveBeenCalledTimes(2)
  })

  it('says the family is offline rather than that the club could not be reached', async () => {
    // P8's second item, and the other half `@studio/ui`'s LoadFailed carries: a parent in a
    // dojo doorway with no signal was being told the club was broken. `navigator.onLine`
    // is the browser's own answer and the only one available here.
    const onLine = vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      renderWizard({
        source: fakeSource({ loadStudio: vi.fn(async () => Promise.reject(new Error('x'))) }),
      })
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(t('he', 'common.loadFailed.offline'))
      expect(alert).not.toHaveTextContent(t('he', 'people.joinWizard.flow.loadFailed'))
    } finally {
      onLine.mockRestore()
    }
  })
})

// The 2026-09-06 fields, driven through the REAL form rather than by building a draft.
// CLAUDE.md's rule: a field added to an API is not proven by a test that constructs the
// props by hand — assert the mapping that carries it, or a field dropped between the input
// and the payload passes every other test in this file.
describe('שנת עליה and הורה 2 reach the write', () => {
  it('carries the student’s year, the guardian’s year and the second parent into register', async () => {
    const user = userEvent.setup()
    const { source } = renderWizard()
    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))
    await fillOneChildAndContinue(user, { aliyah: true, secondParent: true })
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => expect(source.register).toHaveBeenCalled())
    const body = vi.mocked(source.register).mock.calls[0]![0]
    const [child] = body.children
    expect(child!.aliyah_year).toBe('2014')
    expect(body.signer.aliyah_year).toBe('1998')
    expect(child!.other_parent).toEqual({
      first_name: 'סרגיי',
      last_name: 'כהן',
      national_id: '100000033',
      phone: '0527654321',
    })
    // The field the owner removed. Asserted, not assumed: `phone_home` is still a nullable
    // column, so nothing would fail if the form quietly started sending one again.
    expect(body.signer.phone_home).toBeNull()
    // Both tests here drive the REAL five-part form end to end and legitimately take the
    // better part of a second; under a loaded full parallel run that passes vitest's 5s
    // default and times out with nothing hung. Headroom on the test rather than a global
    // bump, exactly as the install-walkthrough test above already does — a raised global
    // would mask an unrelated test that really is stuck. Do not "tidy" this away.
  }, 20000)

  it('lets a family submit with no second parent at all, and sends null', async () => {
    // One-parent families are not incomplete families, and the tab must not become a
    // required section by accident.
    const user = userEvent.setup()
    const { source } = renderWizard()
    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))
    await fillOneChildAndContinue(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => expect(source.register).toHaveBeenCalled())
    const body = vi.mocked(source.register).mock.calls[0]![0]
    expect(body.children[0]!.other_parent).toBeNull()
    expect(body.children[0]!.aliyah_year).toBeNull()
  }, 20000)
})

// The club's own health clause — the gap that stopped the wizard working at all.
//
// `PartHealth` fell through to its TEXT input for a `clause` question, so a family saw a
// box, typed nothing the server would accept, and the ENTIRE registration was refused at
// step 3's final button with `answers_incomplete: clause_confirmed`. Reproduced against the
// live API before the fix: a wizard-shaped payload with every boolean answered and no
// clause came back 422. Nothing in this file caught it because the fixture schema carried
// no clause question — it does now, which is why every sequence above ticks one.
describe('the health declaration clause', () => {
  /** Step 1, then the whole student form up to part 4's questions, clause unconfirmed. */
  async function reachHealthPart(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))
    return fillUpToHealthPart(user)
  }

  it('will not leave part 4 until the family confirms the club’s declaration', async () => {
    const user = userEvent.setup()
    renderWizard()
    const dialog = await reachHealthPart(user)

    await user.click(within(dialog).getByRole('button', { name: STUDENT_FORM_COPY.next4 }))

    // Still on part 4, and told WHY — not the "answer every question" message, which would
    // send a family back over questions they have already answered.
    expect(within(dialog).getByTestId('wizard-declaration-clause')).toBeInTheDocument()
    expect(within(dialog).getByText(VALIDATION_COPY.healthClauseRequired)).toBeInTheDocument()
  }, 20000)

  it('drops a confirmed clause when an answer it was derived from changes', async () => {
    // A family who confirms "no limitations" and then answers כן to asthma would otherwise
    // submit a false statement under a real signature. `verify_clause` is the server half;
    // this is the client half that stops the family ever reaching it.
    const user = userEvent.setup()
    renderWizard()
    const dialog = await reachHealthPart(user)
    const clause = () =>
      within(dialog).getByTestId('wizard-declaration-clause').querySelector('input')!

    await user.click(clause())
    expect(clause()).toBeChecked()

    await user.click(within(dialog).getAllByText(STUDENT_FORM_COPY.answerYes)[0]!)
    expect(clause()).not.toBeChecked()
  }, 20000)

  it('sends the clause the answers imply, so the server’s verify_clause accepts it', async () => {
    const user = userEvent.setup()
    const { source } = renderWizard()
    await screen.findByTestId('join-welcome')
    await user.click(screen.getByLabelText(STEP1_COPY.agree))
    await user.click(screen.getByRole('button', { name: STEP1_COPY.continue }))
    await fillOneChildAndContinue(user)
    await chooseMethodAndSubmit(user, STEP3_COPY.methodCash)

    await waitFor(() => expect(source.register).toHaveBeenCalled())
    const body = vi.mocked(source.register).mock.calls[0]![0]
    // Every boolean answered "no", so the applicable clause is `none` — the value the
    // server derives independently and refuses any other.
    expect(body.children[0]!.health!.answers.clause_confirmed).toBe('none')
  }, 20000)
})
