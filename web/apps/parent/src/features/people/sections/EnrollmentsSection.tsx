// This lane's `student-card` section: the groups, and the days the child comes to each.
//
// **Every live enrollment, not one** — C11 and L3: "§5.4's 'each child is enrolled in one
// group' was wrong and is corrected." A section that rendered `enrollments[0]` would hide
// the second group from the parent paying for it.
//
// **No price, anywhere** — C11 put that on the student, and `EnrollmentOut` has no field for
// one. L2: this lane never renders an amount.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { StudentCardSectionProps } from '../StudentCard'

const rowStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

//: The days are secondary to the group they qualify, and read as such.
const daysStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

export function EnrollmentsSection({ locale, student, enrollments = [] }: StudentCardSectionProps) {
  return (
    <section aria-labelledby="card-groups" data-testid="student-card-enrollments">
      <h2 id="card-groups">{t(locale, 'people.card.enrollments')}</h2>
      {enrollments.length === 0 ? (
        <p data-testid="student-card-no-enrollments">{t(locale, 'people.enrollment.empty')}</p>
      ) : (
        <ul>
          {enrollments.map((enrollment) => (
            // A flex row with a gap: the group and the days were adjacent inline elements
            // with nothing between them, so a card read "ילדים א'כל הימים".
            <li key={enrollment.id} data-testid="student-card-enrollment" style={rowStyle}>
              <bdi>{enrollment.group_name}</bdi>
              {/* C12 — `attends_weekdays` is NULL when the child comes to everything, which
                  is the default and the common case. "כל הימים" is the honest rendering of
                  that; listing seven days would imply a choice nobody made. */}
              <span data-testid="student-card-weekdays" style={daysStyle}>
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
      {/* The way in to `#/plan/<studentId>` — the training-plan screen (§5.1's upgrade
          offer, this week's extras, what the price buys). It was mounted in the shell and
          linked from nowhere at all, so no parent could reach it. The student card is its
          home because the plan is per CHILD: a family with two children has two plans and
          two upgrade decisions, which is the same reason the route carries an id. */}
      {student ? (
        <a data-testid="student-card-plan-link" href={`#/plan/${student.id}`}>
          {t(locale, 'schedule.plan.title')}
        </a>
      ) : null}
    </section>
  )
}
