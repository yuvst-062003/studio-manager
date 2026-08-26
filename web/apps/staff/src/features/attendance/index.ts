// The attendance feature's barrel, and the one place this lane registers into containers it
// does not own.
//
// Registration happens in a function called once from the app's entry, never at module
// import of a component file — the rule `features/people/register.ts` already states: a
// registration that fires on import registers twice under HMR and in any test that imports
// the barrel more than once. (`registerSlot` de-duplicates on key, which is a belt to this
// braces.)
import { registerSlot } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { AttendanceStrip } from './AttendanceStrip'
import type { AttendanceStripProps } from './AttendanceStrip'
import { ConflictSection } from './ConflictSection'
import { registerAttendanceDevTools } from './devbar'

export { RosterRow } from './RosterRow'
export type { RosterRowSectionProps } from './RosterRow'
export { RosterScreen } from './RosterScreen'
export { SessionSummary } from './SessionSummary'
export { StudentCardScreen } from './StudentCardScreen'
export { AttendanceStrip } from './AttendanceStrip'
export { ConflictSection } from './ConflictSection'
export { makeStaffAttendanceClient } from './client'
export type { AttendanceRecord, SessionRosterOut, StaffAttendanceClient } from './client'
export { registerAttendanceDevTools } from './devbar'

/**
 * The three slots this lane fills, plus the two dev tools.
 *
 * The `roster-row` CONTAINER is not here — this lane *builds* that one, and M4's badge and
 * M7's belt bar register into it from their own directories.
 *
 * `order: 40` on the attendance strip leaves M3's details (10), enrollments (30) and
 * guardians (50) where they are, and puts the marks above the guardian list on `2d`, which
 * is where the artboard draws them.
 */
export function registerAttendanceSections(): void {
  registerSlot<AttendanceStripProps>('student-card', {
    key: 'attendance-strip',
    order: 40,
    render: AttendanceStrip,
  })
  registerSlot<{ locale: Locale }>('alert-centre', {
    key: 'attendance-conflicts',
    // Ahead of M3's pending requests and trials. §10.5's cards are unsynced work a human
    // has to decide about; a trial booking can wait an hour and a coach's lost register
    // cannot.
    order: 5,
    render: ConflictSection,
  })
  registerAttendanceDevTools()
}
