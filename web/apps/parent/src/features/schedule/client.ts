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

/** Mirrors `app/schemas/schedule.py::ClosureOut`. */
export interface ClosureRow {
  id: string
  training_year_id: string
  date_from: string
  date_to: string
  /** The manager's own text (`ראש השנה`, `שיפוצים`) — data, never a translation key. */
  reason: string
  source: 'holiday_preset' | 'manual'
}

export interface ParentScheduleClient {
  /** No `groupId`, no student id — see the module header. */
  listSessions(query: { from: string; to: string }): Promise<SessionRow[]>
  /**
   * Bug #20 — why an empty day is empty. §5.6 makes `materialize_sessions` skip a closed
   * date, so a holiday arrives here as an ABSENCE of rows and `listSessions` above can
   * never explain it; the reason lives only on the closure.
   *
   * `GET /me/closures`, not `GET /closures`: the staff read is `AnyStaff`, which is the
   * whole reason this screen had nothing to say. The `/me/` route is on `/me/studio`'s
   * pattern (`app/routers/schedule.py`) — no role dependency, and a shape that is the
   * club's shop window rather than a settings read.
   */
  listClosures(query: { from: string; to: string }): Promise<ClosureRow[]>
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
    async listClosures({ from, to }) {
      const params = new URLSearchParams({ from, to })
      const response = await fetcher(`${API}/me/closures?${params.toString()}`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { items: ClosureRow[] }
      return body.items
    },
  }
}

/** The closures whose `[date_from, date_to]` touch `[from, to]`, earliest first.
 *
 *  **Overlap, not containment** — סוכות opens on 26 September and closes on 3 October, and
 *  a filter asking for closures *inside* the month would drop it from both months and leave
 *  two screens with the same silent gap this bug is about. Lexicographic on ISO dates,
 *  which is exact; the server applies the same rule, and this repeats it because the day and
 *  week views narrow the window further than the month the fetch asked for. */
export function closuresOverlapping(
  closures: ClosureRow[],
  from: string,
  to: string,
): ClosureRow[] {
  return closures
    .filter((c) => c.date_from <= to && from <= c.date_to)
    .sort((left, right) => left.date_from.localeCompare(right.date_from))
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
