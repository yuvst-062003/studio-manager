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
import {
  AttendanceStrip,
  BeltBar,
  Button,
  Card,
  LoadFailed,
  SegmentedControl,
  StatusChip,
} from '@studio/ui'
import type { AttendanceStripItem } from '@studio/ui'
import { ClassPricesCard } from '../billing/ClassPricesCard'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { chipToneFor } from './StudentsScreen'
import type {
  AttendanceMarkRow,
  DashboardPeopleClient,
  GroupOption,
  EnrollmentOut,
  StatusHistoryOut,
  StudentDetail,
  StudentPricePlan,
} from './peopleClient'

/** §5.7's four states, as the shared strip draws them. Same mapping the parent card and
 *  the staff roster use — one picture of one child's attendance, on three surfaces. */
const STRIP_STATE: Record<string, AttendanceStripItem['state']> = {
  present: 'present',
  absent_unexcused: 'absent',
  absent_excused: 'notified',
  unmarked: 'unmarked',
}

const STRIP_LABEL: Record<AttendanceStripItem['state'], string> = {
  present: 'attendance.roster.present',
  absent: 'attendance.roster.absent',
  notified: 'attendance.source.preReported',
  unmarked: 'attendance.roster.unmarked',
  // `STRIP_STATE` above maps only the four states a MARK can carry, so nothing on this
  // card resolves to `planned` today — a mark exists because a session already happened.
  // The entry is here because the record is exhaustive over the shared state, and the
  // calendar's own legend is the one label the product has for it.
  planned: 'schedule.calendar.legend.planned',
}

/** `4a`'s twelve. `2d` draws eight and the two artboards disagree (2d finding 9), which is
 *  why `GET /students/{id}/attendance` bakes in neither and the caller trims. */
const MARKS_ON_THE_CARD = 12

/** Dashboard redesign — the four tabs the card's existing sections are grouped under.
 *  `general` is first and is the default: it is what a manager opens the card to check
 *  first, before training, money, or health. */
