// §6 -- payment. Two sub-views behind one screen: the question, then the per-child methods.
//
// **The prototype's success dialog is not ported.** Choosing "already arranged" there pops
// a card reading הדיווח נקלט בהצלחה! and "a message was sent to the coach" -- before
// anything has been written, because the whole wizard writes at this screen's final button
// (§6.3, §14). It also skips the method picker entirely, so the club never learns HOW the
// payment was arranged. Here the choice routes into the same sub-view B with a note saying
// the report goes to the coach ON COMPLETION, which is both honest and better data.
//
// **Task 1c** wires the button to `submitJoin` (via the `onSubmit` prop, which now does the
// whole write and resolves with what landed). Two phases live behind it, because they
// cannot be one screen: `onSubmit` may come back naming a uPay checkout to post, or one or
// more standing-order mandates still to sign -- both need a second interaction before the
// family can be told "done", so `phase` tracks 'form' -> 'working' -> (optionally)
// 'mandates', and only once every promise is accounted for does this screen call `onDone`.
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Handshake,
  HelpCircle,
  Info,
  Lock,
  Receipt,
  Repeat,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { Locale } from '@studio/i18n'
import { step3Copy } from './copy'
import { PaymentFrame } from './PaymentFrame'
import type { PaymentFrameRequest } from './PaymentFrame'
import type { PaymentOrderOut } from '../../billing/billingClient'
import type { SubmitJoinResult } from './submitJoin'
import { formatShekels, needsManagerReview } from './types'
import type { PaymentMethod, StudentDraft, WizardPlan } from './types'
import { RegisterCodeError } from './wizardSources'

type SubView = 'decision' | 'methods'
type Intent = 'now' | 'arranged'
type Phase = 'form' | 'working' | 'mandates' | 'awaitingPayment'
type Step3CopyKey = keyof ReturnType<typeof step3Copy>

const METHOD_BUTTONS: readonly { key: PaymentMethod; label: Step3CopyKey; Icon: typeof CreditCard }[] = [
  { key: 'credit', label: 'methodCredit', Icon: CreditCard },
  { key: 'cash', label: 'methodCash', Icon: Banknote },
  { key: 'cheque', label: 'methodCheque', Icon: Receipt },
  { key: 'standing_order', label: 'methodStandingOrder', Icon: Repeat },
]

const LONG_LABEL: Record<PaymentMethod, Step3CopyKey> = {
  credit: 'methodCreditLong',
  cash: 'methodCashLong',
  cheque: 'methodChequeLong',
  standing_order: 'methodStandingOrderLong',
}

export type Step3PaymentProps = {
  locale: Locale
  students: readonly StudentDraft[]
  plans: readonly WizardPlan[]
  methods: Readonly<Record<string, PaymentMethod>>
  onMethodChange: (studentId: string, method: PaymentMethod) => void
  /** Step 3's own "כן, התשלום כבר הוסדר מראש" choice, lifted so `JoinWizard` can pass
   *  it into `submitJoin` as `alreadyArranged`. Fired only when the family changes it. */
  onIntentChange?: (arranged: boolean) => void
  onBack: () => void
  /** Runs the whole write. Resolves with what landed; rejects ONLY when the registration
   *  itself failed, which is the one case that leaves the family able to press the
   *  button again. Once it resolves the family exists, and nothing may send them back. */
  onSubmit: () => Promise<SubmitJoinResult>
  /** Every child accounted for -- advance to step 4 with what landed. */
  onDone: (result: SubmitJoinResult) => void
  /** Reads one order's status, for `PaymentFrame`'s poll. The wizard holds the billing
   *  client; this step only ever had `onSubmit`, so the reader is passed in beside it. */
  orderStatus: (publicRef: string) => Promise<PaymentOrderOut>
}

