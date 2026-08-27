// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// The design pass (2026-08-27) reshaped this screen to the artboard's own order: the
// title row, the alert cards (a debt with its לתשלום CTA — the one alert 1a draws that
// the mounted §6.1 gate doesn't already own), the family's lessons grouped by day, and
// the child filter chips. The tab bar left this file for the App shell, where 1a always
// drew it — on every screen, not only home. 2a's day strip (read back/forward with past
// attendance) remains unbuilt and recorded.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatDateInStudioZone, formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { Button, Card, EmptyState, Icon, MoneyDisplay, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type HomeStudent = {
  id: string
  displayName: string
  groupNames: readonly string[]
}

export type HomeLesson = {
  id: string
  /** UTC ISO — rendered in the studio zone here, per G3. */
  startsAt: string
  groupName: string
}

/** One child's answer for one session — 2a's "כולל נוכחות שהייתה". */
export type HomeAttendanceRow = {
  session_id: string
  student_id: string
  status: string
}

const ATTENDANCE_LABEL: Record<string, string> = {
  present: 'attendance.roster.present',
  absent_excused: 'attendance.roster.absentExcused',
  absent_unexcused: 'attendance.roster.absentUnexcused',
  unmarked: 'attendance.roster.unmarked',
}

/** YYYY-MM-DD ± days, in the studio zone's own keys. */
function shiftDayKey(key: string, by: number): string {
  const base = new Date(`${key}T12:00:00Z`)
  return studioDayKey(new Date(base.getTime() + by * 24 * 60 * 60 * 1000).toISOString())
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // 390×844 is the drawn size, not a maximum: the same screen has to survive a 430pt Pro
  // Max and a desktop tab, so it is a max-width rather than a fixed width.
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const alertRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const dayHeaderStyle: CSSProperties = {
  margin: 0,
  paddingBlockStart: 'var(--space-2)',
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 500,
}

const lessonRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const lessonListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  minBlockSize: '40px',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-xl)',
  border: 'var(--border-width-hairline) solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  font: 'inherit',
  cursor: 'pointer',
}

const chipActiveStyle: CSSProperties = {
  ...chipStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  borderColor: 'var(--fg)',
}

/** Today / tomorrow get their names; further out, the studio-zone date carries the row. */
function dayLabel(iso: string, locale: Locale): string {
  return formatDateInStudioZone(iso, locale)
}

