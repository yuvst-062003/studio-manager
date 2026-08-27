// The schedule vertical's own view of the API.
//
// **Why these types are declared here and not imported from `@studio/api-client`.** That
// package is generated from `openapi.json`, and `openapi.json` is regenerated on `main`
// after both W2 lanes merge — regenerating it inside one lane guarantees a conflict with
// the other in a file neither of them owns. `packages/ui/src/setup-wizard/client.ts`
// already takes the same route for the same reason. When the client is regenerated these
// interfaces become a compile-time cross-check of it rather than dead weight.
//
// The fetcher is injected rather than imported so a test can drive a screen without a
// network, which is also what `SetupClient` does.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export interface SessionStaff {
  person_id: string
  display_name: string
  role: 'lead_coach' | 'assistant_coach'
  is_substitute: boolean
}

/** Mirrors `app/schemas/schedule.py::SessionOut`, field for field. */
export interface SessionRow {
  id: string
  group_id: string
  group_name: string
  training_year_id: string
  starts_at: string
  ends_at: string
  location_id: string | null
  location_name: string | null
  status: 'scheduled' | 'cancelled' | 'completed'
  is_manually_edited: boolean
  is_ad_hoc: boolean
  cancel_reason: string | null
  staff: SessionStaff[]
  attendance_taken: boolean
}

export interface ScheduleRule {
  id?: string
  group_id?: string
  weekday: number
  start_time: string
  end_time: string
  location_id: string | null
  effective_from: string
  effective_to?: string | null
}

export interface ProtectedSession {
  id: string
  starts_at: string
  ends_at: string
}

/** Mirrors `ScheduleImpactPreview`, including C12's `students_left_unscheduled`. */
export interface ImpactPreview {
  sessions_to_create: number
  sessions_to_update: number
  sessions_to_cancel: number
  sessions_protected_past: number
  sessions_protected_manually_edited: number
  sessions_protected_ad_hoc: number
  first_affected_date: string | null
  protected_manually_edited_sessions: ProtectedSession[]
  students_left_unscheduled: number
}

export interface HolidayPreset {
  key: string
  name: string
  date_from: string
  date_to: string
}

export interface TrainingYear {
  id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'draft' | 'active' | 'closed'
}

export interface Closure {
  id: string
  training_year_id: string
  date_from: string
  date_to: string
  reason: string
  source: 'holiday_preset' | 'manual'
}

/** What 4b needs about a group. `/groups` and `/classes` are M1's, read-only from here. */
export interface GroupSummary {
  id: string
  name: string
  className: string
}

export interface ScheduleClient {
  listGroups(): Promise<GroupSummary[]>
  listSessions(query: {
    from: string
    to: string
    groupId?: string
    coachPersonId?: string
  }): Promise<SessionRow[]>
  getSchedule(groupId: string): Promise<ScheduleRule[]>
  putSchedule(
    groupId: string,
    body: { rules: ScheduleRule[]; effective_from: string; apply: boolean },
  ): Promise<ImpactPreview>
  /** F3 — the session actions D5 promised the calendar. Times move as a pair. */
  patchSession(
    sessionId: string,
    body: {
      starts_at?: string
      ends_at?: string
      location_id?: string | null
      staff?: { person_id: string; role: 'lead_coach' | 'assistant_coach'; is_substitute: boolean }[]
    },
  ): Promise<SessionRow>
  cancelSession(sessionId: string, reason: string): Promise<SessionRow>
  addSessionNote(sessionId: string, body: string): Promise<void>
  /** 409s on a generated session — the server owns that refusal, not the UI. */
  deleteSession(sessionId: string): Promise<void>
  listLocations(): Promise<{ id: string; name: string }[]>
  listTrainingYears(): Promise<TrainingYear[]>
  listClosures(trainingYearId: string): Promise<Closure[]>
  createClosure(body: Omit<Closure, 'id'>): Promise<{ sessions_cancelled: number }>
  listHolidayPresets(year: number): Promise<HolidayPreset[]>
}

const API = '/api/v1'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

