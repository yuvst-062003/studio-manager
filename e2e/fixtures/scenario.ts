/**
 * The scenario every flow stands on, built through the product's own API.
 *
 * ── Why this file exists at all ───────────────────────────────────────────────────────
 * `POST /dev/demo/reset` restores three fixture layers — studio, personas, health
 * templates — and `PLANNED_LAYERS` in `app/services/demo/fixtures.py` still owes structure,
 * students, health, attendance, money and belts. So after a reset there is not one group,
 * one session, one student or one charge anywhere in the demo studio. Every flow needs
 * some of those, and this is where they come from.
 *
 * Driving the real endpoints is not a workaround for a missing seed. A charge that arrives
 * by INSERT proves nothing about §5.10's run; one that arrives because a manager made a
 * group, priced it, enrolled a child and pressed the billing run has already exercised the
 * chain the flow is about.
 *
 * ── Linking a persona as a guardian ───────────────────────────────────────────────────
 * The parent app can only be driven as one of §19.3's nine personas, because
 * `/dev/sign-in-as` takes a persona key and `/dev/act-as` returns a bearer token a browser
 * has nowhere to put. So the payer has to BE a persona, which means a `guardian` row
 * pointing at one.
 *
 * The nine `person` rows carry no `email` and no `phone`. Their `auth_identity` rows do —
 * `dev+<key>@studio.invalid`, `email_verified = true`, seeded in
 * `app/services/demo/personas.py` — and that is exactly what `match_person` keys on: it
 * joins `Person → AuthIdentity` and matches the VERIFIED identity address, never
 * `person.email`, whose own docstring says "person.email alone is therefore never a key".
 *
 * So `POST /students` carrying `guardian.email = dev+parent3@studio.invalid` links the
 * persona rather than duplicating them, and with `group_id` it creates student, guardian
 * and enrollment in one transaction (§5.4(a): "creates everything immediately").
 *
 * This is also what makes `RegistrationService.approve` wrong today — it passes
 * `parent.email`, the Person column, where `match_person` wants the identity's. See the
 * lane's findings.
 *
 * ── Isolation ─────────────────────────────────────────────────────────────────────────
 * There is one reset per run (`global-setup.ts` explains why it cannot be per test), so
 * every call here builds its own class, group, student and charges, and returns their ids.
 * A test asserts on what it created and never on "the" roster.
 */

import type { APIRequestContext } from '@playwright/test'

import { API_ORIGIN } from '../origins'
import type { PersonaKey } from './api'

/** The training year every scenario materializes into. §16: 1 September – 31 August. */
const YEAR_STARTS = '2026-09-01'
const YEAR_ENDS = '2027-08-31'

/** The period the billing run charges, and the month the flows talk about. */
export const PERIOD = { year: 2026, month: 9 } as const

/** §5.10's tuition price for the fixture group. Whole shekels — G2, integers throughout. */
const MONTHLY_AGOROT = 32_000

/**
 * The verified address `match_person` keys on, derived the same way
 * `app/services/demo/personas.py` derives it. Not a guess: every persona's identity is
 * seeded as `dev+<key>@studio.invalid` with `email_verified = true`.
 */
export function personaEmail(persona: PersonaKey): string {
  return `dev+${persona}@studio.invalid`
}

export type Scenario = {
  locationId: string
  trainingYearId: string
  classId: string
  groupId: string
  /** Every session the two weekly rules materialized, ascending by start. */
  sessionIds: string[]
  pricePlanId: string
  studentId: string
  /** The persona acting as guardian and payer. */
  parentPersona: PersonaKey
  parentPersonId: string
  payerPersonId: string
  /** Open tuition charges for the payer, oldest first — the order §5.10 selects in. */
  chargeIds: string[]
  monthlyAmountAgorot: number
}

export type ScenarioOptions = {
  /** Which persona guards and pays for the child. Defaults to §19.3's three-child parent. */
  parent?: PersonaKey
  /** Distinguishes one scenario's rows from another's in a shared studio. */
  label?: string
}

/**
 * A per-call suffix, so two scenarios in one run never read as each other's.
 *
 * Random rather than a counter: there is one reset per run but several workers and several
 * files, and a counter is per-module-instance — two workers would both start at one and
 * collide on the first `training_year` name, which the API rejects with a 409 naming a row
 * the test never created.
 */
function uniqueTag(): string {
  return Math.random().toString(36).slice(2, 8)
}

