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

    student: (id: string): Promise<StudentDetail> =>
      fetcher(`/api/v1/students/${id}`).then(json<StudentDetail>),

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
      preferred_group_id?: string | null
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
