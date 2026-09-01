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
//
// ── The 2026-09-01 redesign ────────────────────────────────────────────────────────────
//
// Until now every section rendered its own `<section><h2>`, so eight sections built by six
// milestones read as eight screens stacked rather than one record about one child. The
// redesign spec names exactly that for this screen, and the owner picked the dense-ledger
// arrangement: a header carrying the child, and one hairline-separated list of labelled
// facts beneath it.
//
// The container did NOT learn any section's name to do it. `SlotEntry` grew a `region`, so
// a lane says which FRAME of the card it belongs in — `mark` before the name, `status`
// after it, `body` (the default, so nothing had to be reopened) in the ledger. Placement
// moved into the lane's own file, next to the `order` the lane already chose.
import { useSlot } from '@studio/ui'
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

/** The card's frames. Named for what they hold, so a lane can pick one without reading
 *  this file: a small identifying mark, the child's current standing, or a ledger row. */
type Region = 'mark' | 'status' | 'body'

export function StudentCard({
  student,
  locale,
  enrollments = [],
  guardians = [],
}: StudentCardSectionProps) {
  const marks = useSlot<StudentCardSectionProps>('student-card', 'mark')
  const statuses = useSlot<StudentCardSectionProps>('student-card', 'status')
  const rows = useSlot<StudentCardSectionProps>('student-card', 'body')

  const paint = (region: readonly { key: string; render: React.ComponentType<StudentCardSectionProps> }[]) =>
    region.map(({ key, render: Section }) => (
      <Section
        key={key}
        student={student}
        locale={locale}
        enrollments={enrollments}
        guardians={guardians}
      />
    ))

  return (
    <article
      aria-labelledby="student-card-title"
      className="studio-student-card"
      data-testid="student-card"
    >
      {/* One heading on the card, and it is the child. Every fact below is a labelled row,
          which is what stops a section from outranking the person it is about. */}
      <header className="studio-student-card__header" data-testid="student-card-header">
        {paint(marks)}
        <h1 className="studio-student-card__name" id="student-card-title">
          <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
        </h1>
        {paint(statuses)}
      </header>
      <div className="studio-student-card__rows" data-testid="student-card-rows">
        {paint(rows)}
      </div>
    </article>
  )
}

export type { Region as StudentCardRegion }
