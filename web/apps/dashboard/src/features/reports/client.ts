// `4g`'s one request, and the file version of it.
//
// The types are hand-written rather than pulled out of `@studio/api-client`'s generated
// `schema.d.ts` for the same reason `features/attendance/client.ts` writes its own: the
// generated tree is a `paths[...]['get']['responses'][200]['content']['application/json']`
// chain per field, which reads as noise at every use site and changes shape whenever the
// generator does. The generated schema is still the contract — `npm run typecheck` over
// the api-client package is what proves the two agree.
import { apiFetch } from '@studio/core'

/** `4g`'s switcher. See `app/services/reports/periods.py` for why these three and not
 *  `reports.period.*`'s four. */
export type PeriodKind = 'month' | 'season' | 'year'

export const PERIODS: readonly PeriodKind[] = ['month', 'season', 'year']

export type PeriodWindow = {
  kind: PeriodKind
  from_date: string
  to_date: string
  /** The studio's own name for the season. Null for month and year. */
  season_name: string | null
}

export type Kpi = {
  active_students: number
  active_students_delta: number
  /** Tenths of a percent, per 30 days. `3.2%` is `32`. Never divided in JS — see
   *  `formatPermille`. */
  churn_permille: number | null
  churn_permille_delta: number | null
  avg_monthly_revenue_agorot: number
  revenue_per_student_agorot: number | null
  attendance_percent: number | null
  attendance_percent_delta: number | null
  attendance_unmarked_marks: number
  attendance_decided_marks: number
  undated_departures: number
}

export type RevenueMonth = {
  year: number
  month: number
  billed_agorot: number
  collected_agorot: number
  outstanding_agorot: number
}

export type RetentionBucketKey = 'm0_3' | 'm3_6' | 'm6_12' | 'm12_plus'

export type RetentionBucket = {
  key: RetentionBucketKey
  lower_months: number
  upper_months: number | null
  cohort: number
  retained: number
  /** Null draws NO bar — a bar at 0% is a claim about students who never had the chance
   *  to leave. Same rule as a group with no decided marks on `4c`. */
  percent: number | null
}

export type BeltPromotion = {
  belt_rank_id: string
  name: string
  /** DATA, not a token (D3, §5.9) — `belt_rank.color_hex` is per-studio configuration. */
  color_hex: string
  secondary_color_hex: string | null
  order_index: number
  promotions: number
}

export type ReportsOverview = {
  /** Null exactly when the switcher asked for a season the studio does not have. */
  period: PeriodWindow | null
  kpi: Kpi | null
  billing_month: {
    period_year: number
    period_month: number
    total_students: number
    total_agorot: number
    settled_agorot: number
    overdue_agorot: number
    pending_agorot: number
  } | null
  revenue: RevenueMonth[]
  retention: RetentionBucket[]
  belts: BeltPromotion[]
  has_data: boolean
}

export function overviewPath(studioId: string, period: PeriodKind): string {
  return `/api/v1/reports/${studioId}/overview?period=${period}`
}

export function overviewCsvPath(studioId: string, period: PeriodKind): string {
  return `/api/v1/reports/${studioId}/overview.csv?period=${period}`
}

export async function fetchOverview(
  studioId: string,
  period: PeriodKind,
): Promise<ReportsOverview> {
  const response = await apiFetch(overviewPath(studioId, period))
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as ReportsOverview
}

/**
 * Tenths of a percent -> `3.2`, in integer arithmetic.
 *
 * `value / 10` is a float, and a float is how `3.2` becomes `3.1999999999999997` in the
 * one place on this screen where a single decimal is the whole point. The server already
 * did the rounding; this only splits the integer it sent.
 */
export function formatPermille(value: number): string {
  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  return `${sign}${Math.floor(magnitude / 10)}.${magnitude % 10}`
}

/** `+3` / `-2` / `0`, with an explicit sign so a delta always reads as a change. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}