export function ParentHome({
  locale,
  students = null,
  upcoming = null,
  attendance = [],
  debtAgorot = 0,
}: {
  locale: Locale
  /** `null` while loading — the section stays quiet rather than flashing an empty state. */
  students?: readonly HomeStudent[] | null
  /** The family's lessons across 2a's strip window (past AND coming week). `null` = loading. */
  upcoming?: readonly HomeLesson[] | null
  /** 2a — what actually happened, per child per session, for the strip's past days. */
  attendance?: readonly HomeAttendanceRow[]
  /** The family's open balance — 1a's debt alert, fed from `/me/balance`. */
  debtAgorot?: number
}) {
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const todayKey = studioDayKey(new Date().toISOString())
  const [selectedDay, setSelectedDay] = useState(todayKey)
  // 2a's strip: three days back, today, three forward — read either way with one thumb.
  const strip = [-3, -2, -1, 0, 1, 2, 3].map((by) => shiftDayKey(todayKey, by))

  const filtered = useMemo(() => {
    if (upcoming === null) return null
    let rows = upcoming
    // 2a: a selected day shows exactly that day; today keeps 1a's forward list.
    rows =
      selectedDay === todayKey
        ? rows.filter((lesson) => studioDayKey(lesson.startsAt) >= todayKey)
        : rows.filter((lesson) => studioDayKey(lesson.startsAt) === selectedDay)
    if (childFilter === null || students === null) return rows
    const child = students.find((s) => s.id === childFilter)
    if (!child) return rows
    return rows.filter((lesson) => child.groupNames.includes(lesson.groupName))
  }, [upcoming, childFilter, students, selectedDay, todayKey])

  const marksOf = (lesson: HomeLesson) =>
    attendance
      .filter((row) => row.session_id === lesson.id)
      .map((row) => ({
        row,
        name: (students ?? []).find((s) => s.id === row.student_id)?.displayName ?? '',
      }))

  const byDay = useMemo(() => {
    if (filtered === null) return null
    const groups = new Map<string, HomeLesson[]>()
    for (const lesson of filtered) {
      const key = dayLabel(lesson.startsAt, locale)
      const rows = groups.get(key) ?? []
      rows.push(lesson)
      groups.set(key, rows)
    }
    return [...groups.entries()]
  }, [filtered, locale])

  const childrenOf = (lesson: HomeLesson): string =>
    (students ?? [])
      .filter((s) => s.groupNames.includes(lesson.groupName))
      .map((s) => s.displayName)
      .join(' · ')

  return (
    <section aria-labelledby="parent-home-title" data-testid="parent-home" style={pageStyle}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <h1
          id="parent-home-title"
          style={{
            margin: 0,
            fontSize: 'var(--text-display)',
            fontWeight: 600,
            marginInlineEnd: 'auto',
          }}
        >
          {t(locale, 'common.home.title')}
        </h1>
        {/* 1a's gear. A link and not an icon-only button with no name: an unnamed control
            is unreachable to a screen reader (ui-rtl-a11y.md). */}
        <a
          href="#/profile"
          data-testid="parent-home-settings"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
        >
          <Icon name="settings" size={16} />
          {t(locale, 'common.home.settings')}
        </a>
      </header>

      {/* 1a's alert cards. The health card is the §6.1 gate's job now — a family who owes
          a declaration never reaches this screen — so the debt card is the one that can
          actually appear here. Quiet line when nothing needs attention (4h's rule: state
          the goal state, never draw an empty box). */}
      {debtAgorot > 0 ? (
        <Card>
          <div style={alertRowStyle} data-testid="parent-home-debt">
            <Icon name="warning" size={20} style={{ color: 'var(--debt)' }} />
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--debt)' }}>
                {t(locale, 'common.home.debt.title')}
              </strong>
              <div style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>
                <MoneyDisplay agorot={debtAgorot} tone="debt" />
              </div>
            </div>
            <Button onClick={() => (globalThis.location.hash = '#/payments')}>
              {t(locale, 'common.home.debt.cta')}
            </Button>
          </div>
        </Card>
      ) : (
        <p data-testid="parent-home-no-alerts" style={{ margin: 0, color: 'var(--text-muted)' }}>
          {t(locale, 'common.home.noAlerts')}
        </p>
      )}

      <section aria-labelledby="parent-home-upcoming-title">
        <h2 id="parent-home-upcoming-title" style={{ fontSize: 'var(--text-title)' }}>
          {selectedDay === todayKey
            ? t(locale, 'common.home.upcoming')
            : formatDateInStudioZone(`${selectedDay}T12:00:00Z`, locale)}
        </h2>
        {/* 2a — the day strip: read back and forward, tap a day. Past days carry what
            actually happened; the strip is the affordance that makes attendance a thing
            a parent can SEE rather than ask about. */}
        <div
          role="group"
          aria-label={t(locale, 'common.home.dayStrip')}
          data-testid="parent-day-strip"
          style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBlockEnd: 'var(--space-2)' }}
        >
          {strip.map((day) => {
            const selected = day === selectedDay
            return (
              <button
                key={day}
                type="button"
                data-testid={`home-day-${day}`}
                aria-current={selected ? 'date' : undefined}
                style={selected ? { ...chipActiveStyle, minInlineSize: '44px' } : { ...chipStyle, minInlineSize: '44px' }}
                onClick={() => setSelectedDay(day)}
              >
                <span style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
                  {t(locale, `schedule.weekday.${new Date(`${day}T12:00:00Z`).getUTCDay()}`)}
                </span>
                <span>{day.slice(8)}</span>
              </button>
            )
          })}
        </div>
        {byDay === null ? null : byDay.length === 0 ? (
          <EmptyState
            title={t(locale, 'common.home.noUpcoming')}
            description={t(locale, 'common.home.noUpcomingWeek')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {byDay.map(([day, lessons]) => (
              <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <h3 style={dayHeaderStyle}>{day}</h3>
                <ul style={lessonListStyle}>
                  {lessons.map((lesson) => (
                    <li key={lesson.id} data-testid="parent-home-lesson">
                      <Card>
                        <div style={lessonRowStyle}>
                          <div style={{ flex: 1, minInlineSize: 0 }}>
                            <strong>
                              <bdi>{childrenOf(lesson) || lesson.groupName}</bdi>
                            </strong>
                            <div
                              style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}
                            >
                              <bdi>{lesson.groupName}</bdi>
                            </div>
                          </div>
                          <span
                            style={{
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: 600,
                              fontSize: 'var(--text-title)',
                            }}
                          >
                            {formatTimeInStudioZone(lesson.startsAt, locale)}
                          </span>
                        </div>
                        <div
                          style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
                        >
                          {marksOf(lesson).map(({ row, name }) => (
                            <span key={row.student_id} data-testid="home-attendance-mark">
                              <StatusChip
                                status={
                                  row.status === 'present'
                                    ? 'paid'
                                    : row.status === 'unmarked'
                                      ? 'unmarked'
                                      : 'cancelled'
                                }
                                label={`${name} · ${t(locale, ATTENDANCE_LABEL[row.status] ?? 'attendance.roster.unmarked')}`}
                              />
                            </span>
                          ))}
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 1a's child filter chips — הכל first, then one per child, reading edge first. */}
      {students !== null && students.length > 0 ? (
        <ul style={chipRowStyle} aria-label={t(locale, 'common.home.title')}>
          <li>
            <button
              type="button"
              style={childFilter === null ? chipActiveStyle : chipStyle}
              aria-pressed={childFilter === null}
              data-testid="parent-home-chip-all"
              onClick={() => setChildFilter(null)}
            >
              {t(locale, 'common.home.allChildren')}
            </button>
          </li>
          {students.map((student) => (
            <li key={student.id} data-testid="parent-home-child">
              <button
                type="button"
                style={childFilter === student.id ? chipActiveStyle : chipStyle}
                aria-pressed={childFilter === student.id}
                onClick={() => setChildFilter(childFilter === student.id ? null : student.id)}
              >
                <bdi>{student.displayName}</bdi>
              </button>
            </li>
          ))}
        </ul>
      ) : students !== null ? (
        <EmptyState
          title={t(locale, 'common.home.noChildren')}
          description={t(locale, 'common.home.childrenComeLater')}
        />
      ) : null}
    </section>
  )
}