export function Step3Payment({
  locale,
  students,
  plans,
  methods,
  onMethodChange,
  onIntentChange,
  onBack,
  onSubmit,
  onDone,
  orderStatus,
}: Step3PaymentProps) {
  const copy = step3Copy(locale)
  const [subView, setSubView] = useState<SubView>('decision')
  const [intent, setIntentState] = useState<Intent>('now')
  const [phase, setPhase] = useState<Phase>('form')
  const [result, setResult] = useState<SubmitJoinResult | null>(null)
  const [frame, setFrame] = useState<PaymentFrameRequest | null>(null)
  //: Which mandate row a `link` frame belongs to -- kept beside `frame` rather than folded
  //: into it, so closing the frame marks THAT row done and never another one.
  const [openMandateDraftId, setOpenMandateDraftId] = useState<string | null>(null)
  const [signed, setSigned] = useState<readonly string[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  const setIntent = (next: Intent) => {
    setIntentState(next)
    onIntentChange?.(next === 'arranged')
    // F5 (fix round 1) — "already arranged" must never leave a child on credit: a card
    // pays through this app's own uPay order, which is a SECOND charge for money the
    // family has just told the club they already handed over. Writing an explicit value
    // for every such child, once, here, is what keeps this component's own `?? 'credit'`
    // fallback, the picker's `active` check and `submitJoin`'s method bucketing from
    // disagreeing about what was chosen -- the three only ever read the same value.
    // Switching back to 'now' changes nothing: a family that picked cash and changed
    // their mind still has cash selected, and can choose card again themselves.
    if (next === 'arranged') {
      for (const student of chargeable) {
        const current = methods[student.id]
        if (current === undefined || current === 'credit') onMethodChange(student.id, 'cash')
      }
    }
  }

  const priceOf = (student: StudentDraft) =>
    plans.find((plan) => plan.id === student.planId)?.pricePerMonthAgorot ?? 0

  const { chargeable, awaiting, total, creditSum, coachSum } = useMemo(() => {
    const awaitingList = students.filter(needsManagerReview)
    const chargeableList = students.filter((student) => !needsManagerReview(student))
    let credit = 0
    let coach = 0
    for (const student of chargeableList) {
      const price = priceOf(student)
      //: Default to credit when nothing is chosen yet, matching the picker's own default.
      if ((methods[student.id] ?? 'credit') === 'credit') credit += price
      else coach += price
    }
    return {
      chargeable: chargeableList,
      awaiting: awaitingList,
      total: chargeableList.reduce((sum, student) => sum + priceOf(student), 0),
      creditSum: credit,
      coachSum: coach,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, plans, methods])

  // F5 (fix round 1) — no אשראי button at all on the "already arranged" path, not a
  // disabled one. A disabled control still invites "why can't I?"; this route simply has
  // no card in it.
  const availableMethodButtons =
    intent === 'arranged' ? METHOD_BUTTONS.filter((button) => button.key !== 'credit') : METHOD_BUTTONS

  const allMandatesSigned =
    result !== null && result.mandates.every((mandate) => signed.includes(mandate.draftId))

  const footerLabel = () => {
    if (phase === 'working') return copy.submitting
    if (phase === 'awaitingPayment') return copy.retryPayment
    if (phase === 'mandates') return allMandatesSigned ? copy.mandatesFinish : copy.mandatesFinishWithOpen
    if (subView === 'decision') return intent === 'now' ? copy.continueToPay : copy.reportArranged
    if (chargeable.length === 0) return copy.submitReviewOnly
    if (creditSum > 0) return `${copy.submitWithCredit} (₪${formatShekels(creditSum)})`
    return copy.submitNoCredit
  }

  const runSubmit = async () => {
    setPhase('working')
    setSubmitError(null)
    try {
      const landed = await onSubmit()
      setResult(landed)
      if (landed.checkout) {
        setOpenMandateDraftId(null)
        setFrame({ kind: 'checkout', form: landed.checkout, publicRef: landed.checkoutRef })
        return
      }
      if (landed.mandates.length > 0) {
        setPhase('mandates')
        return
      }
      onDone(landed)
    } catch (error) {
      // Gap 1 -- a malformed ת.ז. is a 422 that NAMES the problem
      // (`detail.code = 'national_id_invalid'`), and the family deserves to be told which
      // field it belongs to rather than the one generic message every other failure gets.
      // Both doors' `register` (`wizardSources.ts`) throw the same `RegisterCodeError`
      // for this, so this is the one place that reads it.
      setSubmitError(
        error instanceof RegisterCodeError && error.code === 'national_id_invalid'
          ? copy.submitFailedNationalId
          : copy.submitFailed,
      )
      setPhase('form')
    }
  }

  const onFooter = () => {
    if (phase === 'awaitingPayment') {
      reopenCheckout()
      return
    }
    if (phase === 'mandates') {
      if (result) onDone(result)
      return
    }
    if (subView === 'decision') {
      setSubView('methods')
      return
    }
    void runSubmit()
  }

  //: **Completing and dismissing are NOT the same thing**, and wiring both to one handler
  //: is what let a family reach step 4 without paying (owner-reported 2026-09-07): open the
  //: card frame, pay nothing, press the X, and the wizard said done.
  //:
  //: `PaymentFrame` already told the two apart. `onComplete` fires only when OUR OWN return
  //: page posts a completion ref back, which happens after uPay says yes; `onClose` is the X.
  const completeFrame = () => {
    setFrame(null)
    const finishedMandateId = openMandateDraftId
    setOpenMandateDraftId(null)
    if (finishedMandateId) {
      setSigned((previous) => (previous.includes(finishedMandateId) ? previous : [...previous, finishedMandateId]))
    }
    if (!result) return
    if (result.mandates.length > 0) setPhase('mandates')
    else onDone(result)
  }

  //: Dismissed with nothing paid and nothing signed. Two things must NOT happen: the
  //: mandate must not be ticked, and step 4 must not be reached.
  //:
  //: It also must not fall back to the form, because `runSubmit` has already REGISTERED
  //: this family -- pressing submit a second time would enrol them twice. So the checkout
  //: is held and can be reopened, which is the one action that is actually still available.
  const dismissFrame = () => {
    const wasMandate = openMandateDraftId !== null
    setFrame(null)
    setOpenMandateDraftId(null)
    if (!result) return
    if (wasMandate || result.mandates.length > 0) {
      setPhase('mandates')
      return
    }
    setPhase('awaitingPayment')
  }

  //: Reopens the SAME checkout rather than submitting again, for the reason above.
  const reopenCheckout = () => {
    if (result?.checkout) {
      setFrame({ kind: 'checkout', form: result.checkout, publicRef: result.checkoutRef })
    }
  }

  return (
    <div className="tw-scope flex flex-col w-full pb-[calc(9rem+env(safe-area-inset-bottom,0px))]">
      {submitError ? (
        <p
          className="mb-3 p-3 rounded-xl bg-red-50 border border-red-300 text-[13px] text-red-800 font-medium"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      {result?.checkoutUnavailable ? (
        <div className="bg-[#0056c5]/10 border border-[#0056c5]/20 rounded-xl p-3 mb-3 flex items-start gap-2 text-[#001849]">
          <Info className="w-4 h-4 text-[#0056c5] shrink-0 mt-0.5" />
          <p className="text-[12px] leading-relaxed">{copy.demoNoForm}</p>
        </div>
      ) : null}

      {/* §6.1 — the family summary strip */}
      <div className="bg-[#f2f3ff] border border-[#dee2f4] rounded-xl p-3 shadow-2xs mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#0056c5]/10 flex items-center justify-center text-[#0056c5] shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold text-[#001849]">
              {students.length} {copy.familyCount}
            </span>
            <span className="text-[11px] text-[#444650] truncate">
              {students
                .map((student) => {
                  const name = `${student.firstName} ${student.lastName}`.trim()
                  if (needsManagerReview(student)) return `${name} (${copy.awaitingBadge} - ₪0)`
                  const plan = plans.find((entry) => entry.id === student.planId)
                  return `${name} (${plan?.title ?? ''} - ₪${formatShekels(priceOf(student))})`
                })
                .join(', ')}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="bg-[#001849] text-white text-[12px] font-bold px-2.5 py-1 rounded-full shadow-xs whitespace-nowrap">
            ₪{formatShekels(total)} {copy.perMonth}
          </span>
          {awaiting.length > 0 ? (
            <span className="text-[10px] text-amber-700 font-bold mt-0.5 whitespace-nowrap">
              ({awaiting.length} {copy.awaitingCount} - ₪0)
            </span>
          ) : null}
        </div>
      </div>

      {awaiting.length > 0 ? (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-start gap-2.5 text-amber-900 shadow-2xs">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5 text-[12.5px] leading-relaxed">
            <span className="font-bold text-amber-900 text-[13px]">
              {copy.reviewBannerTitle}:{' '}
              {awaiting.map((s) => `${s.firstName} ${s.lastName}`.trim()).join(', ')}
            </span>
            <span className="text-amber-800">{copy.reviewBannerBody}</span>
          </div>
        </div>
      ) : null}

      {phase === 'awaitingPayment' ? (
        //: Said out loud rather than left to a silent return to the same screen. A parent
        //: who dismissed the frame has to be told two things: the registration IS saved
        //: (so they do not start over), and nothing has been charged (so they do not
        //: assume it has). `role="status"` because it appears without them acting.
        <div
          role="status"
          data-testid="awaiting-payment"
          className="mb-3 p-3.5 rounded-xl bg-[var(--pending-tint)] border border-[var(--pending)]"
        >
          <p className="text-[14px] font-bold text-[var(--pending)] m-0">{copy.awaitingPaymentTitle}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)] m-0">
            {copy.awaitingPaymentBody}
          </p>
        </div>
      ) : null}

      {phase === 'mandates' && result ? (
        <section className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#dee2f4] flex flex-col gap-1">
            <div className="flex items-center justify-between border-b border-[#dee2f4] pb-2 mb-1">
              <span className="text-[15px] font-bold text-[#001849]">{copy.mandatesTitle}</span>
              <span className="text-[11px] text-[#444650]">
                {result.mandates.length} {copy.mandatesCount}
              </span>
            </div>

            {result.mandates.map((mandate) => {
              const isSigned = signed.includes(mandate.draftId)
              const marker = (
                <span className="flex items-center gap-2.5 min-w-0">
                  {isSigned ? (
                    <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className="w-4 h-4 rounded-full border-2 border-[#757681] shrink-0"
                    />
                  )}
                  <span className="flex flex-col min-w-0 text-right">
                    <span className="text-[13px] font-bold text-[#161b28] truncate">
                      {mandate.name}
                    </span>
                    <span className="text-[11px] text-[#444650]">
                      ₪{formatShekels(mandate.amountAgorot)}
                    </span>
                  </span>
                </span>
              )
              return isSigned ? (
                <div
                  key={mandate.draftId}
                  className="flex items-center justify-between gap-2 py-2.5 border-b border-[#f2f3ff] last:border-0"
                >
                  {marker}
                  <span className="text-[12px] font-semibold text-emerald-700 shrink-0">
                    {copy.mandateDone}
                  </span>
                </div>
              ) : (
                // F2 (fix round 1) — this row IS the only route to signing a mandate, and
                // an empty circle beside a status word ("להסדרה") reads as information,
                // not as something to tap. `copy.mandateOpen` now stands in that same
                // spot as a visible, blue, underline-on-hover call to action, so a
                // sighted parent gets the same "tap me" signal a screen reader already
                // had from the accessible name below (left untouched).
                <button
                  key={mandate.draftId}
                  type="button"
                  aria-label={`${copy.mandateOpen} — ${mandate.name}`}
                  onClick={() => {
                    setOpenMandateDraftId(mandate.draftId)
                    setFrame({ kind: 'link', url: mandate.url })
                  }}
                  className="group flex items-center justify-between gap-2 py-2.5 -mx-1 px-1 border-b border-[#f2f3ff] last:border-0 w-full text-right cursor-pointer hover:bg-[#f2f3ff] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#0056c5]"
                >
                  {marker}
                  <span className="text-[13px] font-bold text-[#0056c5] shrink-0 group-hover:underline group-active:text-[#00429b]">
                    {copy.mandateOpen}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : subView === 'decision' ? (
        <fieldset className="flex flex-col gap-4 border-0 p-0 m-0">
          <div className="bg-white rounded-2xl p-4 shadow-xs flex flex-col gap-2 text-center items-center border border-[#dee2f4]/60">
            <div className="w-12 h-12 rounded-full bg-[#e9edff] flex items-center justify-center text-[#001849] mb-1">
              <HelpCircle className="w-7 h-7" />
            </div>
            <legend className="contents">
              <h2 className="text-[18px] sm:text-[20px] font-bold text-[#161b28]">
                {copy.decisionTitle}
              </h2>
            </legend>
            <p className="text-[13px] text-[#444650] leading-relaxed max-w-sm">{copy.decisionLead}</p>
          </div>

          <div className="flex flex-col gap-3">
            {(
              [
                { key: 'now' as const, Icon: CreditCard, title: copy.decisionNowTitle, lead: copy.decisionNowLead },
                { key: 'arranged' as const, Icon: ShieldCheck, title: copy.decisionArrangedTitle, lead: copy.decisionArrangedLead },
              ]
            ).map(({ key, Icon, title, lead }) => {
              const selected = intent === key
              return (
                <label
                  key={key}
                  className={`cursor-pointer p-4 rounded-2xl transition-all flex items-start gap-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                    selected
                      ? 'bg-[#e9edff] shadow-md border-2 border-[#001849]'
                      : 'bg-white shadow-xs border-2 border-transparent hover:border-[#dee2f4]'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-intent"
                    checked={selected}
                    onChange={() => setIntent(key)}
                    className="sr-only"
                  />
                  <span
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                      selected ? 'bg-[#001849] text-white' : 'bg-[#e9edff] text-[#001849]'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </span>
                  <span className="flex flex-col flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[16px] font-bold text-[#161b28]">{title}</span>
                      <span
                        aria-hidden
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          selected ? 'bg-[#001849]' : 'bg-[#e3e7fa]'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-white" />
                      </span>
                    </span>
                    <span className="text-[13px] text-[#444650] mt-1 leading-snug">{lead}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[16px] font-bold text-[#001849]">{copy.methodsTitle}</h3>
            <button
              type="button"
              onClick={() => setSubView('decision')}
              className="text-[12px] text-[#0056c5] hover:underline font-semibold cursor-pointer"
            >
              {copy.backToChoice}
            </button>
          </div>

          {intent === 'arranged' ? (
            <div className="bg-[#0056c5]/10 border border-[#0056c5]/20 rounded-xl p-3 flex items-start gap-2 text-[#001849]">
              <Handshake className="w-4 h-4 text-[#0056c5] shrink-0 mt-0.5" />
              <p className="text-[12px] leading-relaxed">{copy.arrangedNotice}</p>
            </div>
          ) : null}

          {students.map((student, index) => {
            const name = `${student.firstName} ${student.lastName}`.trim()
            const price = priceOf(student)
            const plan = plans.find((entry) => entry.id === student.planId)

            if (needsManagerReview(student)) {
              return (
                <div
                  key={student.id}
                  className="bg-amber-50/20 rounded-2xl p-4 shadow-xs border-2 border-amber-300/80 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-amber-100 pb-2.5 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 font-bold text-[13px] flex items-center justify-center shrink-0 border border-amber-300">
                        {index + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[16px] font-bold text-[#161b28]">{name}</span>
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-700" />
                            {copy.awaitingBadge}
                          </span>
                        </div>
                        <span className="text-[12px] text-[#444650] truncate">{plan?.title}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[12px] font-bold text-amber-800 line-through decoration-amber-600/60">
                        ₪{formatShekels(price)}
                      </span>
                      <span className="text-[18px] font-black text-emerald-700">₪0</span>
                      <span className="text-[10px] text-amber-700 font-bold">{copy.notChargedNow}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5 text-[12px] leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-amber-900 text-[12.5px]">
                        {copy.reviewCardTitle}
                      </span>
                      {copy.reviewCardBody}
                    </div>
                  </div>
                </div>
              )
            }

            const method = methods[student.id] ?? 'credit'
            return (
              <div
                key={student.id}
                className="bg-white rounded-2xl p-4 shadow-xs border border-[#dee2f4] flex flex-col gap-3"
              >
                <div className="flex items-center justify-between border-b border-[#f2f3ff] pb-2.5 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-[#001849]/10 text-[#001849] font-bold text-[13px] flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[16px] font-bold text-[#161b28]">{name}</span>
                      <span className="text-[12px] text-[#444650] truncate">{plan?.title}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[16px] font-bold text-[#001849]">
                      ₪{formatShekels(price)}
                    </span>
                    <span className="text-[11px] text-[#444650]">{copy[LONG_LABEL[method]]}</span>
                  </div>
                </div>

                <fieldset className="flex flex-col gap-1.5 border-0 p-0 m-0">
                  <legend className="text-[11px] text-[#444650] font-medium mb-1">
                    {copy.methodFor} {name}
                  </legend>
                  {/* F5 (fix round 1) — arranged with the coach already means one of the
                      three PROMISE methods. No אשראי button here at all: a family that
                      just reported the payment settled must never be one tap from a real
                      card charge on a live merchant account, and a disabled button still
                      invites "why can't I?" where an absent one does not. */}
                  <div
                    className={`grid gap-1.5 ${
                      intent === 'arranged' ? 'grid-cols-3' : 'grid-cols-4'
                    }`}
                  >
                    {availableMethodButtons.map(({ key, label, Icon }) => {
                      const active = method === key
                      return (
                        <label
                          key={key}
                          className={`py-2 px-1 rounded-xl text-[12px] font-bold text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                            active ? 'bg-[#001849] text-white' : 'bg-[#e9edff] text-[#161b28] hover:bg-[#dee2f4]'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`method-${student.id}`}
                            checked={active}
                            onChange={() => onMethodChange(student.id, key)}
                            className="sr-only"
                          />
                          <Icon className="w-4 h-4" />
                          <span>{copy[label]}</span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              </div>
            )
          })}

          {/* F3 (fix round 1) — counts CHARGEABLE children, not every registered child: a
              family of two where one is awaiting manager review has exactly one payer,
              and "one form either way" is not a multi-child note. */}
          {chargeable.length >= 2 &&
          chargeable.some((student) => (methods[student.id] ?? 'credit') === 'standing_order') ? (
            <div className="bg-[#0056c5]/10 border border-[#0056c5]/20 rounded-xl p-3 flex items-start gap-2 text-[#001849]">
              <Repeat className="w-4 h-4 text-[#0056c5] shrink-0 mt-0.5" />
              <p className="text-[12px] leading-relaxed">{copy.standingOrderMultiNote}</p>
            </div>
          ) : null}

          {/* §6.5 — the breakdown */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#dee2f4] flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-[#dee2f4] pb-2">
              <span className="text-[15px] font-bold text-[#001849]">{copy.breakdownTitle}</span>
              <span className="text-[11px] text-[#0056c5] font-semibold">{copy.insuranceIncluded}</span>
            </div>

            {awaiting.length > 0 ? (
              <div className="flex items-center justify-between py-1.5 bg-amber-50/70 px-2.5 rounded-lg text-amber-900 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12.5px] font-bold">
                      {copy.awaitingRow} ({awaiting.length})
                    </span>
                    <span className="text-[11px] text-amber-700 truncate">
                      {awaiting.map((s) => `${s.firstName} ${s.lastName}`.trim()).join(', ')}
                    </span>
                  </div>
                </div>
                <span className="text-[13px] font-bold text-amber-800 shrink-0">
                  {copy.noCharge} (₪0)
                </span>
              </div>
            ) : null}

            {creditSum > 0 ? (
              <div className="flex items-center justify-between py-1 border-b border-[#f2f3ff] gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard className="w-5 h-5 text-[#0056c5] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-[#161b28]">{copy.creditRow}</span>
                    <span className="text-[11px] text-[#444650]">{copy.creditRowSub}</span>
                  </div>
                </div>
                <span className="text-[16px] font-bold text-[#0056c5] shrink-0">
                  ₪{formatShekels(creditSum)}
                </span>
              </div>
            ) : null}

            {coachSum > 0 ? (
              <div className="flex items-center justify-between py-1 border-b border-[#f2f3ff] gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Handshake className="w-5 h-5 text-[#001849] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-[#001849]">{copy.coachRow}</span>
                    <span className="text-[11px] text-[#444650]">{copy.coachRowSub}</span>
                  </div>
                </div>
                <span className="text-[16px] font-bold text-[#001849] shrink-0">
                  ₪{formatShekels(coachSum)}
                </span>
              </div>
            ) : null}

            {chargeable.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-[12.5px] text-amber-900 font-semibold leading-relaxed">
                {copy.allAwaiting}
              </div>
            ) : null}

            {coachSum > 0 ? (
              <div className="bg-[#0056c5]/10 border border-[#0056c5]/20 rounded-xl p-2.5 flex items-start gap-2 text-[#001849]">
                <Handshake className="w-4 h-4 text-[#0056c5] shrink-0 mt-0.5" />
                <p className="text-[12px] leading-relaxed">{copy.coachNote}</p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <footer className="fixed bottom-0 inset-x-0 z-30 bg-[#faf8ff]/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(15,23,42,0.08)] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] px-4 border-t border-[#dee2f4]">
        <div className="max-w-[480px] mx-auto flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {phase === 'form' ? (
              <button
                type="button"
                onClick={subView === 'methods' ? () => setSubView('decision') : onBack}
                className="h-12 px-4 rounded-xl bg-[#e9edff] hover:bg-[#dee2f4] text-[#001849] text-[14px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                {copy.back}
              </button>
            ) : null}
            <button
              type="button"
              disabled={phase === 'working'}
              onClick={onFooter}
              className={`flex-1 h-12 rounded-xl text-white text-[15px] font-bold shadow-md transition-all flex items-center justify-center gap-2 ${
                phase === 'working'
                  ? 'bg-[#757681] cursor-not-allowed'
                  : 'bg-[#001849] hover:bg-[#0056c5] active:scale-[0.99] cursor-pointer'
              }`}
            >
              <span className="truncate">{footerLabel()}</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[#444650] text-[11px]">
            <Lock className="w-3.5 h-3.5 text-[#0056c5]" />
            <span>{copy.secureNote}</span>
          </div>
        </div>
      </footer>

      {frame ? (
        <PaymentFrame
          locale={locale}
          request={frame}
          onComplete={completeFrame}
          onClose={dismissFrame}
          orderStatus={orderStatus}
        />
      ) : null}
    </div>
  )
}
