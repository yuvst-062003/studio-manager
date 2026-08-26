// §5.15 step 7 — "optionally publish the new schedule to all guardians in one action", and
// then the press that makes the year real.
//
// **Optional means skippable, and skipping must still finish the wizard.** `RolloverState`
// counts `skipped` towards `complete` for a stated reason: "a wizard that will not finish
// because the manager declined to announce is a wizard that trains people to announce things
// they did not want to send." So the skip button is a first-class control beside the publish
// button, not a link hidden under it.
//
// **Activation is a separate press from the announcement, and it is the last one.** §5.15:
// nothing is visible to guardians until the year is activated. The two live on the same step
// because they are the same moment in the manager's head — "tell them, then open it" — but
// they are two buttons because a studio that announces nothing still has to open the year,
// and a studio that announces by mistake must not have opened it as a side effect.
//
// There is no audience picker. `RolloverAnnounceIn` has no `scope_type` — "the step's whole
// definition is *all guardians*, and offering a narrower audience here would be a second
// announcements composer hiding inside a wizard. A manager who wants one group has `4f`."
import { useState } from 'react'
import { Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import { fill } from './client'
import type { RolloverClient, TrainingYear } from './client'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  actionsStyle,
  errorStyle,
  fieldsetStyle,
  introStyle,
  noteStyle,
  stepStyle,
} from './StepShell'

export type AnnounceStepProps = RolloverStepProps & {
  client: RolloverClient
  year: TrainingYear
  onChanged: () => void
}

export function AnnounceStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  year,
  onChanged,
}: AnnounceStepProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [families, setFamilies] = useState<number | null>(null)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function publish() {
    if (!title.trim() || !body.trim()) {
      setError(t(locale, 'schedule.rollover.announce.missing'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await client.announce(year.id, { title: title.trim(), body: body.trim() })
      setFamilies(result.families)
      // Publishing IS the step's outcome, so the step reports itself done rather than
      // waiting for a second press that would only mean "yes, I did the thing you saw".
      onDone()
    } catch {
      setError(t(locale, 'schedule.rollover.announce.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setError(null)
    setBusy(true)
    try {
      await client.activateYear(year.id)
      setActivated(true)
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.announce.activateFailed'))
    } finally {
      setBusy(false)
    }
  }

  const isActive = activated || year.status === 'active'

  return (
    <section
      aria-labelledby="rollover-announce-title"
      style={stepStyle}
      data-testid="rollover-step-announce"
    >
      <h2 id="rollover-announce-title">{t(locale, 'schedule.rollover.announce.title')}</h2>
      <p style={introStyle} data-testid="rollover-announce-optional">
        {t(locale, 'schedule.rollover.announce.optional')}
      </p>

      <section aria-labelledby="rollover-announce-compose">
        <h3 id="rollover-announce-compose">{t(locale, 'schedule.rollover.announce.intro')}</h3>
        <fieldset style={fieldsetStyle}>
          <legend>{t(locale, 'schedule.rollover.announce.subject')}</legend>
          <TextField
            label={t(locale, 'schedule.rollover.announce.subject')}
            data-testid="rollover-announce-subject"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            multiline
            rows={5}
            label={t(locale, 'schedule.rollover.announce.body')}
            data-testid="rollover-announce-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div style={actionsStyle}>
            <Button
              data-testid="rollover-announce-publish"
              disabled={busy}
              onClick={() => void publish()}
            >
              {t(locale, 'schedule.rollover.announce.publish')}
            </Button>
          </div>
        </fieldset>
        {families !== null ? (
          <p role="status" data-testid="rollover-announce-published">
            {fill(t(locale, 'schedule.rollover.announce.published'), { count: families })}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="rollover-activate-title">
        <h3 id="rollover-activate-title">
          {t(locale, 'schedule.rollover.announce.activateTitle')}
        </h3>
        <p style={noteStyle}>{t(locale, 'schedule.rollover.announce.activateIntro')}</p>
        {/* The year's state is a word, always. */}
        <p data-testid="rollover-activate-state">
          {`${t(locale, 'schedule.rollover.year.statusLabel')}: ${t(
            locale,
            `schedule.year.status.${isActive ? 'active' : year.status}`,
          )}`}
        </p>
        {isActive ? (
          <p role="status" data-testid="rollover-activated">
            {t(locale, 'schedule.rollover.announce.activated')}
          </p>
        ) : (
          <Button
            data-testid="rollover-activate"
            disabled={busy}
            onClick={() => void activate()}
          >
            {t(locale, 'schedule.rollover.announce.activate')}
          </Button>
        )}
      </section>

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-announce-error">
          {error}
        </p>
      ) : null}

      <StepActions
        locale={locale}
        stepId="announce"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
