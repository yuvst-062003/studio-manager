// Task 3a -- the three things a door differs by, injected rather than branched on inside
// `JoinWizard`. See that module's own header and the type doc below for why these three
// and nothing else.
import { apiFetch } from '@studio/core'
import type { HealthClient, TemplateSchema } from '../../health/healthClient'
import type { PlanOption } from '../familyDraft'
import { toWizardGroup, toWizardPlan } from './adapters'
import type { ApiGroup, RegisterPayload } from './adapters'
import type { RegisterResult } from './submitJoin'
import type { WizardGroup, WizardPlan } from './types'

export type WizardStudio = {
  studioName: string
  logoUrl: string | null
  groups: WizardGroup[]
}

export type WizardCatalogue = {
  plans: WizardPlan[]
  schema: TemplateSchema
  templateId: string
}

/** `OnboardingPricePlanOut` -- what BOTH price-plan endpoints actually return
 *  (`/public/onboarding/{token}/price-plans` for door B, `/public/studios/{slug}/price-plans`
 *  for doors C/D): snake_case on the wire. `PlanOption` (what `toWizardPlan` reads) is
 *  camelCase, so every `loadCatalogue` below maps through this one function rather than
 *  each repeating the field list -- reading the wire straight through as `PlanOption`, as
 *  `tokenSource.loadCatalogue` used to, hands `toWizardPlan` `undefined` for
 *  `monthlyAmountAgorot`/`sessionsPerWeek`, which is what rendered every price on door B's
 *  wizard as "NaN". */
type WirePricePlan = {
  id: string
  name: string
  monthly_amount_agorot: number
  sessions_per_week: number | null
}

function toPlanOption(item: WirePricePlan): PlanOption {
  return {
    id: item.id,
    name: item.name,
    monthlyAmountAgorot: item.monthly_amount_agorot,
    sessionsPerWeek: item.sessions_per_week,
  }
}

/** The three things a door differs by, and nothing else. Everything the wizard draws,
 *  validates, persists and submits is the same on all four doors -- §11's "one shell for
 *  all four doors" -- so what varies is injected here rather than branched on inside. */
export type JoinWizardSource = {
  /** The club: its name, its logo and its groups. Step 1 needs the first two and step 2
   *  needs the third. */
  loadStudio: () => Promise<WizardStudio>
  /** The price plans and the health form template -- what step 2's plan and health parts
   *  read. Its own call and its own failure, so a slow catalogue cannot take the
   *  agreements screen down with it. */
  loadCatalogue: () => Promise<WizardCatalogue>
  /** The one write. Rejects on failure. */
  register: (payload: RegisterPayload) => Promise<RegisterResult>
}

/** Door B (`/join/{token}`): a caller who belongs to no studio yet, so everything is
 *  resolved from the TOKEN. Lifted from `WizardJoinFlow` (task 2) unchanged -- same three
 *  request shapes, same failure handling, no behaviour change. */
export function tokenSource(token: string, healthClient: HealthClient): JoinWizardSource {
  return {
    async loadStudio() {
      const response = await apiFetch(`/api/v1/public/onboarding/${token}`)
      if (!response.ok) throw new Error(String(response.status))
      const info = (await response.json()) as {
        studio_name: string
        logo_url: string | null
        groups: ApiGroup[]
      }
      return {
        studioName: info.studio_name,
        logoUrl: info.logo_url ?? null,
        groups: (info.groups ?? []).map(toWizardGroup),
      }
    },

    async loadCatalogue() {
      const [plansResponse, template] = await Promise.all([
        apiFetch(`/api/v1/public/onboarding/${token}/price-plans`),
        healthClient.template(),
      ])
      if (!plansResponse.ok) throw new Error(String(plansResponse.status))
      // Accepts both `{items: [...]}` and a bare array, as today. Mapped through
      // `toPlanOption` because the wire is snake_case and `PlanOption` is camel -- see
      // that function's own doc for why (a fix, not part of the original lift: this used
      // to read the body straight through as `PlanOption`, which rendered every price on
      // this screen as "NaN").
      const body = (await plansResponse.json()) as { items?: WirePricePlan[] } | WirePricePlan[]
      const planList = Array.isArray(body) ? body : (body.items ?? [])
      return {
        plans: planList.map(toPlanOption).map(toWizardPlan),
        schema: template.schema as unknown as TemplateSchema,
        templateId: template.id,
      }
    },

    async register(payload) {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(String(response.status))
      return (await response.json()) as RegisterResult
    },
  }
}

/** Carries `detail.code` from a failed `studioSource.register`, so a caller can tell
 *  `national_id_invalid` from a generic failure -- the same distinction
 *  `SelfServeJoinFlow.submitRegistration` already reads off the same endpoint. A plain
 *  `Error` subclass, in this file, so this module adds no dependency for it. */
