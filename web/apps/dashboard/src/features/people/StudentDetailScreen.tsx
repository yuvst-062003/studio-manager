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
import { BeltBar, Button, Card, PlanBadge, StatusChip } from '@studio/ui'
import { usePlanBadges } from '../billing/usePlanBadges'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { chipToneFor } from './StudentsScreen'
import type {
  DashboardPeopleClient,
  GroupOption,
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
  // Manager-scoped, like the price-plan read beside it. Resolves the plan id this screen
  // already fetches into something a person can read.
  const plans = usePlanBadges()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentOut[]>([])
  const [history, setHistory] = useState<StatusHistoryOut[]>([])
  const [plan, setPlan] = useState<StudentPricePlan | null>(null)
  // §5.4a step 5 — 'Manager converts → picks group, sets price, status=active, enrollment
  // created. Three decisions in one request, because they are one decision.'
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [converting, setConverting] = useState(false)
  const [convertGroup, setConvertGroup] = useState('')
  // F2 — the two buttons on either side of convert, wired at last. Each expands into
  // its own small form: the second press is the confirmation step, and the fields ARE
  // the decision (§5.4's freeze keeps the spot; mark-lost wants the manager's reason).
  const [freezing, setFreezing] = useState(false)
  const [freezeFrom, setFreezeFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [freezeTo, setFreezeTo] = useState('')
  const [markingLost, setMarkingLost] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([
      client.student(studentId),
      client.enrollments(studentId),
      client.statusHistory(studentId),
      client.pricePlan(studentId),
      client.groups().catch(() => ({ items: [] as GroupOption[] })),
    ])
      .then(([detail, rows, statuses, pricePlan, groupList]) => {
        if (!live) return
        setStudent(detail)
        setEnrollments(rows)
        setHistory(statuses.items)
        setPlan(pricePlan)
        setGroups(groupList.items)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, studentId, reloads])

  async function convert() {
    if (!convertGroup || busy) return
    setBusy(true)
    try {
      // `price_plan_id` is deliberately absent: C11 and L2 make the price an id this lane
      // stores and never resolves, and the plans live on the billing screen. A conversion
      // without one leaves the student unpriced, which the billing run reports rather than
      // charging zero — see `_charge_one`'s `tally.unpriced`.
      await client.convert(studentId, {
        group_id: convertGroup,
        started_on: new Date().toISOString().slice(0, 10),
      })
      setConverting(false)
      setConvertGroup('')
      setReloads((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

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
        {/* Was the raw `price_plan_id` UUID — right when L2 was written, because
            `price_plan` was W4's table and did not exist yet to resolve against. It does
            now, so a manager reads the plan rather than its primary key. Still never an
            amount and never a picker: C11 keeps the price a manager-scoped id here. */}
        <p data-testid="detail-price-plan">
          {plan?.price_plan_id ? (
            <>
              <PlanBadge
                loading={plans.loading}
                locale={locale}
                perWeek={plans.frequencies[studentId]}
              />{' '}
              <bdi>{plans.names[studentId] ?? plan.price_plan_id}</bdi>
            </>
          ) : (
            '—'
          )}
        </p>
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
        {freezing ? (
          <>
            <label>
              {t(locale, 'people.freeze.from')}
              <input
                data-testid="detail-freeze-from"
                onChange={(event) => setFreezeFrom(event.target.value)}
                type="date"
                value={freezeFrom}
              />
            </label>
            <label>
              {t(locale, 'people.freeze.to')}
              <input
                data-testid="detail-freeze-to"
                onChange={(event) => setFreezeTo(event.target.value)}
                type="date"
                value={freezeTo}
              />
            </label>
            <Button
              data-testid="detail-freeze-submit"
              disabled={!freezeFrom || busy}
              onClick={() => {
                setBusy(true)
                void client
                  .freeze(studentId, { from_date: freezeFrom, to_date: freezeTo || null })
                  .then(() => {
                    setFreezing(false)
                    setReloads((n) => n + 1)
                  })
                  .finally(() => setBusy(false))
              }}
            >
              {t(locale, 'people.freeze.submit')}
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            data-testid="detail-freeze"
            onClick={() => setFreezing(true)}
          >
            {t(locale, 'people.freeze.title')}
          </Button>
        )}
        {/* §5.4a step 5. The button opens the decision rather than converting in place,
            because the group is part of it — and it had no handler at all, so the one
            action that turns a trial into a member did nothing when pressed. */}
        {converting ? (
          <>
            <label>
              {t(locale, 'people.convert.group')}
              <select
                data-testid="detail-convert-group"
                value={convertGroup}
                onChange={(event) => setConvertGroup(event.target.value)}
              >
                <option value="">—</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              data-testid="detail-convert-submit"
              disabled={!convertGroup || busy}
              onClick={() => void convert()}
            >
              {t(locale, 'people.convert.submit')}
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            data-testid="detail-convert"
            onClick={() => setConverting(true)}
          >
            {t(locale, 'people.convert.title')}
          </Button>
        )}
        {markingLost ? (
          <>
            <label>
              {t(locale, 'people.convert.markLostReason')}
              <input
                data-testid="detail-lost-reason"
                onChange={(event) => setLostReason(event.target.value)}
                value={lostReason}
              />
            </label>
            <Button
              data-testid="detail-mark-lost-submit"
              disabled={!lostReason.trim() || busy}
              onClick={() => {
                setBusy(true)
                void client
                  .markLost(studentId, lostReason.trim())
                  .then(() => {
                    setMarkingLost(false)
                    setLostReason('')
                    setReloads((n) => n + 1)
                  })
                  .finally(() => setBusy(false))
              }}
              variant="destructive"
            >
              {t(locale, 'people.convert.markLost')}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            data-testid="detail-mark-lost"
            onClick={() => setMarkingLost(true)}
          >
            {t(locale, 'people.convert.markLost')}
          </Button>
        )}
      </div>
    </section>
  )
}
