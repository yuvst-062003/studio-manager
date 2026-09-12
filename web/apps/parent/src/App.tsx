// §6.1's parent first launch, in its stated order:
//
//   1 שפה (BEFORE login) → 2 welcome → 3 resolve → 4 studio picker
//   → 5 אישורים + 6 הצהרת בריאות (BLOCKING, M4's) → 7-9 prompted once → home
//
// The install gate sits in front of all of it. §6.5: on iOS, Web Push exists only for a
// home-screen web app, "so an iPhone parent who never installs receives no push at all —
// and §5.11 permits no email or SMS fallback, so that parent is reachable only by
// telephone."
import { useEffect, useMemo, useState } from 'react'
import {
  apiFetch,
  apiUrl,
  getAccessToken,
  refresh,
  useDisplayMode,
  useScrollMemory,
  useSession,
  switchStudio,
} from '@studio/core'
import {
  AccessibilityMenu,
  InstallBanner,
  InstallWalkthrough,
  LanguageButton,
  LanguagePicker,
  SignIn,
  ThemeProvider,
  UpdateToast,
  useDocumentLocale,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ParentShell } from './features/shell/ParentShell'
import type { ParentTab } from './features/shell/ParentTabBar'
import { AccessGate } from './features/identity/AccessGate'
import type { InvitedStudent } from './features/identity/AccessGate'
import { Resolve } from './features/identity/Resolve'
// `12a` — the absence pre-report (P1). Every layer of this feature existed except a line
// of routing, so nothing in the product could produce an absence report — the state the
// staff roster, the dashboard count and `הודעתם מראש` are all built to read.
import { registerAttendanceSections } from './features/attendance'
import { useToday } from './features/schedule/useToday'
import {
  LegalPage,
  PublicLanding,
  TrialBookingPage,
  landingHostsFrom,
  landingSlugFor,
  landingViewHref,
  makeLandingClient,
} from './features/landing'
import type { LandingClient, LandingRoute } from './features/landing'
import { matchJoinPath } from './features/onboarding/joinPath'
// The redesigned wizard (spec 2026-09-05). It replaced `JoinFlow`'s four screens for all
// three doors that route through here (B, C, D) -- door A's own trial booking
// (`BookingFlow.tsx`) is unrelated and still runs its own flow. `JoinFlow.tsx` itself is
// gone (task 7); only `matchJoinPath` above survived it, moved to `joinPath.ts`.
import { JoinWizard } from './features/onboarding/wizard/JoinWizard'
//: §5.5's gate seeds the wizard with the family's existing children rather than opening
//: it blank -- see `gateSeed` below.
import { emptyStudent, isGradeKey } from './features/onboarding/wizard/types'
import type { StudentDraft } from './features/onboarding/wizard/types'
import { studioSource, tokenSource } from './features/onboarding/wizard/wizardSources'
// Task 3b -- doors C and D read the same `/me/onboarding-status` this decides between,
// and translate its answer into the wizard's own step numbering.
import { startingStep, wizardStepFor } from './features/onboarding/doorSteps'
import type { OnboardingStatus } from './features/onboarding/doorSteps'
// §2 decision 3 -- "cleared ... on sign-out": a stale draft (children's national ids,
// health answers) must not survive into whoever signs in on this device next.
import { clearAllJoinDrafts } from './features/onboarding/joinDraftStorage'
import {
  EventInviteScreen,
  ParentEventsScreen,
  makeParentEventsClient,
} from './features/events'
import { BeltProgressScreen, makeParentBeltsClient, registerBeltSections } from './features/belts'
// The judo technique library — the first screen in this app that belongs to the CHILD
// rather than to the parent (its design's §1). Built unmounted while the shell was being
// rewritten in parallel, and wired here by the merge of the two.
import { TechniqueDetail, TechniquesScreen, matchTechniquesPath } from './features/techniques'
import { BeltRouteResolver } from './features/belts/BeltRouteResolver'
import { makeParentCommsClient } from './features/comms'
import { UpdatesScreen } from './features/comms/redesign/UpdatesScreen'
import { JoinClubSection, makePeopleClient, registerPeopleSections } from './features/people'
import { ProfileScreen } from './features/people/redesign/ProfileScreen'
// `2c` behind `#/student/<id>` — the composite card the slot system was built for (P2).
import { TraineeCardSection } from './features/people/redesign/TraineeCardSection'
import { registerBillingSections } from './features/billing/StudentCardBillingSection'
import { DirectionsScreen } from './features/people/DirectionsScreen'
// `12f` behind the hash the payments tab links to, and §5.10's return leg (P1).
import { PaymentHistorySection } from './features/billing/PaymentHistorySection'
import { PaymentCompleteSection } from './features/billing/PaymentCompleteSection'
// The training-plan screen, per child. `#/plan/<studentId>` for the same reason `#/belts/`
// carries ids: a family with two children has two plans and two upgrade decisions, and a
// screen that summed them could not mark anything — a booking names a student.
import { PlanSection } from './features/billing/redesign/PlanSection'
// §6.1's plan step — 300 / 400 / 550 and how the money moves, asked once, right after the
// health declaration. Every piece of it existed behind `#/plan/<studentId>` and nothing in
// the first-run sequence reached it, so a family finished signup with no plan at all.
import type { MandateLink } from './features/billing/billingClient'
import { makeParentBillingClient } from './features/billing/billingClient'
import { ClubShop } from './features/billing/redesign/ClubShop'
import { ParentPayments } from './features/billing/redesign/ParentPayments'
// §6.1 step 6 — the BLOCKING declaration. Mounted here because nothing imported it
// (HB-w6-health-gate-unmounted): the gate, the form and the pad were built and tested in
// W3 and a guardian with an unsigned declaration still reached home.
import { HealthGate, firstStudentNeedingDeclaration, makeHealthClient, registerHealthSections } from './features/health'
import type { GatedStudent } from './features/health'
// §6.1 step 5 — the OTHER blocking gate, and the one that had never been built.
// SPEC:1314 puts `5  אישורים  →  terms of service + privacy policy` in the BLOCKING band
// and SPEC:1327 says steps 5 and 6 are the only hard gates. M4 shipped step 6 and not
// step 5, so `consent_record` was written by exactly one place in the whole product
// (`app/services/events/rsvp.py`'s per-event consent) and no guardian had ever accepted a
// privacy policy. `Resolve.tsx:9` records the handover that dropped it.
import { ConsentGate, PrivacyScreen, makePrivacyClient } from './features/privacy'
import type { ConsentGateStatus } from './features/privacy'