export function makeScheduleClient(fetcher: Fetcher): ScheduleClient {
  return {
    async listGroups() {
      // Two reads rather than one, because `/groups` carries `class_id` and 4b shows the
      // class name. Both are M1's endpoints and neither is written from this lane.
      const [groups, classes] = await Promise.all([
        json<{ items: { id: string; name: string; class_id: string }[] }>(
          await fetcher(`${API}/groups`),
        ),
        json<{ items: { id: string; name: string }[] }>(await fetcher(`${API}/classes`)),
      ])
      const classNames = new Map(classes.items.map((klass) => [klass.id, klass.name]))
      return groups.items.map((group) => ({
        id: group.id,
        name: group.name,
        className: classNames.get(group.class_id) ?? '',
      }))
    },
    async listSessions({ from, to, groupId, coachPersonId }) {
      // Paged to the end of the range, because the callers ask for a whole training year.
      // `GET /sessions` defaults to 50 rows and two rules a week across §16's default year
      // is about 104, so a single request rendered the first fifty and silently dropped
      // the rest — no count, no "load more", nothing to notice. For a year that started
      // last September that is every past lesson and not one future one, on a screen whose
      // entire job is showing a manager what is coming.
      const all: SessionRow[] = []
      let cursor: string | null = null
      do {
        const params = new URLSearchParams({ from, to, limit: '200' })
        if (groupId) params.set('group_id', groupId)
        if (coachPersonId) params.set('coach_person_id', coachPersonId)
        if (cursor) params.set('cursor', cursor)
        const body = await json<{ items: SessionRow[]; next_cursor: string | null }>(
          await fetcher(`${API}/sessions?${params.toString()}`),
        )
        all.push(...body.items)
        cursor = body.next_cursor
      } while (cursor)
      return all
    },
    async getSchedule(groupId) {
      const body = await json<{ rules: ScheduleRule[] }>(
        await fetcher(`${API}/groups/${groupId}/schedule`),
      )
      return body.rules
    },
    async putSchedule(groupId, body) {
      return json<ImpactPreview>(
        await fetcher(`${API}/groups/${groupId}/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    },
    async patchSession(sessionId, body) {
      return json<SessionRow>(
        await fetcher(`${API}/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    },
    async cancelSession(sessionId, reason) {
      return json<SessionRow>(
        await fetcher(`${API}/sessions/${sessionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }),
      )
    },
    async addSessionNote(sessionId, body) {
      const response = await fetcher(`${API}/sessions/${sessionId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!response.ok) throw new Error(String(response.status))
    },
    async deleteSession(sessionId) {
      const response = await fetcher(`${API}/sessions/${sessionId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(String(response.status))
    },
    async listLocations() {
      return (
        await json<{ items: { id: string; name: string }[] }>(await fetcher(`${API}/locations`))
      ).items
    },
    async listTrainingYears() {
      const body = await json<{ items: TrainingYear[] }>(await fetcher(`${API}/training-years`))
      return body.items
    },
    async listClosures(trainingYearId) {
      const body = await json<{ items: Closure[] }>(
        await fetcher(`${API}/closures?training_year_id=${trainingYearId}`),
      )
      return body.items
    },
    async createClosure(body) {
      return json<{ sessions_cancelled: number }>(
        await fetcher(`${API}/closures`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    },
    async listHolidayPresets(year) {
      return json<HolidayPreset[]>(await fetcher(`${API}/holiday-presets?year=${year}`))
    },
  }
}

/** `t()` returns the raw string; the `{{count}}` convention is filled here. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole,
  )
}

/**
 * D-M2-3 — a cancellation the server generated writes `system:schedule_change` or
 * `system:closure`; a manager's reason is the text they typed. Mapping the tokens here is
 * what keeps `app/` free of a second Hebrew string table §9 cannot reach.
 */
export function cancelReasonLabel(locale: Locale, reason: string | null): string {
  if (!reason) return ''
  if (reason === 'system:schedule_change')
    return t(locale, 'schedule.session.cancelReason.scheduleChange')
  if (reason === 'system:closure') return t(locale, 'schedule.session.cancelReason.closure')
  return reason
}
