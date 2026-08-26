// SPEC §5.15's rollover, as this screen's own view of the API.
//
// **Why the interfaces are hand-declared here rather than imported from `@studio/api-client`.**
// Same reason `features/schedule/client.ts` gives: that package is generated from
// `openapi.json` on `main`, and a lane that regenerates it collides with every other lane in
// a file none of them owns. `packages/api-client/src/schema.d.ts` already carries every route
// below, so these shapes are a compile-time cross-check of it rather than a guess. They
// mirror `app/schemas/rollover.py` field for field, snake_case on the wire.
//
// **Three of §5.15's seven steps have no `/rollover/*` route, and this file must not invent
// one.** `app/routers/rollover.py` says so in its header: step 1 is `POST /training-years`,
// step 2 is `GET /holiday-presets` + `POST /closures`, step 6 is
// `POST /training-years/{id}/generate-sessions` — all built in W2 and all reachable from
// other screens. Re-exposing them under `/rollover/*` would give the product two ways to
// create a closure that could drift apart, so this client calls the originals.
//
// The fetcher is injected rather than imported so a test can drive the wizard without a
// network, which is what `SetupClient` and `ScheduleClient` both do.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RolloverStepId, RolloverStepStatus } from './types'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** Mirrors `TrainingYearOut`. */
export interface TrainingYear {
  id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'draft' | 'active' | 'closed'
}

/** Mirrors `RolloverStepOut`. `detail` is set only on the two derived steps. */
export interface RolloverStep {
  id: RolloverStepId
  status: RolloverStepStatus
  detail?: number | null
}

/** Mirrors `RolloverStateOut` — the whole wizard, in one read. */
export interface RolloverState {
  training_year: TrainingYear
  steps: RolloverStep[]
  resume_at: RolloverStepId
  complete: boolean
  closures: number
  groups_active: number
  students_enrolled: number
  price_plans_open: number
  sessions_generated: number
}

/** Mirrors `BulkRefusal`. `reason` is a machine token, translated by `refusalLabel`. */
export interface BulkRefusal {
  id: string
  reason: string
}

/** Mirrors `BulkOutcomeOut`. `applied` counts rows CHANGED, not rows submitted. */
export interface BulkOutcome {
  applied: number
  refused: BulkRefusal[]
}

export interface GroupRename {
  group_id: string
  name: string
}

export interface GroupCreate {
  class_id: string
  name: string
  description?: string | null
  age_min?: number | null
  age_max?: number | null
}

/** Mirrors `RolloverGroupsIn`. There is no `carry_forward` — see the schema's docstring. */
export interface RolloverGroupsIn {
  renames: GroupRename[]
  retire: string[]
  revive: string[]
  creates: GroupCreate[]
}

export interface EnrollmentMove {
  enrollment_id: string
  to_group_id: string
}

/** Mirrors `RolloverStudentsIn`. No `confirm` list: an enrolment left alone continues. */
export interface RolloverStudentsIn {
  moves: EnrollmentMove[]
  not_returning: string[]
}

/**
 * Mirrors `PlanRepricing`. `registration_fee_agorot` **omitted** means inherit the current
 * fee, which is not the same as sending `0` — that sets the fee to nothing. Real money
 * rides on the difference, so the field is optional rather than defaulted here too.
 */
export interface PlanRepricing {
  plan_id: string
  monthly_amount_agorot: number
  registration_fee_agorot?: number
}

export interface RolloverPricesIn {
  repricings: PlanRepricing[]
}

export interface AnnounceResult {
  announcement_id: string
  families: number
}

export interface GenerateResult {
  training_year_id: string
  groups: number
  sessions_created: number
}

export interface HolidayPreset {
  key: string
  name: string
  date_from: string
  date_to: string
}

export interface ClosureIn {
  training_year_id: string
  date_from: string
  date_to: string
  reason: string
  source: 'holiday_preset' | 'manual'
}

