// Dashboard artboard 4a — כרטיס חניך: "כל מה שהמנהל צריך על חניך אחד".
//
// **The price is an id and a suggestion, never an amount** (C11, L2). `price_plan` is W4's
// table, so `convert.pricePlan` takes an id and `convert.weeklyVolume` shows the number
// §5.10 puts beside it: "about 300 for twice a week, about 500 for daily" — approximate by
// the club's own admission, which is exactly why the manager picks and the app suggests.
//
// The volume comes from a manager-only route. `price_plan_id` is what invariant 3's detector
// reads as a financial field, so it never travels on the coach-reachable card.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BeltBar, Button, Card, StatusChip } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { chipToneFor } from './StudentsScreen'
import type {
  DashboardPeopleClient,
  EnrollmentOut,
  StatusHistoryOut,
  StudentDetail,
  StudentPricePlan,
} from './peopleClient'

const pageStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
  gap: 'var(--space-4)',
  // §6.4 — 'a manager checking cover from a phone is a normal case rather than an error.'
  inlineSize: '100%',
}

export function StudentDetailScreen({
  studentId,
  locale,
  client,
}: {
  studentId: string
  locale: Locale
  client: DashboardPeopleClient
}) {
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentOut[]>([])
  const [history, setHistory] = useState<StatusHistoryOut[]>([])
  const [plan, setPlan] = useState<StudentPricePlan | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([
      client.student(studentId),
      client.enrollments(studentId),
      client.statusHistory(studentId),
      client.pricePlan(studentId),
    ])
      .then(([detail, rows, statuses, pricePlan]) => {
        if (!live) return
        setStudent(detail)
        setEnrollments(rows)
        setHistory(statuses.items)
        setPlan(pricePlan)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, studentId])

  if (!student) return <p data-testid="student-detail-loading" />

  const live = enrollments.filter((enrollment) => enrollment.ended_on == null)

  return (
    <section style={pageStyle} aria-labelledby="detail-title" data-testid="student-detail">
      <div>
        <h1 id="detail-title">
          <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
        </h1>
        <StatusChip
          status={chipToneFor(student.status)}
          label={t(locale, `people.status.${student.status}`)}
        />
        {student.current_belt_color_hex ? (
          <BeltBar
            colorHex={student.current_belt_color_hex}
            label={student.current_belt_name ?? ''}
          />
        ) : null}
        {student.status === 'frozen' ? (
          <p data-testid="detail-frozen">
            {t(locale, 'people.freeze.active')}
            {student.frozen_until
              ? ` — ${formatDateInStudioZone(student.frozen_until, locale)}`
              : ''}
          </p>
        ) : null}
      </div>

      <Card>
        <h2>{t(locale, 'people.student.groups')}</h2>
        {/* C11 — every live enrollment, with its C12 pattern. */}
        <ul>
          {live.map((enrollment) => (
            <li key={enrollment.id} data-testid="detail-enrollment">
              <bdi>{enrollment.group_name}</bdi>
              <span data-testid="detail-weekdays">
                {enrollment.attends_weekdays == null
                  ? t(locale, 'people.weekdays.allDays')
                  : enrollment.attends_weekdays
                      .map((day) => t(locale, `people.weekdays.${day}`))
                      .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2>{t(locale, 'people.convert.pricePlan')}</h2>
        {/* An ID field and a hint, never an amount and never a picker. L2 — `price_plan` is
            W4's table and this lane stores the id without resolving it. */}
        <p data-testid="detail-price-plan">{plan?.price_plan_id ?? '—'}</p>
        <p data-testid="detail-price-hint">{t(locale, 'people.convert.pricePlanHint')}</p>
        <p data-testid="detail-weekly-volume">
          {t(locale, 'people.convert.weeklyVolume')}: {plan?.weekly_volume ?? 0}
        </p>
      </Card>

      <Card>
        <h2>{t(locale, 'people.guardian.plural')}</h2>
        <ul>
          {(student.guardians ?? []).map((guardian) => (
            <li key={guardian.person_id} data-testid="detail-guardian">
              <bdi>{guardian.display_name}</bdi>
              {guardian.is_primary ? (
                <span data-testid="detail-primary">{t(locale, 'people.guardian.primary')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2>{t(locale, 'people.status.history')}</h2>
        {/* §5.4a computes the funnel from these rows; 4a renders the same rows as a
            timeline, so a manager reads the same history the report is built on. */}
        <ol>
          {history.map((row) => (
            <li key={row.id} data-testid="detail-history">
              {t(locale, `people.status.${row.to_status}`)} —{' '}
              {formatDateInStudioZone(row.changed_at, locale)}
              {row.reason ? ` · ${row.reason}` : ''}
            </li>
          ))}
        </ol>
      </Card>

      <div>
        <Button variant="secondary" data-testid="detail-freeze">
          {t(locale, 'people.freeze.title')}
        </Button>
        <Button variant="secondary" data-testid="detail-convert">
          {t(locale, 'people.convert.title')}
        </Button>
        <Button variant="ghost" data-testid="detail-mark-lost">
          {t(locale, 'people.convert.markLost')}
        </Button>
      </div>
    </section>
  )
}
