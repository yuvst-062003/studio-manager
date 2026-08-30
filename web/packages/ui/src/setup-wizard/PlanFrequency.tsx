// How often a plan lets a student train — the question both places that create a plan ask.
//
// It lives in its own file because there are two of them: the setup wizard's step 4 and
// the standing מחירים ומסלולים screen. The wizard's was rebuilt on 2026-08-29 and the
// screen's was not, so the same club saw two different designs for one decision and the
// owner reported the menu screen as "didn't change to the new design". Sharing the control
// is what stops that happening again the next time either is touched.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { agorotFromShekels } from '@studio/core'
import { Button } from '../primitives/Button'
import { MoneyDisplay } from '../primitives/MoneyDisplay'

/**
 * The ladder, with `null` for open membership.
 *
 * `price_plan.sessions_per_week` is nullable and its own docstring gives this club's
 * shape: "300 → 0, 400 → 1, 550 → NULL = unlimited". Both were a bare numeric box labelled
 * חל על ("applies to") — no unit, no example, nothing saying what a good answer was.
 */
export const FREQUENCIES: readonly (number | null)[] = [1, 2, 3, 4, 5, null]

/** "3 אימונים בשבוע", or "מנוי חופשי" for the open plan. */
export function frequencyLabel(locale: Locale, perWeek: number | null): string {
  return perWeek === null
    ? t(locale, 'billing.plan.unlimited')
    : t(locale, 'billing.plan.perWeek').replace('{{count}}', String(perWeek))
}

/** The choice itself. `undefined` means the manager has not answered yet. */
export function PlanFrequencyPicker({
  locale,
  value,
  onChange,
}: {
  locale: Locale
  value: number | null | undefined
  onChange: (next: number | null) => void
}) {
  return (
    <fieldset className="plan-frequency" data-testid="wizard-plan-frequency">
      <legend className="plan-frequency__legend">{t(locale, 'billing.plan.howOften')}</legend>
      <div className="plan-frequency__options">
        {FREQUENCIES.map((option) => (
          <Button
            data-selected={value === option}
            data-testid={`wizard-plan-freq-${option ?? 'open'}`}
            key={String(option)}
            onClick={() => onChange(option)}
            variant={value === option ? 'secondary' : 'ghost'}
          >
            {frequencyLabel(locale, option)}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * The plan as one sentence, before it is created.
 *
 * "400 – 3 times a week" is how a club says it out loud, and this is the only place the
 * two answers meet. `MoneyDisplay` keeps the amount an LTR island so the sentence does not
 * reorder around the currency sign in an RTL row.
 */
export function PlanPreview({
  locale,
  name,
  perWeek,
  shekels,
}: {
  locale: Locale
  name: string
  perWeek: number | null | undefined
  shekels: string
}) {
  if (perWeek === undefined || shekels.trim() === '') return null
  return (
    <p className="plan-preview" data-testid="wizard-plan-preview">
      <strong>{name.trim() || frequencyLabel(locale, perWeek)}</strong>
      <span>·</span>
      <MoneyDisplay
        agorot={agorotFromShekels(shekels)}
        label={t(locale, 'billing.plan.monthlyAmount')}
      />
      <span>{t(locale, 'billing.plan.perMonth')}</span>
    </p>
  )
}
