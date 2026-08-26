// The dashboard's view of the attendance API.
//
// §10.2: the dashboard is **online only, explicitly**. So there is no queue here and no
// import of `@studio/core`'s offline layer — a manager marking a register from a desk with
// no network is not a case the product supports, and pretending otherwise would put a
// silent queue behind a screen with no badge to show it.
//
// The types duplicate the staff app's copy for the reason `features/schedule/client.ts`
// states: a cross-app import would couple two separately deployed bundles. Both collapse
// into `@studio/api-client` once `main` regenerates it.
import type { RosterRow } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export interface DashboardSessionRoster {
  session: {
    id: string
    group_id: string
    group_name: string
    starts_at: string
    ends_at: string
    location_name: string | null
    status: 'scheduled' | 'cancelled' | 'completed'
    attendance_taken: boolean
  }
  roster: RosterRow[]
}

export interface DashboardAttendanceClient {
  sessionRoster(sessionId: string): Promise<DashboardSessionRoster>
  bulkPresent(sessionId: string): Promise<void>
  mark(
    sessionId: string,
    mark: { studentId: string; status: RosterRow['status'] },
  ): Promise<void>
  /** `4c`'s left half — the sessions nobody marked, in a window. */
  unmarkedSessions(window: { from: string; to: string }): Promise<UnmarkedSession[]>
}

/** One row of `4c`'s `ממתין לסימון` list. */
export interface UnmarkedSession {
  id: string
  group_name: string
  starts_at: string
  coach_name: string | null
  headcount: number
}

const API = '/api/v1'

export function makeDashboardAttendanceClient(fetcher: Fetcher): DashboardAttendanceClient {
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(path, init)
    if (!response.ok) throw new Error(String(response.status))
    return (await response.json()) as T
  }

  const post = (path: string, body: unknown): Promise<Response> =>
    fetcher(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  return {
    async sessionRoster(sessionId) {
      return json<DashboardSessionRoster>(`${API}/sessions/${sessionId}/attendance`)
    },

    async bulkPresent(sessionId) {
      // `respect_absence_reports` is not sent. §10.5 protects a parent's advance notice
      // regardless, and `1e` draws the same button `9f` does — the one whose drawn behaviour
      // contradicts the copy shipping beside it.
      const response = await post(`${API}/sessions/${sessionId}/attendance/bulk-present`, {
        client_mark_id_prefix: crypto.randomUUID(),
        device_marked_at: new Date().toISOString(),
      })
      if (!response.ok) throw new Error(String(response.status))
    },

    async mark(sessionId, { studentId, status }) {
      const response = await post(`${API}/attendance/batch`, {
        session_id: sessionId,
        marks: [
          {
            student_id: studentId,
            status,
            client_mark_id: crypto.randomUUID(),
            device_marked_at: new Date().toISOString(),
          },
        ],
        session_status_seen: 'scheduled',
      })
      if (!response.ok) throw new Error(String(response.status))
    },

    async unmarkedSessions({ from, to }) {
      const body = await json<{
        sessions: {
          id: string
          group_name: string
          starts_at: string
          status: string
          attendance_taken: boolean
        }[]
      }>(`${API}/sync/bootstrap?from=${from}&to=${to}`)
      return body.sessions
        .filter((session) => session.status !== 'cancelled' && !session.attendance_taken)
        .map((session) => ({
          id: session.id,
          group_name: session.group_name,
          starts_at: session.starts_at,
          coach_name: null,
          headcount: 0,
        }))
    },
  }
}

/**
 * §5.14's at-risk rule, over one student's marks.
 *
 * **`unmarked` breaks nothing and counts as nothing.** `4c` finding 1: the artboard draws a
 * six-square strip reading present · absent · absent · **unmarked** · absent · **unmarked**
 * and labels it *three consecutive absences*. "The streak count only works if the unmarked
 * squares are skipped — neither counted as absences nor treated as breaking the run. That is
 * a real rule, inferred from the data, stated nowhere."
 *
 * It is stated here, and `reports.attendance.unmarkedExcluded` states it on the screen.
 * §5.14's whole reason for making `unmarked` a real state is that a coach who forgot the
 * register must not look like a child who stopped coming.
 */
export function consecutiveAbsences(statuses: RosterRow['status'][]): number {
  let streak = 0
  for (const status of [...statuses].reverse()) {
    if (status === 'unmarked') continue
    if (status === 'present') break
    streak += 1
  }
  return streak
}
