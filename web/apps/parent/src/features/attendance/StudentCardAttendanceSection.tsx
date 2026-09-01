// 2c's נוכחות row (P2) — M5's quarter of the card.
//
// **Counts, not the eight-session strip.** The brief for this screen asks for "how many
// sessions they attended, how many they were reported absent from in advance, how many are
// still unmarked", and that is a question about a PERIOD — the whole 62 days the endpoint
// returns — not about the last eight marks. The strip answered a different question and
// answered it badly at 390px: `AttendanceStrip` draws 42×42 marks with `flex-wrap`, so
// eight of them wrap to two rows inside a 350px card and the "strip" is a block.
//
// The marks are not lost. `AttendanceStrip` is still the shared primitive on the staff
// roster and on 2d/9c/9h, and the full history stays one tap away on the attendance screen.
//
// Reads GET /me/attendance — the same §3.3-scoped read home makes — over the last 62 days,
// which is the endpoint's own cap.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { DetailRow, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type Row = { session_id: string; student_id: string; status: string; starts_at: string }

/** The window the endpoint itself caps at. Named once so the number and the sentence that
 *  describes it to a parent cannot drift apart. */
const WINDOW_DAYS = 62

/** Server status → the count a parent understands. `absent_unexcused` and
 *  `absent_excused` are two different facts to a family: one is "they did not turn up",
 *  the other is "we told you". Never summed. */
const COUNTED: { status: string; labelKey: string }[] = [
  { status: 'present', labelKey: 'attendance.roster.present' },
  { status: 'absent_excused', labelKey: 'attendance.source.preReported' },
  { status: 'absent_unexcused', labelKey: 'attendance.roster.absent' },
  { status: 'unmarked', labelKey: 'attendance.roster.unmarked' },
]

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
    const back = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86_400_000)
    void apiFetch(`/api/v1/me/attendance?from=${day(back)}&to=${day(now)}`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: Row[] }).items : [],
      )
      .then((items) => live && setRows(items))
      // A failed read renders NOTHING, never a reassuring zero. "0 לא סומן" from a request
      // that never landed is a worse answer than no row at all.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [student.id])

  if (rows === null) return null

  const nowIso = new Date().toISOString()
  // Sessions that have already happened. A lesson next Tuesday is not an unmarked
  // absence, and counting it as one tells a parent their child missed a class that has
  // not been taught yet.
  const mine = rows.filter((row) => row.student_id === student.id && row.starts_at <= nowIso)
  if (mine.length === 0) return null

  const counts = COUNTED.map((entry) => ({
    ...entry,
    total: mine.filter((row) => row.status === entry.status).length,
  })).filter((entry) => entry.total > 0)

  return (
    <DetailRow label={t(locale, 'attendance.roster.title')} testId="student-card-attendance">
      {/* Row gap and column gap are set separately, and that is not fussiness. A single
          `gap` big enough to separate two counts side by side ("18 נוכח 3 הודיעו מראש" read
          as one run at space-3) is also applied BETWEEN the wrapped lines, which left a
          20px hole down the middle of the row on a card too narrow for three counts. */}
      <span
        style={{ columnGap: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', rowGap: 'var(--space-1)' }}
      >
        {counts.map((entry) => (
          <span key={entry.status} data-testid="attendance-count">
            {/* The number leads and the word qualifies it — never the colour alone, and
                never a number with no noun beside it. */}
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--weight-medium)' }}>
              {entry.total}
            </span>{' '}
            <span style={{ color: 'var(--text-muted)' }}>{t(locale, entry.labelKey)}</span>
          </span>
        ))}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
        {t(locale, 'attendance.card.window')}
      </span>
    </DetailRow>
  )
}

/** Order 40: the ledger draws it between the groups (30) and the health row (60). */
export function registerAttendanceSections(): void {
  registerSlot<{ student: { id: string }; locale: Locale }>('student-card', {
    key: 'attendance-strip',
    order: 40,
    render: StudentCardAttendanceSection,
  })
}
