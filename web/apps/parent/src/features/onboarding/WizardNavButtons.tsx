import type { CSSProperties } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

export type WizardNavButtonsProps = {
  backTestId?: string
  forwardDisabled?: boolean
  forwardLabel?: string
  forwardTestId?: string
  locale: Locale
  onBack?: () => void
  onForward: () => void
}

export function WizardNavButtons({
  backTestId = 'onboarding-wizard-back',
  forwardDisabled = false,
  forwardLabel,
  forwardTestId = 'onboarding-wizard-forward',
  locale,
  onBack,
  onForward,
}: WizardNavButtonsProps) {
  return (
    <div style={rowStyle}>
      {onBack ? (
        <Button data-testid={backTestId} onClick={onBack} type="button" variant="ghost">
          {t(locale, 'health.agreement.back')}
        </Button>
      ) : null}
      <Button
        data-testid={forwardTestId}
        disabled={forwardDisabled}
        onClick={onForward}
        type="button"
        variant="primary"
      >
        {forwardLabel ?? t(locale, 'health.agreement.next')}
      </Button>
    </div>
  )
}
