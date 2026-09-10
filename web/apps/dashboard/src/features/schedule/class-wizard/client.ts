// Everything the seven steps read and write, in one injected object.
//
// **Every endpoint here already exists.** The wizard needed no migration: the only route
// added for it was `PATCH /api/v1/classes/{id}`, whose schema had been sitting unused since
// the model landed. What follows is the mapping, step by step, so the next reader can check
// a claim rather than take it:
//
//   1 details  → POST/PATCH /classes
//   2 groups   → GET/POST /groups, GET/PUT /groups/{id}/schedule
//   3 prices   → GET/POST /price-plans, PUT /price-plans/{id}/class
//   4 belts    → GET /belt-ranks, GET /belt-presets, POST /belt-ranks/seed, POST /belt-ranks
//   5 items    → GET/POST /products
//   6 coaches  → GET /staff, GET/POST /groups/{id}/staff
//   7 launch   → GET/POST /onboarding-link
//
// Four things the prototype's wizard asks for are NOT here, each with its reason in §4:
// coach wages (no model, no endpoint — rule 3), standing orders as a created artefact (our
// provider cannot make one — rule 7), two more progression systems (rule 5), and
// multi-discipline studios (rule 6).
// The same injected-fetch shape the schedule client uses, so the app hands both the
// one `apiFetch` and a test hands both the one stub.
import type { Fetcher } from '../client'

const API = '/api/v1'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

async function ok(response: Response): Promise<void> {
  if (!response.ok) throw new Error(String(response.status))
}

