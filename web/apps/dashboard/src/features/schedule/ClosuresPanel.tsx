// The closure calendar — Israeli holiday presets and manual ranges. Reached from 4b and
// 6a, and driven by E2E-5's third scenario.
//
// **§5.6's rule shapes every line of this file.** Holidays are "proposals the manager
// ticks, never automatic closures. Nothing is closed automatically — studios differ, and a
// wrong guess deletes real lessons." So: the presets arrive unticked, the copy is phrased
// as an offer (`סמנו את הימים שבהם המועדון סגור`), and nothing is written until the manager
// presses a button. A test asserts each of those three separately, because any one of them
// alone would let the screen close a club that trains through the holiday.
//
// Preset labels come from `t()` keyed on the preset's stable key, not from the `name` the
// server sends (D-M2-4). `name` is the fallback and the text written into
// `studio_closure.reason`; the label a manager reads is translated like everything else.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, Checkbox, EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { Closure, HolidayPreset, ScheduleClient } from './client'

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  inlineSize: '100%',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'end',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-label)',
}

const fieldsetStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }
const errorStyle: CSSProperties = { color: 'var(--danger)' }

/** A bare calendar date rendered at Jerusalem noon, so it never slips a day. */
const asLabel = (day: string, locale: Locale): string =>
  formatDateInStudioZone(`${day}T12:00:00Z`, locale)

export function ClosuresPanel({
  locale,
  client,
  trainingYearId,
  year,
}: {
  locale: Locale
  client: ScheduleClient
  trainingYearId: string
  /** Gregorian. §7 spells the endpoint `GET /holiday-presets?year=2026`. */
  year: number
}) {
  const [closures, setClosures] = useState<Closure[]>([])
  const [loaded, setLoaded] = useState(false)
  const [presets, setPresets] = useState<HolidayPreset[] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      const loadedClosures = await client.listClosures(trainingYearId)
      if (!live) return
      setClosures(loadedClosures)
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [client, trainingYearId])

  const showPresets = useCallback(async () => {
    setPresets(await client.listHolidayPresets(year))
  }, [client, year])

  const refresh = useCallback(async () => {
    setClosures(await client.listClosures(trainingYearId))
  }, [client, trainingYearId])

  const applyPresets = useCallback(async () => {
    const chosen = (presets ?? []).filter((preset) => ticked.has(preset.key))
    if (chosen.length === 0) {
      setError(t(locale, 'schedule.closure.preset.none'))
      return
    }
    setError(null)
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
    setOutcome(fill(t(locale, 'schedule.closure.cancelled'), { count: cancelled }))
    await refresh()
  }, [client, locale, presets, refresh, ticked, trainingYearId])

  const addManual = useCallback(async () => {
    if (!from || !to || !reason.trim()) {
      // `studio_closure.reason` is non-null, and "closed" with no explanation is what a
      // parent sees when they ask why.
      setError(t(locale, 'schedule.closure.reason'))
      return
    }
    if (to < from) {
      setError(t(locale, 'schedule.closure.endBeforeStart'))
      return
    }
    setError(null)
    const result = await client.createClosure({
      training_year_id: trainingYearId,
      date_from: from,
      date_to: to,
      reason,
      source: 'manual',
    })
    setOutcome(fill(t(locale, 'schedule.closure.cancelled'), { count: result.sessions_cancelled }))
    setFrom('')
    setTo('')
    setReason('')
    await refresh()
  }, [client, from, locale, reason, refresh, to, trainingYearId])

  return (
    <section aria-labelledby="closures-title" style={panelStyle}>
      <h2 id="closures-title">{t(locale, 'schedule.closure.title')}</h2>

      {loaded && closures.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.closure.empty')} />
      ) : (
        <Card>
          {closures.map((closure) => (
            <div key={closure.id} data-testid="closure-row" style={rowStyle}>
              <span>
                {asLabel(closure.date_from, locale)}
                {closure.date_to !== closure.date_from ? ` – ${asLabel(closure.date_to, locale)}` : ''}
              </span>
              <span>{closure.reason}</span>
              <span style={noteStyle}>
                {closure.source === 'manual'
                  ? t(locale, 'schedule.closure.source.manual')
                  : t(locale, 'schedule.closure.source.holidayPreset')}
              </span>
            </div>
          ))}
        </Card>
      )}

      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}
      {outcome ? <p role="status">{outcome}</p> : null}

      {/* §5.6 — an OFFER. The button reveals proposals; it closes nothing. */}
      <Button variant="secondary" data-testid="holiday-presets" onClick={() => void showPresets()}>
        {t(locale, 'schedule.closure.preset.title')}
      </Button>

      {presets ? (
        <fieldset style={fieldsetStyle}>
          <legend>{t(locale, 'schedule.closure.preset.subtitle')}</legend>
          {presets.map((preset) => (
            <Checkbox
              key={preset.key}
              data-testid="preset-day"
              // Unticked on arrival, and there is a test for it: a preset that arrived
              // ticked would be a closure applied on the manager's behalf.
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
          <Button data-testid="apply-presets" onClick={() => void applyPresets()}>
            {t(locale, 'schedule.closure.preset.apply')}
          </Button>
        </fieldset>
      ) : null}

      <div style={formStyle}>
        <label style={fieldStyle}>
          {t(locale, 'schedule.closure.dateFrom')}
          <input
            type="date"
            data-testid="closure-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label style={fieldStyle}>
          {t(locale, 'schedule.closure.dateTo')}
          <input
            type="date"
            data-testid="closure-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label style={fieldStyle}>
          {t(locale, 'schedule.closure.reason')}
          <input
            type="text"
            data-testid="closure-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button variant="secondary" data-testid="add-closure" onClick={() => void addManual()}>
          {t(locale, 'schedule.closure.add')}
        </Button>
      </div>
    </section>
  )
}
