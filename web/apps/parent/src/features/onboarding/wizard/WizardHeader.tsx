// §2 -- the chrome above steps 1-3. Step 4 takes the whole screen and does not render it.
//
// The prototype's header carries a fourth row of "מסך 1..4" quick-jump buttons. It is a
// design-review affordance and is NOT ported (spec §2, §16 item 5).
import { ArrowRight, Check, User } from 'lucide-react'
import type { Locale } from '@studio/i18n'
import { t } from '@studio/i18n'
import { step1Copy } from './copy'

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
  locale: Locale
  currentStep: WizardStep
  studioName: string
  logoUrl?: string | null
  /** Refused when the step being left has not been completed. §14.2 -- the prototype's
   *  pills navigate unconditionally, which walks straight past step 1's agreement gate. */
  onNavigate: (step: WizardStep) => void
  onBack: () => void
}

export function WizardHeader({
  locale,
  currentStep,
  studioName,
  logoUrl,
  onNavigate,
  onBack,
}: WizardHeaderProps) {
  const copy = step1Copy(locale)
  const current = STEP_DETAIL[currentStep]

  return (
    <header className="tw-scope fixed top-0 w-full z-40 bg-[var(--wz-ground)]/95 backdrop-blur-xl border-b border-[var(--wz-tint)] shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
      <div className="max-w-[480px] mx-auto px-4 pt-2.5 pb-2 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t(locale, 'people.joinWizard.header.back')}
                className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--wz-ink)] hover:bg-[var(--wz-tint)] active:scale-95 transition-all shrink-0 cursor-pointer"
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
              <span className="text-[11px] font-semibold text-[var(--wz-secondary)] leading-none">
                {studioName}
              </span>
              <h1 className="text-[16px] font-bold text-[var(--wz-ink)] leading-tight truncate mt-0.5">
                {current.title}
              </h1>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-[var(--wz-btn-bg)] flex items-center justify-center shrink-0 shadow-sm text-white">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="flex items-center justify-between text-[var(--wz-secondary)] text-[13px] font-medium mb-1.5 px-0.5">
          <span className="font-bold text-[var(--wz-heading)]">{current.stage}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--wz-secondary)] font-medium">{copy.completedLabel}</span>
            <span className="text-[12.5px] font-extrabold text-[var(--wz-accent)] bg-[var(--wz-tint)] px-2 py-0.5 rounded-md">
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
                    ? 'bg-[var(--wz-btn-bg)] text-white shadow-xs ring-2 ring-[var(--wz-heading)]/20'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-[var(--wz-raised)] text-[var(--wz-tertiary)] hover:bg-[var(--wz-tint)]'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                ) : (
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9.5px] font-black ${
                      isCurrent ? 'bg-[var(--wz-surface)] text-[var(--wz-heading)]' : 'bg-[var(--wz-line)] text-[var(--wz-secondary)]'
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
        className="w-full h-2 bg-[var(--wz-line)] overflow-hidden relative shadow-inner"
        role="progressbar"
        aria-valuenow={current.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="מד התקדמות תהליך הרישום"
      >
        <div
          className="h-full bg-gradient-to-r from-[var(--wz-accent)] via-[var(--wz-accent)] to-[var(--wz-accent-deep)] transition-all duration-500 ease-out"
          style={{ width: `${current.percent}%` }}
        />
      </div>
    </header>
  )
}
