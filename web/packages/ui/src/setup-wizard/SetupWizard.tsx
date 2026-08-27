// SPEC §5.1's resumable setup wizard — the container, and nothing that belongs to a step.
//
// Six steps, four of them M1's. M7 registers `belts` at order 2 and M6 registers `prices`
// at order 4, each as one file plus one barrel line. **This file is never reopened for
// them**, which is the whole reason the steps are slot entries and not a switch statement.
//
// There is no new `SlotId`: 'setup-wizard' is one of the five M0 declared, and
// `web/apps/parent/src/features/identity/Resolve.tsx` already refused to invent a sixth
// for a comparable case. The M2/M3 gaps inside steps 3 and 6 do not get sub-slots either —
// each of those two step files has exactly one later owner, named in its own header.
//
// Layout: the flow is drawn at 1440×900, and it must also work at 390. Both the dashboard
// and the staff app mount this in place, per §5.1's "the staff app and dashboard" — a
// redirect from staff to the dashboard was considered and rejected, because an owner doing
// setup on a phone is a normal case rather than an error.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { LoadFailed } from '../primitives/LoadFailed'
import type { Locale } from '@studio/i18n'
import { useSlot } from '../slots'
import { Button } from '../primitives/Button'
import { WIZARD_STEP_ORDER } from './types'
import type { SetupProgress, WizardStep, WizardStepId, WizardStepProps } from './types'

/** Injected so the container has no opinion about how the app talks to the API. */
export type SetupClient = {
  read: () => Promise<SetupProgress>
  setStep: (stepId: WizardStepId, status: 'done' | 'skipped') => Promise<SetupProgress>
  dismiss: () => Promise<SetupProgress>
}

const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // The narrow layout is the default and the wide one is the enhancement, rather than the
  // other way round. A max-width with `margin-inline: auto` centres at 1440 and costs
  // nothing at 390.
  maxWidth: '72rem',
  marginInline: 'auto',
  width: '100%',
}

const railStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const stepChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  // Logical properties throughout (G12): the rail runs right-to-left in he and
  // left-to-right in en, and `padding-left` would be wrong in one of them.
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--surface)',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
}

const spacerStyle: CSSProperties = { marginInlineStart: 'auto' }

function statusLabel(locale: Locale, status: WizardStep['status']): string {
  return t(locale, `common.setup.status.${status}`)
}

