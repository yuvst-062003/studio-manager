// This lane's `student-card` sections, registered the way M4's and M6's will be.
//
// Called once from the app's own entry, never at module import of a component file: a
// registration that happens on import registers twice under HMR and in any test that imports
// the barrel more than once. (`registerSlot` de-duplicates on key, which is a belt to this
// braces.)
//
// The `order` values leave room deliberately. Later lanes slot between them — a belt strip
// (M7) belongs beside the details, a payment section (M6) at the end — without anybody
// renumbering what is already there.
import { registerSlot } from '@studio/ui'
import { DetailsSection } from './sections/DetailsSection'
import { EnrollmentsSection } from './sections/EnrollmentsSection'
import { GuardiansSection } from './sections/GuardiansSection'
import type { StudentCardSectionProps } from './StudentCard'

export function registerPeopleSections(): void {
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-details',
    order: 10,
    render: DetailsSection,
  })
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-enrollments',
    order: 30,
    render: EnrollmentsSection,
  })
  registerSlot<StudentCardSectionProps>('student-card', {
    key: 'people-guardians',
    order: 50,
    render: GuardiansSection,
  })
}
