// §2 -- the chrome above steps 1-3. Step 4 takes the whole screen and does not render it.
//
// The prototype's header carries a fourth row of "מסך 1..4" quick-jump buttons. It is a
// design-review affordance and is NOT ported (spec §2, §16 item 5).
import { ArrowRight, Check, User } from 'lucide-react'
import { STEP1_COPY } from './content'

export type WizardStep = 1 | 2 | 3 | 4

const STEP_PILLS = [
  { step: 1 as const, title: 'תנאי הצטרפות' },
  { step: 2 as const, title: 'פרטי מתאמנים' },
  { step: 3 as const, title: 'תשלום וסיכום' },
]

const STEP_DETAIL: Record<WizardStep, { title: string; stage: string; percent: number }> = {
  1: { title: 'הסכמים ותנאי הצטרפות', stage: 'שלב 1 מתוך 3: הסכמים ותקנון', percent: 33 },
  2: { title: 'רישום מתאמנים לעונה', stage: 'שלב 2 מתוך 3: פרטי מתאמנים', percent: 67 },
  3: { title: 'תשלום וסיכום הצטרפות', stage: 'שלב 3 מתוך 3: תשלום וסיכום', percent: 100 },
  4: { title: 'ברוכים הבאים למשפחה', stage: 'הרישום הושלם בהצלחה', percent: 100 },
}

export type WizardHeaderProps = {
  currentStep: WizardStep
  studioName: string
  logoUrl?: string | null
  /** Refused when the step being left has not been completed. §14.2 -- the prototype's
   *  pills navigate unconditionally, which walks straight past step 1's agreement gate. */
  onNavigate: (step: WizardStep) => void
  onBack: () => void
}

export function WizardHeader({
  currentStep,
  studioName,
  logoUrl,
  onNavigate,
  onBack,
}: WizardHeaderProps) {
  const current = STEP_DETAIL[currentStep]

  return (
    <header className="tw-scope fixed top-0 w-full z-40 bg-[#faf8ff]/95 backdrop-blur-xl border-b border-[#e9edff] shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
      <div className="max-w-[480px] mx-auto px-4 pt-2.5 pb-2 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="חזרה לשלב הקודם"
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#161b28] hover:bg-[#e9edff] active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-2" />
            )}

            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-9 w-auto object-contain bg-transparent shrink-0"
              />
            ) : null}

            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-[#444650] leading-none">
                {studioName}
              </span>
              <h1 className="text-[16px] font-bold text-[#161b28] leading-tight truncate mt-0.5">
                {current.title}
              </h1>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-[#001849] flex items-center justify-center shrink-0 shadow-sm text-white">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="flex items-center justify-between text-[#444650] text-[13px] font-medium mb-1.5 px-0.5">
          <span className="font-bold text-[#001849]">{current.stage}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#444650] font-medium">{STEP1_COPY.completedLabel}</span>
            <span className="text-[12.5px] font-extrabold text-[#0056c5] bg-[#e9edff] px-2 py-0.5 rounded-md">
              {current.percent}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 w-full mb-1.5">
          {STEP_PILLS.map((item) => {
            const isCompleted = currentStep > item.step
            const isCurrent = currentStep === item.step
            return (
              <button
                key={item.step}
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onNavigate(item.step)}
                className={`flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#001849] text-white shadow-xs ring-2 ring-[#001849]/20'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-[#f2f3ff] text-[#757681] hover:bg-[#e9edff]'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                ) : (
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9.5px] font-black ${
                      isCurrent ? 'bg-white text-[#001849]' : 'bg-[#dee2f4] text-[#444650]'
                    }`}
                  >
                    {item.step}
                  </span>
                )}
                <span className="truncate">{item.title}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="w-full h-2 bg-[#dee2f4] overflow-hidden relative shadow-inner"
        role="progressbar"
        aria-valuenow={current.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="מד התקדמות תהליך הרישום"
      >
        <div
          className="h-full bg-gradient-to-r from-[#0056c5] via-[#2563eb] to-[#0d2c6c] transition-all duration-500 ease-out"
          style={{ width: `${current.percent}%` }}
        />
      </div>
    </header>
  )
}
