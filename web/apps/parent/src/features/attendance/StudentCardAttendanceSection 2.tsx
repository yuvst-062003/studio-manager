// 2c's נוכחות section (P2) — M5's quarter: the 8-session strip with its counts legend,
// through the shared AttendanceStrip primitive so this surface and the staff card
// cannot drift apart. Reads GET /me/attendance — the same §3.3-scoped read home makes —
// over the last 62 days (the endpoint's own cap) and keeps the child's last 8 marks.
import { useEffect, useState } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { AttendanceStrip, registerSlot } from '@studio/ui'
import type { AttendanceStripItem } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type Row = { session_id: string; student_id: string; status: string; starts_at: string }

const STATE: Record<string, AttendanceStripItem['state']> = {
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
  unmarked: 'unmarked',
}

const LABEL: Record<AttendanceStripItem['state'], string> = {
  present: 'attendance.roster.present',
  absent: 'attendance.roster.absent',
  notified: 'attendance.source.preReported',
  unmarked: 'attendance.roster.unmarked',
}

function day(instant: Date): string {
  return instant.toISOString().slice(0, 10)
}

export function StudentCardAttendanceSection({
  student,
  locale,
}: {
  student: { id: string }
  locale: Locale
}) {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let live = true
    const now = new Date()
    const back = new Date(now.getTime() - 61 * 86_400_000)
    void apiFetch(`/api/v1/me/attendance?from=${day(back)}&to=${day(now)}`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: Row[] }).items : [],
      )
      .then((items) => live && setRows(items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [student.id])

  if (rows === null) return null
  const nowIso = new Date().toISOString()
  const mine = rows
    .filter((row) => row.student_id === student.id && row.starts_at <= nowIso)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .slice(-8)
  if (mine.length === 0) return null

  const items: AttendanceStripItem[] = mine.map((row) => {
    const state = STATE[row.status] ?? 'unmarked'
    return {
      id: row.session_id,
      state,
      label: `${formatDateInStudioZone(row.starts_at, locale)} · ${t(locale, LABEL[state])}`,
    }
  })

  return (
    <section aria-labelledby={`attendance-${student.id}`} data-testid="student-card-attendance">
      <h2 id={`attendance-${student.id}`}>{t(locale, 'attendance.roster.title')}</h2>
      <AttendanceStrip items={items} locale={locale} />
    </section>
  )
}

/** Order 40: 2c draws the strip between the belt (20) and the documents row (60). */
export function registerAttendanceSections(): void {
  registerSlot<{ student: { id: string }; locale: Locale }>('student-card', {
    key: 'attendance-strip',
    order: 40,
    render: StudentCardAttendanceSection,
  })
}
