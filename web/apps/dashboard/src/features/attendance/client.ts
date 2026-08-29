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
  /** Both halves of `4c`, over one window. See `AttendanceReportData`. */
  report(window: { from: string; to: string }): Promise<AttendanceReportData>
}

/** One row of `4c`'s `ממתין לסימון` list. */
export interface UnmarkedSession {
  id: string
  group_id: string
  group_name: string
  starts_at: string
  ends_at: string
}

/** One row of `4c`'s second card — name · bar · percentage.
 *
 *  `rate_percent` is nullable and the null is load-bearing: the denominator is the marks
 *  somebody actually decided, and a group with none has no rate. 0% would be a claim about
 *  children who did not come, which is exactly the claim §5.14 forbids making out of a
 *  register nobody opened. */
export interface GroupRate {
  group_id: string
  group_name: string
  present: number
  absent: number
  unmarked: number
  rate_percent: number | null
  sessions: number
  marked_sessions: number
}

export interface AttendanceReportData {
  unmarked_sessions: UnmarkedSession[]
  groups: GroupRate[]
}

const API = '/api/v1'

/** The same bound `GET /exports/attendance` and `app/services/attendance/report.py` enforce.
 *  One picker drives the table and the CSV, so a range that renders and then fails to
 *  download would be the screen contradicting itself. Checked here so the manager is told
 *  before the round trip rather than by an empty table after it. */
export const MAX_REPORT_DAYS = 400

/** Whole days between two ISO `YYYY-MM-DD` keys.
 *
 *  Both ends are pinned to UTC midnight before subtracting. A bare `new Date('2026-03-27')`
 *  is already UTC, but a span computed from local-midnight dates across a DST boundary is an
 *  hour short, and an hour short divided by a day is a day short once it rounds. Pinning the
 *  zone is what makes the answer independent of where the manager's laptop thinks it is. */
export function daysBetween(from: string, to: string): number {
  const day = 24 * 60 * 60 * 1000
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / day)
}

/** `4c`'s export button, and the only place its URL is written. */
export function attendanceExportPath({ from, to }: { from: string; to: string }): string {
  return `${API}/exports/attendance?from=${from}&to=${to}`
}

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

    async report({ from, to }) {
      // Was `GET /sync/bootstrap`, and that was a bug rather than a shortcut. That endpoint
      // is §6.1's OFFLINE PRIMING payload and clamps every window to §10.6's two days
      // (`app/services/attendance/bootstrap.clamp_window`), so this screen asked for a week
      // and silently rendered the two oldest days of it — and no date picker wired to it
      // could ever have shown the range it displayed. §10.6's bound belongs on the phone's
      // cache; a manager's report is a different question and now has its own endpoint.
      return json<AttendanceReportData>(`${API}/attendance/report?from=${from}&to=${to}`)
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
