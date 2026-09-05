// §6 -- payment. Two sub-views behind one screen: the question, then the per-child methods.
//
// **The prototype's success dialog is not ported.** Choosing "already arranged" there pops
// a card reading הדיווח נקלט בהצלחה! and "a message was sent to the coach" -- before
// anything has been written, because the whole wizard writes at this screen's final button
// (§6.3, §14). It also skips the method picker entirely, so the club never learns HOW the
// payment was arranged. Here the choice routes into the same sub-view B with a note saying
// the report goes to the coach ON COMPLETION, which is both honest and better data.
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  Clock,
  CreditCard,
  Handshake,
  HelpCircle,
  Lock,
  Receipt,
  Repeat,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { STEP3_COPY } from './content'
import { formatShekels, needsManagerReview } from './types'
import type { PaymentMethod, StudentDraft, WizardPlan } from './types'

type SubView = 'decision' | 'methods'
type Intent = 'now' | 'arranged'

const METHOD_BUTTONS: readonly { key: PaymentMethod; label: keyof typeof STEP3_COPY; Icon: typeof CreditCard }[] = [
  { key: 'credit', label: 'methodCredit', Icon: CreditCard },
  { key: 'cash', label: 'methodCash', Icon: Banknote },
  { key: 'cheque', label: 'methodCheque', Icon: Receipt },
  { key: 'standing_order', label: 'methodStandingOrder', Icon: Repeat },
]

const LONG_LABEL: Record<PaymentMethod, keyof typeof STEP3_COPY> = {
  credit: 'methodCreditLong',
  cash: 'methodCashLong',
  cheque: 'methodChequeLong',
  standing_order: 'methodStandingOrderLong',
}

export type Step3PaymentProps = {
  students: readonly StudentDraft[]
  plans: readonly WizardPlan[]
  methods: Readonly<Record<string, PaymentMethod>>
  onMethodChange: (studentId: string, method: PaymentMethod) => void
  onBack: () => void
  onSubmit: () => void
}

export function Step3Payment({
  students,
  plans,
  methods,
  onMethodChange,
  onBack,
  onSubmit,
}: Step3PaymentProps) {
  const copy = STEP3_COPY
  const [subView, setSubView] = useState<SubView>('decision')
  const [intent, setIntent] = useState<Intent>('now')

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

  const footerLabel = () => {
    if (subView === 'decision') return intent === 'now' ? copy.continueToPay : copy.reportArranged
    if (chargeable.length === 0) return copy.submitReviewOnly
    if (creditSum > 0) return `${copy.submitWithCredit} (₪${formatShekels(creditSum)})`
    return copy.submitNoCredit
  }

  const onFooter = () => (subView === 'decision' ? setSubView('methods') : onSubmit())

  return (
    <div className="tw-scope flex flex-col w-full pb-36">
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

      {subView === 'decision' ? (
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
                  <div className="grid grid-cols-4 gap-1.5">
                    {METHOD_BUTTONS.map(({ key, label, Icon }) => {
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

      <footer className="fixed bottom-0 inset-x-0 z-30 bg-[#faf8ff]/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(15,23,42,0.08)] py-3 px-4 border-t border-[#dee2f4]">
        <div className="max-w-[480px] mx-auto flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={subView === 'methods' ? () => setSubView('decision') : onBack}
              className="h-12 px-4 rounded-xl bg-[#e9edff] hover:bg-[#dee2f4] text-[#001849] text-[14px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              {copy.back}
            </button>
            <button
              type="button"
              onClick={onFooter}
              className="flex-1 h-12 rounded-xl bg-[#001849] hover:bg-[#0056c5] active:scale-[0.99] text-white text-[15px] font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
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
    </div>
  )
}
