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

/**
 * The training year every scenario materializes into.
 *
 * Two properties, and the second one is a workaround rather than a design.
 *
 * **It straddles today**, which is load-bearing for E2E-5: a year starting in the future
 * materializes nothing in the past, because §5.6 rewrites only sessions with `starts_at >
 * now()` and `change_window_start` is `max(effective_from, today)`. Both correct. But
 * §5.6's whole subject is what a rule change must NOT touch, so a scenario with no past
 * has nothing to protect.
 *
 * **It is not §16's default year, and it cannot be.** §16 runs 1 September – 31 August,
 * and today sits five days from the end of the current one: that year has a hundred past
 * sessions and one future, which is not enough to hold a hand-moved lesson AND leave a
 * rule-driven one for the change to move. Next year's has the opposite problem — all
 * future, nothing to protect. So the fixture takes a window with room on both sides.
 *
 * It used to be short for a second reason, now gone: `listSessions` ignored `next_cursor`,
 * so a year's worth of sessions arrived truncated at fifty. That was a real defect for a
 * real club and it is fixed rather than dodged.
 */
const YEAR_STARTS = '2026-06-01'
const YEAR_ENDS = '2026-10-31'

/**
 * The period the billing run charges, and the month the flows talk about. The current
 * month, so the charge it produces is one a parent would really be looking at.
 */
export const PERIOD = { year: 2026, month: 8 } as const

//: A 1×1 transparent PNG. The server sniffs the bytes for a PNG magic number and nothing
//: more (`decode_signature`) — a drawn signature is a person's job, not a fixture's.
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

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
  /** The same sessions with their times, for a spec that needs to pick one by date. */
  sessions: { id: string; starts_at: string }[]
  pricePlanId: string
  /**
   * The suffix every row this scenario created carries in its name.
   *
   * There is one reset per run and only four guardian personas, so a payer is shared
   * between tests and `/me/charges` answers per PAYER — a screen assertion counting
   * "the" debt rows would be counting another test's months too. Filtering on this
   * keeps each test looking at its own family.
   */
  tag: string
  studentId: string
  /** Every child the scenario enrolled, in creation order. */
  studentIds: string[]
  /** The persona acting as guardian and payer. */
  parentPersona: PersonaKey
  parentPersonId: string
  payerPersonId: string
  /** Open tuition charges for the payer, oldest first — the order §5.10 selects in. */
  chargeIds: string[]
  monthlyAmountAgorot: number
  /** Present only when `withProtections` was asked for. */
  protections: Protections | null
}

export type ScenarioOptions = {
  /** Which persona guards and pays for the child. Defaults to §19.3's three-child parent. */
  parent?: PersonaKey
  /** Distinguishes one scenario's rows from another's in a shared studio. */
  label?: string
  /**
   * Set up §5.6's three protections: one session already held with attendance against it,
   * one moved by hand, one one-off. Off by default because only E2E-5 needs them and they
   * cost four extra round trips — and because a flow that does not need them should not
   * quietly depend on them.
   */
  withProtections?: boolean
  /**
   * How many months to bill, counting back from `PERIOD`. §5.10's card route offers
   * `[1] [2] [3] [6]`, and a flow about "choosing three months" needs three to choose from
   * — one charge would make the chip group render a single option and prove nothing.
   */
  months?: number
  /**
   * How many children to enrol, all in the one group and all guarded by `parent`.
   *
   * E2E-2 needs more than one: §5.14's whole point is that `unmarked` is a state of its
   * own, and a roster of one is either fully marked or fully unmarked, so it cannot tell
   * "the coach marked everyone" from "the coach marked the only child there".
   */
  students?: number
}

