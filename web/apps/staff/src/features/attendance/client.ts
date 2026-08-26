// The staff app's view of the attendance API.
//
// The types below mirror `app/schemas/attendance.py` and duplicate the dashboard's copy,
// for the reason `features/schedule/client.ts` already states: a cross-app import from
// `apps/dashboard` would couple two separately deployed bundles so that one app could not
// build without the other's source. Both collapse into `@studio/api-client` once `main`
// regenerates it after W3 merges.
//
// **`markAttendance` is not here.** §10.3: a mark goes to `pending_ops` regardless of auth
// state, because the local write is not an API call. Putting a "mark this student" method on
// an API client would be an invitation to call it from a tap handler, and that is the exact
// branch that works in the office and fails in a basement. The only write in this file is
// the queue's own flush.
import type { BootstrapPayload, RosterRow } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** Mirrors `app/schemas/attendance.py::SessionRosterOut`. */
export interface SessionRosterOut {
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

/** Mirrors `app/services/attendance/schemas.py::BatchResult`. */
export interface BatchResult {
  applied: number
  replayed: number
  superseded: number
  conflicts: {
    kind: 'session_cancelled' | 'student_unenrolled' | 'rejected'
    session_id: string
    student_ids: string[]
    count: number
  }[]
}

export interface StaffAttendanceClient {
  bootstrap(window?: { from: string; to: string }): Promise<BootstrapPayload>
  sessionRoster(sessionId: string): Promise<SessionRosterOut>
  bulkPresent(
    sessionId: string,
    body: { client_mark_id_prefix: string; device_marked_at: string },
  ): Promise<BatchResult>
  studentAttendance(studentId: string, limit?: number): Promise<AttendanceRecord[]>
}

/** Mirrors `app/schemas/attendance.py::AttendanceOut`, narrowed to what `2d` draws. */
export interface AttendanceRecord {
  id: string
  session_id: string
  student_id: string
  status: 'unmarked' | 'present' | 'absent_excused' | 'absent_unexcused'
  source: 'coach' | 'parent' | 'bulk' | 'system'
  device_marked_at: string
}

const API = '/api/v1'

export function makeStaffAttendanceClient(fetcher: Fetcher): StaffAttendanceClient {
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(path, init)
    if (!response.ok) throw new Error(String(response.status))
    return (await response.json()) as T
  }

  return {
    async bootstrap(window) {
      // Both parameters omitted by default. `GET /sync/bootstrap` defaults to today and
      // tomorrow on the server, which is §6.1's window — a client that computed its own
      // would be a second definition of "the window", in the app most likely to be running
      // on a device whose clock is wrong.
      const query = window ? `?from=${window.from}&to=${window.to}` : ''
      return json<BootstrapPayload>(`${API}/sync/bootstrap${query}`)
    },
    async sessionRoster(sessionId) {
      return json<SessionRosterOut>(`${API}/sessions/${sessionId}/attendance`)
    },
    async bulkPresent(sessionId, body) {
      return json<BatchResult>(`${API}/sessions/${sessionId}/attendance/bulk-present`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `respect_absence_reports` is not sent. The server refuses to overwrite a parent's
        // advance notice regardless (§10.5), and a client that sent `false` would be a
        // client claiming a capability the API deliberately does not grant.
        body: JSON.stringify(body),
      })
    },
    async studentAttendance(studentId, limit = 8) {
      const body = await json<{ items: AttendanceRecord[] }>(
        `${API}/students/${studentId}/attendance?limit=${limit}`,
      )
      return body.items
    },
  }
}
