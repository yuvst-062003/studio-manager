// The parent app's health endpoints, in one file. A screen with a fetch in it is a screen a
// test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client) — SPEC §8.2 regenerates it from
// openapi.json and fails CI on a stale copy, so a hand-written shape here would be a second
// definition nothing keeps in step.
//
// **G7 applies to this file.** Nothing here logs, and `submit` is the only call that carries a
// child's answers. It posts them once and never keeps a copy: the form owns the draft state.
import type { components } from '@studio/api-client'

export type HealthDeclarationOut = components['schemas']['HealthDeclarationOut']
export type HealthFormTemplateOut = components['schemas']['HealthFormTemplateOut']
export type HealthStatus = components['schemas']['StudentSummaryOut']['health_status']
export type AgreementStatusOut = components['schemas']['AgreementStatusOut']
export type RegistrationIn = components['schemas']['RegistrationIn']
export type PickupContactIn = components['schemas']['PickupContactIn']
export type RegistrationDefaultsOut = components['schemas']['RegistrationDefaultsOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

/**
 * One question, as the template describes it. Mirrors `health_form_template.schema`, which is
 * JSONB and therefore has no generated type — the OpenAPI shape says `dict[str, Any]`.
 *
 * **12c finding 4, answered:** `label` is the manager's own wording, not a translation key. The
 * questions are manager-editable rows (D11), so they are *data* — a studio that reworded them
 * into Russian has a Russian questionnaire, and a translation layer would silently overwrite it.
 * Only the answers are copy.
 */
export type TemplateQuestion = {
  id: string
  /**
   * `clause` is template v2's addition and is not a fourth input type — it is the club's own
   * declaration sentence, and WHICH sentence is derived from the answers above it (see
   * `clauses.ts`). The parent confirms the one that follows rather than choosing between two,
   * because letting a family pick would let them declare "no medical limitations of any kind"
   * on the same form where they answered yes to asthma.
   */
  type: 'boolean' | 'text' | 'phone' | 'clause'
  label: string
  required?: boolean
  /** §5.5 — this question's answer becomes a `derived_flag`, and a coach sees the boolean. */
  flag?: boolean
  /** Progressive disclosure: shown only while every named answer matches. */
  visible_if?: Record<string, unknown>
}

export type TemplateSection = {
  id: string
  title?: string
  questions: TemplateQuestion[]
}

export type TemplateSchema = {
  title?: string
  version?: number
  sections: TemplateSection[]
}

export type AnswerValue = boolean | string | null

/** §5.5's three question types, plus the third answer state 12c finding 5 says must exist. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  return value !== undefined && value !== null && value !== ''
}

/**
 * Whether a question is on screen, given what has been answered so far.
 *
 * §5.5's progressive disclosure and 12c's mechanism: "a yes reveals a detail field; a no does
 * not. That is what makes structured answers work — the flag comes from the boolean, the detail
 * from the text, and only the boolean ever reaches a coach."
 */
export function isVisible(
  question: TemplateQuestion,
  answers: Readonly<Record<string, AnswerValue>>,
): boolean {
  if (!question.visible_if) return true
  return Object.entries(question.visible_if).every(([key, value]) => answers[key] === value)
}

/**
 * The questions that must be answered before the form may be submitted.
 *
 * **A flag question is required whether or not it says so**, matching the server
 * (`app/services/health/declarations.py`). §5.5 gives a coach a ⚠ derived from these and nothing
 * else, so an unanswered one is a warning that silently is not one — and an unanswered flag
 * deriving to `false` reads as "no asthma" rather than "nobody asked".
 */
export function unansweredRequired(
  schema: TemplateSchema,
  answers: Readonly<Record<string, AnswerValue>>,
): string[] {
  const missing: string[] = []
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (!isVisible(question, answers)) continue
      if (question.required !== true && question.flag !== true) continue
      if (!isAnswered(answers[question.id])) missing.push(question.id)
    }
  }
  return missing
}

