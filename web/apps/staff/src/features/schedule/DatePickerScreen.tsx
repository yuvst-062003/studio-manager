// Staff artboard 9b — בחירת תאריך: יומן מלא, טווח, קפיצה.
//
// **Sunday-first, like everything else in this lane.** `group_schedule_rule.weekday` is
// Sunday-first, the week board is, the day strip is; a Monday-first calendar here would be
// a daily papercut in an Israeli club and would disagree with the screen it navigates.
//
// **The grid marks the days that have lessons.** A date picker that cannot show where the
// classes are is a picker for a diary, not for a dojo — a coach opening this wants to jump
// to the next training day, not to count squares.
//
// The range half composes `@studio/ui`'s `DateRangePicker` rather than reimplementing it.
// That primitive already owns the "end precedes start" rule and the aria wiring, and
// `packages/ui` is not this lane's to extend.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, DateRangePicker } from '@studio/ui'
import { formatDateInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { SessionRow, StaffScheduleClient } from './client'

const pad = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` for a calendar day, built without a Date so no zone can shift it. */
const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`

/**
 * One month as a flat Sunday-first grid, padded to whole weeks with `''`.
 *
 * `Date.UTC` is used only to ask which weekday the first of the month is and how long the
 * month is — both calendar facts, not instants, so UTC is exact and the studio zone would
 * add nothing but a chance to slip a day.
 */
export function monthGrid(year: number, month: number): string[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: string[] = Array.from({ length: firstWeekday }, () => '')
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(dayKey(year, month, day))
  while (cells.length % 7 !== 0) cells.push('')
  return cells
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: dayKey(year, month, 1), to: dayKey(year, month, daysInMonth) }
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 'var(--space-1)',
}

const headerCellStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: 'var(--text-caption)',
  color: 'var(--text-secondary)',
}

// Longhand, not the `border` shorthand. `hasSessionsStyle` overrides only the colour and
// the width, and React warns that removing a longhand while a conflicting shorthand is set
// "can lead to styling bugs" — a day would keep the accent ring after it stopped having a
// lesson. Three properties consistently beats one plus two exceptions.
const dayStyle: CSSProperties = {
  // §6.2's thumb rule applies to a calendar more than to anything else on the phone.
  minBlockSize: '44px',
  minInlineSize: '44px',
  borderRadius: 'var(--radius-sm)',
  borderStyle: 'solid',
  borderWidth: 'var(--border-width-hairline)',
  borderColor: 'var(--border)',
  background: 'var(--surface)',
}

const selectedDayStyle: CSSProperties = {
  ...dayStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
}

const hasSessionsStyle: CSSProperties = {
  ...dayStyle,
  borderColor: 'var(--accent)',
  borderWidth: 'var(--border-width-strong)',
}

const unmarkedStyle: CSSProperties = {
  ...dayStyle,
  borderColor: 'var(--pending)',
  borderWidth: 'var(--border-width-strong)',
}

const padStyle: CSSProperties = { minBlockSize: '44px' }

const legendStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  fontSize: 'var(--text-caption)',
  color: 'var(--text-secondary)',
}

const swatchStyle = (color: string): CSSProperties => ({
  display: 'inline-block',
  inlineSize: '0.75rem',
  blockSize: '0.75rem',
  borderRadius: 'var(--radius-sm)',
  border: `var(--border-width-strong) solid ${color}`,
  marginInlineEnd: 'var(--space-1)',
  verticalAlign: 'middle',
})

const jumpsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

/** Sunday-first week bounds for the week containing `key`. */
function weekBounds(key: string): { from: string; to: string } {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay()
  const from = shift(key, -weekday)
  return { from, to: shift(from, 6) }
}

function shift(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * 86_400_000))
}

