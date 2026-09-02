import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DeclarationForm } from '../health/DeclarationForm'
import type { HealthClient } from '../health/healthClient'
import { needsFullDeclaration, type GatedStudent } from '../health/HealthGate'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'

const queueStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const pillStyle: CSSProperties = {
  borderRadius: '999px',
  fontSize: 'var(--text-caption)',
  padding: 'var(--space-1) var(--space-2)',
}

export type JoinHealthStepProps = {
  client: HealthClient
  locale: Locale
  onBack: () => void
  onSigned: () => void
  signerName?: string
  students: readonly GatedStudent[]
}

export function JoinHealthStep({
  client,
  locale,
  onBack,
  onSigned,
  signerName,
  students,
}: JoinHealthStepProps) {
  const queue = students.filter(needsFullDeclaration)
  const current = queue[0] ?? null

  if (!current) return null

  return (
    <div data-testid="join-health-step">
      <OnboardingWizardChrome
        locale={locale}
        onBack={onBack}
        position={stepPosition('health')}
        title={t(locale, 'health.onboarding.step.health')}
      >
        {queue.length > 1 ? (
          <div
            aria-label={t(locale, 'health.onboarding.healthQueue')}
            data-testid="join-health-queue"
            style={queueStyle}
          >
            {queue.map((subject, index) => {
              const active = subject.id === current.id
              const done = subject.health_status === 'signed'
              return (
                <span
                  aria-current={active ? 'step' : undefined}
                  data-testid={`join-health-subject-${subject.id}`}
                  key={subject.id}
                  style={{
                    ...pillStyle,
                    background: active
                      ? 'var(--accent)'
                      : done
                        ? 'color-mix(in srgb, var(--paid) 12%, var(--surface))'
                        : 'color-mix(in srgb, var(--pending) 8%, var(--surface))',
                    color: active ? 'var(--surface)' : 'var(--text-muted)',
                  }}
                >
                  <bdi>{subject.display_name}</bdi>
                  {' · '}
                  {index + 1}/{queue.length}
                </span>
              )
            })}
          </div>
        ) : null}

        <p style={{ margin: 0 }}>
          {t(locale, 'health.declaration.forChild')} <bdi>{current.display_name}</bdi>
        </p>

        <DeclarationForm
          client={client}
          locale={locale}
          onSubmitted={onSigned}
          signerName={signerName}
          studentId={current.id}
          studentName={current.display_name}
        />
      </OnboardingWizardChrome>
    </div>
  )
}
