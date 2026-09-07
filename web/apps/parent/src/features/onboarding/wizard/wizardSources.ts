// Task 3a -- the three things a door differs by, injected rather than branched on inside
// `JoinWizard`. See that module's own header and the type doc below for why these three
// and nothing else.
import { apiFetch, apiUrl } from '@studio/core'
import type { HealthClient, TemplateSchema } from '../../health/healthClient'
import type { PlanOption } from '../familyDraft'
import { toWizardGroup, toWizardPlan } from './adapters'
import type { ApiGroup, RegisterPayload } from './adapters'
import type { RegisterResult } from './submitJoin'
import type { WizardBelt, WizardGroup, WizardPlan } from './types'

export type WizardStudio = {
  studioName: string
  logoUrl: string | null
  groups: WizardGroup[]
  /** `OnboardingInfoOut.club_terms_version` -- live off the server's own
   *  `CLUB_TERMS_VERSION`, so step 1 can show the family which version they are agreeing
   *  to (gap 2). `null` when the door has no such number to show: `studioSource` below
   *  (doors C/D) reads `/me/studio`, which carries no version at all, and inventing one
   *  would be worse than showing none. */
  clubTermsVersion: number | null
  /** Bug #10 — the club's own belt ladder, for the picker in part 1 of the student form.
   *  Empty for a club that has not built one, and for any door whose slug could not be
   *  resolved; the picker hides itself rather than offering eight belts the club does not
   *  award, which is exactly what it did before. */
  belts: WizardBelt[]
  /** Task 10 item 3 -- the club's own slug, for step 2's "try a trial lesson first"
   *  link (`/t/{slug}`). `tokenSource` (door B) already has it on the join-link read
   *  (`OnboardingInfoOut.slug`); `studioSource` (doors C/D) already reads it off
   *  `/me/studio` for its own groups call and now threads the same value through here
   *  instead of discarding it. `null` only if a source genuinely has none to offer. */
  slug: string | null
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

/** Bug #10 — `GET /public/studios/{slug}/belt-ranks`, for whichever door has a slug.
 *
 *  Shared by both sources for the reason `toPlanOption` below is: two copies of one seam is
 *  how door B and doors C/D drifted apart on the price-plan shape and rendered `NaN`.
 *
 *  **A failure is an empty ladder, never a thrown wizard.** The belt is an optional field
 *  on an optional line of the form; a club whose ranks could not be read must still be able
 *  to take a registration, so this resolves to `[]` and the picker disappears. */
async function loadBelts(slug: string | null): Promise<WizardBelt[]> {
  if (!slug) return []
  try {
    const response = await apiFetch(`/api/v1/public/studios/${slug}/belt-ranks`)
    if (!response.ok) return []
    const body = (await response.json()) as { items: { id: string; name: string }[] }
    return body.items.map((item) => ({ id: item.id, name: item.name }))
  } catch {
    return []
  }
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
  /** Task 10 item 4 -- `GET /me/students/duplicate-check`, re-wired into the new
   *  wizard's student form save. `undefined` on door B (`tokenSource`): that caller has
   *  no session for a `/me/*` read, since a token-only visitor belongs to no studio yet.
   *  Doors C and D (`studioSource`) already have the session this needs. Never throws --
   *  a failed check must not block a registration, so the caller reads a plain `boolean`
   *  and a failure resolves `false` (silent) rather than rejecting. */
  checkDuplicate?: (firstName: string, lastName: string, birthDate: string) => Promise<boolean>
}

/** Carries `detail.code` from a failed `register` -- either door's -- so a caller can
 *  tell `national_id_invalid` from a generic failure -- the same distinction
 *  `SelfServeJoinFlow.submitRegistration` already reads off the same endpoint. A plain
 *  `Error` subclass, in this file, so this module adds no dependency for it. Gap 1: this
 *  used to be `studioSource`'s alone, leaving door B's `tokenSource.register` throwing a
 *  bare `Error` that discarded the code entirely -- a family who mistyped a ת.ז. saw only
 *  "something went wrong". One error type for both doors closes that. */
export class RegisterCodeError extends Error {
  readonly code: string | undefined
  constructor(code: string | undefined) {
    super(code ?? 'register_failed')
    this.code = code
  }
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
        //: Optional for the same reason `logo_url` is: an older cached response (or a
        //: test fixture) predating this field must read as "no version", not crash.
        club_terms_version?: number
        //: `OnboardingInfoOut.slug` -- always present on the real endpoint; optional
        //: here so an older cached response or a test fixture predating this field
        //: reads as "no slug", not a crash.
        slug?: string
      }
      return {
        studioName: info.studio_name,
        //: `logo_url` is an API PATH, not a public URL. On split origins -- which every
        //: deployed environment is -- the browser resolves a relative path against THIS
        //: app's host and 404s, so the wizard header rendered a broken image.
        //: `PublicLanding` learned this on 2026-08-30 and wraps its own logo in `apiUrl`;
        //: the wizard's two sources never got the same fix (owner-reported 2026-09-07).
        logoUrl: info.logo_url ? apiUrl(info.logo_url) : null,
        groups: (info.groups ?? []).map(toWizardGroup),
        clubTermsVersion: info.club_terms_version ?? null,
        belts: await loadBelts(info.slug ?? null),
        slug: info.slug ?? null,
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
        //: Absolute for the same reason as `tokenSource`'s above: this is an API path,
        //: and on a split origin a relative one resolves against the PWA's host.
        logoUrl: logoUrl ? apiUrl(`/api/v1/public/studios/${slug}/logo`) : null,
        groups: groups.map(toWizardGroup),
        // Gap 2: `/me/studio` carries no `club_terms_version` at all -- this door has no
        // number to show, and inventing one (a frontend constant, or the WRITE's default)
        // would be worse than showing none. `null` is the honest answer; the WRITE itself
        // is unaffected either way, since the server stamps its own constant regardless
        // of what this screen displays.
        clubTermsVersion: null,
        belts: await loadBelts(slug),
        // Item 3 -- the same `slug` this call already read to build the groups URL,
        // threaded through instead of discarded. Step 2 uses it for the "try a trial
        // lesson first" link.
        slug,
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

    // Item 4 -- `GET /api/v1/me/students/duplicate-check` (`app/routers/students.py`).
    // Doors C/D only: this caller already holds the `/me/*` session the read needs,
    // unlike door B's `tokenSource`, which has none and never gets this method at all.
    // **Never refuses, never throws.** A parent may genuinely have two children with
    // similar names, and the club's own record may be the wrong one -- so this warns and
    // nothing more. A non-OK response or a network failure answers `false` (silent)
    // rather than rejecting: the endpoint being down must not stop a registration over a
    // check that only ever warns.
    async checkDuplicate(firstName, lastName, birthDate) {
      try {
        const params = new URLSearchParams({ first_name: firstName, last_name: lastName })
        if (birthDate) params.set('birthdate', birthDate)
        const response = await apiFetch(`/api/v1/me/students/duplicate-check?${params.toString()}`)
        if (!response.ok) return false
        const body = (await response.json()) as { duplicate: boolean }
        return body.duplicate
      } catch {
        return false
      }
    },
  }
}
