// The `student-card` attendance strip — this lane's fill into M3's container (`2c`/`2d`/`4a`).
//
// Artboard `2d`: "§ attendance history — 8 marks + a percentage caption". `4a` draws twelve
// (`2d` finding 9, an open disagreement), so the count is a prop with `2d`'s default rather
// than a constant baked in for the staff surface and contradicted on the dashboard.
//
// **The caption states no exam threshold.** `2d` finding 3: an 80% attendance threshold for
// exam eligibility "exists only on this artboard", and §5.9 computes eligibility from rank
// and time in grade. Printing a threshold no model implements would tell a coach something
// the product does not do — so the caption is the rate, and nothing more.
import { useEffect, useState } from 'react'
import { AttendanceMark } from '@studio/ui'
import type { AttendanceState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { AttendanceRecord, StaffAttendanceClient } from './client'

/** §5.14 — `unmarked` is a real state and the strip draws it as its own treatment, never as
 *  an absence. `4c`'s sequence strip depends on the same distinction. */
const GLYPH: Record<AttendanceRecord['status'], AttendanceState> = {
  unmarked: 'unmarked',
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
}

const LABEL: Record<AttendanceRecord['status'], string> = {
  unmarked: 'attendance.roster.unmarked',
  present: 'attendance.roster.present',
  absent_unexcused: 'attendance.roster.absentUnexcused',
  absent_excused: 'attendance.roster.absentExcused',
}

export type AttendanceStripProps = {
  student: { id: string }
  locale: Locale
  client?: StaffAttendanceClient
  /** `2d` draws eight, `4a` twelve. Neither is baked in. */
  window?: number
}

export function AttendanceStrip({ student, locale, client, window = 8 }: AttendanceStripProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  useEffect(() => {
    if (!client) return
    let live = true
    void client
      .studentAttendance(student.id, window)
      .then((rows) => {
        if (live) setRecords(rows)
      })
      .catch(() => {
        // A card opened from the roster is a card opened on the mat. An empty strip beats
        // an error boundary over a screen the coach reached mid-lesson.
      })
    return () => {
      live = false
    }
  }, [client, student.id, window])

  return (
    <section data-testid="student-card-attendance">
      <h2>{t(locale, 'attendance.card.recentAttendance')}</h2>
      {records.length === 0 ? (
        <p data-testid="student-card-attendance-empty">{t(locale, 'attendance.report.empty')}</p>
      ) : (
        <>
          {/* Oldest at the reading start — `4c`'s rule for the same strip. `dir` does it;
              no reverse, no physical offset. */}
          <ol data-testid="student-card-attendance-strip">
            {[...records].reverse().map((record) => (
              <li key={record.id}>
                <AttendanceMark
                  label={t(locale, LABEL[record.status])}
                  state={GLYPH[record.status]}
                />
              </li>
            ))}
          </ol>
          <p data-testid="student-card-attendance-rate">
            {t(locale, 'attendance.report.attendanceRate')}: {rate(records)}%
          </p>
        </>
      )}
    </section>
  )
}

/**
 * §5.14 — "**The denominator is sessions the student was expected at**, never every session
 * the group held."
 *
 * `unmarked` rows are excluded from BOTH halves, which is the same rule `4c`'s at-risk
 * streak encodes and never states: a session nobody marked is not a session the child
 * missed. Counting it as an absence would make a coach who forgot the register look like a
 * child who stopped coming.
 */
function rate(records: AttendanceRecord[]): number {
  const decided = records.filter((record) => record.status !== 'unmarked')
  if (decided.length === 0) return 0
  const present = decided.filter((record) => record.status === 'present').length
  return Math.round((present / decided.length) * 100)
}