type DetailTab = 'general' | 'training' | 'finance' | 'health'

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
  const [marks, setMarks] = useState<AttendanceMarkRow[]>([])
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
  const [failed, setFailed] = useState(false)
  // Dashboard redesign — the card's existing sections sit under four tabs instead of one
  // long scroll. Purely a display grouping: nothing here changes what is fetched or when.
  const [tab, setTab] = useState<DetailTab>('general')

  useEffect(() => {
    let live = true
    void Promise.all([
      client.student(studentId),
      client.enrollments(studentId),
      client.statusHistory(studentId),
      client.pricePlan(studentId),
      client.groups().catch(() => ({ items: [] as GroupOption[] })),
      // Best-effort, like the group list beside it: one section of a composite card, and a
      // failed read here must not take the guardians and the status history down with it.
      client.attendance(studentId).catch(() => ({ items: [] as AttendanceMarkRow[] })),
    ])
      .then(([detail, rows, statuses, pricePlan, groupList, attendance]) => {
        if (!live) return
        setStudent(detail)
        setEnrollments(rows)
        setHistory(statuses.items)
        setPlan(pricePlan)
        setGroups(groupList.items)
        setMarks(attendance.items)
        // Cleared on success rather than at the top of the effect: a synchronous setState
        // in the effect body is a render every load pays for, and the retry below is the
        // only thing that re-enters here anyway.
        setFailed(false)
      })
      // Was `.catch(() => undefined)`, which is how a dead card and a slow one became the
      // same screen: `student` stayed null, the gate below returned the loading
      // placeholder, and it stayed there forever with no message and nothing to press.
      // The four reads above are NOT best-effort — the two that are (`groups`,
      // `attendance`) catch for themselves and fall back to an empty list.
      .catch(() => live && setFailed(true))
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

  // The failure branch comes FIRST: `student` is null in both states, so checking the
  // placeholder first would render it over a failure that had already been detected.
  if (failed) return <LoadFailed locale={locale} onRetry={() => setReloads((n) => n + 1)} />

  if (!student) return <p data-testid="student-detail-loading" />

  const live = enrollments.filter((enrollment) => enrollment.ended_on == null)
  // The route answers newest-first — `ORDER BY device_marked_at DESC`, so a queue that
  // flushed two days late cannot put last Tuesday at the top of the list. A strip is read
  // the other way round, so the last twelve are taken from the head and then reversed.
  const strip: AttendanceStripItem[] = marks
    .slice(0, MARKS_ON_THE_CARD)
    .reverse()
    .map((row) => {
      const state = STRIP_STATE[row.status] ?? 'unmarked'
      return {
        id: row.id,
        state,
        // The DEVICE clock, which is when the lesson was — `marked_at` is when the queue
        // reached the server, and for an offline coach those are different days.
        label: `${formatDateInStudioZone(row.device_marked_at, locale)} · ${t(locale, STRIP_LABEL[state])}`,
      }
    })

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

      {/* Dashboard redesign — the sections below used to be one long scroll; they are now
          grouped under four tabs, and only the matching group renders. The tab strip is a
          display grouping only: it fetches nothing and calls nothing itself. */}
      <SegmentedControl
        legend={t(locale, 'people.student.tab.legend')}
        onValueChange={(next) => setTab(next as DetailTab)}
        options={[
          { value: 'general', label: t(locale, 'people.student.tab.general') },
          { value: 'training', label: t(locale, 'people.student.tab.training') },
          { value: 'finance', label: t(locale, 'people.student.tab.finance') },
          { value: 'health', label: t(locale, 'people.student.tab.health') },
        ]}
        value={tab}
      />

      {tab === 'general' ? (
        <>
          <Card>
            <h2>{t(locale, 'people.student.groups')}</h2>
            {/* C11 — every live enrollment, with its C12 pattern.
                The class carries a gap: the group name and the weekday list are two
                adjacent inline elements, and with nothing between them they rendered as
                one run-on word — "ג׳וניוריםכל הימים". Spaced in CSS rather than by a
                literal between the tags, because a separator in the markup would be an
                inlined user-facing string, which G4 fails the build on. */}
            <ul className="people-detail-groups">
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
            {/* How much this child actually trains. It used to sit on the read-only plan
                card the per-class editor replaced, and it belongs here rather than inside
                that editor: it is a fact about ENROLMENTS, and §5.10 wants it visible so a
                mismatch between what a child attends and what they are billed for is
                noticeable at the moment the price is set. */}
            <p data-testid="detail-weekly-volume">
              {t(locale, 'people.convert.weeklyVolume')}: {plan?.weekly_volume ?? 0}
            </p>
          </Card>

          <Card>
            <h2>{t(locale, 'people.guardian.plural')}</h2>
            {/* Same run-on as the group list above — "לביא אזולאיהורה ראשי" — and the same
                fix, for the same reason: the separator belongs in CSS, not between the
                tags where it would be an inlined string. */}
            <ul className="people-detail-groups">
              {(student.guardians ?? []).map((guardian) => (
                <li key={guardian.person_id} data-testid="detail-guardian">
                  {/* Decision 20 — the 3-field add-student form sends a guardian email and
                      no name, so `display_name` is `""` until the parent finishes the
                      wizard. A blank row told the manager nothing; the email plus a hint
                      at least says who this is and that they are not done yet. */}
                  {guardian.display_name ? (
                    <bdi>{guardian.display_name}</bdi>
                  ) : guardian.email ? (
                    <>
                      <bdi>{guardian.email}</bdi>{' '}
                      <span data-testid="detail-guardian-pending">
                        {t(locale, 'people.guardian.notRegisteredYet')}
                      </span>
                    </>
                  ) : (
                    <bdi>{t(locale, 'people.guardian.noContactInfo')}</bdi>
                  )}
                  {guardian.is_primary ? (
                    <span data-testid="detail-primary">
                      {t(locale, 'people.guardian.primary')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {tab === 'training' ? (
        <>
          <Card>
            {/* `GET /students/{id}/attendance` was built, manager-scoped and called by
                nothing. The card had four sections and could not answer the question a
                manager asks about a child immediately before telephoning their parent.

                No coach note is rendered, and the strip has nowhere to put one: §5.13
                makes it a coach's written opinion about a child, and `AttendanceOut`
                carries it only because the roster it was built for needs it. */}
            <h2>{t(locale, 'people.student.attendance')}</h2>
            <div data-testid="detail-attendance">
              {strip.length === 0 ? (
                // §5.14 makes `unmarked` a real state so a coach who forgot the register
                // does not look like a child who stopped coming. A blank strip would say
                // exactly the thing that state exists to prevent.
                <p data-testid="detail-attendance-empty">
                  {t(locale, 'people.student.attendanceEmpty')}
                </p>
              ) : (
                <AttendanceStrip items={strip} locale={locale} />
              )}
            </div>
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
        </>
      ) : null}

      {tab === 'finance' ? (
        // Was a read-only badge naming `student.price_plan_id`, which is now only the
        // FALLBACK — what a child pays for any class nobody has priced. The per-class
        // editor replaces it rather than sitting beside it: two boxes both showing a
        // child's price leaves a manager working out which one wins, and the fallback is
        // still named here, on every row it actually applies to, with its amount.
        <ClassPricesCard locale={locale} studentId={studentId} />
      ) : null}

      {tab === 'health' ? (
        // No health card exists on this screen yet — health documents are read on the
        // documents screen. The tab stays (a manager expects to find health somewhere on
        // a student's own card) and points at where the data actually lives, rather than
        // rendering an empty card that promises a section that is not there.
        <p className="people-detail-health-hint">
          {t(locale, 'people.student.tab.healthHint')}{' '}
          <a href="#/documents">{t(locale, 'people.student.tab.healthLink')}</a>
        </p>
      ) : null}

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
