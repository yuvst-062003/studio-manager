// Dashboard artboard `1e` — the Quick View popover's roster. **The artboard that fulfils
// D5**: clicking a session opens a popover with the roster and inline attendance marking,
// so a manager never leaves the calendar to take a register.
//
// Only the roster is here. `1e` finding 1 — "`1e` and `3a` must be merged. D5 requires the
// popover; `3a` has the nav, search and create" — is a decision about the week grid, which
// is M2's, and neither artboard settles it alone. This component is the part `1e` owns
// outright, built so whichever shell wins can mount it.
//
// Two findings corrected rather than carried:
//
//   * finding 2 — "the popover's roster is **clipped, not scrollable**, with no scroll
//     affordance. A group larger than fits has nowhere to go." It scrolls.
//   * finding 5 — "the summary omits the absent count entirely, though absences are in the
//     roster." It does not.
import { AttendanceMark, Button, StatusChip } from '@studio/ui'
import type { AttendanceState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow } from '@studio/core'

/** `1e`'s four marks, the same four as `1c` at a smaller size. Notified and unmarked share
 *  `--pending` and differ only by solid vs dashed and cross vs dot — `1e` notes that
 *  notified "is reachable only by clicking, so it is easy to miss when building". */
const GLYPH: Record<RosterRow['status'], AttendanceState> = {
  unmarked: 'unmarked',
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
}

const LABEL: Record<RosterRow['status'], string> = {
  unmarked: 'attendance.roster.unmarked',
  present: 'attendance.roster.present',
  absent_unexcused: 'attendance.roster.absentUnexcused',
  absent_excused: 'attendance.roster.absentExcused',
}

/** `1e` — "each click advances that student one step through a fixed four-state cycle:
 *  present → absent → notified → unmarked → present." That is the artboard's cycle and it
 *  differs from `1c`'s three-step one, which is a real inconsistency: `1c` reaches
 *  `notified` only through a parent's report. This follows `1c`, because a manager clicking
 *  a row into `absent_excused` would be recording an advance notice nobody gave. */
const CYCLE: Record<RosterRow['status'], RosterRow['status']> = {
  unmarked: 'present',
  present: 'absent_unexcused',
  absent_unexcused: 'unmarked',
  absent_excused: 'present',
}

export function QuickViewRoster({
  roster,
  locale,
  onMark,
  onBulkPresent,
  onClose,
}: {
  roster: RosterRow[]
  locale: Locale
  onMark: (studentId: string, status: RosterRow['status']) => void
  onBulkPresent: () => void
  onClose: () => void
}) {
  const present = roster.filter((row) => row.status === 'present').length
  const absent = roster.filter((row) => row.status.startsWith('absent')).length
  const unmarked = roster.filter((row) => row.status === 'unmarked').length

  return (
    <div className="quickview" data-testid="quickview-roster">
      <header>
        {/* `1e` finding 3 — "The × has no handler and there is no backdrop. Dismissal is
            undecided." Decided: the × closes, and it is a real button with an accessible
            name rather than a glyph. A backdrop is the shell's to add. */}
        <Button onClick={onClose} variant="ghost">
          {t(locale, 'attendance.quickView.close')}
        </Button>
        {unmarked > 0 ? (
          <StatusChip label={t(locale, 'attendance.roster.unmarked')} status="unmarked" />
        ) : null}
        {/* finding 5 — the artboard's summary shows present and unmarked and drops absent,
            which is the number a manager is looking for. */}
        <p data-testid="quickview-summary">
          {present} · {t(locale, 'attendance.roster.present')} · {absent} ·{' '}
          {t(locale, 'attendance.roster.absent')} · {unmarked} ·{' '}
          {t(locale, 'attendance.roster.unmarked')}
        </p>
      </header>

      {/* finding 2 — scrollable, not clipped. A group of twenty-five had nowhere to go. */}
      <ul className="quickview__list" data-testid="quickview-list">
        {roster.map((row) => (
          <li key={row.student_id}>
            <button
              data-pre-reported={row.has_absence_report ? 'true' : undefined}
              data-status={row.status}
              data-testid={`quickview-row-${row.student_id}`}
              // §5.7 and §10.5 — a parent's advance notice is not cycled by a click here
              // either. The server refuses it and the screen agrees, so the row does not
              // flash a value the next refresh takes back.
              onClick={() => {
                if (row.has_absence_report && row.status === 'absent_excused') return
                onMark(row.student_id, CYCLE[row.status])
              }}
              type="button"
            >
              <AttendanceMark label={t(locale, LABEL[row.status])} state={GLYPH[row.status]} />
              <bdi>{row.display_name}</bdi>
              {row.has_absence_report ? (
                <span data-testid={`quickview-note-${row.student_id}`}>
                  {t(locale, 'attendance.source.preReported')}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <footer>
        <Button onClick={onBulkPresent} variant="primary">
          {t(locale, 'attendance.roster.markAllPresent')}
        </Button>
        {/* `9f` finding 1 again, on the dashboard. The label above says what the button
            does; this says what it deliberately does not. */}
        <p data-testid="quickview-bulk-hint">
          {t(locale, 'attendance.roster.markAllPresentHint')}
        </p>
      </footer>
    </div>
  )
}