// Seam 4 — the student card is a container and knows no section by name. This call was
// written for "the app's own entry" and the entry never made it: only tests called it,
// so a real guardian's student card rendered NO sections at all — not even M3's three.
// Found by the S1 slot-wiring guard; registered at module load so the slot is populated
// before anything renders.
registerPeopleSections()
// P2 — the four sections M4, M5, M6 and M7 each left for someone else. The slot design
// worked exactly as intended; nobody had used it until now.
registerBillingSections()
registerBeltSections()
registerAttendanceSections()
registerHealthSections()

// NO `NAV` ARRAY, AND NO DRAWER FOR IT TO SIT IN.
//
// Seven entries stood here — myChildren, calendar, payments, announcements, events, shop,
// addChild — behind a hamburger. §4 of the redesign deletes the drawer: "Four tabs, no side
// menu." Where each one went, and why, is the table in
// docs/design/parent-app-shell-map.md; the short version is that four became tabs, two
// became parts of a screen, and one (events) folds into Home beside every other session.
//
// The comments this array carried are not lost with it: each recorded a route that had
// shipped mounted and unreachable, and `routes.reachable.test.ts` is the guard those
// lessons turned into. It still runs, and it is what proves the drawer's removal did not
// strand anything — `#/calendar` and `#/add-child` were the only two routes it linked
// alone, and both are held by `AccountControls` until their own screen is ported.

/**
 * Lane SCHEDULE's screens route on `location.hash`, matching the dashboard: real `<a href>`
 * links that survive the back button and open-in-new-tab, with no router dependency
 * (`.claude/rules/ui-rtl-a11y.md` forbids adding one without asking).
 */
