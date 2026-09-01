// This lane's `student-card` sections, registered the way M4's, M6's and M7's are.
//
// Called once from the app's own entry, never at module import of a component file: a
// registration that happens on import registers twice under HMR and in any test that imports
// the barrel more than once. (`registerSlot` de-duplicates on key, which is a belt to this
// braces.)
//
// **`region` is where a lane says which FRAME of the card it belongs in** — `mark` before
// the name, `status` after it, `body` (the default) in the ledger. It sits next to `order`
// because it is the same kind of decision: where this section goes, made in the file that
// owns the section rather than in the container that must never learn its name.
//
// The `order` values leave room deliberately. Later lanes slot between them without anybody
// renumbering what is already there.
import { registerSlot } from '@studio/ui'
import { DetailsSection, StudentStatusSection } from './sections/DetailsSection'
import { EnrollmentsSection, TrainingPlanRow } from './sections/EnrollmentsSection'
import { GuardiansSection } from './sections/GuardiansSection'
import { StatusHistorySection } from './sections/StatusHistorySection'
import type { StudentCardSectionProps } from './StudentCard'

export function registerPeopleSections(): void {
  // The header. §5.4a surfaces `student.status` everywhere a student is rendered, and the
  // card's header is where "who is this child, right now" belongs.
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-status',
    order: 10,
    region: 'status',
    render: StudentStatusSection,
  })

  // Order 25 — after M7's belt row (20), because a belt is what a parent came to see and a
  // birthdate is what they already know.
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-details',
    order: 25,
    render: DetailsSection,
  })
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-enrollments',
    order: 30,
    render: EnrollmentsSection,
  })
  // Order 75 — after M6's money row (70). The plan is what the money BUYS, so it reads
  // directly beneath what is owed for it.
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-plan',
    order: 75,
    render: TrainingPlanRow,
  })
  // The two rows a parent consults rather than scans, last: who the club has on file, and
  // when the membership began.
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-guardians',
    order: 80,
    render: GuardiansSection,
  })
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-status-history',
    order: 85,
    render: StatusHistorySection,
  })
}
