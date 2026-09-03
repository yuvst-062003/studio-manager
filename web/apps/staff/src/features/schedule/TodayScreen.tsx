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
import { Button, Card, EmptyState, LoadFailed, StatusChip } from '@studio/ui'
import {
  formatDateInStudioZone,
  formatTimeInStudioZone,
  studioDayKey,
  useNetworkMode,
} from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { cancelReasonLabel, yearCovers } from './client'
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
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Register §4.2 — defaults to false (an ordinary empty day) until the check below
  // (fired only when the day's own fetch comes back empty) proves otherwise.
  const [noTrainingYear, setNoTrainingYear] = useState(false)
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const strip = useMemo(() => stripAround(initialDay ?? todayKey), [initialDay, todayKey])

  useEffect(() => {
    let live = true
    client
      .listSessions({
        from: day,
        to: day,
        coachPersonId: coachFilter || undefined,
      })
      .then((loaded) => live && setSessions(loaded))
      // S11 — the day's list used to reject unhandled and render as an empty day, which
      // is the one lie this screen must never tell: "no sessions" reads as a day off.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, coachFilter, day, attempt])

  // The server already scoped the query to one day, but it answers in instants and the
  // screen groups by Jerusalem days. Re-filtering here is what keeps a 00:30 class off
  // yesterday's screen.
  const onThisDay = useMemo(
    () => sessions.filter((session) => studioDayKey(session.starts_at) === day),
    [day, sessions],
  )

  // Register §4.2 — `_year_covering` (app/services/schedule/service.py) silently skips any
  // occurrence outside every declared training year, so a year-less date and an ordinary
  // day off both arrive here as "zero sessions" with nothing to tell them apart. Checked
  // only when the day is empty: `GET /training-years` is `AnyStaff`, so a coach's own
  // client can already ask, and asking on every non-empty day would be a query nobody needs
  // the answer to.
  useEffect(() => {
    if (onThisDay.length > 0) {
      setNoTrainingYear(false)
      return
    }
    let live = true
    client
      .listTrainingYears()
      .then((years) => live && setNoTrainingYear(!yearCovers(years, day)))
      // A failed check must not invent a claim the day cannot back up — the ordinary
      // "no classes" empty state is the honest fallback, not a second failure mode.
      .catch(() => live && setNoTrainingYear(false))
    return () => {
      live = false
    }
  }, [client, day, onThisDay.length])

  const chooseDay = useCallback((key: string) => setDay(key), [])

  const coachName = useMemo(
    () => coaches.find((coach) => coach.person_id === coachFilter)?.display_name ?? null,
    [coachFilter, coaches],
  )

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        offline={networkMode !== 'online'}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

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
        {plural(locale, 'schedule.today.sessionCount', onThisDay.length)}
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
          title={t(locale, noTrainingYear ? 'schedule.today.noTrainingYear' : 'schedule.today.empty')}
          description={t(
            locale,
            noTrainingYear ? 'schedule.today.noTrainingYearHint' : 'schedule.today.emptyHint',
          )}
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