export function DatePickerScreen({
  locale,
  client,
  today,
  onSelect,
}: {
  locale: Locale
  client: StaffScheduleClient
  /** An ISO instant. A prop, not `new Date()` — the month this opens on depends on it. */
  today: string
  onSelect: (range: { from: string; to: string }) => void
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)))
  const [selected, setSelected] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [range, setRange] = useState({ from: '', to: '' })

  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const bounds = useMemo(() => monthBounds(year, month), [year, month])

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await client.listSessions({ from: bounds.from, to: bounds.to })
      if (live) setSessions(loaded)
    })()
    return () => {
      live = false
    }
  }, [bounds.from, bounds.to, client])

  const daysWithSessions = useMemo(
    () => new Set(sessions.map((session) => studioDayKey(session.starts_at))),
    [sessions],
  )

  // 9b's second legend entry — a PAST day that held a session whose register was never
  // signed. §5.14's sessions-held-versus-planned report counts exactly these, and the
  // grid is where a manager spots the hole before the month-end report does.
  const daysWithUnmarked = useMemo(() => {
    const keys = new Set<string>()
    for (const session of sessions) {
      const key = studioDayKey(session.starts_at)
      if (key < todayKey && session.status !== 'cancelled' && !session.attendance_taken) {
        keys.add(key)
      }
    }
    return keys
  }, [sessions, todayKey])

  const step = useCallback((delta: number) => {
    setMonth((currentMonth) => {
      const next = currentMonth + delta
      if (next < 1) {
        setYear((currentYear) => currentYear - 1)
        return 12
      }
      if (next > 12) {
        setYear((currentYear) => currentYear + 1)
        return 1
      }
      return next
    })
  }, [])

  const jumpToToday = useCallback(() => {
    setYear(Number(todayKey.slice(0, 4)))
    setMonth(Number(todayKey.slice(5, 7)))
  }, [todayKey])

  const applyRange = useCallback(() => {
    // Lexicographic on ISO dates is exact, and it is the same comparison the shared
    // primitive makes to decide whether to show its error.
    if (!range.from || !range.to || range.to < range.from) return
    onSelect(range)
  }, [onSelect, range])

  return (
    <section aria-labelledby="date-picker-title" style={pageStyle}>
      <h1 id="date-picker-title">{t(locale, 'schedule.datePicker.title')}</h1>

      <div style={toolbarStyle}>
        <Button variant="secondary" data-testid="month-previous" onClick={() => step(-1)}>
          {t(locale, 'schedule.week.previous')}
        </Button>
        <span data-testid="month-label">{`${year}-${pad(month)}`}</span>
        <Button variant="secondary" data-testid="month-next" onClick={() => step(1)}>
          {t(locale, 'schedule.week.next')}
        </Button>
        <Button data-testid="jump-to-today" onClick={jumpToToday}>
          {t(locale, 'schedule.datePicker.jumpToToday')}
        </Button>
      </div>

      <div style={gridStyle} role="grid" aria-label={t(locale, 'schedule.view.month')}>
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
          <div key={weekday} style={headerCellStyle} role="columnheader">
            {t(locale, `schedule.weekday.${weekday}`)}
          </div>
        ))}
        {cells.map((cell, index) =>
          cell === '' ? (
            <div key={`pad-${index}`} style={padStyle} aria-hidden="true" />
          ) : (
            <button
              key={cell}
              type="button"
              // Keyed only. The grid's day count is `within(grid).getAllByRole('button')`
              // — the pads are inert divs and the headers are columnheaders, so the
              // buttons ARE the days, asked of the accessibility tree.
              data-testid={`day-${cell}`}
              data-has-sessions={daysWithSessions.has(cell) ? 'true' : 'false'}
              data-attendance-unmarked={daysWithUnmarked.has(cell) ? 'true' : undefined}
              aria-current={selected === cell ? 'date' : undefined}
              // The full date, not the number: a screen reader hearing "17" cannot tell
              // which month.
              aria-label={formatDateInStudioZone(`${cell}T12:00:00Z`, locale)}
              style={
                selected === cell
                  ? selectedDayStyle
                  : daysWithUnmarked.has(cell)
                    ? unmarkedStyle
                    : daysWithSessions.has(cell)
                      ? hasSessionsStyle
                      : dayStyle
              }
              onClick={() => {
                setSelected(cell)
                onSelect({ from: cell, to: cell })
              }}
            >
              {Number(cell.slice(8))}
            </button>
          ),
        )}
      </div>

      {/* 9b's legend — the two ring colours, named. */}
      <p style={legendStyle} data-testid="picker-legend">
        <span>
          <span aria-hidden="true" style={swatchStyle('var(--accent)')} />
          {t(locale, 'schedule.datePicker.legendHasSessions')}
        </span>
        <span>
          <span aria-hidden="true" style={swatchStyle('var(--pending)')} />
          {t(locale, 'schedule.datePicker.legendUnmarked')}
        </span>
      </p>

      {/* 9b's quick jumps. Each one IS a selection — a range handed straight back — so
          "week view" needs no second screen: it is this screen answering faster. */}
      <div style={jumpsStyle} role="group" aria-label={t(locale, 'schedule.datePicker.title')}>
        <Button
          variant="secondary"
          data-testid="jump-this-week"
          onClick={() => onSelect(weekBounds(todayKey))}
        >
          {t(locale, 'schedule.datePicker.thisWeek')}
        </Button>
        <Button
          variant="secondary"
          data-testid="jump-next-week"
          onClick={() => onSelect(weekBounds(shift(todayKey, 7)))}
        >
          {t(locale, 'schedule.datePicker.nextWeek')}
        </Button>
        <Button
          variant="secondary"
          data-testid="jump-this-month"
          onClick={() =>
            onSelect(monthBounds(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7))))
          }
        >
          {t(locale, 'schedule.datePicker.thisMonth')}
        </Button>
        <Button
          variant="secondary"
          data-testid="jump-last-30"
          onClick={() => onSelect({ from: shift(todayKey, -29), to: todayKey })}
        >
          {t(locale, 'schedule.datePicker.last30')}
        </Button>
      </div>

      <section aria-labelledby="range-title">
        <h2 id="range-title">{t(locale, 'schedule.datePicker.range')}</h2>
        <DateRangePicker
          from={range.from}
          to={range.to}
          onChange={setRange}
          fromLabel={t(locale, 'schedule.datePicker.from')}
          toLabel={t(locale, 'schedule.datePicker.to')}
          errorMessage={t(locale, 'schedule.closure.endBeforeStart')}
        />
        <Button data-testid="apply-range" onClick={applyRange}>
          {t(locale, 'schedule.datePicker.apply')}
        </Button>
        <Button
          variant="secondary"
          data-testid="clear-range"
          onClick={() => setRange({ from: '', to: '' })}
        >
          {t(locale, 'schedule.datePicker.clear')}
        </Button>
      </section>
    </section>
  )
}
