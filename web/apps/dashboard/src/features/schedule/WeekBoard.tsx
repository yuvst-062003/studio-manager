// Dashboard artboard 3a — לוח שבועי עם תפריט הצד.
//
// D5: "Dashboard is a superset of the staff app, and contains a calendar", and the session
// block "surfaces coverage and completion — is a coach assigned, is it cancelled, has
// attendance been taken — **not** registration counts." Children are enrolled rather than
// booking (§5.4), so a capacity number here would invite a question the product does not
// answer, and a test asserts none is rendered.
//
// **The week starts on Sunday and the day is a Jerusalem day.** Both are the same rule the
// backend uses — `group_schedule_rule.weekday` is Sunday-first, and `studioDayKey` files an
// instant under the Jerusalem date. A Monday-based grid would push every Sunday class into
// the previous column, and grouping by the UTC date would file a 22:30 class under the
// wrong day entirely.
//
// `today` is a prop rather than `new Date()`: a component that read the clock could not be
// tested at a fixed date, and every assertion about this grid depends on which week it is.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '@studio/ui'
import { formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel } from './client'
import type { ScheduleClient, SessionRow } from './client'

const DAY_MS = 86_400_000

/** A `YYYY-MM-DD` key shifted by whole days. Safe across DST because it never leaves noon. */
function shiftDayKey(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS))
}

/**
 * The Sunday of the week an instant falls in, as a Jerusalem `YYYY-MM-DD`.
 *
 * The anchor is read in Jerusalem rather than UTC: 22:30Z on a Saturday is already Sunday
 * here — the first day of the *next* week, not the last of this one.
 */
export function weekStart(iso: string): string {
  const key = studioDayKey(iso)
  // `getUTCDay()` on the key's own noon is safe: the key is already a Jerusalem date, and
  // noon UTC never crosses a day boundary in either direction.
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay()
  return shiftDayKey(key, -weekday)
}

/** Seven consecutive Jerusalem day keys, starting at `startKey`. */
export function weekDays(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shiftDayKey(startKey, offset))
}

const boardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  inlineSize: '100%',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
}

// A CSS grid flips with `dir` on its own, which is exactly why G12 bans the physical
// properties that would not.
const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 'var(--space-2)',
  overflowX: 'auto',
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minInlineSize: '8rem',
  paddingBlock: 'var(--space-2)',
  borderBlockStart: 'var(--border-width-strong) solid var(--border)',
}

const todayColumnStyle: CSSProperties = {
  ...columnStyle,
  borderBlockStart: 'var(--border-width-strong) solid var(--fg)',
}

const blockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  fontSize: 'var(--text-caption)',
}

const cancelledBlockStyle: CSSProperties = {
  ...blockStyle,
  background: 'var(--cancelled-tint)',
  color: 'var(--cancelled)',
  textDecoration: 'line-through',
}

const dayHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'],
}

function SessionBlock({ locale, session }: { locale: Locale; session: SessionRow }) {
  const lead = session.staff[0]
  return (
    <article
      data-testid="session-block"
      data-status={session.status}
      style={session.status === 'cancelled' ? cancelledBlockStyle : blockStyle}
    >
      <strong>{session.group_name}</strong>
      <span>
        {formatTimeInStudioZone(session.starts_at, locale)}
        {'–'}
        {formatTimeInStudioZone(session.ends_at, locale)}
      </span>
      {session.location_name ? <span>{session.location_name}</span> : null}
      {/* D5 — coverage. A block with no coach is §5.14's 'sessions without a coach'. */}
      {lead ? <span>{lead.display_name}</span> : <span>{t(locale, 'schedule.session.noCoach')}</span>}
      {lead?.is_substitute ? <span>{t(locale, 'schedule.session.substitute')}</span> : null}
      {session.cancel_reason ? (
        <span>{cancelReasonLabel(locale, session.cancel_reason)}</span>
      ) : null}
    </article>
  )
}

export function WeekBoard({
  locale,
  client,
  today,
}: {
  locale: Locale
  client: ScheduleClient
  /** An ISO instant. A prop, not `new Date()` — see the module header. */
  today: string
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [start, setStart] = useState(() => weekStart(today))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const days = useMemo(() => weekDays(start), [start])

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await client.listSessions({ from: days[0] as string, to: days[6] as string })
      if (live) setSessions(loaded)
    })()
    return () => {
      live = false
    }
  }, [client, days])

  const byDay = useMemo(() => {
    const grouped = new Map<string, SessionRow[]>()
    for (const session of sessions) {
      const key = studioDayKey(session.starts_at)
      grouped.set(key, [...(grouped.get(key) ?? []), session])
    }
    return grouped
  }, [sessions])

  return (
    <section aria-labelledby="week-board-title" style={boardStyle}>
      <h2 id="week-board-title">{t(locale, 'schedule.week.title')}</h2>

      <div style={toolbarStyle}>
        <button
          type="button"
          data-testid="week-previous"
          onClick={() => setStart((current) => shiftDayKey(current, -7))}
        >
          {t(locale, 'schedule.week.previous')}
        </button>
        <button type="button" data-testid="week-today" onClick={() => setStart(weekStart(today))}>
          {t(locale, 'schedule.week.today')}
        </button>
        <button
          type="button"
          data-testid="week-next"
          onClick={() => setStart((current) => shiftDayKey(current, 7))}
        >
          {t(locale, 'schedule.week.next')}
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title={t(locale, 'schedule.today.empty')}
          description={t(locale, 'schedule.today.emptyHint')}
        />
      ) : null}

      <div role="grid" aria-label={t(locale, 'schedule.week.title')} style={gridStyle}>
        {days.map((day, index) => {
          const isToday = day === todayKey
          return (
            <div
              key={day}
              role="gridcell"
              // Keyed rather than generic: the interesting assertion is WHICH day a
              // session was filed under, not how many columns there are. The column count
              // is `getAllByRole('gridcell')`, which asks the accessibility tree the same
              // question instead of asking a test hook.
              data-testid={`week-day-${day}`}
              data-day={day}
              aria-current={isToday ? 'date' : undefined}
              style={isToday ? todayColumnStyle : columnStyle}
            >
              <h3 style={dayHeadingStyle}>{t(locale, `schedule.weekday.${index}`)}</h3>
              {(byDay.get(day) ?? []).map((session) => (
                <SessionBlock key={session.id} locale={locale} session={session} />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