function useHash(): string {
  const [hash, setHash] = useState<string>(() => globalThis.location?.hash ?? '')
  useEffect(() => {
    const onChange = () => setHash(globalThis.location?.hash ?? '')
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/**
 * L6/P4 — the public routes resolve BEFORE any session hook can run. `useSession()`
 * fires `/auth/refresh` on mount, so the old shape — one component, early returns after
 * the hooks — meant every anonymous landing visit took a 401 on a page a stranger sees
 * first. §5.4a's rule is in PublicLanding's own header: the sign-in wall stands in front
 * of BOOKING, never in front of reading. The split is what keeps the hook out of the
 * public paths entirely.
 */
export default function App() {
  const path = globalThis.location?.pathname ?? '/'
  // #25 -- `/t/{slug}` stays canonical; the root of a LANDING HOST additionally serves the
  // configured club, so `gladiatorclub.co.il` is the shop window rather than a sign-in box
  // while `app.` keeps opening the app. ONE Railway service answers for both from a single
  // build, which is why the host decides and not the path alone -- see `landingSlugFor`.
  //
  // The literal `import.meta.env.X` form is deliberate, and is why these two reads are not
  // hoisted into `route.ts`: both Vite's build and vitest's transform replace exactly that
  // expression, and an aliased read survives untransformed as `undefined`. Unset is the
  // behaviour this app has always had, which is what keeps staging untouched.
  const landingRoute = landingSlugFor(
    path,
    import.meta.env.VITE_LANDING_SLUG,
    landingHostsFrom(import.meta.env.VITE_LANDING_HOSTS),
    globalThis.location?.hostname ?? '',
  )
  const joinToken = matchJoinPath(path)
  if (landingRoute) return <LandingShell route={landingRoute} />
  if (joinToken) return <JoinShell token={joinToken} />
  return <AuthedApp />
}

/**
 * The club's three public pages: the shop window, the trial form and the documents.
 *
 * **Only the shop window fetches for itself.** `PublicLanding` owns its own request
 * because it owns the three states a stranger can land in — loading, a slug nobody owns,
 * a club with no schedule — and those states are what that screen is largely made of. The
 * other two need the same payload for much less (a club's name and logo; its groups,
 * address and phone), so they are fed by `LandingSubPage` below rather than each growing
 * a copy of that machinery.
 */
function LandingShell({ route }: { route: LandingRoute }) {
  const [locale, setLocale] = useState<Locale>('he')
  useDocumentLocale(locale)
  const landingClient = useMemo(() => makeLandingClient(apiFetch), [])
  // §5.4a step 1 → step 2. The OAuth callback appends `signed_in=1` to its redirect, and
  // that marker is the ONE case where these pages know a refresh is worth firing — a
  // full-page return is a fresh JS context with an empty in-memory token, so without it
  // the trial form would ask a freshly-signed-in parent for details it already has.
  // Anonymous visits stay refresh-free (L6). The render is held while restoring because
  // the trial form reads `signedIn` once, at mount.
  const [restoring, setRestoring] = useState(
    () => new URLSearchParams(globalThis.location?.search ?? '').has('signed_in'),
  )
  useEffect(() => {
    if (!restoring) return
    // One-shot: stripped before the refresh so a copied URL or reload cannot refire it.
    const url = new URL(globalThis.location.href)
    url.searchParams.delete('signed_in')
    globalThis.history.replaceState({}, '', url)
    void refresh().finally(() => setRestoring(false))
  }, [restoring])
  if (restoring) return null
  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      {/* Language before login (§6.1): a Russian-speaking parent cannot read a Hebrew
          offer any more than a Hebrew consent screen. It goes INTO the page's header
          rather than above it — loose here it rendered unstyled over the hero. */}
      {route.view === 'landing' ? (
        <PublicLanding
          slug={route.slug}
          locale={locale}
          client={landingClient}
          languagePicker={<LanguagePicker locale={locale} onChoose={setLocale} />}
        />
      ) : (
        <LandingSubPage client={landingClient} locale={locale} route={route} />
      )}
    </ThemeProvider>
  )
}

/**
 * The trial form and the documents page, and the one read they share.
 *
 * Both are reached directly — a link in an advertisement, the footer, a printed QR — so
 * neither can assume the shop window ran first and left a payload behind. This is that
 * payload: the club's name and logo for the documents, its groups, address and phone for
 * the form.
 *
 * **A failed read offers the shop window rather than a retry button.** The three states a
 * bad slug can be in — nobody owns it, the club has no schedule, the network dropped —
 * are told apart properly by `PublicLanding` and nowhere else. Sending a stranger there
 * gets them a real answer instead of this page guessing at one.
 */
function LandingSubPage({
  client,
  locale,
  route,
}: {
  client: LandingClient
  locale: Locale
  route: LandingRoute
}) {
  //: `undefined` is "still asking", `null` is "asked and failed" — the same three-state
  //: shape `PublicLanding` uses, for the same reason: a blank page and a failed page must
  //: not be the same render.
  const [landing, setLanding] = useState<Awaited<ReturnType<LandingClient['landing']>> | null>()

  useEffect(() => {
    let live = true
    client
      .landing(route.slug)
      .then((body) => live && setLanding(body))
      .catch(() => live && setLanding(null))
    return () => {
      live = false
    }
  }, [client, route.slug])

  if (landing === undefined) return null

  if (landing === null) {
    return (
      <main className="tw-scope mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <p className="text-[15px] font-medium text-[#161b28]">{t(locale, 'common.loadFailed.body')}</p>
        <a
          className="rounded-xl bg-[#001849] px-5 py-3 text-[14px] font-bold text-white"
          data-testid="landing-subpage-recover"
          href={landingViewHref(globalThis.location?.pathname ?? '/', 'landing')}
        >
          {t(locale, 'people.bookTrial.legal.back')}
        </a>
      </main>
    )
  }

  if (route.view === 'legal') {
    return (
      <LegalPage
        backHref={landingViewHref(globalThis.location?.pathname ?? '/', 'trial')}
        locale={locale}
        logoUrl={landing.logo_url ? apiUrl(landing.logo_url) : null}
        studioName={landing.studio_name}
      />
    )
  }

  return (
    <TrialBookingPage
      address={landing.address}
      client={client}
      groups={landing.groups ?? []}
      //: The group the visitor pressed on the shop window, carried in the link rather
      //: than in state — the form is a separate page now, and a page cannot inherit the
      //: previous one's memory. `PublicLanding` writes it; this reads it.
      initialGroupId={new URLSearchParams(globalThis.location?.search ?? '').get('group')}
      locale={locale}
      phone={landing.phone ?? null}
      //: Passive: the in-memory token, never a request. A cold anonymous load is simply
      //: not signed in, which is the ordinary case on this page.
      signedIn={getAccessToken() !== null}
      slug={route.slug}
    />
  )
}

type FamilyChild = { id: string; first_name: string; last_name: string }

/** §5.10's mandate links, read by `submitJoin` AFTER the write -- the children it names
 *  do not exist before it. A missing or failing read must not fail a registration that has
 *  already landed, so this returns `[]` rather than throwing. A plain top-level function
 *  and not a hook: every door `JoinWizard` serves shares this ONE read (`JoinShell` for
 *  door B, `AuthedApp` below for doors C and D) rather than each holding its own copy. */
async function loadStandingOrderLinks(): Promise<readonly MandateLink[]> {
  try {
    const response = await apiFetch('/api/v1/me/standing-order-links')
    if (!response.ok) return []
    const body = (await response.json()) as {
      items: { student_id: string; amount_agorot: number; url: string }[]
    }
    return body.items.map((row) => ({
      studentId: row.student_id,
      amountAgorot: row.amount_agorot,
      url: row.url,
    }))
  } catch {
    return []
  }
}

/** What the sign-in wall needs to show the club's own branding before anyone has signed
 *  in -- §6's `slug`/`logo_url` additions to `OnboardingInfoOut`, read from the same
 *  public, unauthenticated `GET /public/onboarding/{token}` the wizard itself reads once
 *  signed in (kept as a separate fetch here rather than threaded through as a prop, so
 *  neither this shell nor `JoinWizard`'s own load has to wait on the other's request). */
type JoinWallInfo = { studio_name: string; logo_url: string | null }

function JoinShell({ token }: { token: string }) {
  const [locale, setLocale] = useState<Locale>('he')
  // The privacy client belonged to the old `JoinFlow`'s payment step and nothing in the
  // redesigned wizard consumes it, so it is not rebuilt here (task 1c's own note) -- an
  // unused fetch held open for a screen that never reads it is worse than not fetching.
  // F1/F10 -- the ONE `useSession()` call for this whole route. `JoinFlow` and
  // `JoinWelcomeStep` (both since deleted) used to each mount their own, and every
  // mount's `refresh()` call
  // rotates the refresh token -- three (with this one, four) rotations for one page load,
  // and a REMOUNT of any of them (e.g. `JoinWelcomeStep` on back-navigation) restarted
  // that instance at `status: 'loading'`, which its own render treated as "not signed
  // in" and flashed a sign-in wall for ~120ms. Read once, here, and pass down what the
  // children need -- neither child calls `useSession()` any more.
  const session = useSession()
  const [wallInfo, setWallInfo] = useState<JoinWallInfo | null>(null)
  const healthClient = useMemo(() => makeHealthClient(apiFetch), [])
  const billingClient = useMemo(() => makeParentBillingClient(apiFetch), [])
  // `JoinWizard`'s effects key on `source`'s IDENTITY (task 3a) -- built with `useMemo`
  // keyed on `[token, healthClient]` so it stays the same object across a re-render, not
  // a fresh one that would restart both loads.
  const source = useMemo(() => tokenSource(token, healthClient), [token, healthClient])
  useDocumentLocale(locale)

  // Fetched once on mount, unconditionally -- not gated on `session.status`, so it is
  // already resolved by the time `status` settles to `anonymous` and the wall below
  // never itself flashes from "no branding" to "branding". A stranger reading this is
  // exactly who §5.4a's public read is already built for: anonymous, unauthenticated,
  // no side effects (the server rolls the read back).
  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/public/onboarding/${token}`)
      .then(async (response) => {
        if (!alive || !response.ok) return
        const body = (await response.json()) as JoinWallInfo
        setWallInfo({ studio_name: body.studio_name, logo_url: body.logo_url })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [token])

  // No flash while the session resolves (mirrors `AuthedApp` below: neither branch
  // matches while `status === 'loading'`, so nothing renders for that one tick).
  if (session.status === 'loading') return null

  if (session.status !== 'signed-in') {
    // §3's Redirect rule: "Not signed in → the SHELL shows the sign-in wall above the
    // wizard, with the club's logo and name. Never inside step 1" (F1). `JoinWizard`
    // is not rendered at all until this branch is no longer taken.
    return (
      <ThemeProvider>
        <AccessibilityMenu locale={locale} />
        {/* The BUTTON, not the inline row — see `LanguageButton`'s header. The wizard below
            is `position: fixed` at the top, and an inline picker rendered beside it was
            painted underneath: present, reachable by a screen reader, invisible to the
            person holding the phone. The wall uses the same control so the two screens of
            this route do not offer language two different ways. */}
        <LanguageButton locale={locale} onChoose={setLocale} />
        <div data-testid="join-sign-in-wall">
          {wallInfo ? (
            <div className="studio-page-header" data-testid="join-wall-studio">
              {wallInfo.logo_url ? (
                <img
                  alt={wallInfo.studio_name}
                  data-testid="join-wall-logo"
                  src={apiUrl(wallInfo.logo_url)}
                />
              ) : null}
              <h1>{wallInfo.studio_name}</h1>
            </div>
          ) : null}
          <SignIn app="parent" locale={locale} returnPath={`/join/${token}`} />
        </div>
      </ThemeProvider>
    )
  }

  // `JoinWizard` owns consent internally (its own Step 1) -- no external `ConsentGate`
  // wrapper. `ConsentGate.tsx` itself is unchanged and still gates the regular app
  // below; this shell just no longer uses it for this route.
  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      <LanguageButton locale={locale} onChoose={setLocale} />
      <JoinWizard
        locale={locale}
        billingClient={billingClient}
        source={source}
        onEnterApp={() => {
          globalThis.location.assign('/')
        }}
        standingOrderLinks={loadStandingOrderLinks}
        draftScope={token}
      />
    </ThemeProvider>
  )
}

function AuthedApp() {
  const session = useSession()
  const displayMode = useDisplayMode()
  // M0 drew this line: core's isInstalled() is display-mode !== 'browser', so a
  // fullscreen or minimal-ui home-screen launch counts too. Since the 2026-08-27
  // feature pass this no longer GATES anything — the app runs fully in a browser tab —
  // it only decides whether the home screen shows InstallBanner's nudge.
  //
  // The `MODE` disjunct hides the nudge on the VITE DEV SERVER, which serves no service
  // worker (`devOptions: { enabled: false }`) — there is nothing to install from, so the
  // banner would point at a dead end. `import.meta.env.MODE` is replaced by a string
  // literal at build time, so in a real build the disjunct folds away. Under vitest MODE
  // is 'test', which is what lets this app's tests exercise the real banner.
  //
  // `useDisplayMode()` is deliberately left alone: M8 reports install rates from it, and
  // a measurement that lies to make a dev tab convenient is worse than no banner.
  const installed = displayMode !== 'browser' || import.meta.env.MODE === 'development'
  const [locale, setLocale] = useState<Locale>('he')
  // `<html lang>` and `<html dir>` follow the choice. index.html ships `lang="he" dir="rtl"`
  // as a literal, so without this a parent who picks English or Russian reads LTR copy inside
  // an RTL document and hears it announced with a Hebrew voice.
  useDocumentLocale(locale)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Memoised for the same reason each time: a screen reads through its client in an effect
  // keyed on the client, so a fresh object every render would re-fetch forever.
  const billingClient = useMemo(() => makeParentBillingClient(apiFetch), [])
  const peopleClient = useMemo(() => makePeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeParentEventsClient(apiFetch), [])
  const beltsClient = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const commsClient = useMemo(() => makeParentCommsClient(apiFetch), [])
  const healthClient = useMemo(() => makeHealthClient(apiFetch), [])
  const privacyClient = useMemo(() => makePrivacyClient(apiFetch), [])
  // §3 Door C -- the manager's invitation (`/?invite=<token>`), and now also the trial
  // follow-up's reuse of that same link for a family who may already have full access
  // (task 9b). `AccessGate` redeems the token and reports which student it named (see
  // its own header); by the time this component ever renders, `session.access.parent`
  // may already have been true BEFORE this visit, so it is not a usable signal either --
  // the query string is the only thing that still says "this visit came from that
  // link". `AccessGate`'s own local `arrivedWithInvite` flips false the instant
  // redemption succeeds, so it cannot be reused here as a standing "is this door C"
  // signal. Computed once: the param is not expected to change over this component's
  // lifetime.
  const arrivedWithInvite = useMemo(
    () => new URLSearchParams(globalThis.location?.search ?? '').has('invite'),
    [],
  )
  // task 9b §2/§3 -- which child the invitation THIS visit redeemed was about, reported
  // by `AccessGate` from the same `POST /accept-invitation` response that binds it
  // server-side. `null` until redemption resolves (or fails, or names no student) --
  // the gate below asks THIS, never the family-WIDE onboarding status, because a family
  // who has already finished onboarding for every other child still needs to register
  // the ONE this link named (§3's whole point).
  const [invitedStudent, setInvitedStudent] = useState<InvitedStudent | null>(null)
  // Task 3b -- read ONCE, for both doors C and D (`doorSteps.ts::startingStep` needs the
  // whole body, not only whether a next step exists), rather than door C's old private
  // fetch of the same endpoint. A failed read resolves to `null`, which `startingStep`
  // itself treats as "open at the agreements step" (see that function's own docstring) --
  // there is no separate tri-state to track here any more (task 9b removed the last
  // reader that needed one).
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null)
  useEffect(() => {
    if (session.status !== 'signed-in' || !session.access.parent) return
    let alive = true
    void apiFetch('/api/v1/me/onboarding-status')
      .then(async (response) => (response.ok ? ((await response.json()) as OnboardingStatus) : null))
      .then((result) => {
        if (!alive) return
        setOnboardingStatus(result)
      })
      .catch(() => {
        if (!alive) return
        setOnboardingStatus(null)
      })
    return () => {
      alive = false
    }
  }, [session.status, session.access.parent])
  // `JoinWizard`'s effects key on `source`'s IDENTITY (task 3a) -- memoised so doors C and
  // D hand it the SAME object across a re-render, not a fresh one that restarts both of
  // `studioSource`'s reads.
  const memberSource = useMemo(() => studioSource(healthClient), [healthClient])
  // §6.1 step 5's gate reports its own state up, because the TAB BAR has to hide with it
  // and the bar is a prop of `AppShell`, rendered outside the gate's children. `loading`
  // until the answer arrives: a bar drawn during the fetch is a bar a fast finger uses
  // before the gate exists, which is the same reason the shell renders nothing at all
  // while `gatedChildren` is null.
  const [consentStatus, setConsentStatus] = useState<ConsentGateStatus>('loading')
  // §6.1 step 6 — which children still owe a declaration. `null` until the answer
  // arrives, and the shell renders NOTHING gated until it does: a home screen that
  // flashes before the gate is a gate a fast finger gets past. On a fetch failure the
  // gate stands aside — first login (the moment §6.1 gates) cannot happen offline, and
  // a network blip locking a family out of the cached PWA would punish exactly the
  // parent §6.5 worked hardest to keep.
  const [gatedChildren, setGatedChildren] = useState<readonly GatedStudent[] | null>(null)
  /** The family's children, by first name — read once beside the gate's own read and used
   *  by `UpdatesScreen` to say who a notification is about. Named for the payment-setup
   *  screen it used to feed until that was removed (2026-09-07). */
  const [familyChildren, setFamilyChildren] = useState<readonly FamilyChild[]>([])
  /** The gated family's children as the WIZARD needs them -- §5.5's gate opens the one
   *  join wizard now, and it would otherwise open blank and ask a parent to re-type a child
   *  the club has had for weeks. `null` until read; an empty list is a real answer. */
  const [gateSeed, setGateSeed] = useState<readonly StudentDraft[] | null>(null)
  const [declarationsSigned, setDeclarationsSigned] = useState(0)
  // Bumped when a trial family joins the club. The child goes `trial` -> `active` while
  // still holding the short health form, so §5.5's gate must fire on the very next
  // render — and `gatedChildren` is read once per this counter, not per route change.
  const [familyJoined, setFamilyJoined] = useState(0)
  // `2a` §7's badge. Fetched by the SHELL and not by `InboxScreen`, because a badge that
  // appeared only after the inbox had been opened would announce news the parent had just
  // finished reading. `notificationsRead` bumps to re-fetch after the inbox marks anything
  // read, so the badge clears without a reload.
  //
  // **It counts what has not been DEALT WITH, which is one rule with two readings.** A
  // notice that asks for something is dealt with when the club's records say it was done
  // (`action.outstanding`, resolved in `app/services/comms/actions.py`); a notice that asks
  // for nothing is dealt with when it has been read. Counting `read_at` alone was the
  // screen-7 defect wearing a different hat: it cleared the moment a parent glanced at a
  // demand they had not met.
  const [pendingCount, setPendingCount] = useState(0)
  const [notificationsRead, setNotificationsRead] = useState(0)
  useEffect(() => {
    if (session.status !== 'signed-in') return
    let alive = true
    void apiFetch('/api/v1/notifications')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              items: { read_at: string | null; action: { outstanding: boolean } | null }[]
            }>)
          : { items: [] },
      )
      // A failed read is NO badge rather than a stale one: the count is a nudge, and a
      // wrong nudge about unread mail is worse than none.
      .then(
        (data) =>
          alive &&
          setPendingCount(
            data.items.filter((row) => (row.action ? row.action.outstanding : row.read_at === null))
              .length,
          ),
      )
      .catch(() => alive && setPendingCount(0))
    return () => {
      alive = false
    }
  }, [session.status, notificationsRead])
  useEffect(() => {
    if (session.status !== 'signed-in') return
    let alive = true
    void apiFetch('/api/v1/me/students')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              items: {
                id: string
                first_name: string
                last_name: string
                status: string
                health_status: GatedStudent['health_status']
                agreement_complete?: boolean | null
              }[]
            }>)
          : { items: [] },
      )
      .then((data) => {
        if (!alive) return
        // The payment step needs the parts, not the joined label: it renders a child's
        // own name beside their price and matches their mandate link by id.
        setFamilyChildren(
          data.items.map(({ id, first_name, last_name }) => ({ id, first_name, last_name })),
        )
        setGatedChildren(
          data.items.map((student) => ({
            id: student.id,
            display_name: `${student.first_name} ${student.last_name}`,
            // Carried through because the gate reads it: a child still on a trial is not
            // held for the full declaration (§5.4a / §6.3 — see HealthGate's header).
            status: student.status,
            health_status: student.health_status,
            // **Carried through, and the gate is useless without it.** `הסכם הרשמה` is
            // three conditions — registration, health, the club's terms — and only the
            // server knows all three. Dropping it here made every child whose v1
            // declaration was already `signed` look finished to the gate, so the families
            // who most needed re-asking were exactly the ones never asked.
            agreement_complete: student.agreement_complete,
          })),
        )
      })
      .catch(() => {
        if (alive) setGatedChildren([])
      })
    return () => {
      alive = false
    }
  }, [session.status, declarationsSigned, familyJoined])

  //: The seed for §5.5's gate, read beside `gatedChildren` and on the same counters so the
  //: two can never describe different families. Separate from `/me/students` because the
  //: wizard needs a child's grade, groups and plan, and that shape is shared with the staff
  //: roster -- whose route is `coach`-tagged, where a plan id may never appear (SPEC §13).
  //:
  //: A failure leaves `gateSeed` empty rather than null: the gate still opens the wizard,
  //: just without the children pre-filled. Blocking the app on a prefill read would punish
  //: the family for a convenience.
  useEffect(() => {
    if (session.status !== 'signed-in' || !session.access.parent) return
    let alive = true
    apiFetch('/api/v1/me/wizard-prefill')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              items: {
                id: string
                first_name: string
                last_name: string
                birthdate: string | null
                grade: string | null
                group_ids: string[]
                price_plan_id: string | null
              }[]
            }>)
          : { items: [] },
      )
      .then((data) => {
        if (!alive) return
        setGateSeed(
          data.items.map((child) =>
            //: Keyed by the REAL student id, not a fresh draft id. `submitJoin` matches a
            //: child to what `register` returned by position, and the payment methods map is
            //: keyed by draft id -- a stable id here is what keeps a resumed draft pointing
            //: at the same child across a reload.
            emptyStudent(child.id, {
              firstName: child.first_name,
              lastName: child.last_name,
              birthDate: child.birthdate ?? '',
              //: `grade` is a closed set on the draft (`GradeKey`), and the column is free
              //: text that predates it. An unrecognised value becomes empty rather than
              //: being forced through -- the form then asks for it, which is honest, where
              //: a cast would put an unselectable value in a select.
              grade: isGradeKey(child.grade) ? child.grade : '',
              groupId: child.group_ids[0] ?? '',
              planId: child.price_plan_id ?? '',
            }),
          ),
        )
      })
      .catch(() => {
        if (alive) setGateSeed([])
      })
    return () => {
      alive = false
    }
  }, [session.status, session.access.parent, declarationsSigned, familyJoined])

  const hash = useHash()
  // Each screen keeps its own scroll offset, and a screen with none opens at the top. A
  // hash link moves neither by itself — see useScrollMemory's header.
  useScrollMemory(hash)
  const today = useToday()
  // §5.4(c)'s add-a-sibling is one hash away from home. Hash and not a path: it is an
  // in-app screen, unlike the landing page, which has to be shareable.
  //
  // Read off `useHash()` rather than `globalThis.location.hash` directly: both W2 lanes
  // put a screen behind a hash in this shell, and a plain read is not reactive — the
  // screen would change only when something else happened to re-render App. One
  // subscription serves both lanes' routes.
  const addingChild = hash === '#/add-child'
  // Entrance A — §5.4a ④'s "איך היה?" finally leads somewhere, and `trial.followup`'s
  // payload names this same hash so the inbox row is pressable too.
  const joiningClub = hash === '#/join'
  // §5.10's payments tab, and `12f`'s history one hash below it.
  const onPayments = hash === '#/payments'
  const onPaymentsHistory = hash === '#/payments/history'
  // §5.10 step 5 — the uPay return leg carries the order's public_ref in the hash.
  //
  // **Everything after the ref is dropped, and that is not defensive tidying.**
  // upay-integration.md round one: 'the customer's browser is ALSO redirected to
  // returnurl with the same payload'. Our returnurl is a hash route, so whatever uPay
  // appends lands INSIDE the fragment: `#/payment-complete/<ref>?providererrorcode=0&...`.
  // Slicing the prefix alone made the query part of the ref, `?ref=` went to a route typed
  // `uuid.UUID`, the server answered 422, and `PaymentCompleteSection` renders a 422 as
  // LoadFailed — a generic error screen, shown to a parent who has just been charged.
  // Nothing uPay puts here is read: the IPN is the only settlement (see that section's
  // own comment), so the ref is the single thing worth recovering from this hash.
  const paymentCompleteRef = hash.startsWith('#/payment-complete/')
    ? (hash.slice('#/payment-complete/'.length).split(/[?&#/]/)[0] ?? '')
    : ''
  // `12a` — the absence pre-report.
  // `2c` — the student card, per child.
  const cardStudentId = hash.startsWith('#/student/') ? hash.slice('#/student/'.length) : ''
  // 12i — the profile tab's screen (ship-audit B4: built in W2, mounted by nothing).
  const onProfile = hash === '#/profile'
  // §11.3/§11.4/§11.6 — the subject's own privacy screen. Linked from the drawer, and
  // asserted by `routes.reachable.test.ts`: three screens have shipped mounted and
  // unreachable in this app already, and a privacy screen nobody can find is a subject
  // access right nobody can exercise.
  const onPrivacy = hash === '#/privacy'
  // 12e — the item shop (feature pass: built in W4, mounted by nothing).
  const onShop = hash === '#/shop'
  const onDirections = hash === '#/directions'
  // §6.5's walkthrough, now an on-demand screen behind InstallBanner's nudge.
  const onInstall = hash === '#/install'
  // 12h's list, and 7d's invite behind `#/events/<eventId>/<studentId>`. Both ids are in
  // the hash because 12h is per CHILD per event: a family with two children on one
  // competition has two answers to give, and an event id alone cannot say which.
  const onEvents = hash === '#/events'
  // §5.11's one-way inbox — artboard `2b`, and D9.1's reason it has no second half.
  const onAnnouncements = hash === '#/announcements'
  const invite = hash.startsWith('#/events/') ? hash.slice('#/events/'.length).split('/') : []
  // 12d, per child per class: a ladder belongs to a class (§5.9), so a child who trains
  // in two disciplines has two progressions to look at.
  const belts = hash.startsWith('#/belts/') ? hash.slice('#/belts/'.length).split('/') : []
  // The training plan, per child: what 300 / 400 / 550 ₪ buys, this week's extras, and the
  // upgrade offer §5.1 computes.
  const planStudentId = hash.startsWith('#/plan/') ? hash.slice('#/plan/'.length) : ''
  // The technique library's two routes. Both hashes are named HERE, in this file's own
  // `hash === …` / `hash.startsWith(…)` shapes, and only then handed to the feature's
  // matcher — `routes.reachable.test.ts` reads the route table out of THIS file by looking
  // for exactly those two shapes, so a route parsed entirely behind a helper is a route
  // that guard cannot arm on, which is the defect it exists to catch. What the matcher
  // owns is what each hash MEANS: a bare `#/techniques/` is the list, not a detail screen
  // for an empty slug.
  const techniquesRoute =
    hash === '#/techniques' || hash.startsWith('#/techniques/') ? matchTechniquesPath(hash) : null

  /**
   * Which of the five tabs the current hash belongs to.
   *
   * `null` — no tab current — is a real answer and not a fallback, and it is why this is a
   * derived value rather than a piece of state. A student card, the privacy screen, the
   * absence report and uPay's return all sit BESIDE the tabs rather than inside one:
   * the bar still shows, so the parent can leave, but marking a tab `aria-current="page"`
   * on a screen that tab does not lead to is a lie told to a screen reader.
   *
   * Home takes the empty hash as well as `#/` and `#`, because that is where an unknown
   * hash falls through to — see the routing block below.
   */
  const activeTab: ParentTab | null = onShop
    ? 'shop'
    : onAnnouncements
      ? 'updates'
      : // A technique's detail screen counts as INSIDE its tab, unlike a student card:
        // it is reached only from the list and its own back control returns there, so the
        // tab it came from is genuinely the current one.
        techniquesRoute !== null
        ? 'techniques'
        : onProfile
          ? 'profile'
          : hash === '' || hash === '#' || hash === '#/'
            ? 'home'
            : null

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    globalThis.addEventListener('beforeinstallprompt', onPrompt)
    return () => globalThis.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // §5.4a ① — the shop window is a marketing asset on the open internet, so it renders
  // AHEAD of every gate. A stranger tapping an Instagram link must see the club, not an
  // install walkthrough for an app they have no reason to want yet; §6.5's install prompt
  // belongs on `13b`, after they have booked, which is the moment they are most willing.
  //
  // A real path and not a hash: the URL goes in a bio and on a printed QR, and Vite's PWA
  // config already sets `navigateFallback: 'index.html'` so the deep link resolves.
  // §5.4b — the onboarding link, AHEAD of the install gate for the same reason the
  // landing page is: it arrives from WhatsApp into whatever browser opens, and an
  // install wall between the tap and the form is where a migration cohort evaporates.
  return (
    <ThemeProvider>
      {/* נגישות, SIGNED OUT ONLY (owner review, 2026-09-06). The floating button is right on
          a public page and wrong behind the tab bar: at phone widths it came to rest ON TOP
          of the בית tab, so Home could not be pressed from the bar at all — `.studio-a11y__fab`
          publishes an `--a11y-fab-clearance` for exactly this and the redesigned Tailwind bar
          does not read it. Signed in, the same menu is a row in פרופיל → הגדרות, one tap away.
          The sign-in wall, the join wall and the landing keep the button, because that is
          where IS 5568 bites hardest — a stranger with low vision has no profile to go to. */}
      {session.status !== 'signed-in' ? <AccessibilityMenu locale={locale} /> : null}
      {/* New-build toast — floats over whatever is open, in every session state. */}
      <UpdateToast locale={locale} />
      {session.status === 'anonymous' ? (
        // Language before login (§6.1) — the picker floats over the sign-in screen.
        <SignIn
          locale={locale}
          app="parent"
          // An invitation link (`/?invite=<token>`, 2026-08-30) must survive the OAuth
          // round trip, or the parent lands back with the token gone and Resolve's
          // no-match screen asks them to retype what the link already carried.
          returnPath={
            globalThis.location?.search.includes('invite=')
              ? `/${globalThis.location.search}`
              : '/'
          }
          languagePicker={<LanguagePicker locale={locale} onChoose={setLocale} />}
        />
      ) : null}

      {session.status === 'signed-in' ? (
        // §6.1 step 3's refusal, and the mid-join spinner in front of it, render OUTSIDE
        // `AppShell` — see `AccessGate`'s header. `AppShell` mounts only once it has
        // confirmed `session.access.parent`, so a hash typed by a refused visitor
        // (`#/absence`, `#/student/<id>`, …) can no longer reach a screen behind it either.
        <AccessGate session={session} locale={locale} onInvitedStudent={setInvitedStudent}>
        <ParentShell
          activeTab={activeTab}
          locale={locale}
          updatesBadgeCount={pendingCount}
          // The bar hides while EITHER of §6.1's gates holds — "no other screen is
          // reachable" includes the bar that reaches them. Step 5 is `consentStatus`,
          // step 6 is `gatedChildren`. Same condition the old `tabBar` prop carried.
          tabBar={
            consentStatus === 'open' &&
            gatedChildren !== null &&
            firstStudentNeedingDeclaration(gatedChildren) === null
          }
          devBar={
            <DevBar
              identity={
                session.devTools
                  ? {
                      isDeveloper: true,
                      studioName: session.activeStudioName ?? '',
                      actingAs: session.actingAsLabel ?? undefined,
                    }
                  : null
              }
              locale={locale}
            />
          }
        >
          {/* §6.1's first-run routing still owns the DEFAULT screen — `Resolve` decides
              between the studio picker, the blocking consents and home. Both W2 lanes
              hang one screen off a hash in front of it, and neither claims the fallback:
              an unknown hash still falls through to `Resolve`.

              `access.parent` guards lane SCHEDULE's branch because a hash is typed by
              whoever is holding the phone, so the check cannot live in the link. Lane
              PEOPLE's branch needs no such guard — Door D's `JoinWizard` is behind
              §6.1's refusal already, since a person with no guardian row never reaches
              this shell. */}
          {/* §6.1 step 6 wraps EVERY routed branch, not the default one: "no other
              screen is reachable", and every drawer link and typed hash routes through
              this expression. Loading, not `null`, while the children are still loading
              — see the fetch above. §7.9: `AppShell`'s own chrome (title, drawer, tab
              bar) already renders around this, but the content area itself read as an
              empty page with nothing on it for as long as the fetch took. */}
          {arrivedWithInvite && invitedStudent !== null ? (
            // §3 Door C -- "Door C is Door B with one row pre-filled, not a separate
            // 'gaps only' step list." The invited parent has agreed to nothing and
            // signed nothing yet, so the OLD ConsentGate/HealthGate/PaymentSetupGate
            // stack below must never run first -- that IS the redundant "gaps only"
            // list the spec rules out, and it would ask through a different screen
            // than the one this door's own wizard already opens on.
            //
            // task 9b -- gated on `invitedStudent`, not on the family-WIDE onboarding
            // status any more. "Does this family still need onboarding" answers `no` for
            // a returning family with other children already registered, and the wizard
            // never opened for them at all -- they landed on their ordinary home screen
            // with the one child this link named never touched. The right question is
            // "does the student THIS invitation named still need registering", which is
            // exactly what a non-null `invitedStudent` says: `AccessGate` only reports
            // one once `POST /accept-invitation` has actually named a student, so there
            // is no separate in-flight state to track here (see that component's header).
            <JoinWizard
              locale={locale}
              billingClient={billingClient}
              onEnterApp={() => {
                setInvitedStudent(null)
                setFamilyJoined((n) => n + 1)
              }}
              prefillFirstRowName={invitedStudent.name ?? undefined}
              //: **What the manager already answered, carried across.** Door C used to pass
              //: the invited child's NAME and nothing else, so a parent re-entered the group
              //: their manager had just chosen — and a different pick re-synced the
              //: enrolment over it. The same read §5.5's gate uses, narrowed to the one
              //: child this invitation names: §3 is explicit that Door C is "Door B with one
              //: row pre-filled", not the whole family.
              seedStudents={(gateSeed ?? []).filter((child) => child.id === invitedStudent.id)}
              source={memberSource}
              standingOrderLinks={loadStandingOrderLinks}
              startAtStep={wizardStepFor(startingStep('invite', onboardingStatus))}
            />
          ) : gatedChildren === null ? (
            <p data-testid="gated-children-loading">{t(locale, 'common.setup.loading')}</p>
          ) : (
          /* §6.1 step 5 OUTSIDE step 6, because 5 precedes 6 and the ordering carries an
             argument: the privacy policy is what permits the club to collect a medical
             record about a child at all, so asking for the record first and the permission
             afterwards has the consent doing no work. */
          <ConsentGate
            client={privacyClient}
            locale={locale}
            onStatusChange={setConsentStatus}
          >
          <HealthGate
            students={gatedChildren}
            wizard={() => (
              // **One wizard.** This used to be `AgreementFlow`, a second five-step flow
              // with its own chrome -- which is what a manager hit on 2026-09-12 and
              // reported as the app having gone back to an older version. Same component,
              // same three steps and same design as every other door now; the family's
              // existing children are seeded so it opens on them instead of blank.
              <JoinWizard
                locale={locale}
                billingClient={billingClient}
                onEnterApp={() => setDeclarationsSigned((count) => count + 1)}
                seedStudents={gateSeed ?? []}
                source={memberSource}
                standingOrderLinks={loadStandingOrderLinks}
                startAtStep={wizardStepFor(startingStep('addChild', onboardingStatus))}
              />
            )}
          >
          {/* §6.1's plan step used to stand HERE, as `PaymentSetupGate`. Removed on the
              owner's call (2026-09-07), and the reason is worth keeping: its
              `familyAnswered` was a plain `useState(false)`, never read back from the
              server, so it re-asked "איך תשלמו?" on every launch of the app no matter what
              the family had already answered — in the pre-redesign design, in front of
              everything else. The wizard's step 3 is where a new family picks a method
              now, and the payments screen (Profile → תשלומים) is where anyone changes one.
              Neither blocks the app. `App.test.tsx`'s "no second payment question" guards
              it. */}
          {cardStudentId ? (
            <TraineeCardSection client={peopleClient} locale={locale} studentId={cardStudentId} />
          ) : paymentCompleteRef ? (
            <PaymentCompleteSection locale={locale} publicRef={paymentCompleteRef} />
          ) : onPaymentsHistory ? (
            <PaymentHistorySection locale={locale} />
          ) : onPayments ? (
            // No `access.parent` guard needed and none added: the routes behind this
            // screen resolve the payer from the session, so a person with no charges sees
            // an empty state rather than somebody else's money.
            // The 2026-09-07 rebuild. `PaymentsScreen` and `PaymentsSection` are gone —
            // deleted 2026-09-08, a day after this screen replaced them, along with the
            // four exports of theirs that had nothing to do with a screen and are now in
            // `billingClient.ts` where their nine importers were already reaching.
            <ParentPayments locale={locale} />
          ) : planStudentId ? (
            // Same reasoning as the payments screen above: the route resolves the family
            // from the session, so a student id that is not this caller's child answers
            // 404 and the section renders nothing rather than another family's plan.
            <PlanSection locale={locale} studentId={planStudentId} />
          ) : onShop ? (
            // Checkpoint 4 of the parent-app redesign — the port of the prototype's
            // `GearScreen`. `ShopSection` and `OrderItemsScreen` are long gone; this
            // comment claimed they were "on disk until the redesign is accepted" for weeks
            // after they were deleted, which is the rot the delete-with-the-replacement
            // rule exists to prevent.
            <ClubShop locale={locale} />
          ) : techniquesRoute !== null ? (
            techniquesRoute.kind === 'detail' ? (
              <TechniqueDetail locale={locale} slug={techniquesRoute.slug} />
            ) : (
              <TechniquesScreen locale={locale} />
            )
          ) : onDirections ? (
            <DirectionsScreen locale={locale} />
          ) : onInstall ? (
            <section aria-label={t(locale, 'common.install.title')}>
              <a href="#/">{t(locale, 'common.install.back')}</a>
              {installed ? (
                <p>{t(locale, 'common.install.done')}</p>
              ) : (
                <InstallWalkthrough
                  locale={locale}
                  installed={false}
                  deferredPrompt={installPrompt}
                />
              )}
            </section>
          ) : onPrivacy ? (
            // No `access.parent` guard and none needed: every route behind this screen
            // resolves the subject from the session, so a caller with no children sees
            // their own record and nobody else's.
            <PrivacyScreen
              client={privacyClient}
              locale={locale}
              personId={
                session.studios.find((s) => s.studio_id === session.activeStudioId)?.person_id ??
                null
              }
            />
          ) : onProfile ? (
            // The drawer's two orphans — sign-out and the studio switcher — arrive here as
            // props rather than being read again inside the screen: `useSession()` is
            // called ONCE for this whole route (see F1/F10 above), and a second call in a
            // tab would put a second `/auth/refresh` on every visit to it.
            // Checkpoint 5 of the parent-app redesign — the last of the four tabs, the
            // port of the prototype's `ProfileScreen`. `ProfileSection` and
            // `GuardianSettings` are gone; the promise that they were "on disk until the
            // redesign is accepted" outlived both files by weeks.
            <ProfileScreen
              locale={locale}
              onLocaleChange={setLocale}
              account={{
                studios: session.studios.map((s) => ({
                  studioId: s.studio_id,
                  studioName: s.studio_name,
                  studioIsDemo: s.studio_is_demo,
                })),
                activeStudioId: session.activeStudioId,
                onSwitchStudio: (studioId: string) => void switchStudio(studioId),
                onSignOut: () => {
                  clearAllJoinDrafts()
                  void session.signOut()
                },
              }}
            />
          ) : joiningClub ? (
            // INSIDE the gates, like every other branch: a trial family passes both today
            // (§5.5 does not hold `trial_signed` while the child is still on a trial), and
            // the moment the join lands they stop passing — which is the point.
            <JoinClubSection
              client={peopleClient}
              healthClient={healthClient}
              locale={locale}
              onJoined={() => setFamilyJoined((n) => n + 1)}
            />
          ) : addingChild ? (
            // §3 Door D -- replaces the old 3-field `AddSibling` wholesale (F18: "writes
            // the most on the least"). Nested inside the same gates `AddSibling` was --
            // unlike Door C's invited stranger, this family has already passed them for
            // their EXISTING children, and an unrelated unpaid balance is still this
            // family's own gate to clear before adding a fourth child, not a wizard
            // Door D exists to route around.
            <JoinWizard
              locale={locale}
              billingClient={billingClient}
              onEnterApp={() => {
                setFamilyJoined((n) => n + 1)
                // Leave the hash, or `addingChild` stays true and the family lands back
                // on the wizard they have just finished. "Enter the app" means the app.
                globalThis.location.hash = ''
              }}
              source={memberSource}
              standingOrderLinks={loadStandingOrderLinks}
              startAtStep={wizardStepFor(startingStep('addChild', onboardingStatus))}
            />
          ) : belts.length === 2 ? (
            <BeltProgressScreen
              classId={belts[1]!}
              client={beltsClient}
              locale={locale}
              studentId={belts[0]!}
            />
          ) : hash.startsWith('#/belts') ? (
            // P7 — the single-segment form resolves through the child's belt history or
            // refuses visibly. It used to fall through to home with no message.
            <BeltRouteResolver locale={locale} studentId={belts[0] ?? ''} />
          ) : invite.length === 2 ? (
            <EventInviteScreen
              client={eventsClient}
              eventId={invite[0]!}
              locale={locale}
              now={today}
              studentId={invite[1]!}
            />
          ) : onAnnouncements ? (
            // Checkpoint 3 of the parent-app redesign. `InboxScreen` (screen 7 of the
            // superseded Stitch pass) is replaced by the port of the prototype's
            // `UpdatesScreen` — three labelled sections and a filter strip in place of the
            // one-card queue. It stays on disk until the redesign is accepted end to end,
            // and this file still imports its `ACTIONS` map, which is the one place a
            // notification kind is mapped to a screen.
            <UpdatesScreen
              client={commsClient}
              locale={locale}
              childrenById={Object.fromEntries(
                familyChildren.map((child) => [child.id, child.first_name]),
              )}
              childNames={familyChildren.map((child) => child.first_name)}
              onReadChange={() => setNotificationsRead((n) => n + 1)}
            />
          ) : onEvents ? (
            <ParentEventsScreen
              client={eventsClient}
              locale={locale}
              now={today}
              onOpen={(eventId, studentId) => {
                globalThis.location.hash = `#/events/${eventId}/${studentId}`
              }}
            />
          ) : (
            <>
              <InstallBanner
                locale={locale}
                installed={installed}
                onOpenWalkthrough={() => {
                  globalThis.location.hash = '#/install'
                }}
              />
              {/* No unread count goes down here any more (owner, 2026-09-07). בית's bell
                  used to carry the same number the tab bar badges עדכונים with; one inbox
                  showing two counts is two places for a stale one to sit. `pendingCount`
                  still feeds `updatesBadgeCount` above, which is the badge that is visible
                  from every screen rather than only from home. */}
              <Resolve session={session} locale={locale} />
            </>
          )}
          </HealthGate>
          </ConsentGate>
          )}
        </ParentShell>
        </AccessGate>
      ) : null}
    </ThemeProvider>
  )
}
