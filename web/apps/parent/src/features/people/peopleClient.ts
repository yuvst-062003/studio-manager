// The parent app's endpoint paths, in one file. A screen with a fetch in it is a screen a
// test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client) — SPEC §8.2 regenerates it from
// openapi.json and fails CI on a stale copy, so a hand-written shape here would be a second
// definition nothing keeps in step.
import { useEffect, useState } from 'react'
import type { components } from '@studio/api-client'

export type StudentSummary = components['schemas']['StudentSummaryOut']
export type GuardianOut = components['schemas']['GuardianOut']
export type StudentDetail = components['schemas']['StudentDetailOut']
export type EnrollmentOut = components['schemas']['EnrollmentOut']
export type RegistrationRequestOut = components['schemas']['RegistrationRequestOut']
/** One move through §5.4a's funnel, in the parent-facing shape — no manager `reason`. */
export type MyStatusHistoryRow = components['schemas']['MyStudentStatusHistoryOut']
export type MyTrialBooking = components['schemas']['MyTrialBookingOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makePeopleClient(fetcher: Fetcher) {
  return {
    /**
     * §6.3's home, and L9 verbatim: "my children" is
     * `SELECT student_id FROM guardian WHERE person_id = me`. Not paginated — this is one
     * person's children, and a family that outgrows a page is not a case the product has.
     */
    myStudents: (): Promise<{ items: StudentSummary[] }> =>
      fetcher('/api/v1/me/students').then(json<{ items: StudentSummary[] }>),

    /**
     * 12i's guardians, from the payer-side read (ship-audit B4): `student(id)` below is
     * a staff route a parent gets 403 from, which went unnoticed exactly as long as
     * nothing mounted the profile screen. Deduplicated by person server-side.
     */
    myGuardians: (): Promise<{ items: GuardianOut[] }> =>
      fetcher('/api/v1/me/guardians').then(json<{ items: GuardianOut[] }>),

    student: (id: string): Promise<StudentDetail> =>
      fetcher(`/api/v1/students/${id}`).then(json<StudentDetail>),

    /**
     * §5.4's funnel, for one of MY children.
     *
     * `/me/students/{id}/...` and not `/students/{id}/status-history`. The staff route is
     * `AnyStaff`-scoped — a guardian gets 403 — and it returns the manager's `reason`,
     * which is the club's own note about a family. Ship-audit B4 was this exact mistake
     * made once already, against `GET /students/{id}`, and it went unnoticed for as long as
     * nothing mounted the screen that made it.
     */
    myStatusHistory: (studentId: string): Promise<{ items: MyStatusHistoryRow[] }> =>
      fetcher(`/api/v1/me/students/${studentId}/status-history`).then(
        json<{ items: MyStatusHistoryRow[] }>,
      ),

    /**
     * §6.3's reduced home needs a lesson to count down to, and `StudentSummaryOut` carries
     * none — it is the coach-reachable roster row every student in the product shares, so a
     * trial-only field would ride on all of them. This is the separate read instead.
     */
    myTrialBookings: (): Promise<{ items: MyTrialBooking[] }> =>
      fetcher('/api/v1/me/trial-bookings').then(json<{ items: MyTrialBooking[] }>),

    enrollments: (studentId: string): Promise<EnrollmentOut[]> =>
      fetcher(`/api/v1/enrollments?student_id=${studentId}`).then(json<EnrollmentOut[]>),

    /**
     * §5.4(c) — parent `12g`. **A request, not an enrollment** (L6). The group travels as a
     * preference; the manager chooses on the decision (§5.4).
     */
    requestSibling: (body: {
      first_name: string
      last_name: string
      birthdate?: string | null
      /** Plural and required: the price is derived from weekly volume across every group
       *  the child trains in, so one id could not price a child who trains twice a week. */
      group_ids: string[]
    }): Promise<Response> =>
      fetcher('/api/v1/me/students', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),

    /**
     * §5.4's leaving. Parent `12i` states the rule this carries no field for: the monthly
     * charge stays the parent's responsibility, so there is no refund flag to tick.
     */
    leave: (studentId: string, body: { left_on: string; reason?: string | null }) =>
      fetcher(`/api/v1/students/${studentId}/leave`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }),
  }
}

export type PeopleClient = ReturnType<typeof makePeopleClient>

export type MyStudents =
  | { status: 'loading' }
  | { status: 'ready'; students: StudentSummary[] }
  | { status: 'error' }

/**
 * §6.1's parent-app query, as a hook.
 *
 * Lives here rather than in `features/identity/` because L9 makes "my children" a `guardian`
 * question and this is the people vertical — and because `Resolve.tsx` is a mount point this
 * lane touches as little as possible.
 */
export function useMyStudents(client: PeopleClient): MyStudents {
  const [state, setState] = useState<MyStudents>({ status: 'loading' })
  useEffect(() => {
    let live = true
    client
      .myStudents()
      .then((body) => live && setState({ status: 'ready', students: body.items }))
      .catch(() => live && setState({ status: 'error' }))
    return () => {
      live = false
    }
  }, [client])
  return state
}

/**
 * §6.3's trial state: "A guardian whose children are **all** `trial` sees a reduced home."
 *
 * Every child, not any: a family mid-conversion — one child already active, one still on a
 * trial — must keep the app they are already using.
 */
export function everyChildIsOnATrial(students: StudentSummary[]): boolean {
  return students.length > 0 && students.every((student) => student.status === 'trial')
}

/** What §6.3's reduced home is drawn around: one lesson, and whether it happened. */
export type TrialLesson = {
  sessionStartsAt: string | null
  /** Three-state, like the column. `null` is "it has not happened yet", not "no show". */
  attended: boolean | null
}

/**
 * Which of a family's trial bookings `TrialHome` should show.
 *
 * A pure function and not a line inside `Resolve`, because it is the only *decision* in
 * this wiring and `Resolve` is a mount point this lane touches as little as possible —
 * the same reason `useMyStudents` lives in this file.
 *
 * The rule, in order:
 *  1. the **soonest lesson still to come**. A family with two children on trials has two
 *     bookings, §6.3 draws one countdown, and the lesson a parent is getting ready for is
 *     the next one.
 *  2. otherwise the **most recent lesson that has happened**, so §5.4a ④'s "איך היה?" has
 *     something to be about. Returning null here would send a family that has already
 *     attended back to the "nothing booked yet" copy.
 *  3. otherwise the first booking with **no session at all** — §5.4a's logged phone
 *     enquiry. That family has a booking and no lesson, which is a real state and the one
 *     the fallback copy is written for.
 *
 * `null` only when there is no booking of any kind.
 */
export function nextTrialLesson(
  bookings: readonly MyTrialBooking[],
  now: Date,
): TrialLesson | null {
  const nowIso = now.toISOString()
  const scheduled = bookings
    .filter((row): row is MyTrialBooking & { session_starts_at: string } =>
      Boolean(row.session_starts_at),
    )
    .sort((a, b) => a.session_starts_at.localeCompare(b.session_starts_at))
  const upcoming = scheduled.find((row) => row.session_starts_at >= nowIso)
  const chosen = upcoming ?? scheduled.at(-1) ?? bookings[0]
  if (!chosen) return null
  return { sessionStartsAt: chosen.session_starts_at, attended: chosen.attended }
}
