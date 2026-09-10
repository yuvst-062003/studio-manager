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
import { Button, Checkbox, EmptyState, LoadFailed, PageHeader, StatusChip } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { Closure, HolidayPreset, ScheduleClient } from './client'

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
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
      try {
        const loadedClosures = await client.listClosures(trainingYearId)
        if (!live) return
        setClosures(loadedClosures)
        setLoaded(true)
      } catch {
        // Without this the screen stayed at `loaded === false` for ever: no list, no empty
        // state, no error — the same blank panel a studio with no closures gets.
        if (live) setLoadFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [attempt, client, trainingYearId])

  const showPresets = useCallback(async () => {
    setError(null)
    try {
      setPresets(await client.listHolidayPresets(year))
    } catch {
      setError(t(locale, 'common.loadFailed.body'))
    }
  }, [client, locale, year])

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
    try {
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
    } catch {
      // §3.4's named defect. A failed POST used to reject unhandled: the ticks stayed, no
      // outcome line appeared, and the list refreshed to the same contents — indis-
      // tinguishable from a closure that saved. The ticks are LEFT ticked deliberately, so
      // pressing again retries the same choice rather than asking the manager to rebuild it.
      setOutcome(null)
      setError(t(locale, 'schedule.closure.saveFailed'))
      return
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
    let result
    try {
      result = await client.createClosure({
        training_year_id: trainingYearId,
        date_from: from,
        date_to: to,
        reason,
        source: 'manual',
      })
    } catch {
      // The three fields are NOT cleared on failure — clearing them would make a retry
      // mean retyping a date range the manager already typed once.
      setOutcome(null)
      setError(t(locale, 'schedule.closure.saveFailed'))
      return
    }
    setOutcome(fill(t(locale, 'schedule.closure.cancelled'), { count: result.sessions_cancelled }))
    setFrom('')
    setTo('')
    setReason('')
    await refresh()
  }, [client, from, locale, reason, refresh, to, trainingYearId])

  const header = (
    <PageHeader
      subtitle={t(locale, 'schedule.closure.subtitle')}
      title={t(locale, 'schedule.closure.title')}
      titleId="closures-title"
    />
  )

  // A failed list is its own screen, not a blank one. Retry re-runs the effect.
  if (loadFailed) {
    return (
      <section aria-labelledby="closures-title" className="closures">
        {header}
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setLoadFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  return (
    <section aria-labelledby="closures-title" className="closures">
      {header}

      {loaded && closures.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.closure.empty')} />
      ) : (
        <ul aria-label={t(locale, 'schedule.closure.title')} className="closures__list">
          {closures.map((closure) => (
            <li className="closure-row" data-testid="closure-row" key={closure.id}>
              <span className="closure-row__when" dir="ltr">
                {asLabel(closure.date_from, locale)}
                {closure.date_to !== closure.date_from
                  ? ` – ${asLabel(closure.date_to, locale)}`
                  : ''}
              </span>
              <span className="closure-row__reason">{closure.reason}</span>
              {/* Manual or holiday preset, as a chip rather than a grey word. Both are
                  `planned` — the source is a fact about who typed it, not a state, and
                  giving one of them a warning tone would read as "this one is a problem". */}
              <StatusChip
                label={
                  closure.source === 'manual'
                    ? t(locale, 'schedule.closure.source.manual')
                    : t(locale, 'schedule.closure.source.holidayPreset')
                }
                status="planned"
              />
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="closures__error" role="alert">
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p className="closures__outcome" role="status">
          {outcome}
        </p>
      ) : null}

      {/* §5.6 — an OFFER. The button reveals proposals; it closes nothing. */}
      <Button variant="secondary" data-testid="holiday-presets" onClick={() => void showPresets()}>
        {t(locale, 'schedule.closure.preset.title')}
      </Button>

      {presets ? (
        <fieldset className="closures__presets">
          <legend>{t(locale, 'schedule.closure.preset.subtitle')}</legend>
          <div className="closures__preset-grid">
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
          </div>
          <Button data-testid="apply-presets" onClick={() => void applyPresets()}>
            {t(locale, 'schedule.closure.preset.apply')}
          </Button>
        </fieldset>
      ) : null}

      <div className="closures__form">
        <label className="closures__field">
          {t(locale, 'schedule.closure.dateFrom')}
          <input
            type="date"
            data-testid="closure-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="closures__field">
          {t(locale, 'schedule.closure.dateTo')}
          <input
            type="date"
            data-testid="closure-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="closures__field closures__field--wide">
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
