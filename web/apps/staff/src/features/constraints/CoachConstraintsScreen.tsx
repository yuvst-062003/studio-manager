// §4.8 / §6.1 of the staff app redesign — a coach's own unavailability screen,
// `#/constraints`. Ported from
// `~/Downloads/staff-app/src/components/CoachConstraintsScreen.tsx` — class vocabulary
// matched, not approximated, the same way `TodayScreen.tsx` and `AccountScreen.tsx` were —
// with three deliberate departures from it:
//
// 1. **The note field is no longer always rendered.** The prototype's gate is
//    `(selectedReason === 'אחר...' || true)`, a tautology that shows it for every reason.
//    Here it renders — and is required — only when `reason === 'other'`, matching
//    `CoachConstraintCreate`'s own server-side rule (`app/schemas/schedule.py`).
// 2. **A filed constraint says it is *waiting for an answer*, never that it is settled.**
//    Every constraint this screen creates lands `pending` (approval is C12's, on the
//    dashboard) — the toast, and the pending status badge, say so in as many words rather
//    than the prototype's "נשלח בהצלחה ונרשם במערכת המועדון!", which reads as final.
// 3. **The "suggested substitute" step is free text, not a picker bound to a real
//    colleague's id**, even though `substitute_person_id` is a real column
//    (`app/models/schedule.py::CoachConstraint`). No endpoint an ordinary coach may call
//    returns another staff member's name — `GET /staff` and `GET /staff/available` are
//    both manager/owner only (§3.2, decision 12), and `GET /groups/{id}/staff` returns
//    ids with no name attached. Inventing a fake local roster the way the prototype's
//    hardcoded `substituteOptions` does would be exactly the fabrication
//    `AccountScreen.tsx`'s own header refuses to repeat ("nothing here invents one"). The
//    coach's free-text guess travels inside `note` instead, in their own words, where the
//    manager reading the pending queue actually sees it — real information reaching a
//    real destination, rather than an id this screen cannot honestly resolve.
//
// Dates and times are converted to UTC with `studioWallTimeToUtc` — the same function
// `SessionPopover.tsx` uses to move a session — which round-trips a Jerusalem wall time
// through its own zone rather than a fixed offset. That is the whole of "get the all-day
// math right": Jerusalem observes daylight time, so midnight-to-midnight is a different
// UTC gap in December than in July, and a fixed `+02:00`/`+03:00` would be wrong by an
// hour for half the year and by two hours right at the seams.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Calendar, ChevronRight, Send, Shield, Sparkles, Trash2, UserCheck } from 'lucide-react'
import {
  formatDateInStudioZone,
  formatTimeInStudioZone,
  studioDayKey,
  studioWallTimeToUtc,
} from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EmptyState, LoadFailed } from '@studio/ui'
import type { CoachConstraintReason, CoachConstraintRow, CoachConstraintsClient } from './constraintsClient'

const DAY_MS = 86_400_000

/** A `YYYY-MM-DD` key → the next calendar day's key. Noon-anchored, the same trick
 *  `TodayScreen.tsx`'s `shiftDayKey` uses, so the shift itself never crosses a DST edge —
 *  the actual midnight boundary is `studioWallTimeToUtc`'s job, not this one's. */
function nextDayKey(dayKey: string): string {
  return studioDayKey(new Date(new Date(`${dayKey}T12:00:00Z`).getTime() + DAY_MS))
}

/** The inverse shift, for turning an EXCLUSIVE end instant back into the last calendar
 *  day it actually covers — see `whenLabel`'s own note on why an all-day row needs it. */
function previousDayKey(dayKey: string): string {
  return studioDayKey(new Date(new Date(`${dayKey}T12:00:00Z`).getTime() - DAY_MS))
}

const REASONS: readonly CoachConstraintReason[] = [
  'reserve_duty',
  'competition',
  'studies',
  'illness',
  'vacation',
  'family',
  'other',
]

/** §6.1: "The emoji the prototype stores is a client concern and is not persisted." Kept
 *  here, purely decorative (`aria-hidden`), and never read from or sent to the server. */
const REASON_EMOJI: Record<CoachConstraintReason, string> = {
  reserve_duty: '🪖',
  competition: '🥋',
  studies: '🎓',
  illness: '🤒',
  vacation: '✈️',
  family: '👨‍👩‍👧',
  other: '✏️',
}

const STATUS_BADGE: Record<CoachConstraintRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  refused: 'bg-rose-100 text-rose-800',
  withdrawn: 'bg-slate-200 text-slate-600',
}