class Api {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  async send<T>(method: 'get' | 'post' | 'put' | 'patch', path: string, data?: unknown): Promise<T> {
    const response = await this.request[method](`${API_ORIGIN}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      ...(data === undefined ? {} : { data }),
    })
    if (!response.ok()) {
      throw new Error(
        `${method.toUpperCase()} ${path} answered ${response.status()}: ` +
          `${(await response.text()).slice(0, 500)}`,
      )
    }
    return (await response.json()) as T
  }
}

/**
 * A bearer token for one persona, over the same door the browser uses.
 *
 * `request.newContext()` per persona rather than one shared context: the refresh cookie is
 * host-only and not port-scoped, so two personas in one jar leave the later one holding
 * both sessions.
 */
async function asPersona(request: APIRequestContext, persona: PersonaKey): Promise<Api> {
  const signIn = await request.get(`${API_ORIGIN}/api/v1/dev/sign-in-as/${persona}`, {
    params: { app: 'dashboard', return_path: '/' },
    maxRedirects: 0,
  })
  if (signIn.status() !== 307) {
    throw new Error(`sign-in-as ${persona} answered ${signIn.status()}`)
  }
  const refresh = await request.post(`${API_ORIGIN}/api/v1/auth/refresh`)
  if (!refresh.ok()) {
    throw new Error(`auth/refresh answered ${refresh.status()}: ${await refresh.text()}`)
  }
  const { access_token } = (await refresh.json()) as { access_token: string }
  return new Api(request, access_token)
}

export async function buildScenario(
  request: APIRequestContext,
  options: ScenarioOptions = {},
): Promise<Scenario> {
  const parent = options.parent ?? 'parent3'
  const tag = options.label ?? uniqueTag()

  // Everything below is the manager's work, which is also true of the product: a parent
  // never creates a group or a price plan. The token is a bearer, captured once, so a
  // later sign-in in this same context cannot retroactively change who these calls are.
  const manager = await asPersona(request, 'manager')

  const location = await manager.send<{ id: string }>('post', '/locations', {
    name: `אולם ${tag}`,
  })

  // A training year has to be ACTIVE before sessions materialize into it.
  const trainingYear = await manager.send<{ id: string }>('post', '/training-years', {
    name: `תשפ"ז ${tag}`,
    starts_on: YEAR_STARTS,
    ends_on: YEAR_ENDS,
  })
  await manager.send('post', `/training-years/${trainingYear.id}/activate`)

  const klass = await manager.send<{ id: string }>('post', '/classes', {
    name: `ג׳ודו ${tag}`,
  })
  const group = await manager.send<{ id: string }>('post', '/groups', {
    class_id: klass.id,
    name: `מתחילים ${tag}`,
    location_id: location.id,
  })

  // §5.6 — `apply: false` (the default) returns the impact preview and writes nothing;
  // `true` performs the change. The fixture applies. E2E-5 is the test that asserts the
  // preview, which is why the flag is spelled out here rather than left to the default.
  //
  // Sunday and Tuesday, 17:00–18:00. `weekday` is 0–6 with 0 = Sunday, matching Israel's
  // working week and Postgres's EXTRACT(DOW).
  await manager.send('put', `/groups/${group.id}/schedule`, {
    effective_from: YEAR_STARTS,
    apply: true,
    rules: [0, 2].map((weekday) => ({
      weekday,
      start_time: '17:00',
      end_time: '18:00',
      location_id: location.id,
      effective_from: YEAR_STARTS,
    })),
  })

  const sessions = await manager.send<{ items: { id: string }[] }>(
    'get',
    `/sessions?group_id=${group.id}&from=${YEAR_STARTS}&to=${YEAR_ENDS}`,
  )

  const pricePlan = await manager.send<{ id: string }>('post', '/price-plans', {
    name: `חודשי ${tag}`,
    group_id: group.id,
    sessions_per_week: 2,
    monthly_amount_agorot: MONTHLY_AGOROT,
    active_from: YEAR_STARTS,
  })

  // The child arrives as a LEAD — no `group_id` here, deliberately. §5.4a's lead is "a
  // real student who simply has no enrollment", and naming a group would create the
  // enrollment immediately and skip the step below.
  //
  // The guardian email is the persona's VERIFIED identity address, which is what makes
  // this link the persona instead of creating a second parent beside them, and what stops
  // an invitation being issued to a person who already has a login. See the module
  // docstring.
  const created = await manager.send<{ student: { id: string } }>('post', '/students', {
    first_name: 'דנה',
    last_name: `כהן ${tag}`,
    birthdate: '2016-04-12',
    guardian: {
      first_name: 'שירה',
      last_name: 'הורה',
      relation: 'parent',
      email: personaEmail(parent),
      is_primary: true,
    },
  })

  // §5.4a step 5 — 'Manager converts → picks group, sets price, status=active, enrollment
  // created.' Three decisions in one request because they are one decision.
  //
  // **The price plan can only be set here.** `POST /students` takes no `price_plan_id`, and
  // the billing run reads `student.price_plan_id` — a student with none is reported as
  // `unpriced` and charged nothing, which is a completed run with `charges_created: 0` and
  // no error anywhere. That is what an earlier draft of this fixture produced.
  await manager.send('post', `/students/${created.student.id}/convert`, {
    group_id: group.id,
    started_on: YEAR_STARTS,
    price_plan_id: pricePlan.id,
    reason: 'e2e fixture',
  })

  // §5.10 step 1 — the run charges 'every active enrollment'.
  await manager.send('post', '/billing-runs', {
    period_year: PERIOD.year,
    period_month: PERIOD.month,
  })

  const personaRow = await request.get(`${API_ORIGIN}/api/v1/dev/personas`)
  const cast = (await personaRow.json()) as { items: { key: PersonaKey; person_id: string }[] }
  const parentPersonId = cast.items.find((p) => p.key === parent)!.person_id

  const charges = await manager.send<{ items: { id: string; student_id: string }[] }>(
    'get',
    `/charges?payer_person_id=${parentPersonId}&status=open`,
  )

  return {
    locationId: location.id,
    trainingYearId: trainingYear.id,
    classId: klass.id,
    groupId: group.id,
    sessionIds: sessions.items.map((s) => s.id),
    pricePlanId: pricePlan.id,
    studentId: created.student.id,
    parentPersona: parent,
    parentPersonId,
    payerPersonId: parentPersonId,
    chargeIds: charges.items
      .filter((charge) => charge.student_id === created.student.id)
      .map((charge) => charge.id),
    monthlyAmountAgorot: MONTHLY_AGOROT,
  }
}
