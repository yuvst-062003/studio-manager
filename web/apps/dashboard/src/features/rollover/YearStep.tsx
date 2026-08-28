// §5.15 step 1 — the training year itself.
//
// **This step has two faces and only one of them writes anything.** Before a draft year
// exists there is nothing to roll over, so the step is a form: name, start, end, and
// `POST /training-years`, which is W2's route and not a `/rollover/*` alias. Once the year
// exists the step is a read: `state()` returns it `done` "by the fact that we are here at
// all", and there is nothing left for a manager to do but read the dates and carry on.
//
// **There is no control that marks this step done**, because `PATCH .../steps/year` answers
// 409 — it is derived. `StepActions` renders "continue" instead, which advances the
// container without sending anything.
import { useState } from 'react'
import { Button, Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { RolloverClient, TrainingYear } from './client'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  errorStyle,
  fieldsetStyle,
  introStyle,
  noteStyle,
  stepStyle,
} from './StepShell'

export type YearStepProps = RolloverStepProps & {
  client: RolloverClient
  /** `null` before the draft exists — the form branch. */
  year: TrainingYear | null
  /** Handed the freshly created draft so the container can start reading its state. */
  onYearCreated: (year: TrainingYear) => void
  /** The app clock, for the pre-filled season. Optional so tests can pin a date. */
  today?: string
}

/** The Israeli season is September to August. From August onward the season being set up
 *  is the one about to start; before that, the one already running. The manager edits
 *  freely — these are defaults, not decisions (owner request, 2026-08-28: "why do I need
 *  to type a year"). */
export function defaultSeason(todayIso: string): { name: string; starts: string; ends: string } {
  const today = new Date(todayIso)
  const startYear = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return {
    name: `${startYear}–${startYear + 1}`,
    starts: `${startYear}-09-01`,
    ends: `${startYear + 1}-08-31`,
  }
}

export function YearStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  year,
  onYearCreated,
  today,
}: YearStepProps) {
  const season = defaultSeason(today ?? new Date().toISOString())
  const [name, setName] = useState(season.name)
  const [startsOn, setStartsOn] = useState(season.starts)
  const [endsOn, setEndsOn] = useState(season.ends)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Only the press that created the year announces it. A manager resuming into step 1
  // three days later is not being told something just happened.
  const [justCreated, setJustCreated] = useState(false)

  async function create() {
    if (!name.trim()) {
      setError(t(locale, 'schedule.rollover.year.nameRequired'))
      return
    }
    if (!startsOn || !endsOn) {
      setError(t(locale, 'schedule.rollover.year.datesRequired'))
      return
    }
    if (endsOn <= startsOn) {
      // Refused here rather than at the server, because a manager who typed the dates the
      // wrong way round wants to see that before the round trip.
      setError(t(locale, 'schedule.rollover.year.endBeforeStart'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const created = await client.createTrainingYear({
        name: name.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      })
      setJustCreated(true)
      onYearCreated(created)
    } catch {
      setError(t(locale, 'schedule.rollover.year.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="rollover-year-title" style={stepStyle} data-testid="rollover-step-year">
      <h2 id="rollover-year-title">{t(locale, 'schedule.rollover.year.title')}</h2>
      <p style={introStyle}>{t(locale, 'schedule.rollover.year.intro')}</p>

      {year ? (
        <Card caption={t(locale, 'schedule.rollover.year.dates')}>
          <p data-testid="rollover-year-name">{year.name}</p>
          <p data-testid="rollover-year-range">{`${year.starts_on} – ${year.ends_on}`}</p>
          {/* The year's state is a word, never a colour or a chip alone. */}
          <p data-testid="rollover-year-status">
            {`${t(locale, 'schedule.rollover.year.statusLabel')}: ${t(
              locale,
              `schedule.year.status.${year.status}`,
            )}`}
          </p>
          {year.status === 'draft' ? (
            <p style={noteStyle}>{t(locale, 'schedule.rollover.draftOnlyHint')}</p>
          ) : null}
        </Card>
      ) : (
        <fieldset style={fieldsetStyle}>
          <legend>{t(locale, 'schedule.rollover.year.create')}</legend>
          <TextField
            label={t(locale, 'schedule.rollover.year.name')}
            data-testid="rollover-year-input-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label={t(locale, 'schedule.rollover.year.startsOn')}
            data-testid="rollover-year-input-starts"
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
          <TextField
            label={t(locale, 'schedule.rollover.year.endsOn')}
            data-testid="rollover-year-input-ends"
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
          <Button data-testid="rollover-year-create" disabled={busy} onClick={() => void create()}>
            {t(locale, 'schedule.rollover.year.create')}
          </Button>
        </fieldset>
      )}

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-year-error">
          {error}
        </p>
      ) : null}

      {year ? (
        <>
          {justCreated ? (
            <p role="status" data-testid="rollover-year-created">
              {t(locale, 'schedule.rollover.year.created')}
            </p>
          ) : null}
          <StepActions
            locale={locale}
            stepId="year"
            status={status}
            onDone={onDone}
            onSkip={onSkip}
          />
        </>
      ) : null}
    </section>
  )
}
