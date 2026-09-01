// This lane's `student-card` sections: the groups the child trains in, and the way through
// to the training plan.
//
// **Every live enrollment, not one** — C11 and L3: "§5.4's 'each child is enrolled in one
// group' was wrong and is corrected." A section that rendered `enrollments[0]` would hide
// the second group from the parent paying for it.
//
// **No price, anywhere** — C11 put that on the student, and `EnrollmentOut` has no field for
// one. L2: this lane never renders an amount.
import type { CSSProperties } from 'react'
import { DetailRow } from '@studio/ui'
import { t } from '@studio/i18n'
import type { StudentCardSectionProps } from '../StudentCard'

// One group per line inside the row's value: the group and its days are one fact, and two
// groups are two facts under one label. A flex row with a gap, because the group and the
// days were adjacent inline elements with nothing between them and a card read
// "ילדים א'כל הימים".
const groupStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  gap: 'var(--space-3)',
}

//: The days are secondary to the group they qualify, and sit on the far edge so they line
//: up down the column no matter how long the group's name is.
const daysStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  marginInlineStart: 'auto',
  textAlign: 'end',
}

export function EnrollmentsSection({ locale, enrollments = [] }: StudentCardSectionProps) {
  if (enrollments.length === 0) {
    return (
      <DetailRow label={t(locale, 'people.card.enrollments')} testId="student-card-enrollments">
        <span data-testid="student-card-no-enrollments">
          {t(locale, 'people.enrollment.empty')}
        </span>
      </DetailRow>
    )
  }
  return (
    <DetailRow label={t(locale, 'people.card.enrollments')} testId="student-card-enrollments">
      {enrollments.map((enrollment) => (
        <span key={enrollment.id} data-testid="student-card-enrollment" style={groupStyle}>
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
        </span>
      ))}
    </DetailRow>
  )
}

/**
 * The way in to `#/plan/<studentId>` — the training-plan screen (§5.1's upgrade offer,
 * this week's extras, what the price buys). It was mounted in the shell and linked from
 * nowhere at all, so no parent could reach it.
 *
 * A row of its own rather than a link tucked under the groups: the plan is per CHILD — a
 * family with two children has two plans and two upgrade decisions, which is the same
 * reason the route carries an id — and the whole row being the target is what keeps it
 * over the 44px floor. As a caption-sized link inside another row it was neither.
 */
export function TrainingPlanRow({ locale, student }: StudentCardSectionProps) {
  return (
    <DetailRow
      href={`#/plan/${student.id}`}
      label={t(locale, 'people.card.plan')}
      testId="student-card-plan-link"
    >
      {t(locale, 'schedule.plan.title')}
    </DetailRow>
  )
}
