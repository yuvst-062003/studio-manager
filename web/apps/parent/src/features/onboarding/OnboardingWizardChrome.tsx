import type { CSSProperties, ReactNode } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export const ONBOARDING_WIZARD_STEPS = [
  { key: 'welcome', label: 'health.onboarding.step.welcome' },
  { key: 'family', label: 'health.onboarding.step.family' },
  { key: 'health', label: 'health.onboarding.step.health' },
  { key: 'payment', label: 'health.onboarding.step.payment' },
] as const

export type WizardStepKey = (typeof ONBOARDING_WIZARD_STEPS)[number]['key']

export const ONBOARDING_WIZARD_TOTAL = ONBOARDING_WIZARD_STEPS.length

const DEFAULT_STEP_KEYS: readonly WizardStepKey[] = ONBOARDING_WIZARD_STEPS.map(
  (step) => step.key,
)

/** The one place a step key becomes a position number — every screen reads through this
 *  rather than hardcoding its own, so the rail and the "step X of Y" counter cannot drift
 *  out of agreement with each other the way `family` and `health` used to.
 *
 *  **Wave E's `steps` param.** §3's door table gives each door its OWN step list --
 *  Door A has no payment step at all, and Door D's agreements step may or may not exist
 *  depending on the status. Defaulting to the full 4-step list is what keeps every
 *  existing call site (Doors B/C, unchanged) working without passing anything new. */
export function stepPosition(
  key: WizardStepKey,
  steps: readonly WizardStepKey[] = DEFAULT_STEP_KEYS,
): number {
  return steps.indexOf(key) + 1
}

function stepPositionLabel(locale: Locale, position: number, total: number): string {
  return t(locale, 'health.onboarding.stepOf')
    .replace('{current}', String(position))
    .replace('{total}', String(total))
}

const barStyle: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  gap: 'var(--space-3)',
  paddingBlockEnd: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  flex: '1 1 auto',
  fontSize: 'var(--text-body)',
  fontWeight: 500,
  margin: 0,
}

const countStyle: CSSProperties = {
  color: 'var(--text-muted)',
  flex: 'none',
  fontSize: 'var(--text-caption)',
}

const railStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  paddingBlockStart: 'var(--space-2)',
}

const segmentBase: CSSProperties = {
  background: 'var(--border-strong)',
  blockSize: '0.1875rem',
  borderRadius: '0.125rem',
  flex: '1 1 0',
}

export type OnboardingWizardChromeProps = {
  children: ReactNode
  locale: Locale
  onBack?: () => void
  position: number
  title: string
  /** Wave E -- the door's OWN step list (§3's table), so the rail and the "step X of Y"
   *  counter reflect what THIS door actually has rather than always assuming all 4.
   *  Defaults to the full 4-step list, which is Door B/C's list and every existing call
   *  site's unchanged behaviour. */
  steps?: readonly WizardStepKey[]
}

export function OnboardingWizardChrome({
  children,
  locale,
  onBack,
  position,
  title,
  steps = DEFAULT_STEP_KEYS,
}: OnboardingWizardChromeProps) {
  return (
    <>
      <header>
        <div style={barStyle}>
          {onBack ? (
            <Button
              aria-label={t(locale, 'health.agreement.back')}
              data-testid="onboarding-wizard-back"
              onClick={onBack}
              type="button"
              variant="ghost"
            >
              {t(locale, 'health.agreement.back')}
            </Button>
          ) : (
            <span aria-hidden style={{ flex: 'none', inlineSize: '0.25rem' }} />
          )}
          <h1 style={titleStyle}>{title}</h1>
          <span data-testid="join-step-position" style={countStyle}>
            {stepPositionLabel(locale, position, steps.length)}
          </span>
        </div>
        <div
          aria-label={t(locale, 'health.onboarding.rail')}
          data-testid="join-onboarding-rail"
          style={railStyle}
        >
          {steps.map((key, index) => {
            const stepNumber = index + 1
            const current = stepNumber === position
            const done = stepNumber < position
            return (
              <span
                aria-current={current ? 'step' : undefined}
                data-testid={`join-onboarding-rail-${key}`}
                key={key}
                style={{
                  ...segmentBase,
                  background: current || done ? 'var(--accent)' : 'var(--border-strong)',
                }}
              />
            )
          })}
        </div>
      </header>
      {children}
    </>
  )
}
