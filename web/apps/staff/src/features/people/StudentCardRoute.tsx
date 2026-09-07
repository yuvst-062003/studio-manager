// `9c`/`2d` behind `#/students/<id>` (S2/S3) — the card opened from a roster row's
// info control and from the student list. `StudentCardScreen` composes the slot
// sections; `StaffStudentCard` registers into it, so routing this reaches both of the
// audit's orphans with one route.
//
// **2026-09-06, defect A/S2 fix: `StaffStudentCard` actually mounted.** It was exported
// from `features/people/index.ts`, tested in `StaffPeople.test.tsx`, and named in four
// comments (this file's own header included, before this pass) — but rendered nowhere.
// `unreachable-screens.test.ts` missed it because it stripped module paths and re-export
// lines before searching, but not comments; that guard is fixed separately. Wired in here,
// unchanged and unrestyled — see its own header for מעבר כיתה's audience.
//
// **Where `actor` comes from.** `StaffStudentCard` asks `can(actor, 'session.edit')`, and
// that needs the REAL signed-in role. `App.tsx` already resolves the active membership
// once (for `viewerIsManager`/`viewerIsCoach`) but is off-limits to this lane this
// checkpoint — another lane is mid-edit there — so threading it down as a prop was not an
// option. This file calls `useSession()` a second time instead: one extra
// `/auth/refresh` + `/auth/me` round trip, paid only when a coach actually opens a
// student's card, not on every screen the way
// `apps/parent/src/features/home/redesign/HomeScreen.tsx`'s own header warns against.
// Flagged for consolidation into a passed-down `actor` prop the day this file and
// `App.tsx` can be touched in the same pass.
//
// **2026-09-06, C4: the prototype's design.** Ported from
// `~/Downloads/staff-app/src/components/StudentDetailModal.tsx` — inside the `.tw-scope`
// wrapper `StaffShell` already provides, the house style `AccountScreen.tsx` set at C1.
//
// **This file is the composition point, deliberately, rather than a new `registerSlot`
// fill.** `StudentCardScreen` (`features/attendance/`, off-limits to this lane this
// checkpoint) already composes the attendance strip (order 40) and the pickup-contacts
// section (order 55, `features/health/`) into the `student-card` slot — both of which
// already answer two of the design's asks: "recent sessions"/"attendance progress" and
// "who may collect the child". Nothing here duplicates them; this file wraps that
// container with the profile banner, personal details and parent-contact actions the
// `people` lane owns, and renders it unchanged underneath.
//
// **Two things the design shows that the data does not support (redesign spec §9,
// "deliberately not built"):**
//   1. The prototype's card has a `school` field. The real `Student` has `grade` — the
//      school CLASS, not the school — but no staff-reachable endpoint returns it (only
//      the write-only registration form and the health-declaration PDF read
//      `Student.grade`). Showing it would mean adding a field to `StudentDetailOut`,
//      which is a backend change and out of scope here. Neither a school nor a grade is
//      shown, rather than inventing one that has nothing behind it.
//   2. The attendance trend chart: seven months of invented numbers in the prototype,
//      and nothing computes a club-wide monthly trend. Not built.
//
// **Health data stays exactly as the existing screen renders it.** The medical-notes box
// the prototype draws is not rebuilt here — `features/health/`'s registered sections
// already show what a coach may see (derived flags, never a declaration's contents), and
// this file does not read health data at all, so there is nothing here that could log it.
import { useEffect, useState } from 'react'
import { LoadFailed } from '@studio/ui'
import { useNetworkMode, useSession } from '@studio/core'
import type { Actor, Role } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { StudentCardScreen } from '../attendance/StudentCardScreen'
import type { StaffAttendanceClient } from '../attendance/client'
import { ContactFamiliesButton } from '../contact'
import type { ContactFamily } from '../contact'
import { StaffStudentCard } from './StaffStudentCard'
import type { MoveTarget } from './StaffStudentCard'
import type { EnrollmentOut, StaffPeopleClient, StudentDetail } from './peopleClient'

/** §3.2's staff roles that can act here, most-privileged first. `Actor.role` is singular
 *  while a membership's `roles` is a list; `session.edit` (מעבר כיתה's gate) is granted to
 *  any of the top three, so the highest-privilege match the caller actually holds answers
 *  `can()` correctly — there is no capability this screen asks about that needs more than
 *  that. `guardian` never appears here: this route only mounts behind `session.access.staff`. */
const STAFF_ROLE_PRECEDENCE: readonly Role[] = ['owner', 'manager', 'lead_coach', 'assistant_coach']

function actorRoleFrom(roles: string[]): Role {
  return STAFF_ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? 'assistant_coach'
}

/** Whole years between a `YYYY-MM-DD` birthdate and an ISO instant. `null` when there is no
 *  birthdate on file, so the banner omits the tile rather than showing an age of NaN. */
export function ageFromBirthdate(birthdate: string | null, today: string): number | null {
  if (!birthdate) return null
  const dob = new Date(`${birthdate}T00:00:00Z`)
  const now = new Date(today)
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1
  return Math.max(0, age)
}

