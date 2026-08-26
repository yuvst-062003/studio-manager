// This lane's `student-card` section: who the student is, and what the club says about them.
import { StatusChip } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import { chipToneFor } from '../ProfileAndLeave'
import type { StudentCardSectionProps } from '../StudentCard'

export function DetailsSection({ student, locale }: StudentCardSectionProps) {
  return (
    <section aria-labelledby="card-details" data-testid="student-card-details">
      <h2 id="card-details">{t(locale, 'people.card.details')}</h2>
      {/* §5.4a — `student.status` is surfaced everywhere a student is rendered, never
          inferred from the absence of an enrollment. SC 1.4.1 — the label carries the
          meaning, not the colour. */}
      <StatusChip
        status={chipToneFor(student.status)}
        label={t(locale, `people.status.${student.status}`)}
      />
      {student.birthdate ? (
        <p data-testid="student-card-birthdate">
          {t(locale, 'people.student.birthdate')}:{' '}
          {formatDateInStudioZone(student.birthdate, locale)}
        </p>
      ) : null}
      {student.status === 'frozen' ? (
        <p data-testid="student-card-frozen">
          {t(locale, 'people.freeze.active')}
          {student.frozen_until
            ? ` — ${formatDateInStudioZone(student.frozen_until, locale)}`
            : ''}
        </p>
      ) : null}
    </section>
  )
}
