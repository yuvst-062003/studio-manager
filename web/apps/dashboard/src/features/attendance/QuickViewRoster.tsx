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
import { AttendanceMark, Button, PlanBadge, StatTile } from '@studio/ui'
import type { AttendanceState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PlanBadgeData } from '../billing/usePlanBadges'
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

/** The Quick View's three explicit per-student buttons — the artboard's own composition
 *  (`WeeklyScheduleView`'s attendance tab, `handleToggleAttendeeStatus`), rather than the
 *  three-tap cycle this popover used to run. Each entry is a button's own target status and
 *  its i18n key; `unmarked` has no button of its own because nothing here ever sets a
 *  student back to it — the same reasoning the old cycle followed for keeping
 *  `absent_excused` out of a coach's click path, applied to the state a coach never has a
 *  reason to choose either. */
const ACTIONS: { status: 'present' | 'absent_excused' | 'absent_unexcused'; labelKey: string }[] = [
  { status: 'present', labelKey: 'attendance.roster.present' },
  { status: 'absent_excused', labelKey: 'attendance.roster.markAbsentExcused' },
  { status: 'absent_unexcused', labelKey: 'attendance.roster.markAbsentUnexcused' },
]

export function QuickViewRoster({
  roster,
  locale,
  onMark,
  onBulkPresent,
  onClose,
  plans,
}: {
  roster: RosterRow[]
  locale: Locale
  onMark: (studentId: string, status: RosterRow['status']) => void
  onBulkPresent: () => void
  onClose: () => void
  /**
   * Plan frequency per student, or undefined for a viewer who may not see it.
   *
   * **Passed in rather than read here, and that is the safety property.** This popover is
   * rendered on a screen coaches also reach, and `price_plan_id` is what invariant 3's
   * detector treats as a financial field — §3.2's hard rule is that coaches never see
   * money. The caller holds the permission and simply passes nothing for a coach, so a
   * coach-rendered roster has no plan data in it to leak rather than having some it must
   * remember to hide.
   */
  plans?: PlanBadgeData
}) {
  // The artboard's 3-up stat header (`WeeklyScheduleView`'s attendance tab): registered,
  // present, absent-or-late, each read straight off the roster this popover already holds —
  // no figure here is fetched separately from the rows below it.
  const registered = roster.length
  const present = roster.filter((row) => row.status === 'present').length
  const absent = roster.filter((row) => row.status.startsWith('absent')).length
  // A FOURTH tile the prototype's three do not have. §5.14 makes `unmarked` a real state
  // precisely so a coach who forgot the register does not read as a child who stopped
  // coming — and the one-paragraph summary this header replaces showed it. Dropping it
  // would lose something the predecessor had, which §0 forbids.
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
        <div className="quickview__stats" data-testid="quickview-stats">
          <StatTile label={t(locale, 'attendance.roster.registered')} value={registered} />
          <StatTile label={t(locale, 'attendance.roster.present')} tone="paid" value={present} />
          <StatTile label={t(locale, 'attendance.roster.absent')} tone="debt" value={absent} />
          <StatTile
            label={t(locale, 'attendance.roster.unmarked')}
            tone="pending"
            value={unmarked}
          />
        </div>
      </header>

      {/* finding 2 — scrollable, not clipped. A group of twenty-five had nowhere to go. */}
      <ul className="quickview__list" data-testid="quickview-list">
        {roster.map((row) => {
          // §5.7 and §10.5 — a parent's advance notice is never overwritten by a coach's
          // tap. The server refuses it and the row agrees: all three buttons go inert
          // rather than let one of them flash a value the next refresh takes back.
          const locked = row.has_absence_report && row.status === 'absent_excused'
          return (
            <li key={row.student_id}>
              <div
                className="quickview__row"
                data-pre-reported={row.has_absence_report ? 'true' : undefined}
                data-status={row.status}
                data-testid={`quickview-row-${row.student_id}`}
              >
                <AttendanceMark label={t(locale, LABEL[row.status])} state={GLYPH[row.status]} />
                <bdi>{row.display_name}</bdi>
                {/* Only when the caller supplied plans — see the prop's note. */}
                {plans ? (
                  <PlanBadge
                    loading={plans.loading}
                    locale={locale}
                    perWeek={plans.frequencies[row.student_id]}
                  />
                ) : null}
                {row.has_absence_report ? (
                  <span data-testid={`quickview-note-${row.student_id}`}>
                    {t(locale, 'attendance.source.preReported')}
                  </span>
                ) : null}
                {/* Three explicit buttons, replacing the old three-tap cycle: the button
                    matching the student's current status carries `aria-pressed`, so which
                    mark is set lives in the accessibility tree and drives the styling from
                    that same attribute — never colour alone. */}
                <div className="quickview__actions">
                  {ACTIONS.map((action) => (
                    <button
                      aria-pressed={row.status === action.status}
                      className="quickview__action"
                      data-action={action.status}
                      data-testid={`quickview-mark-${action.status}-${row.student_id}`}
                      disabled={locked}
                      key={action.status}
                      onClick={() => onMark(row.student_id, action.status)}
                      type="button"
                    >
                      {t(locale, action.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
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
