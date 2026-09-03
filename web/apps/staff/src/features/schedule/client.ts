// The staff app's view of the schedule API. **Read-only** — the staff app never puts a
// schedule; §3.2 makes that a manager's action on the dashboard.
//
// The types below duplicate `apps/dashboard/src/features/schedule/client.ts`, and that is
// deliberate rather than lazy. `web/packages/core` is not this lane's to extend, and a
// cross-app import from `apps/dashboard` would be worse than a duplicate: it would couple
// two separately deployed bundles so that one app could not build without the other's
// source. Both copies collapse into `@studio/api-client` once `main` regenerates it after
// both W2 lanes merge — at which point these interfaces become a compile-time cross-check
// of the generated types rather than a second definition.
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
  /** 1d — the group's live enrollment: the roster a coach should expect. */
  headcount: number
}

/** Mirrors `app/schemas/schedule.py::TrainingYearOut` — only the three fields
 *  {@link yearCovers} needs. */
export interface TrainingYearRow {
  starts_on: string
  ends_on: string
  status: string
}

export interface StaffScheduleClient {
  listSessions(query: {
    from: string
    to: string
    groupId?: string
    coachPersonId?: string
  }): Promise<SessionRow[]>
  /**
   * Register §4.2 — `GET /training-years` is `AnyStaff`, not manager-only
   * (`app/routers/schedule.py:78`), so a coach's own client can already ask "does any
   * training year cover this date" without a backend change. Used only when a day/month
   * query above comes back empty, to tell "an ordinary day off" apart from "no training
   * year exists here at all" (§4.2's silent-skip failure mode) — see {@link yearCovers}.
   */
  listTrainingYears(): Promise<TrainingYearRow[]>
}

const API = '/api/v1'

export function makeStaffScheduleClient(fetcher: Fetcher): StaffScheduleClient {
  return {
    async listSessions({ from, to, groupId, coachPersonId }) {
      const params = new URLSearchParams({ from, to })
      if (groupId) params.set('group_id', groupId)
      if (coachPersonId) params.set('coach_person_id', coachPersonId)
      const response = await fetcher(`${API}/sessions?${params.toString()}`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { items: SessionRow[] }
      return body.items
    },
    async listTrainingYears() {
      // 200 is far above any real club's declared-years count (one a year, ever) and still
      // bounded — the same reasoning `bootstrap.py`'s MAX_SESSIONS_IN_WINDOW uses.
      const response = await fetcher(`${API}/training-years?limit=200`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { items: TrainingYearRow[] }
      return body.items
    },
  }
}

/** Whether any training year's `[starts_on, ends_on]` covers `dayKey` (`YYYY-MM-DD`).
 *  Lexicographic comparison is exact on ISO dates — the same trick `DatePickerScreen`'s
 *  `applyRange` already uses. Every declared year counts, not only `active`: a `draft` year
 *  not yet activated is still evidence the gap is a rollover step away, not a dead end. */
export function yearCovers(years: TrainingYearRow[], dayKey: string): boolean {
  return years.some((year) => year.starts_on <= dayKey && dayKey <= year.ends_on)
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
