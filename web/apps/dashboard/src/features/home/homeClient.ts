// The manager home's view of the API — docs/design/proposals/manager-home.md.
//
// This screen owns no data and performs no mutation. Every field here is already served
// to some other screen; the home is the one place they are read together.
//
// Types are declared locally rather than imported from `@studio/api-client`, for the
// reason `features/schedule/client.ts` gives at length: that package is regenerated on
// `main`, and regenerating it inside a lane guarantees a conflict in a file the lane does
// not own. The fetcher is injected so a test can drive the screen without a network.
import type { SessionRow } from '../schedule/client'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** Mirrors `app/routers/reports.py::MonthlyReportSummary`, field for field. */
export interface MonthlySummary {
  period_year: number
  period_month: number
  total_students: number
  total_agorot: number
  settled_agorot: number
  overdue_agorot: number
  pending_agorot: number
}

export interface HomeMoney {
  /** Pending plus overdue. What the club is owed right now. */
  debtAgorot: number
  /** Settled this month. */
  collectedAgorot: number
  /**
   * Households, not students. One guardian with three children in arrears is **one**
   * family to call, and the count a manager acts on. `useSideNavBadges` in App.tsx
   * derives the DashNav badge the same way, from the same field.
   */
  debtHouseholds: number
}

export interface HomeAttention {
  missingHealth: number
  /** This week's sessions with nobody assigned. Not cancelled ones — those need no coach. */
  noCoach: number
  /** Sessions that have already ended without a register. A future session is not late. */
  unmarked: number
}

export interface HomeTodaySession {
  id: string
  groupName: string
  startsAt: string
  endsAt: string
  hall: string | null
  /** null renders as `no coach assigned` in danger — `3a` forbids drawing it like the rest. */
  coach: string | null
  cancelled: boolean
}

/**
 * Each region resolves on its own. A screen whose whole body blanks because one of four
 * endpoints is down is worse than one that shows three regions and an error in the
 * fourth, which is why this is `allSettled` and not `all`.
 */
/** One bar of the board's attendance chart (owner request 2026-08-30). `rate_percent`
 *  null is load-bearing, same as the report screen's: a group nobody marked has no rate,
 *  and 0% would be a claim about children who were simply never counted. */
export interface HomeGroupRate {
  group_id: string
  group_name: string
  rate_percent: number | null
}

export interface HomeData {
  money: HomeMoney | null
  attention: HomeAttention | null
  today: HomeTodaySession[] | null
  attendance: HomeGroupRate[] | null
}

export interface HomeClient {
  load(studioId: string, today: Date): Promise<HomeData>
}

const API = '/api/v1'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

/** Local calendar day as `YYYY-MM-DD`. `toISOString` would answer in UTC, which after
 *  21:00 Asia/Jerusalem is tomorrow — the screen would skip an evening's classes. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Sunday-to-Saturday, the week Israeli clubs run on and the one `3a` draws. */
export function weekBounds(today: Date): { from: string; to: string } {
  const start = new Date(today)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { from: isoDay(start), to: isoDay(end) }
}

export function summariseSessions(sessions: SessionRow[], now: Date): Omit<HomeAttention, 'missingHealth'> {
  const live = sessions.filter((s) => s.status !== 'cancelled')
  return {
    noCoach: live.filter((s) => s.staff.length === 0).length,
    unmarked: live.filter((s) => !s.attendance_taken && new Date(s.ends_at) < now).length,
  }
}

export function todayFrom(sessions: SessionRow[], today: Date): HomeTodaySession[] {
  const day = isoDay(today)
  return sessions
    .filter((s) => isoDay(new Date(s.starts_at)) === day)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((s) => ({
      id: s.id,
      groupName: s.group_name,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      hall: s.location_name,
      // The lead coach is the one a manager chases. An assistant does not cover a session.
      coach: s.staff.find((person) => person.role === 'lead_coach')?.display_name ?? null,
      cancelled: s.status === 'cancelled',
    }))
}

export function makeHomeClient(fetcher: Fetcher): HomeClient {
  return {
    async load(studioId, today) {
      const { from, to } = weekBounds(today)
      const [money, health, sessions, attendance] = await Promise.allSettled([
        (async (): Promise<HomeMoney> => {
          const [summary, charges] = await Promise.all([
            json<MonthlySummary>(
              await fetcher(
                `${API}/reports/${studioId}/monthly?year=${today.getFullYear()}&month=${today.getMonth() + 1}`,
              ),
            ),
            json<{ items: { payer_person_id: string }[] }>(
              await fetcher(`${API}/charges?status=open&limit=200`),
            ),
          ])
          return {
            debtAgorot: summary.pending_agorot + summary.overdue_agorot,
            collectedAgorot: summary.settled_agorot,
            debtHouseholds: new Set(charges.items.map((c) => c.payer_person_id)).size,
          }
        })(),
        (async (): Promise<number> => {
          const rows = await json<{ health_status: string }[]>(
            await fetcher(`${API}/health-declarations/summary`),
          )
          return rows.filter((row) => row.health_status !== 'signed').length
        })(),
        (async (): Promise<SessionRow[]> => {
          const params = new URLSearchParams({ from, to, limit: '200' })
          const body = await json<{ items: SessionRow[] }>(
            await fetcher(`${API}/sessions?${params.toString()}`),
          )
          return body.items
        })(),
        // The board's attendance bars (owner request 2026-08-30) — the report screen's own
        // endpoint over the last 30 days, so the board and 4c can never disagree.
        (async (): Promise<HomeGroupRate[]> => {
          const monthAgo = new Date(today)
          monthAgo.setDate(monthAgo.getDate() - 30)
          const body = await json<{ groups: HomeGroupRate[] }>(
            await fetcher(`${API}/attendance/report?from=${isoDay(monthAgo)}&to=${isoDay(today)}`),
          )
          return body.groups
        })(),
      ])

      const rows = sessions.status === 'fulfilled' ? sessions.value : null
      // Attention needs both reads. With either missing the region is unknown rather than
      // zero — reporting "nothing needs attention" off a failed request is worse than
      // reporting nothing at all.
      const attention =
        health.status === 'fulfilled' && rows
          ? { missingHealth: health.value, ...summariseSessions(rows, today) }
          : null

      return {
        money: money.status === 'fulfilled' ? money.value : null,
        attention,
        today: rows ? todayFrom(rows, today) : null,
        attendance: attendance.status === 'fulfilled' ? attendance.value : null,
      }
    },
  }
}
