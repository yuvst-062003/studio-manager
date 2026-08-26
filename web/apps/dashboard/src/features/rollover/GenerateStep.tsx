// §5.15 step 6 — generate the year's sessions, and show what was created.
//
// **This step is derived, so it never offers a mark.** `PATCH .../steps/generate` answers
// 409: "a manager who acknowledged step 6 without generating would activate a year with an
// empty calendar, and every parent would open the app to nothing." The status the rail shows
// comes from the session count and from nowhere else, which means the honest control here is
// the one that actually generates — plus a "continue" that only moves the container along.
//
// The summary is the point of the screen. §5.15 asks for it by name, and "412 sessions
// across 9 groups" is what tells a manager the weekly rules they set in step 3 were the ones
// they meant — a generation that produced 40 sessions for 9 groups is a schedule that is
// mostly missing, and it is visible in one line here or not until September.
import { useState } from 'react'
import { Button, Card } from '@studio/ui'
import { t } from '@studio/i18n'
import { fill } from './client'
import type { GenerateResult, RolloverClient } from './client'
import type { RolloverStepProps } from './types'
import { StepActions, errorStyle, introStyle, stepStyle } from './StepShell'

export type GenerateStepProps = RolloverStepProps & {
  client: RolloverClient
  trainingYearId: string
  /** `state.sessions_generated` — the count the server derived the status from. */
  sessionsGenerated: number
  onChanged: () => void
}

export function GenerateStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  trainingYearId,
  sessionsGenerated,
  onChanged,
}: GenerateStepProps) {
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setError(null)
    setBusy(true)
    try {
      const generated = await client.generateSessions(trainingYearId)
      setResult(generated)
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.generate.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="rollover-generate-title"
      style={stepStyle}
      data-testid="rollover-step-generate"
    >
      <h2 id="rollover-generate-title">{t(locale, 'schedule.rollover.generate.title')}</h2>
      <p style={introStyle}>{t(locale, 'schedule.rollover.generate.intro')}</p>

      {sessionsGenerated > 0 ? (
        <p data-testid="rollover-generate-existing">
          {fill(t(locale, 'schedule.rollover.generate.existing'), { count: sessionsGenerated })}
        </p>
      ) : null}

      <div>
        <Button
          data-testid="rollover-generate-run"
          disabled={busy}
          onClick={() => void generate()}
        >
          {t(locale, busy ? 'schedule.rollover.generate.running' : 'schedule.rollover.generate.run')}
        </Button>
      </div>

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-generate-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <Card>
          {/* A confirmation of something that just went right — polite, not interrupting. */}
          <p role="status" data-testid="rollover-generate-result">
            {fill(t(locale, 'schedule.rollover.generate.result'), {
              sessions: result.sessions_created,
              groups: result.groups,
            })}
          </p>
        </Card>
      ) : null}

      <StepActions
        locale={locale}
        stepId="generate"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
