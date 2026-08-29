// The parent app's view of the schedule API. **Read-only, and deliberately narrow.**
//
// `listSessions` takes no `groupId` and no student id, and that is the authorization
// design rather than an omission: `GET /sessions` narrows a guardian to the groups their
// own children are enrolled in, server-side, through `guardian -> student -> enrollment`.
// A client that named its own scope would be a client that could name somebody else's, and
// the server would have no way to tell the difference. A test asserts the screen never
// sends one.
//
// **`scope=mine` is sent on every call, and is not an exception to that.** It names no
// group and no student — it asks the server to apply the guardian narrowing above to
// whoever is calling. Without it the paragraph above was false for one person: a parent who
// also coaches matches `STAFF_ROLES` in `app/routers/sessions.py::_visible_groups`, which
// returns "the whole studio" whichever app asked, so §19.3's `dev+both` opened the parent
// app onto the club's entire timetable. The parameter can only ever remove rows.
//
// The types duplicate the dashboard's and the staff app's for the reason those files give:
// `web/packages/core` is not this lane's to extend, and a cross-app import would couple two
// separately deployed bundles. All three collapse into `@studio/api-client` once `main`
// regenerates it after both W2 lanes merge.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export interface SessionStaff {
  person_id: string
  display_name: string
  role: 'lead_coach' | 'assistant_coach'
  is_substitute: boolean
}

/** Mirrors `app/schemas/schedule.py::SessionOut`. */
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

export interface ParentScheduleClient {
  /** No `groupId`, no student id — see the module header. */
  listSessions(query: { from: string; to: string }): Promise<SessionRow[]>
}

const API = '/api/v1'

export function makeParentScheduleClient(fetcher: Fetcher): ParentScheduleClient {
  return {
    async listSessions({ from, to }) {
      const params = new URLSearchParams({ from, to, scope: 'mine' })
      const response = await fetcher(`${API}/sessions?${params.toString()}`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { items: SessionRow[] }
      return body.items
    },
  }
}

/**
 * D-M2-3 — the server writes `system:schedule_change` or `system:closure` for a
 * cancellation it generated; a manager's reason is the text they typed. Mapping the tokens
 * on the client is what keeps `app/` free of a second Hebrew string table §9 cannot reach.
 */
export function cancelReasonLabel(locale: Locale, reason: string | null): string {
  if (!reason) return ''
  if (reason === 'system:schedule_change')
    return t(locale, 'schedule.session.cancelReason.scheduleChange')
  if (reason === 'system:closure') return t(locale, 'schedule.session.cancelReason.closure')
  return reason
}