/** A group as step 3 renders it: `GET /groups` plus the class name `GET /classes` carries. */
export interface GroupRow {
  id: string
  name: string
  class_id: string
  class_name: string
  is_active: boolean
}

export interface ClassRow {
  id: string
  name: string
}

/**
 * One row of step 4's table: an ACTIVE enrolment, with the student's name attached.
 *
 * `enrollment_id` and not `student_id` is what `POST /rollover/{id}/students` moves, because
 * C11 puts a child in as many groups as they train — a student id would be ambiguous for
 * exactly the children a rollover is most likely to move.
 */
export interface EnrollmentRow {
  enrollment_id: string
  student_id: string
  student_name: string
  group_id: string
  group_name: string
}

/** Mirrors `PricePlanOut`. Step 5 only ever shows the open ones (`active_to === null`). */
export interface PricePlanRow {
  id: string
  name: string
  monthly_amount_agorot: number
  registration_fee_agorot: number
  sessions_per_week: number
  active_from: string
  active_to: string | null
}

export interface RolloverClient {
  readState(yearId: string): Promise<RolloverState>
  setStep(yearId: string, stepId: RolloverStepId, status: RolloverStepStatus): Promise<RolloverState>
  applyGroups(yearId: string, body: RolloverGroupsIn): Promise<BulkOutcome>
  applyStudents(yearId: string, body: RolloverStudentsIn): Promise<BulkOutcome>
  applyPrices(yearId: string, body: RolloverPricesIn): Promise<BulkOutcome>
  announce(yearId: string, body: { title: string; body: string }): Promise<AnnounceResult>

  // Step 1, 2 and 6 reach W2's own routes rather than a `/rollover/*` alias.
  listTrainingYears(): Promise<TrainingYear[]>
  createTrainingYear(body: {
    name: string
    starts_on: string
    ends_on: string
  }): Promise<TrainingYear>
  listHolidayPresets(year: number): Promise<HolidayPreset[]>
  createClosure(body: ClosureIn): Promise<{ sessions_cancelled: number }>
  generateSessions(yearId: string): Promise<GenerateResult>
  activateYear(yearId: string): Promise<TrainingYear>

  // The pickers.
  listGroups(): Promise<GroupRow[]>
  listClasses(): Promise<ClassRow[]>
  listEnrollments(): Promise<EnrollmentRow[]>
  listPricePlans(): Promise<PricePlanRow[]>
}

const API = '/api/v1'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

