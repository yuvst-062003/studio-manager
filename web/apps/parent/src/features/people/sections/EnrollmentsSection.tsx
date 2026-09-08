// This lane's `student-card` sections: the groups the child trains in, and the way through
// to the training plan.
//
// **Every live enrollment, not one** — C11 and L3: "§5.4's 'each child is enrolled in one
// group' was wrong and is corrected." A section that rendered `enrollments[0]` would hide
// the second group from the parent paying for it.
//
// **No price, anywhere** — C11 put that on the student, and `EnrollmentOut` has no field for
// one. L2: this lane never renders an amount.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { DetailRow, MoneyDisplay } from '@studio/ui'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { StudentCardSectionProps } from '../redesign/TraineeCard'

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
  const plan = useMyPlan(student.id)
  return (
    <DetailRow
      href={`#/plan/${student.id}`}
      label={t(locale, 'people.card.plan')}
      testId="student-card-plan-link"
    >
      {/* The plan's NAME and what it costs — not the literal 'המסלול שלי', which is the
          screen's title repeated as its own value. Every other row on this card answers
          its label; this one used to say "the plan is: the plan".
          `null` while the read is in flight or when the child has no plan (a `lead`, or a
          child a manager has not priced), and then the row falls back to naming the
          destination rather than printing an amount nobody set. */}
      {plan === null ? (
        t(locale, 'schedule.plan.title')
      ) : (
        <span className="flex items-baseline gap-2">
          <bdi>{plan.plan_name}</bdi>
          <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.plan_name} />
        </span>
      )}
    </DetailRow>
  )
}

/**
 * This child's plan, from `GET /me/training-plans`.
 *
 * A read of its own rather than a field on the card's payload: `StudentSummaryOut` is the
 * roster row a coach also receives, and §13's third invariant keeps the price off it. The
 * same reason home's pill has its own read.
 *
 * A failed read is `null`, which renders the row exactly as it did before this existed. A
 * money row that guesses is worse than one that says less.
 */
function useMyPlan(
  studentId: string,
): { plan_name: string; monthly_amount_agorot: number } | null {
  const [plan, setPlan] = useState<{
    plan_name: string
    monthly_amount_agorot: number
  } | null>(null)

  useEffect(() => {
    let live = true
    void apiFetch('/api/v1/me/training-plans')
      .then(async (response) => {
        if (!live || !response.ok) return
        const body = (await response.json()) as {
          items: {
            student_id: string
            plan_name: string | null
            monthly_amount_agorot: number | null
          }[]
        }
        const row = body.items.find((item) => item.student_id === studentId)
        if (row?.plan_name != null && row.monthly_amount_agorot != null) {
          setPlan({ plan_name: row.plan_name, monthly_amount_agorot: row.monthly_amount_agorot })
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [studentId])

  return plan
}
