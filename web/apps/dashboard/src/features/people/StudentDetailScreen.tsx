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
import type { ReactNode } from 'react'
import {
  AttendanceStrip,
  BeltBar,
  Button,
  LoadFailed,
  SectionHeader,
  StatusChip,
} from '@studio/ui'
import type { AttendanceStripItem } from '@studio/ui'
import { ClassPricesCard } from '../billing/ClassPricesCard'
import { fill, formatDateInStudioZone } from '@studio/core'
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

/** One labelled field box, as the prototype's drawer draws them: the label above, the
 *  value in a filled well beneath it. A `<dl>` row rather than a pair of divs — these are
 *  label/value pairs and the markup should say so. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="student-card__field">
      <dt className="student-card__field-label">{label}</dt>
      <dd className="student-card__field-value">{children}</dd>
    </div>
  )
}

/** The avatar stands in for a photograph the product does not store. Decision 3 chose
 *  initials over building photo upload: a photograph of a minor brings a consent and a
 *  retention question with it, and neither is worth opening for a decoration. */
export function initialsOf(first: string, last: string): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`
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

  const primary = (student.guardians ?? []).find((g) => g.is_primary) ?? student.guardians?.[0]
  const firstGroup = live[0]

  return (
    <section className="student-card" data-testid="student-detail">
      {/* The header: avatar, name, its chips, and the one-line who-and-where beneath. */}
      <header className="student-card__header">
        <span aria-hidden="true" className="student-card__avatar">
          {initialsOf(student.first_name, student.last_name)}
        </span>
        <div className="student-card__identity">
          <div className="student-card__name-row">
            <h1>
              <bdi>
                {student.first_name} {student.last_name}
              </bdi>
            </h1>
            <StatusChip
              label={t(locale, `people.status.${student.status}`)}
              status={chipToneFor(student.status)}
            />
            {student.current_belt_name ? (
              <span className="student-card__belt">
                <BeltBar colorHex={student.current_belt_color_hex ?? '#000000'} label={student.current_belt_name} />
                <bdi>{student.current_belt_name}</bdi>
              </span>
            ) : null}
          </div>
          <p className="student-card__sub">
            {firstGroup ? <bdi>{firstGroup.group_name}</bdi> : null}
            {primary?.display_name ? <bdi>{primary.display_name}</bdi> : null}
          </p>
        </div>
        <a className="student-card__back" href="#/students">
          {t(locale, 'people.student.plural')}
        </a>
      </header>

      {student.status === 'frozen' && student.frozen_until ? (
        <p className="student-card__frozen" data-testid="detail-frozen">
          {fill(t(locale, 'people.freeze.until'), {
            date: formatDateInStudioZone(student.frozen_until, locale),
          })}
        </p>
      ) : null}

      {/* Underlined tabs, as the prototype draws them — not a segmented pill. */}
      <div className="student-card__tabs" role="tablist">
        {(['general', 'training', 'finance', 'health'] as const).map((key) => (
          <button
            aria-selected={tab === key}
            className="student-card__tab"
            data-testid={`detail-tab-${key}`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {t(locale, `people.student.tab.${key}`)}
          </button>
        ))}
      </div>

      <div className="student-card__body">
        {tab === 'general' ? (
          <>
            <SectionHeader title={t(locale, 'people.student.tab.general')} />
            <dl className="student-card__fields">
              <Field label={t(locale, 'people.student.groups')}>
                {live.length === 0 ? (
                  '—'
                ) : (
                  <ul className="student-card__stack" data-testid="detail-enrollment">
                    {live.map((enrollment) => (
                      <li key={enrollment.id}>
                        <bdi>{enrollment.group_name}</bdi>{' '}
                        <span className="student-card__muted" data-testid="detail-weekdays">
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
              </Field>
              <Field label={t(locale, 'people.student.weeklyVolume')}>
                <span data-testid="detail-weekly-volume">{plan?.weekly_volume ?? '—'}</span>
              </Field>
              <Field label={t(locale, 'people.guardian.plural')}>
                {(student.guardians ?? []).length === 0 ? (
                  '—'
                ) : (
                  <ul className="student-card__stack">
                    {(student.guardians ?? []).map((guardian) => (
                      <li data-testid="detail-guardian" key={guardian.person_id}>
                        {guardian.display_name ? (
                          <bdi>{guardian.display_name}</bdi>
                        ) : guardian.email ? (
                          <>
                            <bdi>{guardian.email}</bdi>{' '}
                            <span
                              className="student-card__muted"
                              data-testid="detail-guardian-pending"
                            >
                              {t(locale, 'people.guardian.notRegisteredYet')}
                            </span>
                          </>
                        ) : (
                          <bdi>{t(locale, 'people.guardian.noContactInfo')}</bdi>
                        )}
                        {guardian.is_primary ? (
                          <span className="student-card__muted" data-testid="detail-primary">
                            {t(locale, 'people.guardian.primary')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label={t(locale, 'people.guardian.phone')}>
                {primary?.phone ? (
                  <a dir="ltr" href={`tel:${primary.phone}`}>
                    {primary.phone}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
            </dl>
          </>
        ) : null}

        {tab === 'training' ? (
          <>
            <SectionHeader title={t(locale, 'people.student.tab.training')} />
            <div className="student-card__panel" data-testid="detail-attendance">
              <span className="student-card__field-label">
                {t(locale, 'people.student.attendance')}
              </span>
              {strip.length === 0 ? (
                <p className="student-card__muted" data-testid="detail-attendance-empty">
                  {t(locale, 'people.student.attendanceEmpty')}
                </p>
              ) : (
                <AttendanceStrip items={strip} locale={locale} />
              )}
            </div>
            <div className="student-card__panel">
              <span className="student-card__field-label">
                {t(locale, 'people.student.statusHistory')}
              </span>
              {history.length === 0 ? (
                <p className="student-card__muted">{t(locale, 'people.student.historyEmpty')}</p>
              ) : (
                <ol className="student-card__stack" data-testid="detail-history">
                  {history.map((row) => (
                    <li key={row.id}>
                      <span>{t(locale, `people.status.${row.to_status}`)}</span>{' '}
                      <span className="student-card__muted">
                        {formatDateInStudioZone(row.changed_at, locale)}
                      </span>
                      {row.reason ? (
                        <span className="student-card__muted">
                          <bdi>{row.reason}</bdi>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : null}

        {tab === 'finance' ? (
          <>
            <SectionHeader title={t(locale, 'people.student.tab.finance')} />
            <ClassPricesCard locale={locale} studentId={studentId} />
          </>
        ) : null}

        {tab === 'health' ? (
          <>
            <SectionHeader title={t(locale, 'people.student.tab.health')} />
            <p className="student-card__muted">
              {t(locale, 'people.student.tab.healthHint')}{' '}
              <a href="#/documents">{t(locale, 'people.student.tab.healthLink')}</a>
            </p>
          </>
        ) : null}
      </div>

      <div className="student-card__footer">
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
