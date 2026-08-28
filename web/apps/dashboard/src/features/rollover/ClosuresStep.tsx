// §5.15 step 2 — the new year's closures.
//
// **§5.6's rule holds inside the wizard exactly as it does on `6a`.** Israeli holidays are
// "proposals the manager ticks, never automatic closures. Nothing is closed automatically —
// studios differ, and a wrong guess deletes real lessons." So the presets arrive unticked,
// the legend is phrased as an offer, and nothing is written until a button is pressed. A
// wizard is precisely where that rule is most tempting to break — a manager forty minutes
// into a flow will tick "all of them" without reading — which is why the copy and the
// unticked default are asserted rather than assumed.
//
// Preset labels come from `t()` keyed on the preset's stable key and NOT from the `name` the
// server sends (D-M2-4). `name` is the fallback and the text stored in
// `studio_closure.reason`; the label a manager reads is translated like everything else.
// This step reuses `schedule.closure.preset.<key>` rather than minting a second Hebrew name
// for יום כיפור, because a second name is a name that drifts.
import { useCallback, useState } from 'react'
import { Button, Checkbox } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { HolidayPreset, RolloverClient } from './client'
import type { RolloverStepProps } from './types'
import {
  StepActions,
  errorStyle,
  fieldsetStyle,
  introStyle,
  rowStyle,
  stepStyle,
} from './StepShell'

export type ClosuresStepProps = RolloverStepProps & {
  client: RolloverClient
  trainingYearId: string
  /** The Gregorian year the training year opens in — §7 spells it `?year=2027`. */
  presetYear: number
  /** `state.closures`. The container reads it; this step never counts rows itself. */
  closures: number
  onChanged: () => void
}

/** A bare calendar date rendered at Jerusalem noon, so it never slips a day. */
const asLabel = (day: string, locale: Locale): string =>
  formatDateInStudioZone(`${day}T12:00:00Z`, locale)

