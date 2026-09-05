// §5.4 -- part 3. HOW OFTEN the child trains, on top of the base group's two sessions.
//
// `app/models/training_plan.py`: "Base training on Tuesday and Friday is included in every
// plan and is never marked; 400 buys one extra session a week, which the student must mark,
// after which the app stops letting them mark more; 550 removes the weekly limit and opens
// the Saturday private lesson."
//
// So a plan exceeding the base group's two sessions is the product, not a mismatch. The
// wizard only sets `price_plan_id`; booking the extra session is a parent-app feature.
import { Check, CheckCircle2, CreditCard } from 'lucide-react'
import { STUDENT_FORM_COPY } from '../content'
import type { WizardPlan } from '../types'

const shekels = (agorot: number) => Math.round(agorot / 100).toLocaleString('he-IL')

export function PartPlan({
  plans,
  selectedId,
  onSelect,
  error,
}: {
  plans: readonly WizardPlan[]
  selectedId: string
  onSelect: (id: string) => void
  error: string | null
}) {
  const copy = STUDENT_FORM_COPY

  return (
    <fieldset className="flex flex-col gap-3.5 border-0 p-0 m-0">
      <legend className="contents">
        <div className="flex items-center gap-2 pb-1 pt-0.5">
          <div className="w-8 h-8 rounded-lg bg-[#0056c5]/15 flex items-center justify-center text-[#0056c5] shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="text-right">
            <h4 className="text-[17px] text-[#001849] font-bold leading-tight">{copy.planTitle}</h4>
            <p className="text-[12px] text-[#444650]">{copy.planLead}</p>
          </div>
        </div>
      </legend>

      <div className="flex flex-col gap-3">
        {plans.map((plan) => {
          const isSelected = selectedId === plan.id
          const inverted = isSelected && plan.isRecommended
          return (
            <label
              key={plan.id}
              className={`group relative flex flex-col p-4 rounded-2xl cursor-pointer transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                plan.isRecommended ? 'shadow-lg pt-5' : 'shadow-2xs'
              } ${
                inverted
                  ? 'bg-[#001849] text-white border-2 border-[#0056c5] ring-2 ring-[#0056c5]/20'
                  : isSelected
                    ? 'bg-white border-2 border-[#0056c5] shadow-md'
                    : 'bg-white border-2 border-[#c5c6d2]/40 hover:border-[#0056c5]'
              }`}
            >
              <input
                type="radio"
                name="wizard-plan"
                value={plan.id}
                checked={isSelected}
                onChange={() => onSelect(plan.id)}
                className="sr-only"
              />

              {plan.badge ? (
                <span className="absolute -top-3 start-4 px-3 py-1 rounded-full bg-[#ba1a1a] text-white text-[11px] font-bold flex items-center gap-1 shadow-md">
                  {plan.badge}
                </span>
              ) : null}

              <span className="flex items-start justify-between gap-2">
                <span className="flex flex-col">
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[16px] font-bold ${inverted ? 'text-white' : 'text-[#161b28]'}`}
                    >
                      {plan.title}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                        inverted ? 'bg-white/15 text-[#dae1ff]' : 'bg-[#e9edff] text-[#0056c5]'
                      }`}
                    >
                      {plan.subtitle}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1 mt-2">
                    <span
                      className={`text-[28px] font-bold ${inverted ? 'text-white' : 'text-[#001849]'}`}
                    >
                      ₪{shekels(plan.pricePerMonthAgorot)}
                    </span>
                    <span className={`text-[12px] ${inverted ? 'text-[#b3c5ff]' : 'text-[#444650]'}`}>
                      {copy.perMonth}
                    </span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected
                      ? 'border-[#0056c5] bg-[#0056c5] text-white'
                      : 'border-[#757681] text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              </span>

              <span
                className={`flex flex-col gap-2 mt-3 pt-3 border-t text-[13px] ${
                  inverted ? 'border-white/15 text-[#dae1ff]' : 'border-[#e9edff] text-[#444650]'
                }`}
              >
                {plan.features.map((feature) => (
                  <span key={feature} className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${inverted ? 'text-[#b3c5ff]' : 'text-[#0056c5]'}`}
                    />
                    <span>{feature}</span>
                  </span>
                ))}
              </span>

              <span className="mt-3.5">
                <span
                  className={`w-full py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[#0056c5] text-white shadow-xs'
                      : 'bg-[#e9edff] text-[#001849] group-hover:bg-[#dee2f4]'
                  }`}
                >
                  {isSelected ? copy.planChosen : copy.planChoose}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {error ? (
        <p className="text-[12px] text-red-600 font-medium" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
