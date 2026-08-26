// The parent app's health endpoints, in one file. A screen with a fetch in it is a screen a
// test has to stand up a server for.
//
// Types come from the generated client (@studio/api-client) — SPEC §8.2 regenerates it from
// openapi.json and fails CI on a stale copy, so a hand-written shape here would be a second
// definition nothing keeps in step.
//
// **G7 applies to this file.** Nothing here logs, and `submit` is the only call that carries a
// child's answers. It posts them once and never keeps a copy: the form owns the draft state.
import type { components } from "@studio/api-client";

export type HealthDeclarationOut =
  components["schemas"]["HealthDeclarationOut"];
export type HealthFormTemplateOut =
  components["schemas"]["HealthFormTemplateOut"];
export type HealthStatus =
  components["schemas"]["StudentSummaryOut"]["health_status"];

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json" };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`);
  return (await response.json()) as T;
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
  id: string;
  type: "boolean" | "text" | "phone";
  label: string;
  required?: boolean;
  /** §5.5 — this question's answer becomes a `derived_flag`, and a coach sees the boolean. */
  flag?: boolean;
  /** Progressive disclosure: shown only while every named answer matches. */
  visible_if?: Record<string, unknown>;
};

export type TemplateSection = {
  id: string;
  title?: string;
  questions: TemplateQuestion[];
};

export type TemplateSchema = {
  title?: string;
  version?: number;
  /** D11's marker. `true` while the studio is still showing the questions the app ships with. */
  is_bundled_default?: boolean;
  sections: TemplateSection[];
};

export type AnswerValue = boolean | string | null;

/** §5.5's three question types, plus the third answer state 12c finding 5 says must exist. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  return value !== undefined && value !== null && value !== "";
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
  if (!question.visible_if) return true;
  return Object.entries(question.visible_if).every(
    ([key, value]) => answers[key] === value,
  );
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
  const missing: string[] = [];
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (!isVisible(question, answers)) continue;
      if (question.required !== true && question.flag !== true) continue;
      if (!isAnswered(answers[question.id])) missing.push(question.id);
    }
  }
  return missing;
}

export function makeHealthClient(fetcher: Fetcher) {
  return {
    /**
     * The `full` template a parent signs against. `kind=full` and never the trial one: conflict
     * C3 gives the trial form to M3's booking funnel, and a parent-app gate satisfied by a
     * two-minute trial declaration is not §5.5's gate.
     */
    template: (): Promise<HealthFormTemplateOut> =>
      fetcher("/api/v1/health-templates?kind=full")
        .then(json<{ items: { id: string }[] }>)
        .then((list) => {
          const first = list.items[0];
          if (!first) throw new Error("no full health template in this studio");
          return fetcher(`/api/v1/health-templates/${first.id}`).then(
            json<HealthFormTemplateOut>,
          );
        }),

    declaration: (studentId: string): Promise<HealthDeclarationOut | null> =>
      fetcher(`/api/v1/students/${studentId}/health-declaration`).then(
        (response) =>
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
        template_id: string;
        answers: Record<string, unknown>;
        signature_image_base64: string;
      },
    ): Promise<HealthDeclarationOut> =>
      fetcher(`/api/v1/students/${studentId}/health-declaration`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }).then(json<HealthDeclarationOut>),

    /** §5.5 — 'downloadable by the guardian'. Served through the API, never a bucket URL. */
    pdfUrl: (studentId: string): string =>
      `/api/v1/students/${studentId}/health-declaration/pdf`,
  };
}

export type HealthClient = ReturnType<typeof makeHealthClient>;
