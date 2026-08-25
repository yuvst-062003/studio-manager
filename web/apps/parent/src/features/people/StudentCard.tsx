// Parent artboard 2c — כרטיס חניך. A **CONTAINER** (plan §1.3, seam 4).
//
// 2c is composed of sections owned by different verticals: this lane's details, enrollments
// and guardians; M4's documents; M5's attendance; M6's payment; M7's belt. The container
// renders `useSlot('student-card')` and knows none of them by name, so a later lane adds one
// file plus one line in its own feature barrel and never reopens this one.
//
// Hardcoding a section this lane does not own would put M4's work in M3's file and serialize
// the two waves the slot registry exists to keep parallel. The last test in the sibling spec
// is what keeps that from creeping in.
//
// This lane's own sections go through `registerSlot` as well (see register.ts). Not as a
// special case: one code path means M4 lands into a container that has already been
// exercised by real sections rather than by a test double.
import { useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { EnrollmentOut, GuardianOut, StudentSummary } from './peopleClient'

/**
 * What every `student-card` section receives.
 *
 * Sections read fields the wave's contract commit already put in the payload — they never
 * ask the container to fetch for them, which is what keeps a section from needing the
 * container to know it exists.
 */
export type StudentCardSectionProps = {
  student: StudentSummary
  locale: Locale
  enrollments?: EnrollmentOut[]
  guardians?: GuardianOut[]
}

export function StudentCard({
  student,
  locale,
  enrollments = [],
  guardians = [],
}: StudentCardSectionProps) {
  const sections = useSlot<StudentCardSectionProps>('student-card')
  return (
    <article aria-labelledby="student-card-title" data-testid="student-card">
      <h1 id="student-card-title">
        <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
      </h1>
      {sections.map(({ key, render: Section }) => (
        <Section
          key={key}
          student={student}
          locale={locale}
          enrollments={enrollments}
          guardians={guardians}
        />
      ))}
      {/* Honest about what is not here yet, rather than a page that looks finished and is
          missing four sections. */}
      <p data-testid="student-card-pending">{t(locale, 'people.card.sectionsComeLater')}</p>
    </article>
  )
}