export function SetupWizard({
  client,
  locale,
  onExit,
}: {
  client: SetupClient
  locale: Locale
  /** Both of §5.1's exits land here — the container does not know which screen follows. */
  onExit?: (reason: 'dashboard' | 'later') => void
}) {
  const entries = useSlot<WizardStepProps>('setup-wizard')
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [activeId, setActiveId] = useState<WizardStepId | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    void client
      .read()
      .then((next) => {
        if (alive) setProgress(next)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [client, attempt])

  const steps = useMemo(() => progress?.steps ?? [], [progress])

  // §5.1 — 'progress is persisted so the wizard survives a closed app'. Resuming means
  // landing on the first step that has not been reported yet, not on step 1: an owner who
  // finished three steps last night and is sent back to the first of them will conclude
  // nothing was saved.
  const resumeId = useMemo<WizardStepId | null>(() => {
    const registered = new Set(entries.map((entry) => entry.key as WizardStepId))
    const pending = steps.find(
      (step) => step.status === 'pending' && registered.has(step.id as WizardStepId),
    )
    if (pending) return pending.id as WizardStepId
    const first = steps.find((step) => registered.has(step.id as WizardStepId))
    return (first?.id as WizardStepId | undefined) ?? null
  }, [entries, steps])

  const current = activeId ?? resumeId

  const report = useCallback(
    async (stepId: WizardStepId, status: 'done' | 'skipped') => {
      const next = await client.setStep(stepId, status)
      setProgress(next)
      // Advance to the next step that still needs an answer, staying inside what is
      // actually registered — otherwise skipping `groups` in M1 lands on `prices`, which
      // M6 has not built yet, and the owner sees an empty panel.
      const registered = entries.map((entry) => entry.key as WizardStepId)
      const order = WIZARD_STEP_ORDER.filter((id) => registered.includes(id))
      const after = order.slice(order.indexOf(stepId) + 1)
      const following = next.steps.find(
        (step) => after.includes(step.id as WizardStepId) && step.status === 'pending',
      )
      setActiveId((following?.id as WizardStepId | undefined) ?? stepId)
    },
    [client, entries],
  )

  if (failed) {
    return (
      <section aria-labelledby="setup-title" data-testid="setup-wizard">
        <h2 id="setup-title">{t(locale, 'common.setup.title')}</h2>
        <LoadFailed
          detail={t(locale, 'common.setup.loadFailed')}
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  if (progress === null) {
    return <p data-testid="setup-loading">{t(locale, 'common.setup.loading')}</p>
  }

  const active = entries.find((entry) => entry.key === current)
  const activeStep = steps.find((step) => step.id === current)
  const StepBody = active?.render
  const position = current ? WIZARD_STEP_ORDER.indexOf(current) + 1 : 0

  return (
    <section aria-labelledby="setup-title" data-testid="setup-wizard" style={shellStyle}>
      <header>
        <h2 id="setup-title">{t(locale, 'common.setup.title')}</h2>
        {position > 0 ? (
          <p data-testid="setup-position">
            {t(locale, 'common.setup.stepOfSix').replace('{n}', String(position))}
          </p>
        ) : null}
        <p>{t(locale, 'common.setup.welcome')}</p>
        {/* §5.1's reassurance, verbatim from artboard 5c. It is the sentence that makes
            skipping feel safe, so it belongs on every step and not only the first. */}
        <p>{t(locale, 'common.setup.nothingSentYet')}</p>
      </header>

      {/* An ordered list, so a screen reader announces "3 of 6" without the visual rail
          having to say it. `aria-current` names the one being worked on. */}
      <ol aria-label={t(locale, 'common.setup.progressLabel')} style={railStyle}>
        {steps.map((step) => {
          const registered = entries.some((entry) => entry.key === step.id)
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={step.id === current ? 'step' : undefined}
                data-testid={`setup-rail-${step.id}`}
                data-status={step.status}
                disabled={!registered}
                onClick={() => setActiveId(step.id as WizardStepId)}
                style={stepChipStyle}
              >
                <span>{t(locale, `common.setup.step.${step.id}`)}</span>
                {/* Never colour alone (SC 1.4.1) — the state is written out. */}
                <span data-testid={`setup-rail-${step.id}-status`}>
                  {statusLabel(locale, step.status)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div data-testid="setup-step-body">
        {StepBody && activeStep && current ? (
          <StepBody
            locale={locale}
            status={activeStep.status}
            onDone={() => void report(current, 'done')}
            onSkip={() => void report(current, 'skipped')}
          />
        ) : (
          <p data-testid="setup-step-unbuilt">{t(locale, 'common.setup.stepNotBuilt')}</p>
        )}
      </div>

      <footer style={footerStyle}>
        {/* §5.1's two exits, both from artboard 5f. `dismiss` stops auto-routing and says
            nothing about completeness — the two are separate on the server for the same
            reason they are separate here. */}
        <Button
          onClick={() => {
            void client.dismiss().then((next) => {
              setProgress(next)
              onExit?.('dashboard')
            })
          }}
        >
          {t(locale, 'common.setup.openDashboard')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void client.dismiss().then((next) => {
              setProgress(next)
              onExit?.('later')
            })
          }}
        >
          {t(locale, 'common.setup.continueLater')}
        </Button>
        <span style={spacerStyle} data-testid="setup-complete">
          {progress.complete
            ? t(locale, 'common.setup.complete')
            : t(locale, 'common.setup.incomplete')}
        </span>
      </footer>
    </section>
  )
}