export function makeHealthClient(fetcher: Fetcher) {
  return {
    /**
     * The `full` template a parent signs against. `kind=full` and never the trial one: conflict
     * C3 gives the trial form to M3's booking funnel, and a parent-app gate satisfied by a
     * two-minute trial declaration is not §5.5's gate.
     */
    template: (): Promise<HealthFormTemplateOut> =>
      fetcher('/api/v1/health-templates?kind=full')
        .then(json<{ items: { id: string; version: number }[] }>)
        .then((list) => {
          // **The highest version, never `items[0]`.** A studio holds every version it has
          // ever published — v1 from the bundled questionnaire, v2 from the club's own form —
          // and taking the first row handed a parent a SUPERSEDED template to sign. The gate
          // counts a declaration only when its version is the current one, so that signature
          // satisfied nothing and step 2 asked again forever, with no error to explain it.
          //
          // The list is ordered server-side now and the server refuses a superseded template
          // outright. This is the third guard, and it is the cheapest: whichever order the
          // rows arrive in, the client picks the newest.
          const current = list.items.reduce<{ id: string; version: number } | null>(
            (best, item) => (best === null || item.version > best.version ? item : best),
            null,
          )
          if (!current) throw new Error('no full health template in this studio')
          return fetcher(`/api/v1/health-templates/${current.id}`).then(json<HealthFormTemplateOut>)
        }),

    declaration: (studentId: string): Promise<HealthDeclarationOut | null> =>
      fetcher(`/api/v1/students/${studentId}/health-declaration`).then((response) =>
        response.status === 404 ? null : json<HealthDeclarationOut>(response),
      ),

    /**
     * §5.5's submit. The signature is a base64 PNG from the pad's canvas.
     *
     * The response is the **coach-safe** shape — flags, no answers — even though this caller
     * just typed them. There is no screen that needs them echoed back, and a shape that returned
     * them would be a shape one reuse away from a roster.
     */
    submit: (
      studentId: string,
      body: {
        template_id: string
        answers: Record<string, unknown>
        signature_image_base64: string
      },
    ): Promise<HealthDeclarationOut> =>
      fetcher(`/api/v1/students/${studentId}/health-declaration`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }).then(json<HealthDeclarationOut>),

    /** §5.5 — 'downloadable by the guardian'. Served through the API, never a bucket URL. */
    pdfUrl: (studentId: string): string => `/api/v1/students/${studentId}/health-declaration/pdf`,

    /**
     * The three gate conditions, computed server-side.
     *
     * **Never re-derived here.** A gate whose condition is spelled out at two call sites is a
     * gate that will eventually disagree with itself, and both failure modes are bad: a family
     * locked out of an app they have finished with, or one walking past a signature the club
     * needs.
     */
    agreementStatus: (studentId: string): Promise<AgreementStatusOut> =>
      fetcher(`/api/v1/students/${studentId}/agreement`).then(json<AgreementStatusOut>),

    /** `טופס הרשמה` blocks 1-4. Idempotent — the form shows what is stored and replaces it. */
    saveRegistration: (studentId: string, body: RegistrationIn): Promise<AgreementStatusOut> =>
      fetcher(`/api/v1/students/${studentId}/agreement/registration`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }).then(json<AgreementStatusOut>),

    /**
     * Step 3. `version` is the one this client RENDERED, echoed back — the server refuses a
     * mismatch, because recording today's wording for a screen that showed last month's is how
     * a consent ledger comes to hold agreements nobody made.
     */
    acceptClubTerms: (studentId: string, version: number): Promise<AgreementStatusOut> =>
      fetcher(`/api/v1/students/${studentId}/agreement/club-terms`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ accepted: true, version }),
      }).then(json<AgreementStatusOut>),
  }
}

export type HealthClient = ReturnType<typeof makeHealthClient>

/** Door A (wave E, `/t/<slug>`) — anonymous, or signed in with no membership yet, either
 *  way with no `TenantSession` `GET /health-templates` can resolve. §2 decision 7: "one
 *  health form for everybody... asked through the popup, here as everywhere," so this
 *  door needs the SAME schema every other door signs against, read through the
 *  unauthenticated `GET /public/studios/{slug}/health-template` instead
 *  (`app/routers/public.py`) -- one request, no list-then-fetch-highest-version dance,
 *  because the server already resolves "the current published full template" itself.
 *
 *  Only `template()` is populated: `JoinHealthStep`/`SubjectHealthFlow` -- the one
 *  caller this feeds -- never calls anything else on a `HealthClient` (no
 *  `client.submit()`; B2's deferred model flushes health through the door's own write,
 *  `POST /trial-bookings/self`'s `trial_health_declarations`). The cast is deliberate
 *  rather than a stub for every other method: a stub that silently resolved would be a
 *  correctness bug waiting for a future caller, and a stub that threw would be
 *  indistinguishable from a real one crashing.
 */
export function makePublicHealthClient(fetcher: Fetcher, slug: string): HealthClient {
  return {
    template: (): Promise<HealthFormTemplateOut> =>
      fetcher(`/api/v1/public/studios/${slug}/health-template`).then(json<HealthFormTemplateOut>),
  } as unknown as HealthClient
}