/** §5.6's three, populated only when `withProtections` is asked for. */
export type Protections = {
  /** Held before today, with attendance marked — so regenerating it would rewrite a register. */
  pastSessionId: string
  /** Moved by hand to 19:30, in the future. A rule change must not undo it. */
  manuallyEditedSessionId: string
  /** A one-off no rule created, so no rule may remove it. */
  adHocSessionId: string
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

  /** The bearer itself, for the one caller (`tryOpenOrder`) that needs a raw response. */
  get bearer(): string {
    return this.token
  }

  /**
   * `at` sets §19.5's `X-Dev-Now`, which shifts `app.core.clock.now()` for that request
   * and only that request. The scenario needs it for exactly one call — see the schedule
   * PUT below — and nothing else here should carry it.
   */
  async send<T>(
    method: 'get' | 'post' | 'put' | 'patch',
    path: string,
    data?: unknown,
    at?: string,
  ): Promise<T> {
    const response = await this.request[method](`${API_ORIGIN}/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(at ? { 'X-Dev-Now': at } : {}),
      },
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
  //
  // **`X-Dev-Now` is what makes a past session possible at all.** §5.6 rewrites only
  // sessions with `starts_at > now()`, and `change_window_start` is `max(effective_from,
  // today)` — so a schedule change never materializes into the past, correctly and by
  // design. Applying the rules as of the first day of the training year is therefore the
  // only honest way to end up with a year of sessions with today in the middle of them.
  // §19.5 exists for exactly this: "run the billing run in March" has the same shape.
  await manager.send(
    'put',
    `/groups/${group.id}/schedule`,
    {
      effective_from: YEAR_STARTS,
      apply: true,
      rules: [0, 2].map((weekday) => ({
        weekday,
        start_time: '17:00',
        end_time: '18:00',
        location_id: location.id,
        effective_from: YEAR_STARTS,
      })),
    },
    `${YEAR_STARTS}T06:00:00Z`,
  )

  const sessions = { items: await listAllSessions(manager, group.id) }

  // §3.2 — a coach sees the sessions of the groups they are assigned to, and nothing else.
  // Without this the lead coach's roster is a 404 for a group that plainly exists, which
  // reads as a broken screen rather than as the scoping rule working.
  const coaches = await request.get(`${API_ORIGIN}/api/v1/dev/personas`)
  const lead = (
    (await coaches.json()) as { items: { key: string; person_id: string }[] }
  ).items.find((p) => p.key === 'lead')!
  await manager.send('post', `/groups/${group.id}/staff`, {
    person_id: lead.person_id,
    role: 'lead_coach',
  })

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
  const FIRST_NAMES = ['דנה', 'יונתן', 'מאיה', 'איתי', 'נועה']
  const studentIds: string[] = []
  for (let index = 0; index < (options.students ?? 1); index += 1) {
    const created = await manager.send<{ student: { id: string } }>('post', '/students', {
      first_name: FIRST_NAMES[index % FIRST_NAMES.length],
      last_name: `כהן ${tag}`,
      birthdate: '2016-04-12',
      // Only the first child creates the guardian; the rest MATCH her on the same verified
      // address, which is §5.4a's "a matched parent is never duplicated" doing its job and
      // is why a three-child family here is one payer rather than three.
      guardian: {
        first_name: 'שירה',
        last_name: 'הורה',
        relation: 'parent',
        email: personaEmail(parent),
        is_primary: index === 0,
      },
    })

    // §5.4a step 5 — 'Manager converts → picks group, sets price, status=active, enrollment
    // created.' Three decisions in one request because they are one decision.
    //
    // **The price plan can only be set here.** `POST /students` takes no `price_plan_id`,
    // and the billing run reads `student.price_plan_id` — a student with none is reported
    // as `unpriced` and charged nothing, which is a completed run with
    // `charges_created: 0` and no error anywhere. That is what an earlier draft produced.
    await manager.send('post', `/students/${created.student.id}/convert`, {
      group_id: group.id,
      started_on: YEAR_STARTS,
      price_plan_id: pricePlan.id,
      reason: 'e2e fixture',
    })
    studentIds.push(created.student.id)
  }
  const created = { student: { id: studentIds[0]! } }

  // §5.5 — an ACTIVE student in a running club has a signed declaration, and W6 mounts
  // the parent-app gate that enforces it. EVERY outstanding declaration in the studio is
  // signed here, not only this scenario's children: §6.1 gates on "any linked student",
  // so one fixture-seeded child left `missing` traps its parent persona behind the
  // declaration form in whichever flow uses them next. The suite's steady state is a
  // well-run club; the one test that needs an UNSIGNED child (E2E-1) creates it after
  // this ran, which is also the order reality happens in.
  await signOutstandingDeclarations(manager)

  // §5.10 step 1 — the run charges 'every active enrollment' IN THE STUDIO, not just this
  // scenario's child. So a run here also bills every other scenario's students for the
  // same month, and a payer legitimately ends up owing months a different test created.
  // That is the product working; a spec that assumed otherwise would be asserting a rule
  // §5.10 does not have. `chargeIds` below is filtered to this scenario's own student.
  //
  // One run per month, counting
  // back from PERIOD, because `charge`'s idempotency key is
  // `(student_id, period_year, period_month, kind)` — a single run produces a single month
  // however many times it is repeated, which is the property that makes it safe to re-run
  // and the reason three months need three runs.
  const months = options.months ?? 1
  for (let back = months - 1; back >= 0; back -= 1) {
    const month = PERIOD.month - back
    await manager.send('post', '/billing-runs', {
      period_year: month > 0 ? PERIOD.year : PERIOD.year - 1,
      period_month: month > 0 ? month : month + 12,
    })
  }

  const protections = options.withProtections
    ? await buildProtections(manager, group.id, trainingYear.id, sessions.items)
    : null

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
    sessions: sessions.items,
    pricePlanId: pricePlan.id,
    tag,
    studentId: created.student.id,
    studentIds,
    parentPersona: parent,
    parentPersonId,
    payerPersonId: parentPersonId,
    chargeIds: charges.items
      .filter((charge) => charge.student_id === created.student.id)
      .map((charge) => charge.id),
    monthlyAmountAgorot: MONTHLY_AGOROT,
    protections,
  }
}

/**
 * Every session in the training year, following the cursor to the end.
 *
 * Paged rather than asked for in one go, and the difference is not academic: `GET
 * /sessions` defaults to 50 rows, and two rules a week across a training year is about a
 * hundred. An unpaged read returns the first fifty — which, for a year that started last
 * September, is fifty sessions all in the past and none in the future. That reads exactly
 * like "materialization only went forwards", and it is not.
 */
async function listAllSessions(
  manager: Api,
  groupId: string,
): Promise<{ id: string; starts_at: string }[]> {
  const all: { id: string; starts_at: string }[] = []
  let cursor: string | null = null
  do {
    const page: { items: { id: string; starts_at: string }[]; next_cursor: string | null } =
      await manager.send(
        'get',
        `/sessions?group_id=${groupId}&from=${YEAR_STARTS}&to=${YEAR_ENDS}&limit=200` +
          (cursor ? `&cursor=${cursor}` : ''),
      )
    all.push(...page.items)
    cursor = page.next_cursor
  } while (cursor)
  return all
}

export type SessionRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  is_manually_edited: boolean
  is_ad_hoc: boolean
  attendance_taken: boolean
}

/**
 * One session, read as a manager.
 *
 * Exported because a spec sometimes has to check a flag the screen renders as an icon:
 * asserting `is_manually_edited` through the API says "the lock is true", while asserting
 * the lock in the DOM says "the lock is drawn". Both are worth having, and when they
 * disagree the pair is what tells you which half is broken.
 */
export async function readSession(
  request: APIRequestContext,
  sessionId: string,
): Promise<SessionRow> {
  const manager = await asPersona(request, 'manager')
  return manager.send<SessionRow>('get', `/sessions/${sessionId}`)
}

export type OrderRow = {
  id: string
  payer_person_id: string
  public_ref: string
  expected_amount_agorot: number
  max_payments: number
  status: string
  expires_at: string
  paid_at: string | null
  charge_ids: string[]
}

/**
 * One payment order, read as a MANAGER.
 *
 * `GET /payment-orders/{public_ref}` admits the payer or any staff member, and staff is
 * what a spec has: the order was created by a click in the browser, so the test never held
 * the parent's bearer token. There is deliberately no list-orders endpoint — the specs get
 * a `public_ref` by watching the POST that creates one.
 */
export async function readOrder(
  request: APIRequestContext,
  publicRef: string,
): Promise<OrderRow> {
  const manager = await asPersona(request, 'manager')
  return manager.send<OrderRow>('get', `/payment-orders/${publicRef}`)
}

/**
 * G8's הוראת קבע, recorded by a manager rather than created by us.
 *
 * uPay cannot create a per-payer mandate, cannot vary its amount per payer, and its
 * recurring callbacks carry no customer identifier — so this row is a manager's note that
 * a family is on the shared link, and nothing more. That is exactly why §5.10 makes the
 * resulting warning a warning: the record can be stale, and a stale record must not cost a
 * family the card route.
 */
export async function recordStandingOrder(
  request: APIRequestContext,
  payerPersonId: string,
  amountAgorot: number,
  startDate = '2026-06-01',
): Promise<void> {
  const manager = await asPersona(request, 'manager')
  await manager.send('post', '/recurring-subscriptions', {
    payer_person_id: payerPersonId,
    amount_agorot: amountAgorot,
    start_date: startDate,
  })
}

export type RosterEntry = {
  student_id: string
  display_name: string
  status: 'unmarked' | 'present' | 'absent' | 'late' | 'excused'
  source: string | null
  has_absence_report: boolean
}

/**
 * An open payment order over every charge in the scenario, created as the PAYER.
 *
 * The order routes take their payer from the session rather than the body — deliberately,
 * because a body-supplied payer would let anyone open an order over anyone's charges — so
 * this signs in as the family rather than the manager.
 *
 * Used by E2E-4, where the thing under test is the callback's verdict rather than the
 * parent's click. E2E-3 walks the click.
 */
export async function openOrderFor(
  request: APIRequestContext,
  scenario: Scenario,
  maxPayments = 1,
): Promise<OrderRow> {
  const payer = await asPersona(request, scenario.parentPersona)
  return payer.send<OrderRow>(`post`, `/payment-orders?max_payments=${maxPayments}`, {
    charge_ids: scenario.chargeIds,
  })
}

/**
 * The club's `הסכם הרשמה`, done: filed for every student in the studio that still owes one,
 * by the manager, on the guardians' behalf (§5.1 sanctions exactly this).
 *
 * **Three parts, not one, since the club's own form replaced the bundled questionnaire.**
 * §6.1's gate checks registration details, the health declaration AND the club's
 * `תקנון ותנאי תשלום` — so a fixture that files only the declaration leaves every family
 * behind the gate, and E2E-1's "the app opens" assertion fails for a reason that has nothing
 * to do with what it is testing.
 *
 * All-clear answers, so no derived flag lands on rosters other tests assert against — which
 * is also why `clause_confirmed` is the `none` clause: with every answer negative that is the
 * sentence the family is entitled to sign, and the server refuses the other one.
 *
 * The manager posts all three, and each lands on the GUARDIAN rather than on the office —
 * see `signing_person_id` in app/services/health/agreement.py.
 */
async function signOutstandingDeclarations(manager: Api): Promise<void> {
  const templates = await manager.send<{ items: { id: string; version: number }[] }>(
    'get',
    '/health-templates?kind=full',
  )
  // The highest version, not the first row: a studio holds every version it has published,
  // and the server refuses a declaration signed against a superseded one.
  const templateId = templates.items.reduce((best, item) =>
    item.version > best.version ? item : best,
  ).id
  const template = await manager.send<{
    schema: { sections: { questions: { id: string; type: string }[] }[] }
  }>('get', `/health-templates/${templateId}`)
  const answers: Record<string, unknown> = {}
  for (const section of template.schema.sections) {
    for (const question of section.questions) {
      answers[question.id] =
        question.type === 'boolean' ? false : question.type === 'phone' ? '050-0000000' : ''
    }
  }
  // Template v2's declaration question. Every answer above is negative, so `none` is the
  // clause that follows — `verify_clause` refuses `limited` with nothing declared, and
  // refuses an unconfirmed clause outright.
  answers['clause_confirmed'] = 'none'

  for (const status of ['missing', 'trial_signed']) {
    const unsigned = await manager.send<{ items: { id: string }[] }>(
      'get',
      `/students?health_status=${status}&limit=200`,
    )
    for (const student of unsigned.items) {
      await manager.send(`post`, `/students/${student.id}/health-declaration`, {
        template_id: templateId,
        answers,
        signature_image_base64: SIGNATURE_PNG,
      })
      await completeAgreement(manager, student.id)
    }
  }
}

/**
 * The registration block and the club's terms — the two parts of `הסכם הרשמה` that are not
 * the health declaration.
 *
 * The ת.ז. values are computed to satisfy the check digit and belong to nobody: `app/core/
 * national_id.py` refuses a transposed pair, so a fixture cannot use a round number here.
 */
async function completeAgreement(manager: Api, studentId: string): Promise<void> {
  // The version is READ rather than duplicated as a constant here. The server refuses a
  // mismatch on purpose — accepting wording that is no longer published is how a consent
  // ledger comes to hold agreements nobody made — and a hard-coded 1 in this fixture would
  // turn the next legitimate bump of the club's terms into a fleet of red E2E runs whose
  // cause is a test file rather than the product.
  const status = await manager.send<{ club_terms_version: number }>(
    'get',
    `/students/${studentId}/agreement`,
  )
  await manager.send('put', `/students/${studentId}/agreement/registration`, {
    child: {
      national_id: '100000009',
      address: 'הרצל 12',
      city: 'נתניה',
      grade: 'ג',
    },
    signer: { national_id: '100000017' },
    other_parent: null,
    pickup_contacts: [],
  })
  await manager.send('post', `/students/${studentId}/agreement/club-terms`, {
    accepted: true,
    version: status.club_terms_version,
  })
}

/**
 * The same sweep for a spec that created its own unsigned child mid-test: E2E-1's
 * conversion puts a `trial_signed` student behind §6.1's gate — the spec asserts the gate
 * fired, then calls this and asserts the app opened.
 */
export async function signAllDeclarations(request: APIRequestContext): Promise<void> {
  await signOutstandingDeclarations(await asPersona(request, 'manager'))
}

/**
 * The second-tab POST: an order over exactly `chargeIds`, as the payer, returning the raw
 * status rather than throwing — E2E-3's double-payment test asserts the 409 itself.
 *
 * A tab that loaded before an order existed still offers the charges that order now
 * covers; its POST names them verbatim. The screen's own selection can no longer produce
 * that request (covered rows are unselectable since W6), which is exactly why the guard
 * under test is the server's and the test must address it directly.
 */
export async function tryOpenOrder(
  request: APIRequestContext,
  scenario: Scenario,
  chargeIds: string[],
): Promise<number> {
  const payer = await asPersona(request, scenario.parentPersona)
  const response = await request.post(`${API_ORIGIN}/api/v1/payment-orders?max_payments=1`, {
    headers: { Authorization: `Bearer ${payer.bearer}` },
    data: { charge_ids: chargeIds },
  })
  return response.status()
}

/**
 * §5.7's "הודיעו מראש", filed by the FAMILY rather than by a coach.
 *
 * §10.2 makes this the one write that requires a connection on purpose, and the parent app
 * says so rather than queuing into the void: an offline pre-report that syncs after the
 * class started is not a pre-report, which is why `AbsenceReportIn` deliberately carries no
 * `client_mark_id`.
 */
export async function reportAbsence(
  request: APIRequestContext,
  scenario: Scenario,
  sessionId: string,
  studentId: string,
  reason = 'חולה',
): Promise<void> {
  const parent = await asPersona(request, scenario.parentPersona)
  await parent.send('post', '/absence-reports', {
    student_id: studentId,
    session_id: sessionId,
    reason,
  })
}

/**
 * §5.7's `סמן הכל נוכח`, called as the coach.
 *
 * It 'never overwrites a parent's advance notice, whatever the request body says' — the
 * rule is `AttendanceService._bulk_touches`, and `respect_absence_reports` defaults to
 * protecting so a caller that omits it gets the safe branch.
 */
export async function bulkPresentAsCoach(
  request: APIRequestContext,
  sessionId: string,
): Promise<void> {
  const coach = await asPersona(request, 'lead')
  await coach.send('post', `/sessions/${sessionId}/attendance/bulk-present`, {
    client_mark_id_prefix: crypto.randomUUID(),
    device_marked_at: new Date().toISOString(),
  })
}

/** One charge, read as a manager — `allocated_agorot` is what §4.3 settles on. */
export async function readCharge(
  request: APIRequestContext,
  chargeId: string,
): Promise<{ id: string; status: string; amount_agorot: number; allocated_agorot: number }> {
  const manager = await asPersona(request, 'manager')
  return manager.send('get', `/charges/${chargeId}`)
}

/** `GET /sessions/{id}/attendance` — artboards `1c` and `9f`, and §3.2 gives it to every staff role. */
export async function readRoster(
  request: APIRequestContext,
  sessionId: string,
): Promise<{ session: SessionRow; roster: RosterEntry[] }> {
  const manager = await asPersona(request, 'manager')
  return manager.send('get', `/sessions/${sessionId}/attendance`)
}

/**
 * §5.6's three protections, each a different way to destroy history.
 *
 * They are built AFTER the schedule is applied rather than before, because two of the
 * three are edits to sessions the rules created and the third has to survive a later
 * regenerate — which is the property E2E-5 exists to check.
 */
async function buildProtections(
  manager: Api,
  groupId: string,
  trainingYearId: string,
  sessions: readonly { id: string; starts_at: string }[],
): Promise<Protections> {
  const now = Date.now()
  const past = sessions.filter((s) => Date.parse(s.starts_at) < now)
  const future = sessions.filter((s) => Date.parse(s.starts_at) > now)
  if (past.length === 0 || future.length === 0) {
    throw new Error(
      `the scenario needs sessions on both sides of today; got ${past.length} past ` +
        `and ${future.length} future. Check YEAR_STARTS and the X-Dev-Now on the schedule PUT.`,
    )
  }

  // **Past, and held.** A session that happened has attendance rows against it, and
  // regenerating it rewrites a register a coach already signed. Marking it is what makes
  // the protection mean something — an empty past session loses nothing.
  const held = past[past.length - 1]!
  await manager.send('post', `/sessions/${held.id}/attendance/bulk-present`, {
    client_mark_id_prefix: crypto.randomUUID(),
    device_marked_at: held.starts_at,
  })

  // **Manually edited.** Someone moved this one class deliberately, usually a room clash.
  // Times move as a pair — `SessionPatch` refuses a start without an end, because "the
  // class is an hour shorter now" is not something anyone typed.
  const moved = future[0]!
  const movedDay = moved.starts_at.slice(0, 10)
  await manager.send('patch', `/sessions/${moved.id}`, {
    starts_at: `${movedDay}T16:30:00Z`,
    ends_at: `${movedDay}T17:30:00Z`,
  })

  // **Ad hoc.** A one-off no rule created, so no rule may remove it. `is_ad_hoc` is not a
  // field a caller may set: every session created here is ad-hoc by construction.
  const extraDay = future[future.length - 1]!.starts_at.slice(0, 10)
  const adHoc = await manager.send<{ id: string }>('post', '/sessions', {
    group_id: groupId,
    training_year_id: trainingYearId,
    starts_at: `${extraDay}T11:00:00Z`,
    ends_at: `${extraDay}T12:00:00Z`,
  })

  return {
    pastSessionId: held.id,
    manuallyEditedSessionId: moved.id,
    adHocSessionId: adHoc.id,
  }
}
