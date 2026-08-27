// Staff artboards 9a (היום) and 1d — **one screen, two artboards.**
//
// 1d is 9a at a lower fidelity, the way 1a and 2a are the same parent home. Building two
// components would give one screen two owners and guarantee they drift; a test asserts they
// stay one.
//
// 9a's headline is `מסנן מאמן במקום פיצול מסכים` — a coach filter rather than a separate
// coach app. A coach opening this wants their own day and gets it by default; a manager
// gets the whole club, on the same screen. That default is the entire feature.
//
// **Attendance is not here.** §5.7's roster is M5's and artboard 9f is its screen. A tap
// target here that looked like a mark would be a coach marking into a table that does not
// exist yet, and the last test in the file keeps it out.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel } from './client'
import type { SessionRow, StaffScheduleClient } from './client'

const DAY_MS = 86_400_000

/** A `YYYY-MM-DD` key shifted by whole days, via noon so it never crosses a DST edge. */
function shiftDayKey(key: string, days: number): string {
  return studioDayKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS))
}

/** §6.2's strip reads forward and back: three days either side of the chosen one. */
function stripAround(key: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => shiftDayKey(key, offset - 3))
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const stripStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBlockEnd: 'var(--space-2)',
}

const chipStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  // §6.2 — a thumb, one-handed, on a moving bus.
  minInlineSize: '44px',
  minBlockSize: '44px',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  border: 'var(--border-width-hairline) solid var(--border)',
  background: 'var(--surface)',
  fontSize: 'var(--text-caption)',
}

const selectedChipStyle: CSSProperties = {
  ...chipStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  border: 'var(--border-width-hairline) solid var(--fg)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minBlockSize: '44px',
}

const filterStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-label)',
}

const noteStyle: CSSProperties = { color: 'var(--text-secondary)', fontSize: 'var(--text-caption)' }

export interface CoachOption {
  person_id: string
  display_name: string
}

