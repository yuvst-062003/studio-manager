// The four reads entrance A's conversion needs, and the one thing that decides them.
//
// Every read here resolves off the club's own slug (`GET /me/studio`) rather than a join
// token: this family is already signed in and belongs to the studio, so there is no token to
// resolve one from. That is the same door `wizardSources.studioSource` uses for the wizard's
// C and D, and the price-plan route's own docstring already names "Door A's trial-to-member
// fork" as a caller it was built for.
//
// **A failed read is an empty list, never a thrown screen** — except the declaration, which
// distinguishes "nothing stored" from "could not read". A club whose groups failed to load
// must still show the family something with a retry on it; a declaration that failed to load
// must not be silently drawn as "you answered nothing", which would invite a signature on an
// empty document.
import { apiFetch } from '@studio/core'
import { toWizardPlan } from '../../onboarding/wizard/adapters'
import type { WizardPlan } from '../../onboarding/wizard/types'
import type { AnswerValue } from '../../health/healthClient'

export type JoinGroupOption = {
  id: string
  name: string
  training_weekdays: number[]
  age_min?: number | null
  age_max?: number | null
  /** `base` / `extra` / `private` — `GROUP_KINDS`. Optional because an older served bundle
   *  predates the field; absent reads as `base`, which is the column's own default and the
   *  safe direction (a club that classified nothing keeps every group offered). */
  kind?: string
}

/** What the family answered on the booking form. `template_id` travels so the signature is
 *  filed against the SAME template those answers were given on. */
export type StoredTrialDeclaration = {
  templateId: string | null
  answers: Record<string, AnswerValue>
  declaredBy: string | null
  declaredAt: string | null
}

type WirePricePlan = {
  id: string
  name: string
  monthly_amount_agorot: number
  sessions_per_week: number | null
}

async function studioSlug(): Promise<string | null> {
  try {
    const response = await apiFetch('/api/v1/me/studio')
    if (!response.ok) return null
    return ((await response.json()) as { slug: string }).slug
  } catch {
    return null
  }
}

export async function loadJoinCatalogue(): Promise<{
  groups: JoinGroupOption[]
  plans: WizardPlan[]
  /** False when the club could not be resolved or its groups could not be read — the
   *  difference between "this club publishes no groups" and "we could not ask". */
  ok: boolean
}> {
  const slug = await studioSlug()
  if (!slug) return { groups: [], plans: [], ok: false }
  const [groups, plans] = await Promise.all([
    apiFetch(`/api/v1/public/studios/${slug}/groups`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: JoinGroupOption[] }).items : null,
      )
      .catch(() => null),
    apiFetch(`/api/v1/public/studios/${slug}/price-plans`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items: WirePricePlan[] }).items : [],
      )
      .catch(() => [] as WirePricePlan[]),
  ])
  return {
    groups: groups ?? [],
    // `toWizardPlan` and not a second mapping of the same four fields: reading the wire
    // straight through is what rendered every price on door B's wizard as "NaN", and one
    // copy of that seam is the fix that stuck.
    plans: (plans ?? []).map((plan) =>
      toWizardPlan({
        id: plan.id,
        name: plan.name,
        monthlyAmountAgorot: plan.monthly_amount_agorot,
        sessionsPerWeek: plan.sessions_per_week,
      }),
    ),
    ok: groups !== null,
  }
}

/** `GET /me/students/{id}/trial-declaration`. `null` is "could not read"; a declaration with
 *  no answers is "nothing was stored", which is a real state — a child a manager put on a
 *  trial by hand has no booking form behind them. */
export async function loadTrialDeclaration(
  studentId: string,
): Promise<StoredTrialDeclaration | null> {
  try {
    const response = await apiFetch(`/api/v1/me/students/${studentId}/trial-declaration`)
    if (!response.ok) return null
    const body = (await response.json()) as {
      template_id: string | null
      answers: Record<string, AnswerValue>
      declared_by: string | null
      declared_at: string | null
    }
    return {
      templateId: body.template_id ?? null,
      answers: body.answers ?? {},
      declaredBy: body.declared_by ?? null,
      declaredAt: body.declared_at ?? null,
    }
  } catch {
    return null
  }
}