export function makeRolloverClient(fetcher: Fetcher): RolloverClient {
  async function post<T>(path: string, body?: unknown): Promise<T> {
    return json<T>(
      await fetcher(`${API}${path}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  }

  return {
    async readState(yearId) {
      return json<RolloverState>(await fetcher(`${API}/rollover/${yearId}`))
    },
    async setStep(yearId, stepId, status) {
      return json<RolloverState>(
        await fetcher(`${API}/rollover/${yearId}/steps/${stepId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ status }),
        }),
      )
    },
    async applyGroups(yearId, body) {
      return post<BulkOutcome>(`/rollover/${yearId}/groups`, body)
    },
    async applyStudents(yearId, body) {
      return post<BulkOutcome>(`/rollover/${yearId}/students`, body)
    },
    async applyPrices(yearId, body) {
      return post<BulkOutcome>(`/rollover/${yearId}/prices`, body)
    },
    async announce(yearId, body) {
      return post<AnnounceResult>(`/rollover/${yearId}/announce`, body)
    },

    async listTrainingYears() {
      const page = await json<{ items: TrainingYear[] }>(await fetcher(`${API}/training-years`))
      return page.items
    },
    async createTrainingYear(body) {
      return post<TrainingYear>('/training-years', body)
    },
    async listHolidayPresets(year) {
      return json<HolidayPreset[]>(await fetcher(`${API}/holiday-presets?year=${year}`))
    },
    async createClosure(body) {
      return post<{ sessions_cancelled: number }>('/closures', body)
    },
    async generateSessions(yearId) {
      return post<GenerateResult>(`/training-years/${yearId}/generate-sessions`)
    },
    async activateYear(yearId) {
      return post<TrainingYear>(`/training-years/${yearId}/activate`)
    },

    async listGroups() {
      // Two reads rather than one, exactly as `features/schedule/client.ts` does: `/groups`
      // carries `class_id` and step 3 shows the class name beside the group.
      const [groups, classes] = await Promise.all([
        json<{ items: { id: string; name: string; class_id: string; is_active: boolean }[] }>(
          await fetcher(`${API}/groups`),
        ),
        json<{ items: ClassRow[] }>(await fetcher(`${API}/classes`)),
      ])
      const names = new Map(classes.items.map((klass) => [klass.id, klass.name]))
      return groups.items.map((group) => ({
        id: group.id,
        name: group.name,
        class_id: group.class_id,
        class_name: names.get(group.class_id) ?? '',
        is_active: group.is_active,
      }))
    },
    async listClasses() {
      const page = await json<{ items: ClassRow[] }>(await fetcher(`${API}/classes`))
      return page.items
    },
    async listEnrollments() {
      // **`GET /enrollments` requires a `student_id`, and there is no route that lists a
      // studio's enrolments in one call.** Rather than add one from a UI lane, step 4 reads
      // the active roster and then asks for each student's enrolments in parallel. It is
      // N+1 and it is deliberate: the alternative is a new endpoint in `app/`, which this
      // lane may not touch, and the roster is bounded by `MAX_BULK_ROWS` (500) anyway —
      // beyond that the step has to page to render at all.
      const students: { id: string; first_name: string; last_name: string }[] = []
      let after: string | null = null
      do {
        const params = new URLSearchParams({ status: 'active', limit: '200' })
        if (after) params.set('after', after)
        const page = await json<{
          items: { id: string; first_name: string; last_name: string }[]
          next_cursor: string | null
        }>(await fetcher(`${API}/students?${params.toString()}`))
        students.push(...page.items)
        after = page.next_cursor
      } while (after)

      const perStudent = await Promise.all(
        students.map(async (student) => {
          const rows = await json<
            { id: string; group_id: string; group_name: string; ended_on: string | null }[]
          >(await fetcher(`${API}/enrollments?student_id=${student.id}`))
          return rows
            .filter((row) => row.ended_on === null)
            .map((row) => ({
              enrollment_id: row.id,
              student_id: student.id,
              student_name: `${student.first_name} ${student.last_name}`.trim(),
              group_id: row.group_id,
              group_name: row.group_name,
            }))
        }),
      )
      return perStudent.flat()
    },
    async listPricePlans() {
      const all: PricePlanRow[] = []
      let after: string | null = null
      do {
        const params = new URLSearchParams({ limit: '200' })
        if (after) params.set('after', after)
        const page = await json<{ items: PricePlanRow[]; next_cursor: string | null }>(
          await fetcher(`${API}/price-plans?${params.toString()}`),
        )
        all.push(...page.items)
        after = page.next_cursor
      } while (after)
      // §5.15 step 5 reprices the plans that are still in force. A closed plan is history
      // and offering a new amount for it would be offering to rewrite last year.
      return all.filter((plan) => plan.active_to === null)
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
 * A refusal token → the sentence a manager reads.
 *
 * `BulkRefusal.reason` is deliberately machine-readable (see its docstring): "an English
 * string from the server would be the one piece of copy on a Hebrew screen that nobody could
 * translate". `apply_prices` can also surface a billing service's message verbatim, which no
 * key covers — that falls through as itself rather than being swallowed, because a refusal
 * rendered as a blank cell is a change the manager thinks succeeded.
 */
export function refusalLabel(locale: Locale, reason: string): string {
  const key = `schedule.rollover.refusal.${reason}`
  const translated = t(locale, key)
  return translated === key ? reason : translated
}