export function TodayScreen({
  locale,
  client,
  today,
  initialDay = null,
  coaches = [],
  viewerPersonId,
  viewerIsCoach = false,
}: {
  locale: Locale
  client: StaffScheduleClient
  /** An ISO instant. A prop, not `new Date()` — every assertion here fixes the day. */
  today: string
  /** A day picked in 9b. The strip anchors here and the screen opens on it; `חזרה להיום`
   *  is what walks back. */
  initialDay?: string | null
  coaches?: CoachOption[]
  viewerPersonId?: string
  /**
   * Whether the signed-in person coaches. **This is what 9a's filter defaults from**: a
   * coach opening the app wants their own day, a manager wants the club's. The same screen
   * serves both, which is what "מסנן מאמן במקום פיצול מסכים" means.
   */
  viewerIsCoach?: boolean
}) {
  const todayKey = useMemo(() => studioDayKey(today), [today])
  const [day, setDay] = useState(initialDay ?? todayKey)
  const [coachFilter, setCoachFilter] = useState<string>(
    viewerIsCoach && viewerPersonId ? viewerPersonId : '',
  )
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const strip = useMemo(() => stripAround(initialDay ?? todayKey), [initialDay, todayKey])

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await client.listSessions({
        from: day,
        to: day,
        coachPersonId: coachFilter || undefined,
      })
      if (live) setSessions(loaded)
    })()
    return () => {
      live = false
    }
  }, [client, coachFilter, day])

  // The server already scoped the query to one day, but it answers in instants and the
  // screen groups by Jerusalem days. Re-filtering here is what keeps a 00:30 class off
  // yesterday's screen.
  const onThisDay = useMemo(
    () => sessions.filter((session) => studioDayKey(session.starts_at) === day),
    [day, sessions],
  )

  const chooseDay = useCallback((key: string) => setDay(key), [])

  const coachName = useMemo(
    () => coaches.find((coach) => coach.person_id === coachFilter)?.display_name ?? null,
    [coachFilter, coaches],
  )

  return (
    <section aria-labelledby="today-title" data-testid="staff-today" style={pageStyle}>
      <h1 id="today-title">
        {/* S7 — `היום`, or the day being looked at: `יום שלישי · 3 בנובמבר`. */}
        {day === todayKey
          ? t(locale, 'schedule.today.title')
          : `${t(locale, 'attendance.roster.dayLabel').replace(
              '{{weekday}}',
              t(locale, `schedule.weekday.${new Date(`${day}T12:00:00Z`).getUTCDay()}`),
            )} · ${formatDateInStudioZone(`${day}T12:00:00Z`, locale)}`}
      </h1>

      {/* S7 — `5 שיעורים · אלון מזרחי`. The coach half renders only when the filter has
          chosen one, which for a coach opening their own day is the default. */}
      <p data-testid="today-summary" style={noteStyle}>
        {t(locale, 'schedule.today.sessionCount').replace('{{count}}', String(onThisDay.length))}
        {coachName ? <> · <bdi>{coachName}</bdi></> : null}
      </p>

      {day !== todayKey ? (
        <Button variant="secondary" data-testid="back-to-today" onClick={() => setDay(todayKey)}>
          {t(locale, 'schedule.today.backToToday')}
        </Button>
      ) : null}

      <div style={stripStyle} role="group" aria-label={t(locale, 'schedule.datePicker.title')}>
        {strip.map((key) => {
          const selected = key === day
          return (
            <button
              key={key}
              type="button"
              // Keyed, not generic: the interesting assertion is WHICH day is selected.
              // The strip's length is `within(strip).getAllByRole('button')`, which asks
              // the accessibility tree instead of a test hook.
              data-testid={`day-chip-${key}`}
              aria-current={selected ? 'date' : undefined}
              style={selected ? selectedChipStyle : chipStyle}
              onClick={() => chooseDay(key)}
            >
              <span>{t(locale, `schedule.weekday.${new Date(`${key}T12:00:00Z`).getUTCDay()}`)}</span>
              <span>{key.slice(8)}</span>
            </button>
          )
        })}
      </div>

      <label style={filterStyle}>
        {t(locale, 'schedule.today.filterByCoach')}
        <select
          data-testid="coach-filter"
          value={coachFilter}
          onChange={(event) => setCoachFilter(event.target.value)}
        >
          <option value="">{t(locale, 'schedule.today.allCoaches')}</option>
          {coaches.map((coach) => (
            <option key={coach.person_id} value={coach.person_id}>
              {coach.display_name}
            </option>
          ))}
        </select>
      </label>

      {onThisDay.length === 0 ? (
        <EmptyState
          title={t(locale, 'schedule.today.empty')}
          description={t(locale, 'schedule.today.emptyHint')}
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {onThisDay.map((session) => (
            <li key={session.id} data-testid="session-row" style={{ minBlockSize: '44px' }}>
              <Card>
              <div style={rowStyle}>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  fontSize: 'var(--text-title)',
                }}
              >
                {formatTimeInStudioZone(session.starts_at, locale)}
                {'–'}
                {formatTimeInStudioZone(session.ends_at, locale)}
              </span>
              {/* 1d — `45 דק׳`, derived: two instants are already on the wire. */}
              <span style={noteStyle} data-testid="session-duration">
                {t(locale, 'schedule.session.durationMinutes').replace(
                  '{{minutes}}',
                  String(
                    Math.round(
                      (Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000,
                    ),
                  ),
                )}
              </span>
              <strong>{session.group_name}</strong>
              {/* 1d — `אולם א׳ · 14 חניכים`. */}
              <span style={noteStyle} data-testid="session-headcount">
                {session.location_name ? <>{session.location_name} · </> : null}
                {t(locale, 'schedule.session.headcount').replace(
                  '{{count}}',
                  String(session.headcount),
                )}
              </span>
              <StatusChip
                status={session.status === 'cancelled' ? 'cancelled' : 'planned'}
                label={t(locale, `schedule.session.status.${session.status}`)}
              />
              {/* 1d — `נוכחות נרשמה`: the register-state marker, the difference between
                  "done" and "still owed" at a glance down the day. */}
              {session.attendance_taken ? (
                <StatusChip
                  status="paid"
                  label={t(locale, 'schedule.session.attendanceTaken')}
                />
              ) : null}
              {session.staff[0] ? (
                <span style={noteStyle}>{session.staff[0].display_name}</span>
              ) : (
                <span style={noteStyle}>{t(locale, 'schedule.session.noCoach')}</span>
              )}
              {session.staff[0]?.is_substitute ? (
                <span style={noteStyle}>{t(locale, 'schedule.session.substitute')}</span>
              ) : null}
              {session.is_manually_edited && !session.is_ad_hoc ? (
                <span style={noteStyle}>{t(locale, 'schedule.session.manuallyEditedHint')}</span>
              ) : null}
              {session.is_ad_hoc ? (
                <span style={noteStyle}>{t(locale, 'schedule.session.adHoc')}</span>
              ) : null}
              {session.cancel_reason ? (
                <span style={noteStyle}>{cancelReasonLabel(locale, session.cancel_reason)}</span>
              ) : null}
              </div>
              {session.status !== 'cancelled' ? (
                // 1d — "לחיצה פותחת את 1c". Until the design pass NOTHING in the app
                // linked to the roster: the product's core daily flow was reachable only
                // by typing `#/attendance/<id>` into the URL bar.
                <a
                  href={`#/attendance/${session.id}`}
                  data-testid="open-roster"
                  className="studio-btn"
                  data-variant="primary"
                  style={{
                    marginBlockStart: 'var(--space-3)',
                    display: 'flex',
                    textDecoration: 'none',
                  }}
                >
                  {t(locale, 'schedule.today.openRoster')}
                </a>
              ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