export class RegisterCodeError extends Error {
  readonly code: string | undefined
  constructor(code: string | undefined) {
    super(code ?? 'register_failed')
    this.code = code
  }
}

/** Doors C (`/?invite=<token>`) and D (`#/add-child`): a caller who ALREADY belongs
 *  here, so there is no token anywhere -- the studio comes from `GET /me/studio` and its
 *  groups and plans from that studio's own public reads, and the write is the no-token
 *  `POST /me/students/register`. */
export function studioSource(healthClient: HealthClient): JoinWizardSource {
  // The slug (and the name/logo that ride along on the same response) resolved once and
  // shared by both loads below -- a closure created fresh per `studioSource()` call, NOT a
  // module-level cache, which would survive a studio switch across two different calls to
  // this function. Lazy: the request only fires once something actually asks for it.
  let studioInfo: Promise<{ slug: string; name: string; logoUrl: string | null }> | null = null
  function loadStudioInfo() {
    if (!studioInfo) {
      studioInfo = (async () => {
        const response = await apiFetch('/api/v1/me/studio')
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as {
          slug: string
          name: string
          logo_url: string | null
        }
        return { slug: body.slug, name: body.name, logoUrl: body.logo_url ?? null }
      })()
    }
    return studioInfo
  }

  return {
    async loadStudio() {
      const { slug, name, logoUrl } = await loadStudioInfo()
      const response = await apiFetch(`/api/v1/public/studios/${slug}/groups`)
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as {
        items: {
          id: string
          name: string
          class_name?: string | null
          //: `PublicGroupOut`'s name for this field -- `OnboardingGroupOut` (door B, above)
          //: calls the same fact `weekdays`. Mapped here, at this one seam, rather than
          //: teaching `toWizardGroup` two names for one fact.
          training_weekdays: number[]
          training_durations_min?: number[]
          coaches?: string[]
          locations?: string[]
        }[]
      }
      const groups: ApiGroup[] = body.items.map((item) => ({
        id: item.id,
        name: item.name,
        class_name: item.class_name,
        weekdays: item.training_weekdays,
        training_durations_min: item.training_durations_min,
        coaches: item.coaches,
        locations: item.locations,
      }))
      return {
        studioName: name,
        // `StudioOut.logo_url` (what `/me/studio` -- read above, in `loadStudioInfo` --
        // actually returns) resolves to `/api/v1/studio/logo`, the TENANT-SCOPED read
        // `GET /studio/logo` requires (`app/routers/studio.py`), gated on the caller's
        // bearer token. Step 1 and the shell header render this through a plain
        // `<img src>`, which never attaches that token, so pointing it at that path
        // 401s and shows a broken image -- caught by actually loading the page, not by
        // a mocked-fetch test asserting the `src` attribute alone. So `logo_url` here is
        // read only as the boolean fact "this studio has a logo"; the real URL is
        // rebuilt from `slug` against the UNAUTHENTICATED `GET /public/studios/{slug}/logo`
        // door B already uses, and which the server itself builds the same way in
        // `app/routers/public.py`/`app/routers/onboarding.py`. Null stays null.
        logoUrl: logoUrl ? `/api/v1/public/studios/${slug}/logo` : null,
        groups: groups.map(toWizardGroup),
      }
    },

    async loadCatalogue() {
      const { slug } = await loadStudioInfo()
      const [plansResponse, template] = await Promise.all([
        apiFetch(`/api/v1/public/studios/${slug}/price-plans`),
        healthClient.template(),
      ])
      if (!plansResponse.ok) throw new Error(String(plansResponse.status))
      const body = (await plansResponse.json()) as { items: WirePricePlan[] }
      // Same wire shape and same `toPlanOption` mapping as `tokenSource.loadCatalogue`
      // above -- one function, so the two sources cannot drift apart on this seam again.
      return {
        plans: body.items.map(toPlanOption).map(toWizardPlan),
        schema: template.schema as unknown as TemplateSchema,
        templateId: template.id,
      }
    },

    async register(payload) {
      // `OnboardingSelfRegisterIn` reuses `OnboardingChildIn` for `children` -- exactly
      // `RegisterPayload.children`'s shape -- but carries no signer: this caller's signer
      // is read off the session (`TenantSessionDep`), not off the request body. The
      // signer half of `RegisterPayload` has no place here and is dropped.
      const response = await apiFetch('/api/v1/me/students/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          club_terms_accepted: payload.club_terms_accepted,
          children: payload.children,
        }),
      })
      if (!response.ok) {
        let code: string | undefined
        try {
          code = ((await response.json()) as { detail?: { code?: string } }).detail?.code
        } catch {
          code = undefined
        }
        throw new RegisterCodeError(code)
      }
      return (await response.json()) as RegisterResult
    },
  }
}
