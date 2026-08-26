// Staff artboard 9c — כרטיס חניך ומעבר כיתה: "פעולה של המאמן הראשי בלבד".
//
// Two things on one screen, with different audiences:
//
//   the card       every staff role. §3.2 — 'View students in own groups' reaches all four,
//                  and a card without a way to contact the parent is not a card.
//   מעבר כיתה      lead coach, manager or owner. The artboard says so, and `can()` from
//                  @studio/core is what decides — never a hand-rolled role check, because a
//                  second permission implementation is a second answer.
//
// **No money.** §3.2's hard rule: coaches never see money. `StudentDetailOut` has no
// `price_plan_id` at all — invariant 3's detector reads that name as financial — so this
// screen could not render a price even by accident.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BeltBar, Button, Card, StatusChip } from '@studio/ui'
import { can } from '@studio/core'
import type { Actor } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { WeekdayPicker, attendsWeekdaysFor } from './WeekdayPicker'
import { chipToneFor } from './StudentsSearch'
import type { EnrollmentOut, StaffPeopleClient, StudentDetail } from './peopleClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

export type MoveTarget = { id: string; name: string }

export function StaffStudentCard({
  student,
  enrollments,
  locale,
  client,
  actor,
  groups = [],
  today,
  onMoved,
}: {
  student: StudentDetail
  enrollments: EnrollmentOut[]
  locale: Locale
  client: StaffPeopleClient
  actor: Actor
  groups?: MoveTarget[]
  today: string
  onMoved?: () => void
}) {
  const [moving, setMoving] = useState(false)
  const [targetGroup, setTargetGroup] = useState('')
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [sending, setSending] = useState(false)

  // 9c says "פעולה של המאמן הראשי בלבד" — owner, manager and lead coach, and not an
  // assistant. §3.2 has no row named "move a student between groups"; the row whose role
  // set is exactly that trio is `session.edit`, so that is what is asked here rather than
  // a hand-rolled `role === 'lead_coach'`, which would be a second permission
  // implementation and therefore a second answer.
  //
  // A dedicated `student.moveGroup` capability would name this better, but CAPABILITIES
  // lives in @studio/core, which this lane does not own. Flagged for a later pass rather
  // than worked around with a role check.
  const mayMove = can(actor, 'session.edit')

  useEffect(() => {
    if (!targetGroup) return
    let live = true
    client
      .weekdayOptions(targetGroup)
      .then((options) => {
        if (!live) return
        const days = options.training_weekdays ?? []
        setTrainingWeekdays(days)
        // C12 — all ticked by default. The manager narrows it; the default is that the
        // child comes to everything the group runs.
        setSelected(days)
      })
      .catch(() => live && setTrainingWeekdays([]))
    return () => {
      live = false
    }
  }, [client, targetGroup])

  const live = enrollments.filter((enrollment) => enrollment.ended_on == null)

  return (
    <section style={pageStyle} aria-labelledby="staff-card-title" data-testid="staff-student-card">
      <h1 id="staff-card-title">
        <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
      </h1>

      <StatusChip
        status={chipToneFor(student.status)}
        label={t(locale, `people.status.${student.status}`)}
      />

      {student.current_belt_color_hex ? (
        // D7's ring is unconditional and lives in BeltBar. Redrawing a belt here would be
        // the one place it goes fill-only.
        <BeltBar
          colorHex={student.current_belt_color_hex}
          label={student.current_belt_name ?? ''}
        />
      ) : null}

      <Card>
        <h2>{t(locale, 'people.guardian.plural')}</h2>
        <ul>
          {(student.guardians ?? []).map((guardian) => (
            <li key={guardian.person_id} data-testid="staff-card-guardian">
              <bdi>{guardian.display_name}</bdi>
              {/* §6.2 — 'contact in one tap' from the roster. */}
              <a href={`tel:${guardian.phone ?? ''}`} data-testid="staff-card-call">
                {t(locale, 'people.guardian.call')}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2>{t(locale, 'people.student.groups')}</h2>
        {/* C11 — every live enrollment. A card showing one would hide the second group from
            the coach standing in front of the child. */}
        <ul>
          {live.map((enrollment) => (
            <li key={enrollment.id} data-testid="staff-card-enrollment">
              <bdi>{enrollment.group_name}</bdi>
            </li>
          ))}
        </ul>
      </Card>

      {mayMove ? (
        moving ? (
          <div data-testid="move-group-form">
            <label>
              {t(locale, 'people.enrollment.moveGroup')}
              <select
                value={targetGroup}
                onChange={(event) => setTargetGroup(event.target.value)}
                data-testid="move-group-target"
              >
                <option value="">—</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            {trainingWeekdays !== null ? (
              <WeekdayPicker
                locale={locale}
                trainingWeekdays={trainingWeekdays}
                selected={selected}
                onChange={setSelected}
              />
            ) : null}

            <Button
              // A group with no timetable cannot take an enrolment: C12's pattern is
              // validated against the schedule, and submitting a guess would be refused by
              // the server anyway. Disabled with the reason showing beats a 422.
              disabled={!targetGroup || sending || trainingWeekdays?.length === 0}
              data-testid="move-group-submit"
              onClick={() => {
                setSending(true)
                const first = live[0]
                const ending = first
                  ? client.endEnrollment(first.id, today)
                  : Promise.resolve(new Response(null, { status: 200 }))
                ending
                  .then(() =>
                    client.enrol({
                      student_id: student.id,
                      group_id: targetGroup,
                      started_on: today,
                      attends_weekdays: attendsWeekdaysFor(selected, trainingWeekdays ?? []),
                    }),
                  )
                  .then(() => onMoved?.())
                  .finally(() => {
                    setSending(false)
                    setMoving(false)
                  })
              }}
            >
              {t(locale, 'people.enrollment.moveGroup')}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setMoving(true)} data-testid="move-group-start">
            {t(locale, 'people.enrollment.moveGroup')}
          </Button>
        )
      ) : (
        // Not merely hidden: an assistant coach who cannot do it is told who can, which is
        // what stops them asking the parent instead.
        <p data-testid="move-group-lead-only">{t(locale, 'people.convert.moveGroupLeadOnly')}</p>
      )}
    </section>
  )
}