function send(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// -- what each step reads back ------------------------------------------------------

export interface WizardClass {
  id: string
  name: string
  description: string | null
  discipline: string | null
  is_active: boolean
}

export interface WizardGroup {
  id: string
  class_id: string
  name: string
  age_min: number | null
  age_max: number | null
  is_active: boolean
}

export interface WizardRule {
  id?: string
  weekday: number
  start_time: string
  end_time: string
  location_id: string | null
  effective_from: string
}

export interface WizardPlan {
  id: string
  name: string
  sessions_per_week: number | null
  monthly_amount_agorot: number
  registration_fee_agorot: number
  active_from: string
  active_to: string | null
  class_id: string | null
}

export interface WizardRank {
  id: string
  class_id: string | null
  name: string
  kyu: number | null
  order_index: number
  color_hex: string
  secondary_color_hex: string | null
}

export interface WizardPreset {
  key: string
  /** `judo`, `karate`, … A preset is application data, identical for every studio. */
  discipline: string
  name: string
  ranks: {
    name: string
    kyu: number | null
    order_index: number
    color_hex: string
    secondary_color_hex: string | null
  }[]
}

export interface WizardProduct {
  id: string
  name: string
  description: string | null
  price_agorot: number
  is_active: boolean
  class_id: string | null
  sizes: string[]
}

export interface WizardStaff {
  /** Null for a PENDING INVITATION — nobody has accepted it, so no `Person` exists yet,
   *  and a group cannot be staffed by somebody who has not signed in. Step 6 filters
   *  those out rather than offering a name that cannot be assigned. */
  person_id: string | null
  first_name: string | null
  last_name: string | null
  roles: string[]
}

export interface WizardGroupStaff {
  person_id: string
  display_name: string
  role: 'lead_coach' | 'assistant_coach'
}

export interface WizardLink {
  active: boolean
  registered_count: number
  /** Null when there is no live link — and also for a pre-2026-08-31 row, whose token was
   *  only ever hashed and cannot be recovered. Step 7 offers those a regenerate. */
  url: string | null
}

export interface ClassWizardClient {
  getClass(classId: string): Promise<WizardClass>
  createClass(body: { name: string; description: string | null; discipline: string | null }): Promise<WizardClass>
  updateClass(
    classId: string,
    body: { name?: string; description?: string | null; discipline?: string | null },
  ): Promise<WizardClass>

  listGroups(classId: string): Promise<WizardGroup[]>
  createGroup(body: {
    class_id: string
    name: string
    age_min: number | null
    age_max: number | null
  }): Promise<WizardGroup>
  updateGroup(groupId: string, body: Record<string, unknown>): Promise<WizardGroup>
  getSchedule(groupId: string): Promise<WizardRule[]>
  /** `apply` is the caller's, and the wizard always sends `true` — a step that saved a
   *  preview would look like it saved and change nothing. */
  putSchedule(
    groupId: string,
    body: { rules: WizardRule[]; effective_from: string; apply: boolean },
  ): Promise<{ students_left_unscheduled: number }>

  listPlans(): Promise<WizardPlan[]>
  createPlan(body: {
    name: string
    sessions_per_week: number | null
    monthly_amount_agorot: number
    registration_fee_agorot: number
    active_from: string
    class_id: string
  }): Promise<WizardPlan>

  listRanks(classId: string): Promise<WizardRank[]>
  listPresets(): Promise<WizardPreset[]>
  seedRanks(classId: string, presetKey: string): Promise<WizardRank[]>

  listProducts(): Promise<WizardProduct[]>
  createProduct(body: {
    name: string
    description: string | null
    price_agorot: number
    sizes: string[]
    class_id: string
  }): Promise<WizardProduct>

  listStaff(): Promise<WizardStaff[]>
  listGroupStaff(groupId: string): Promise<WizardGroupStaff[]>
  assignStaff(groupId: string, body: { person_id: string; role: string }): Promise<void>

  getLink(): Promise<WizardLink>
  createLink(): Promise<WizardLink>
}

export function makeClassWizardClient(fetcher: Fetcher): ClassWizardClient {
  return {
    async getClass(classId) {
      // No `GET /classes/{id}` exists; the list is small (a club has a handful of classes)
      // and paging it would be inventing an endpoint the wizard does not need.
      const body = await json<{ items: WizardClass[] }>(await fetcher(`${API}/classes`))
      const found = body.items.find((row) => row.id === classId)
      if (!found) throw new Error('404')
      return found
    },
    async createClass(body) {
      return json<WizardClass>(await fetcher(`${API}/classes`, send('POST', body)))
    },
    async updateClass(classId, body) {
      return json<WizardClass>(await fetcher(`${API}/classes/${classId}`, send('PATCH', body)))
    },

    async listGroups(classId) {
      const body = await json<{ items: WizardGroup[] }>(
        await fetcher(`${API}/groups?class_id=${encodeURIComponent(classId)}`),
      )
      return body.items
    },
    async createGroup(body) {
      return json<WizardGroup>(await fetcher(`${API}/groups`, send('POST', body)))
    },
    async updateGroup(groupId, body) {
      return json<WizardGroup>(await fetcher(`${API}/groups/${groupId}`, send('PATCH', body)))
    },
    async getSchedule(groupId) {
      const body = await json<{ rules: WizardRule[] }>(
        await fetcher(`${API}/groups/${groupId}/schedule`),
      )
      return body.rules
    },
    async putSchedule(groupId, body) {
      return json<{ students_left_unscheduled: number }>(
        await fetcher(`${API}/groups/${groupId}/schedule`, send('PUT', body)),
      )
    },

    async listPlans() {
      const body = await json<{ items: WizardPlan[] }>(await fetcher(`${API}/price-plans`))
      return body.items
    },
    async createPlan(body) {
      return json<WizardPlan>(await fetcher(`${API}/price-plans`, send('POST', body)))
    },

    async listRanks(classId) {
      const body = await json<{ items: WizardRank[] }>(
        await fetcher(`${API}/belt-ranks?class_id=${encodeURIComponent(classId)}`),
      )
      return body.items
    },
    async listPresets() {
      const body = await json<{ items: WizardPreset[] }>(await fetcher(`${API}/belt-presets`))
      return body.items
    },
    // `POST /belt-ranks/seed` answers 409 on a class that already has a ladder rather than
    // merging — a second seed would renumber ranks that `student_belt` rows point at,
    // rewriting a child's history without touching their row. Step 4 offers the seed only
    // when the ladder is empty, and the 409 is the backstop.
    async seedRanks(classId, presetKey) {
      const body = await json<{ items: WizardRank[] }>(
        await fetcher(`${API}/belt-ranks/seed`, send('POST', { class_id: classId, preset_key: presetKey })),
      )
      return body.items
    },

    async listProducts() {
      const body = await json<{ items: WizardProduct[] }>(await fetcher(`${API}/products`))
      return body.items
    },
    async createProduct(body) {
      return json<WizardProduct>(await fetcher(`${API}/products`, send('POST', body)))
    },

    async listStaff() {
      const body = await json<{ items: WizardStaff[] }>(await fetcher(`${API}/staff`))
      return body.items
    },
    async listGroupStaff(groupId) {
      const body = await json<{ items: WizardGroupStaff[] }>(
        await fetcher(`${API}/groups/${groupId}/staff`),
      )
      return body.items
    },
    async assignStaff(groupId, body) {
      await ok(await fetcher(`${API}/groups/${groupId}/staff`, send('POST', body)))
    },

    async getLink() {
      return json<WizardLink>(await fetcher(`${API}/onboarding-link`))
    },
    async createLink() {
      return json<WizardLink>(await fetcher(`${API}/onboarding-link`, send('POST', {})))
    },
  }
}
