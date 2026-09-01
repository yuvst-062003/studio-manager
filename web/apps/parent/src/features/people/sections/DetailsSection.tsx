// This lane's `student-card` sections: who the student is, and what the club says about them.
//
// Two entries, two frames. The STATUS is the child's current standing, so it sits beside
// the name in the header; the birthdate is a fact about them, so it is a row like every
// other fact. Splitting them is what lets the header stay one line while the ledger stays
// uniform — and neither placement required the container to learn this file's name.
import { DetailRow, StatusChip } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import { chipToneFor } from '../ProfileAndLeave'
import type { StudentCardSectionProps } from '../StudentCard'

/**
 * The header's status chip.
 *
 * §5.4a — `student.status` is surfaced everywhere a student is rendered, never inferred
 * from the absence of an enrollment. SC 1.4.1 — the label carries the meaning, not the
 * colour.
 *
 * A frozen child gets the date ON THE CHIP rather than in a line of its own beneath it.
 * "מוקפא" without "until when" is the half of the answer a parent does not need: they
 * already know the child is not training. The old card said it in a separate paragraph
 * under a separate heading, which is one more block for one more clause.
 */
export function StudentStatusSection({ student, locale }: StudentCardSectionProps) {
  const frozenUntil =
    student.status === 'frozen' && student.frozen_until
      ? ` · ${formatDateInStudioZone(student.frozen_until, locale)}`
      : ''
  return (
    <StatusChip
      status={chipToneFor(student.status)}
      label={`${t(locale, `people.status.${student.status}`)}${frozenUntil}`}
    />
  )
}

/** The birthdate row. Renders nothing when the club never recorded one — an empty row
 *  under a label reads as a broken feature rather than as an absent fact. */
export function DetailsSection({ student, locale }: StudentCardSectionProps) {
  if (!student.birthdate) return null
  return (
    <DetailRow label={t(locale, 'people.student.birthdate')} testId="student-card-details">
      {formatDateInStudioZone(student.birthdate, locale)}
    </DetailRow>
  )
}