export function StudentCardRoute({
  studentId,
  locale,
  peopleClient,
  attendanceClient,
  today,
}: {
  studentId: string
  locale: Locale
  peopleClient: StaffPeopleClient
  attendanceClient: StaffAttendanceClient
  /** An ISO instant, for the age tile. Optional — falls back to the live clock, the same
   *  degrade-rather-than-lie pattern `StudentsSearch`'s `now` prop already uses. */
  today?: string
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentOut[]>([])
  const [groups, setGroups] = useState<MoveTarget[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Bumped by `onMoved` below, once a move actually lands. A separate counter from
  // `attempt`: that one is "retry a failed read", this one is "a write just succeeded,
  // reread" — conflating them would mean a failed-read retry also silently re-triggered
  // whatever `onMoved` does, and vice versa.
  const [refreshKey, setRefreshKey] = useState(0)

  // See this file's own header for why this is a second `useSession()` call rather than
  // an `actor` prop from `App.tsx`.
  const session = useSession()
  const membership = session.studios.find((s) => s.studio_id === session.activeStudioId)
  const actor: Actor = {
    role: actorRoleFrom(membership?.roles ?? []),
    personId: membership?.person_id ?? '',
    groupIds: [],
  }

  useEffect(() => {
    let live = true
    void peopleClient
      .student(studentId)
      .then((detail) => live && setStudent(detail))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [peopleClient, studentId, attempt, refreshKey])

  useEffect(() => {
    let live = true
    void peopleClient
      .enrollments(studentId)
      // `Array.isArray` guards against a fetcher whose fallback answers an envelope
      // (`{ items: [] }`) rather than the bare array this client's own type promises —
      // a client transport this lane does not own returning something else is not
      // this card's failure to render.
      .then((rows) => live && setEnrollments(Array.isArray(rows) ? rows : []))
      // The group line degrades to "no group" rather than failing the whole card — the
      // student read above already has its own retry, and a second spinner for one line
      // of text is not worth blocking the rest of the sheet.
      .catch(() => live && setEnrollments([]))
    return () => {
      live = false
    }
  }, [peopleClient, studentId, refreshKey])

  // 9c's move targets — the same active-groups read `StudentsSearch`'s class tabs use.
  // Degrades to an empty list rather than failing the card: a lead coach who cannot see
  // targets simply cannot pick one, which `StaffStudentCard`'s own disabled-submit state
  // already handles.
  useEffect(() => {
    let live = true
    peopleClient
      .groups()
      .then((body) => {
        if (!live) return
        setGroups(
          body.items.filter((group) => group.is_active).map((group) => ({ id: group.id, name: group.name })),
        )
      })
      .catch(() => live && setGroups([]))
    return () => {
      live = false
    }
  }, [peopleClient])

  if (failed) {
    return (
      <LoadFailed
        offline={networkMode !== 'online'}
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (student === null) {
    return <p data-testid="student-card-loading">{t(locale, 'common.setup.loading')}</p>
  }

  const resolvedToday = today ?? new Date().toISOString()

  return (
    <div data-testid="student-card-route" className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <StudentProfileBanner
        enrollments={enrollments}
        locale={locale}
        student={student}
        today={resolvedToday}
      />
      <PersonalDetails locale={locale} student={student} />
      <ParentContacts locale={locale} student={student} />
      {/* Defect A's fix: 9c's מעבר כיתה, mounted for real. `StaffStudentCard` draws its
          own name/status/belt/guardians/groups too, overlapping the sections above —
          accepted rather than restyled; see this file's header. */}
      <StaffStudentCard
        actor={actor}
        client={peopleClient}
        enrollments={enrollments}
        groups={groups}
        locale={locale}
        onMoved={() => setRefreshKey((n) => n + 1)}
        student={student}
        today={resolvedToday}
      />
      <StudentCardScreen
        client={attendanceClient}
        locale={locale}
        student={{ id: student.id, first_name: student.first_name, last_name: student.last_name }}
      />
    </div>
  )
}

function liveGroupNames(enrollments: EnrollmentOut[]): string[] {
  return enrollments.filter((enrollment) => enrollment.ended_on == null).map((e) => e.group_name)
}

function StudentProfileBanner({
  student,
  enrollments,
  locale,
  today,
}: {
  student: StudentDetail
  enrollments: EnrollmentOut[]
  locale: Locale
  today: string
}) {
  const fullName = `${student.first_name} ${student.last_name}`
  const initial = student.first_name.charAt(0)
  const groups = liveGroupNames(enrollments)
  const groupLine = groups.length > 0 ? groups.join(' · ') : t(locale, 'people.student.noGroup')
  const age = ageFromBirthdate(student.birthdate, today)

  return (
    <section
      aria-label={fullName}
      className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden border border-slate-800"
    >
      <div
        aria-hidden="true"
        className="absolute -top-10 -start-10 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none"
      />
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            aria-hidden="true"
            className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-2xl text-white shadow-inner shrink-0"
          >
            {initial}
          </div>
          <div className="min-w-0">
            {/* Not an <h2>: `StudentCardScreen` below already draws this card's one real
                `<h1>` with the same name, and this line comes BEFORE it in reading order
                to match the prototype's banner-first layout. A heading here would put an
                h2 ahead of the page's own h1. */}
            <p className="text-lg font-black text-white leading-tight truncate m-0">
              <bdi>{fullName}</bdi>
            </p>
            <p className="text-xs text-slate-300 font-medium m-0">
              <bdi>{groupLine}</bdi>
            </p>
            {student.current_belt_color_hex ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-full text-[11px] font-bold border border-white/20 bg-white/10">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: student.current_belt_color_hex,
                    boxShadow: 'inset 0 0 0 1px var(--belt-ring)',
                  }}
                />
                <span>{student.current_belt_name}</span>
              </span>
            ) : null}
          </div>
        </div>
        {age !== null ? (
          <div className="text-center bg-white/10 px-3 py-2 rounded-xl border border-white/10 shrink-0">
            <div className="text-[10px] text-slate-300 font-medium">{t(locale, 'people.student.age')}</div>
            <div className="text-lg font-black text-white" data-testid="staff-card-age">
              {age}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PersonalDetails({ student, locale }: { student: StudentDetail; locale: Locale }) {
  return (
    <section className="bg-[var(--surface-raised)] rounded-2xl p-4 border border-[var(--border)] shadow-sm" data-testid="staff-card-personal-details">
      <h2 className="text-xs font-black text-[var(--fg)] tracking-wider m-0 mb-3">
        {t(locale, 'people.staffCard.personalDetails')}
      </h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[var(--surface)] p-2.5 rounded-xl">
          <span className="text-[var(--text-muted)] block mb-0.5">{t(locale, 'people.student.birthdate')}</span>
          <span className="font-bold text-[var(--fg)]" dir="ltr">
            {student.birthdate ?? '—'}
          </span>
        </div>
      </div>
    </section>
  )
}

/** §4.9's pattern, reused rather than redrawn: `ContactFamiliesButton` (`features/contact/`,
 *  built at C2) is the one contact mechanism this app has — a pre-written message, a
 *  WhatsApp share and a copy-numbers fallback, never a claim that either was sent. Each
 *  guardian ALSO keeps a direct one-tap `tel:` link, the same affordance
 *  `PickupContacts` already gives a coach for "who may collect the child" — a plain
 *  anchor is not a second contact component, and dropping it would regress the one-tap
 *  call this card already offered. */
function ParentContacts({ student, locale }: { student: StudentDetail; locale: Locale }) {
  const fullName = `${student.first_name} ${student.last_name}`
  const guardians = student.guardians ?? []
  const guardianFamilies: ContactFamily[] = guardians.map((guardian) => ({
    person_id: guardian.person_id,
    name: guardian.display_name,
    phone: guardian.phone ?? null,
  }))

  return (
    <section
      aria-labelledby="staff-card-guardians-title"
      className="bg-[var(--surface-raised)] rounded-2xl p-4 border border-[var(--border)] shadow-sm flex flex-col gap-3"
    >
      <h2 id="staff-card-guardians-title" className="text-xs font-black text-[var(--fg)] tracking-wider m-0">
        {t(locale, 'people.staffCard.guardiansTitle')}
      </h2>

      {guardians.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] m-0" data-testid="staff-card-no-guardians">
          {t(locale, 'people.staffCard.noGuardians')}
        </p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {guardians.map((guardian) => (
            <li
              key={guardian.person_id}
              data-testid="staff-card-guardian"
              className="flex items-center justify-between gap-3 bg-[var(--surface)] rounded-xl p-2.5"
            >
              <span className="min-w-0">
                <span className="block text-xs font-extrabold text-[var(--fg)] truncate">
                  <bdi>{guardian.display_name}</bdi>
                </span>
                {guardian.phone ? (
                  <a
                    dir="ltr"
                    href={`tel:${guardian.phone}`}
                    data-testid="staff-card-call"
                    className="text-[11px] text-[var(--text-muted)]"
                  >
                    {guardian.phone}
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {guardianFamilies.length > 0 ? (
        <ContactFamiliesButton
          locale={locale}
          message={t(locale, 'people.staffCard.contactParentsMessage').replace('{{name}}', fullName)}
          resolveFamilies={() => Promise.resolve(guardianFamilies)}
          title={fullName}
          triggerLabel={t(locale, 'people.staffCard.contactParentsTrigger')}
        />
      ) : null}

      {/* Direct-to-student contact — §4.9's third row ("call or WhatsApp the student"), for
          the students old enough to carry their own phone. `StudentDetailOut.phone` is the
          student's own number, read here and never written — a `null` for a younger child
          on a guardian's line simply skips this section. */}
      {student.phone ? (
        <ContactFamiliesButton
          locale={locale}
          message={t(locale, 'people.staffCard.contactStudentMessage').replace(
            '{{name}}',
            student.first_name,
          )}
          resolveFamilies={() =>
            Promise.resolve([{ person_id: student.person_id, name: fullName, phone: student.phone ?? null }])
          }
          title={fullName}
          triggerLabel={t(locale, 'people.staffCard.contactStudentTrigger')}
        />
      ) : null}
    </section>
  )
}