export function ClosuresStep({
  locale,
  status,
  onDone,
  onSkip,
  client,
  trainingYearId,
  presetYear,
  closures,
  onChanged,
}: ClosuresStepProps) {
  const [presets, setPresets] = useState<HolidayPreset[] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const showPresets = useCallback(async () => {
    const loaded = await client.listHolidayPresets(presetYear)
    setPresets(loaded)
    // Pre-ticked since 2026-08-28 (owner decision, superseding the arrive-unticked
    // default): no club trains on יום כיפור, and asking for seven ticks that are always
    // the same is the friction the owner named. The חופש הגדול stays UNTICKED — clubs
    // genuinely differ there — and §5.6 still holds where it matters: these are
    // proposals, and NOTHING is written until the apply button is pressed.
    setTicked(new Set(loaded.filter((preset) => preset.key !== 'summer_break').map((p) => p.key)))
  }, [client, presetYear])

  const applyPresets = useCallback(async () => {
    const chosen = (presets ?? []).filter((preset) => ticked.has(preset.key))
    if (chosen.length === 0) {
      setError(t(locale, 'schedule.rollover.closures.none'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      let cancelled = 0
      for (const preset of chosen) {
        const result = await client.createClosure({
          training_year_id: trainingYearId,
          date_from: preset.date_from,
          date_to: preset.date_to,
          // The label the manager saw, so the stored reason matches the screen they ticked
          // it on rather than the server's fallback.
          reason: t(locale, `schedule.closure.preset.${preset.key}`),
          source: 'holiday_preset',
        })
        cancelled += result.sessions_cancelled
      }
      setTicked(new Set())
      setOutcome(fill(t(locale, 'schedule.rollover.closures.added'), { count: cancelled }))
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.closures.failed'))
    } finally {
      setBusy(false)
    }
  }, [client, locale, onChanged, presets, ticked, trainingYearId])

  const addManual = useCallback(async () => {
    if (!from || !to) {
      setError(t(locale, 'schedule.rollover.closures.endBeforeStart'))
      return
    }
    if (to < from) {
      setError(t(locale, 'schedule.rollover.closures.endBeforeStart'))
      return
    }
    if (!reason.trim()) {
      // `studio_closure.reason` is non-null, and "closed" with no explanation is what a
      // parent sees when they ask why.
      setError(t(locale, 'schedule.rollover.closures.reasonRequired'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await client.createClosure({
        training_year_id: trainingYearId,
        date_from: from,
        date_to: to,
        reason: reason.trim(),
        source: 'manual',
      })
      setOutcome(
        fill(t(locale, 'schedule.rollover.closures.added'), { count: result.sessions_cancelled }),
      )
      setFrom('')
      setTo('')
      setReason('')
      onChanged()
    } catch {
      setError(t(locale, 'schedule.rollover.closures.failed'))
    } finally {
      setBusy(false)
    }
  }, [client, from, locale, onChanged, reason, to, trainingYearId])

  return (
    <section
      aria-labelledby="rollover-closures-title"
      style={stepStyle}
      data-testid="rollover-step-closures"
    >
      <h2 id="rollover-closures-title">{t(locale, 'schedule.rollover.closures.title')}</h2>
      {/* §5.6, verbatim in spirit: an offer, never a statement that the club is closed. */}
      <p style={introStyle}>{t(locale, 'schedule.rollover.closures.intro')}</p>
      <p data-testid="rollover-closures-count">
        {fill(t(locale, 'schedule.rollover.closures.existing'), { count: closures })}
      </p>

      {error ? (
        <p role="alert" style={errorStyle} data-testid="rollover-closures-error">
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p role="status" data-testid="rollover-closures-outcome">
          {outcome}
        </p>
      ) : null}

      {/* The button reveals proposals; it closes nothing. */}
      <div>
        <Button
          variant="secondary"
          data-testid="rollover-closures-presets"
          onClick={() => void showPresets()}
        >
          {t(locale, 'schedule.rollover.closures.showPresets')}
        </Button>
      </div>

      {presets ? (
        <fieldset style={fieldsetStyle}>
          <legend>{t(locale, 'schedule.rollover.closures.presetsLegend')}</legend>
          {presets.map((preset) => (
            <Checkbox
              key={preset.key}
              data-testid="rollover-preset-day"
              // Unticked on arrival: a preset that arrived ticked would be a closure applied
              // on the manager's behalf, which is the thing §5.6 forbids in as many words.
              checked={ticked.has(preset.key)}
              label={`${t(locale, `schedule.closure.preset.${preset.key}`)} · ${asLabel(
                preset.date_from,
                locale,
              )}`}
              onChange={(event) =>
                setTicked((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(preset.key)
                  else next.delete(preset.key)
                  return next
                })
              }
            />
          ))}
          <Button
            data-testid="rollover-closures-apply"
            disabled={busy}
            onClick={() => void applyPresets()}
          >
            {t(locale, 'schedule.rollover.closures.apply')}
          </Button>
        </fieldset>
      ) : null}

      <fieldset style={fieldsetStyle}>
        <legend>{t(locale, 'schedule.rollover.closures.manualLegend')}</legend>
        <div style={rowStyle}>
          <label>
            {t(locale, 'schedule.rollover.closures.dateFrom')}
            <input
              type="date"
              data-testid="rollover-closure-from"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            {t(locale, 'schedule.rollover.closures.dateTo')}
            <input
              type="date"
              data-testid="rollover-closure-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            {t(locale, 'schedule.rollover.closures.reason')}
            <input
              type="text"
              data-testid="rollover-closure-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            data-testid="rollover-closure-add"
            disabled={busy}
            onClick={() => void addManual()}
          >
            {t(locale, 'schedule.rollover.closures.add')}
          </Button>
        </div>
      </fieldset>

      <StepActions
        locale={locale}
        stepId="closures"
        status={status}
        onDone={onDone}
        onSkip={onSkip}
      />
    </section>
  )
}
