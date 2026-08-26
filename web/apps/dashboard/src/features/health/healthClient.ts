// The manager dashboard's health endpoints, in one file. A screen with a fetch in it is a screen
// a test has to stand up a server for.
//
// **What this client deliberately cannot do.** There is no call here that returns a child's
// answers. Artboard 4e is the compliance view — "no medical content appears on it, only whether a
// document exists, who owes it, and how to ask" — so the full record is reached by opening the
// PDF, which is a navigation and not a fetch, and which the server audit-logs (§11.2).
import type { components } from "@studio/api-client";

export type HealthStatusSummaryOut =
  components["schemas"]["HealthStatusSummaryOut"];
export type HealthFormTemplateOut =
  components["schemas"]["HealthFormTemplateOut"];
export type HealthTemplatePublishedOut =
  components["schemas"]["HealthTemplatePublishedOut"];

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

const JSON_HEADERS = { "Content-Type": "application/json" };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`);
  return (await response.json()) as T;
}

/** Mirrors `health_form_template.schema`, which is JSONB and so has no generated type. */
export type EditableQuestion = {
  id: string;
  type: "boolean" | "text" | "phone";
  label: string;
  required?: boolean;
  flag?: boolean;
  visible_if?: Record<string, unknown>;
};

export type EditableSection = {
  id: string;
  title?: string;
  questions: EditableQuestion[];
};

export type EditableSchema = {
  title?: string;
  version?: number;
  /** D11's marker — `true` while the studio is still showing the questions the app ships with. */
  is_bundled_default?: boolean;
  sections: EditableSection[];
};

/**
 * 4e's four filter chips. `expiring` is deliberately absent.
 *
 * **4e finding 2, refused.** The artboard draws a "פג בקרוב" chip and a validity column, and §5.5
 * says declarations do not expire — `valid_until` is `NULL` and the studio setting turns on
 * *renewal reminders*, not an expiry the row records. Shipping the chip would be the ninth
 * artboard-driven contradiction of one spec line. A studio that wants renewal gets the worker's
 * reminders (`app/workers/health_reminders.py`), not a red row here.
 */
export type DocumentFilter = "all" | "missing" | "trial_signed" | "signed";

export function makeHealthClient(fetcher: Fetcher) {
  return {
    /** 4e's table. Names, statuses and when the parent was last chased — never a flag. */
    summary: (
      filter: DocumentFilter = "all",
    ): Promise<HealthStatusSummaryOut[]> =>
      fetcher(
        filter === "all"
          ? "/api/v1/health-declarations/summary"
          : `/api/v1/health-declarations/summary?status=${filter}`,
      ).then(json<HealthStatusSummaryOut[]>),

    /** §5.5's one-tap `שלח תזכורת להורה`, from the manager's side of the same action. */
    remind: (studentId: string): Promise<{ last_reminder_sent_at: string }> =>
      fetcher(`/api/v1/students/${studentId}/health-declaration/reminder`, {
        method: "POST",
      }).then(json<{ last_reminder_sent_at: string }>),

    templates: (): Promise<{
      items: { id: string; kind: string; version: number }[];
    }> =>
      fetcher("/api/v1/health-templates?kind=full").then(
        json<{ items: { id: string; kind: string; version: number }[] }>,
      ),

    template: (id: string): Promise<HealthFormTemplateOut> =>
      fetcher(`/api/v1/health-templates/${id}`).then(
        json<HealthFormTemplateOut>,
      ),

    /** D11's edit. Saves a DRAFT — nothing a parent signs moves until `publish`. */
    saveDraft: (
      id: string,
      schema: EditableSchema,
    ): Promise<HealthFormTemplateOut> =>
      fetcher(`/api/v1/health-templates/${id}`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ schema }),
      }).then(json<HealthFormTemplateOut>),

    publish: (id: string): Promise<HealthTemplatePublishedOut> =>
      fetcher(`/api/v1/health-templates/${id}/publish`, {
        method: "POST",
      }).then(json<HealthTemplatePublishedOut>),

    /** §11.2 — opening this is a full read and the server logs it. `documents.viewFullNotice`
     * warns the manager before they do, which 4e finding 1 says must be built. */
    pdfUrl: (studentId: string): string =>
      `/api/v1/students/${studentId}/health-declaration/pdf`,
  };
}

export type DashboardHealthClient = ReturnType<typeof makeHealthClient>;
