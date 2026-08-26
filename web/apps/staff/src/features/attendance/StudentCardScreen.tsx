// Staff artboard `2d` — כרטיס חניך, the coach's view. **A CONTAINER**, on the
// `student-card` slot M3 already declared (the same slot as parent `2c` and dashboard `4a`).
//
// ── §3.2, enforced by omission, and the comment `2d` finding 10 asks for ──────────────
//
// The mock data behind this student carries a payment status and an amount. **Every field
// on that record appears on this card except those two.** There is no balance, no debt chip,
// no pay action, no freeze and no transfer control — all of which `4a`, the manager's card,
// has.
//
// `2d` finding 10: "§3.2 is enforced here by omission, not by a statement... a developer
// reading `2d` alone has no cue that the absence is deliberate. **Put a comment where the
// `student-card` slot is composed for the coach surface.**" This is that comment.
//
// The absence is not a matter of which sections happen to be registered, either: SPEC §13's
// third invariant is enforced against every `coach`-tagged endpoint, so the data a coach's
// client can fetch carries no money in the first place. The omission here and the invariant
// there are the same rule at two levels.
//
// ── What is deliberately NOT rendered ────────────────────────────────────────────────
//
// **No participation restriction.** `2d` finding 1 is the artboard's health banner reading
// `אין להשתתף בלחימת קרקע עד חידוש` — "must not take part". §5.5 is explicit that nothing on
// the mat is ever blocked, `health.badge.missingHint` says `אפשר לסמן נוכחות`, and there is
// deliberately no `block_attendance_without_health` setting. The banner is M4's section
// through the slot; this container gives it nowhere to express a block and no control it
// could disable.
//
// **No exam threshold.** `2d` finding 3: an 80% attendance threshold for exam eligibility
// "exists only on this artboard", and §5.9 computes eligibility from rank and time in grade.
// See `AttendanceStrip.tsx`.
import { useSlot } from '@studio/ui'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow as RosterRowData } from '@studio/core'
import type { StaffAttendanceClient } from './client'

/** What every `student-card` section on the coach surface receives. The shape M3's parent
 *  container already established, plus the client this lane's own strip fetches through. */
export type StaffStudentCardProps = {
  student: { id: string; first_name: string; last_name: string }
  locale: Locale
  client?: StaffAttendanceClient
}

export function StudentCardScreen({
  student,
  locale,
  client,
  row,
  onMark,
}: StaffStudentCardProps & {
  /** The roster row this card was opened from, so the footer pair can show the CURRENT
   *  state. `2d` finding: "neither shows which state the student is currently in... so
   *  toggle or one-shot is undecided." Decided here — they are one-shot buttons that report
   *  which one is already true. */
  row?: RosterRowData
  onMark?: (status: RosterRowData['status']) => void
}) {
  const sections = useSlot<StaffStudentCardProps>('student-card')

  return (
    <article aria-labelledby="staff-student-card-title" data-testid="staff-student-card">
      <header>
        <h1 id="staff-student-card-title">
          {/* <bdi>, as `StudentRow` already does: a name can be Latin and mixed-direction
              text reorders without isolation (§9). */}
          <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
        </h1>
      </header>

      {sections.map(({ key, render: Section }) => (
        <Section client={client} key={key} locale={locale} student={student} />
      ))}

      <footer data-testid="staff-student-card-actions">
        {/* `2d` finding 6 — the mark-present button binds `--accent`, NEVER `--paid`. The
            two hold the same light-mode value, so a payment token here would render
            identically and pass review; D12's dark-mode correction moves `--paid` and the
            button would change colour on one theme only. §3.2 says a coach sees no payment
            data, and wiring an attendance control to the payment semantic is that rule
            broken in the one place nobody would look. The variant carries it — see
            attendance.css. */}
        <Button
          className="attendance-mark-present"
          onClick={() => onMark?.('present')}
          variant="secondary"
        >
          {t(locale, 'attendance.card.markPresent')}
          {row?.status === 'present' ? ' ✓' : ''}
        </Button>
        <Button onClick={() => onMark?.('absent_unexcused')} variant="destructive">
          {t(locale, 'attendance.card.markAbsent')}
          {row?.status === 'absent_unexcused' ? ' ✓' : ''}
        </Button>
      </footer>
    </article>
  )
}