/** A history row is withdrawable exactly when the service will accept it (`refuse rather
 *  than half-do` extended to the button itself, not only to the request it would send) —
 *  see `CoachConstraintService.withdraw`'s own docstring for the same two statuses. */
function isWithdrawable(status: CoachConstraintRow['status']): boolean {
  return status === 'pending' || status === 'approved'
}

/** The history row's own date/time line.
 *
 * **All-day's `ends_at` is midnight of the day AFTER the last covered day** — the same
 * exclusive boundary `studioWallTimeToUtc(nextDayKey(endDay), '00:00')` writes on submit
 * — so the label steps back one calendar day before formatting it, or a single all-day
 * request (Nov 10 00:00 → Nov 11 00:00) would read as a two-day range. A timed window has
 * no such boundary to correct for and adds the actual hours instead of the bare word
 * "hours", which would say a window exists without saying which one.
 */
function whenLabel(row: CoachConstraintRow, locale: Locale): string {
  if (row.all_day) {
    const startKey = studioDayKey(row.starts_at)
    const lastCoveredKey = previousDayKey(studioDayKey(row.ends_at))
    const startLabel = formatDateInStudioZone(row.starts_at, locale)
    if (startKey === lastCoveredKey) return startLabel
    const endLabel = formatDateInStudioZone(`${lastCoveredKey}T12:00:00Z`, locale)
    return `${startLabel} – ${endLabel}`
  }
  const startDay = formatDateInStudioZone(row.starts_at, locale)
  const endDay = formatDateInStudioZone(row.ends_at, locale)
  const range = startDay === endDay ? startDay : `${startDay} – ${endDay}`
  const from = formatTimeInStudioZone(row.starts_at, locale)
  const to = formatTimeInStudioZone(row.ends_at, locale)
  return `${range} · ${from}–${to}`
}

