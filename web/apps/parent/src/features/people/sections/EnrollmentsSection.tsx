// This lane's `student-card` section: the groups, and the days the child comes to each.
//
// **Every live enrollment, not one** — C11 and L3: "§5.4's 'each child is enrolled in one
// group' was wrong and is corrected." A section that rendered `enrollments[0]` would hide
// the second group from the parent paying for it.
//
// **No price, anywhere** — C11 put that on the student, and `EnrollmentOut` has no field for
// one. L2: this lane never renders an amount.
import { t } from '@studio/i18n'
import type { StudentCardSectionProps } from '../StudentCard'

export function EnrollmentsSection({ locale, enrollments = [] }: StudentCardSectionProps) {
  return (
    <section aria-labelledby="card-groups" data-testid="student-card-enrollments">
      <h2 id="card-groups">{t(locale, 'people.card.enrollments')}</h2>
      {enrollments.length === 0 ? (
        <p data-testid="student-card-no-enrollments">{t(locale, 'people.enrollment.empty')}</p>
      ) : (
        <ul>
          {enrollments.map((enrollment) => (
            <li key={enrollment.id} data-testid="student-card-enrollment">
              <bdi>{enrollment.group_name}</bdi>
              {/* C12 — `attends_weekdays` is NULL when the child comes to everything, which
                  is the default and the common case. "כל הימים" is the honest rendering of
                  that; listing seven days would imply a choice nobody made. */}
              <span data-testid="student-card-weekdays">
                {enrollment.attends_weekdays == null
                  ? t(locale, 'people.weekdays.allDays')
                  : enrollment.attends_weekdays
                      .map((day) => t(locale, `people.weekdays.${day}`))
                      .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
