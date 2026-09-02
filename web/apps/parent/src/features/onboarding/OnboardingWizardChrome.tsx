import type { CSSProperties, ReactNode } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export const ONBOARDING_WIZARD_STEPS = [
  { key: 'consent', label: 'health.onboarding.step.consent' },
  { key: 'terms', label: 'health.onboarding.step.terms' },
  { key: 'family', label: 'health.onboarding.step.family' },
  { key: 'health', label: 'health.onboarding.step.health' },
  { key: 'payment', label: 'health.onboarding.step.payment' },
] as const

export const ONBOARDING_WIZARD_TOTAL = ONBOARDING_WIZARD_STEPS.length

/** The one place a step key becomes a position number — every screen reads through this
 *  rather than hardcoding its own, so the rail and the "step X of Y" counter cannot drift
 *  out of agreement with each other the way `family` and `health` used to. */
export function stepPosition(key: (typeof ONBOARDING_WIZARD_STEPS)[number]['key']): number {
  return ONBOARDING_WIZARD_STEPS.findIndex((step) => step.key === key) + 1
}

function stepPositionLabel(locale: Locale, position: number): string {
  return t(locale, 'health.onboarding.stepOf')
    .replace('{current}', String(position))
    .replace('{total}', String(ONBOARDING_WIZARD_TOTAL))
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
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
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
}

export function OnboardingWizardChrome({
  children,
  locale,
  onBack,
  position,
  title,
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
            {stepPositionLabel(locale, position)}
          </span>
        </div>
        <div
          aria-label={t(locale, 'health.onboarding.rail')}
          data-testid="join-onboarding-rail"
          style={railStyle}
        >
          {ONBOARDING_WIZARD_STEPS.map((item, index) => {
            const stepNumber = index + 1
            const current = stepNumber === position
            const done = stepNumber < position
            return (
              <span
                aria-current={current ? 'step' : undefined}
                data-testid={`join-onboarding-rail-${item.key}`}
                key={item.key}
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