export function CoachConstraintsScreen({
  locale,
  client,
  today,
}: {
  locale: Locale
  client: CoachConstraintsClient
  /** An ISO instant — the same "a prop, not `new Date()`" rule every other screen here
   *  follows, so a test can fix the day the form defaults to. */
  today: string
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])

  const [selectionType, setSelectionType] = useState<'single' | 'range'>('single')
  const [singleDate, setSingleDate] = useState(todayKey)
  const [rangeStart, setRangeStart] = useState(todayKey)
  const [rangeEnd, setRangeEnd] = useState(todayKey)
  const [isAllDay, setIsAllDay] = useState(true)
  const [startTime, setStartTime] = useState('16:00')
  const [endTime, setEndTime] = useState('18:00')
  const [reason, setReason] = useState<CoachConstraintReason>('illness')
  const [note, setNote] = useState('')
  const [substitute, setSubstitute] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [history, setHistory] = useState<CoachConstraintRow[]>([])
  const [historyFailed, setHistoryFailed] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    client
      .listMine()
      .then((rows) => live && setHistory(rows))
      .catch(() => live && setHistoryFailed(true))
    return () => {
      live = false
    }
  }, [client, historyAttempt])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const rangeInvalid = selectionType === 'range' && rangeEnd < rangeStart
  const timeInvalid = !isAllDay && endTime <= startTime
  const noteRequired = reason === 'other'
  const noteInvalid = noteRequired && note.trim().length === 0
  const canSubmit = !rangeInvalid && !timeInvalid && !noteInvalid && !submitting

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!canSubmit) return

      const startDay = selectionType === 'single' ? singleDate : rangeStart
      const endDay = selectionType === 'single' ? singleDate : rangeEnd
      const starts_at = isAllDay
        ? studioWallTimeToUtc(startDay, '00:00')
        : studioWallTimeToUtc(startDay, startTime)
      const ends_at = isAllDay
        ? studioWallTimeToUtc(nextDayKey(endDay), '00:00')
        : studioWallTimeToUtc(endDay, endTime)

      // The suggested substitute is free text — see this file's own header for why it
      // cannot be a real `substitute_person_id` from this screen — folded into the one
      // note field the schema carries, alongside whatever the reason's own note says.
      const combinedNote = [
        note.trim() || null,
        substitute.trim()
          ? t(locale, 'schedule.constraint.step3.notePrefix').replace('{{name}}', substitute.trim())
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join('\n')

      setSubmitting(true)
      setSubmitFailed(false)
      client
        .file({ starts_at, ends_at, all_day: isAllDay, reason, note: combinedNote || null })
        .then(() => {
          setSubmitting(false)
          setNote('')
          setSubstitute('')
          // §6.1 / this file's own header, point 2: waiting, not settled.
          setToast(t(locale, 'schedule.constraint.filedToast'))
          setHistoryAttempt((n) => n + 1)
        })
        .catch(() => {
          setSubmitting(false)
          setSubmitFailed(true)
        })
    },
    [
      canSubmit,
      client,
      endTime,
      isAllDay,
      locale,
      note,
      rangeEnd,
      rangeStart,
      reason,
      selectionType,
      singleDate,
      startTime,
      substitute,
    ],
  )

  const withdraw = useCallback(
    (id: string) => {
      setWithdrawingId(id)
      client
        .withdraw(id)
        .then((row) => {
          setWithdrawingId(null)
          setHistory((current) => current.map((item) => (item.id === row.id ? row : item)))
        })
        .catch(() => setWithdrawingId(null))
    },
    [client],
  )

  return (
    <div
      data-testid="staff-constraints"
      className="flex flex-col gap-4 px-4 pt-4 pb-8"
    >
      {toast ? (
        <div
          role="status"
          className="fixed top-14 start-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      ) : null}

      <header className="flex items-center justify-between">
        <a
          href="#/account"
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 transition-all text-xs font-bold shadow-xs"
        >
          <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span>{t(locale, 'schedule.constraint.back')}</span>
        </a>
        <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shadow-xs">
          <Shield className="w-4 h-4" aria-hidden="true" />
        </div>
      </header>

      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          {t(locale, 'schedule.constraint.title')}
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {t(locale, 'schedule.constraint.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* -- step 1: date and time ---------------------------------------------- */}
        <section className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <span>{t(locale, 'schedule.constraint.step1.title')}</span>
            </span>
            <div className="bg-slate-100 p-0.5 rounded-xl flex items-center text-xs font-bold">
              {(['single', 'range'] as const).map((mode) => (
                <label
                  key={mode}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    selectionType === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="constraint-date-mode"
                    className="sr-only"
                    checked={selectionType === mode}
                    onChange={() => setSelectionType(mode)}
                  />
                  {t(locale, `schedule.constraint.step1.${mode}`)}
                </label>
              ))}
            </div>
          </div>

          {selectionType === 'single' ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-500">
                {t(locale, 'schedule.constraint.step1.date')}
              </span>
              <input
                type="date"
                required
                value={singleDate}
                onChange={(event) => setSingleDate(event.target.value)}
                className="h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-500">
                  {t(locale, 'schedule.constraint.step1.rangeStart')}
                </span>
                <input
                  type="date"
                  required
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-500">
                  {t(locale, 'schedule.constraint.step1.rangeEnd')}
                </span>
                <input
                  type="date"
                  required
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                  aria-invalid={rangeInvalid || undefined}
                  aria-describedby={rangeInvalid ? 'constraint-range-error' : undefined}
                />
              </label>
              {rangeInvalid ? (
                <p id="constraint-range-error" role="alert" className="col-span-2 text-[11px] font-bold text-rose-600">
                  {t(locale, 'schedule.constraint.validation.rangeOrder')}
                </p>
              ) : null}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700">
                {t(locale, 'schedule.constraint.step1.scopeLegend')}
              </span>
              <div className="flex items-center gap-2">
                {([true, false] as const).map((allDayOption) => (
                  <label
                    key={String(allDayOption)}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600"
                  >
                    <input
                      type="radio"
                      name="constraint-all-day"
                      checked={isAllDay === allDayOption}
                      onChange={() => setIsAllDay(allDayOption)}
                      className="accent-blue-600"
                    />
                    <span>
                      {t(
                        locale,
                        allDayOption
                          ? 'schedule.constraint.step1.allDay'
                          : 'schedule.constraint.step1.specificHours',
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {!isAllDay ? (
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold">
                    {t(locale, 'schedule.constraint.step1.from')}
                  </span>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold">
                    {t(locale, 'schedule.constraint.step1.to')}
                  </span>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    aria-invalid={timeInvalid || undefined}
                    aria-describedby={timeInvalid ? 'constraint-time-error' : undefined}
                  />
                </label>
                {timeInvalid ? (
                  <p id="constraint-time-error" role="alert" className="col-span-2 text-[11px] font-bold text-rose-600">
                    {t(locale, 'schedule.constraint.validation.timeOrder')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {/* -- step 2: reason ------------------------------------------------------ */}
        <section className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs flex flex-col gap-3">
          <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center">
              2
            </span>
            <span>{t(locale, 'schedule.constraint.step2.title')}</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((code) => {
              const isSelected = reason === code
              return (
                <label
                  key={code}
                  className={`p-2.5 rounded-2xl text-start border transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold ring-2 ring-blue-500/20'
                      : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100 text-xs'
                  }`}
                >
                  <input
                    type="radio"
                    name="constraint-reason"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => setReason(code)}
                  />
                  <span className="text-base shrink-0" aria-hidden="true">
                    {REASON_EMOJI[code]}
                  </span>
                  <span className="text-xs leading-tight">
                    {t(locale, `schedule.constraint.reason.${code}`)}
                  </span>
                </label>
              )
            })}
          </div>

          {/* Renders — and is required — ONLY for `other`. See this file's own header,
              point 1: the prototype's `|| true` made this always show. */}
          {noteRequired ? (
            <div className="pt-2 border-t border-slate-100">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-600">
                  {t(locale, 'schedule.constraint.step2.noteLabel')}
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t(locale, 'schedule.constraint.step2.notePlaceholder')}
                  rows={2}
                  required
                  aria-invalid={noteInvalid || undefined}
                  aria-describedby={noteInvalid ? 'constraint-note-error' : undefined}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </label>
              {noteInvalid ? (
                <p id="constraint-note-error" role="alert" className="mt-1 text-[11px] font-bold text-rose-600">
                  {t(locale, 'schedule.constraint.validation.noteRequired')}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* -- step 3: a suggested substitute, in the coach's own words ------------ */}
        <section className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs flex flex-col gap-3">
          <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center">
              3
            </span>
            <span>{t(locale, 'schedule.constraint.step3.title')}</span>
          </span>
          <label className="flex flex-col gap-1">
            <span className="sr-only">{t(locale, 'schedule.constraint.step3.title')}</span>
            <div className="flex items-center gap-2 p-2.5 bg-slate-50/70 border border-slate-200 rounded-2xl">
              <UserCheck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <input
                type="text"
                value={substitute}
                onChange={(event) => setSubstitute(event.target.value)}
                placeholder={t(locale, 'schedule.constraint.step3.placeholder')}
                className="flex-1 bg-transparent text-xs text-slate-800 outline-hidden"
              />
            </div>
          </label>
          <p className="text-[11px] text-slate-400">{t(locale, 'schedule.constraint.step3.hint')}</p>
        </section>

        {submitFailed ? (
          <p role="alert" className="text-xs font-bold text-rose-600 text-center">
            {t(locale, 'schedule.constraint.submitFailed')}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-60"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>
            {t(locale, submitting ? 'schedule.constraint.submitting' : 'schedule.constraint.submit')}
          </span>
        </button>
      </form>

      <section aria-labelledby="constraint-history-title" className="flex flex-col gap-2 mt-2">
        <div className="flex items-center justify-between px-1">
          <h2 id="constraint-history-title" className="text-xs font-black text-slate-900 tracking-wider">
            {t(locale, 'schedule.constraint.history.title')}
          </h2>
        </div>

        {historyFailed ? (
          <LoadFailed
            locale={locale}
            onRetry={() => {
              setHistoryFailed(false)
              setHistoryAttempt((n) => n + 1)
            }}
          />
        ) : history.length === 0 ? (
          <EmptyState
            title={t(locale, 'schedule.constraint.history.empty')}
            description={t(locale, 'schedule.constraint.history.emptyHint')}
          />
        ) : (
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.map((row) => (
              <li
                key={row.id}
                data-testid="constraint-history-row"
                className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xl p-1.5 rounded-xl bg-slate-100 shrink-0" aria-hidden="true">
                    {REASON_EMOJI[row.reason]}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900">
                        {t(locale, `schedule.constraint.reason.${row.reason}`)}
                      </span>
                      <span
                        data-testid="constraint-status"
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[row.status]}`}
                      >
                        {t(locale, `schedule.constraint.status.${row.status}`)}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                      <Calendar className="w-3 h-3 inline-block me-1" aria-hidden="true" />
                      {whenLabel(row, locale)}
                    </span>
                    {row.note ? (
                      <p className="text-[11px] text-slate-600 mt-1 bg-slate-50 p-1.5 rounded-lg whitespace-pre-line">
                        {row.note}
                      </p>
                    ) : null}
                  </div>
                </div>

                {isWithdrawable(row.status) ? (
                  <button
                    type="button"
                    onClick={() => withdraw(row.id)}
                    disabled={withdrawingId === row.id}
                    aria-label={t(locale, 'schedule.constraint.history.withdraw')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
