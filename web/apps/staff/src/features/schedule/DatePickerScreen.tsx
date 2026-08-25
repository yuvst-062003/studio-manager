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

const dayStyle: CSSProperties = {
  // §6.2's thumb rule applies to a calendar more than to anything else on the phone.
  minBlockSize: '44px',
  minInlineSize: '44px',
  borderRadius: 'var(--radius-sm)',
  border: 'var(--border-width-hairline) solid var(--border)',
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

const padStyle: CSSProperties = { minBlockSize: '44px' }

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
              aria-current={selected === cell ? 'date' : undefined}
              // The full date, not the number: a screen reader hearing "17" cannot tell
              // which month.
              aria-label={formatDateInStudioZone(`${cell}T12:00:00Z`, locale)}
              style={
                selected === cell
                  ? selectedDayStyle
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
