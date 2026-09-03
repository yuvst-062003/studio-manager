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
import { apiFetch, apiUrl, getAccessToken, refresh, useDisplayMode, useSession, switchStudio } from '@studio/core'
import {
  AccessibilityMenu,
  AccountDrawerFooter,
  AppShell,
  Icon,
  InstallBanner,
  InstallWalkthrough,
  LanguagePicker,
  SignIn,
  TabBar,
  ThemeProvider,
  UpdateToast,
  useDocumentLocale,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { AccessGate } from './features/identity/AccessGate'
import { Resolve } from './features/identity/Resolve'
import { ScheduleSection, isCalendarRoute } from './features/schedule/ScheduleSection'
// `12a` — the absence pre-report (P1). Every layer of this feature existed except a line
// of routing, so nothing in the product could produce an absence report — the state the
// staff roster, the dashboard count and `הודעתם מראש` are all built to read.
import { AbsenceScreen, makeAbsenceClient } from './features/absence'
import { registerAttendanceSections } from './features/attendance'
// §5.12's subscription panel, rendered under the calendar it feeds (P1).
import { CalendarSync } from './features/comms'
import { makeParentScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'
import { PublicLanding, makeLandingClient, matchLandingPath } from './features/landing'
import { JoinFlow, matchJoinPath } from './features/onboarding/JoinFlow'
// §2 decision 3 -- "cleared ... on sign-out": a stale draft (children's national ids,
// health answers) must not survive into whoever signs in on this device next.
import { clearAllJoinDrafts } from './features/onboarding/joinDraftStorage'
import {
  EventInviteScreen,
  ParentEventsScreen,
  makeParentEventsClient,
} from './features/events'
import { BeltProgressScreen, makeParentBeltsClient, registerBeltSections } from './features/belts'
import { BeltRouteResolver } from './features/belts/BeltRouteResolver'
import { InboxScreen, makeParentCommsClient } from './features/comms'
import { AddSibling, JoinClubSection, ProfileSection, makePeopleClient, registerPeopleSections } from './features/people'
// `2c` behind `#/student/<id>` — the composite card the slot system was built for (P2).
import { StudentCardSection } from './features/people/StudentCardSection'
import { registerBillingSections } from './features/billing/StudentCardBillingSection'
import { DirectionsScreen } from './features/people/DirectionsScreen'
// §5.10's payments tab. Mounted here because nothing imported it: `PaymentsScreen` is
// artboard `12f`, the subject of E2E-3 and E2E-4, and it was unreachable in a running app.
import { PaymentsSection } from './features/billing/PaymentsSection'
// `12f` behind the hash PaymentsSection already links to, and §5.10's return leg (P1).
import { PaymentHistorySection } from './features/billing/PaymentHistorySection'
import { PaymentCompleteSection } from './features/billing/PaymentCompleteSection'
// The training-plan screen, per child. `#/plan/<studentId>` for the same reason `#/belts/`
// carries ids: a family with two children has two plans and two upgrade decisions, and a
// screen that summed them could not mark anything — a booking names a student.
import { TrainingPlanSection } from './features/billing/TrainingPlanSection'
// §6.1's plan step — 300 / 400 / 550 and how the money moves, asked once, right after the
// health declaration. Every piece of it existed behind `#/plan/<studentId>` and nothing in
// the first-run sequence reached it, so a family finished signup with no plan at all.
import { PaymentSetupGate } from './features/billing/PaymentSetup'
import type { SetupChild, StandingOrderLink } from './features/billing/PaymentSetup'
import { makeParentBillingClient } from './features/billing/PaymentsSection'
import { ShopSection } from './features/billing'
// §6.1 step 6 — the BLOCKING declaration. Mounted here because nothing imported it
// (HB-w6-health-gate-unmounted): the gate, the form and the pad were built and tested in
// W3 and a guardian with an unsigned declaration still reached home.
import { HealthGate, firstStudentNeedingDeclaration, makeHealthClient, registerHealthSections } from './features/health'
import type { GatedStudent } from './features/health'
// The same predicate the gate uses. Two spellings of "does this child still owe
// something" is how a drawer comes to disagree with the screen it links to.
import { needsFullDeclaration } from './features/health/HealthGate'
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

const NAV = [
  { key: 'myChildren', labelKey: 'common.nav.myChildren', href: '/' },
  { key: 'calendar', labelKey: 'schedule.calendar.title', href: '#/calendar' },
  // A hash, not a path. `/payments` matched nothing: `matchLandingPath` accepts only
  // `/t/<slug>` (features/landing/route.ts, and route.test.ts:21 asserts
  // `matchLandingPath('/payments')` is null), so the link fell through `navigateFallback`
  // to index.html and put the parent back on home. The same correction both W2 lanes made
  // for their own entries.
  { key: 'payments', labelKey: 'common.nav.payments', href: '#/payments' },
  // A hash, and mounted below. `/announcements` matched nothing — `matchLandingPath`
  // accepts only `/t/<slug>` — so the link fell through `navigateFallback` to index.html
  // and put the parent back on home. `InboxScreen` (§5.11's one-way inbox, artboard `2b`)
  // existed and was tested but was never imported by anything, so the whole screen was
  // unreachable in a running app. Same defect and same correction as `/payments`.
  { key: 'announcements', labelKey: 'common.nav.announcements', href: '#/announcements' },
  // 12h's list. Mounted below since W4 and linked from NOWHERE: the only `#/events` in the
  // app was the per-child invite hash that this screen itself writes, so a parent could
  // reach an invite from a push notification and never find the list it came from. Same
  // defect and same correction as `/payments` and `/announcements` above.
  { key: 'events', labelKey: 'events.title', href: '#/events' },
  { key: 'shop', labelKey: 'billing.shop.title', href: '#/shop' },
  { key: 'addChild', labelKey: 'people.sibling.title', href: '#/add-child' },
  // NO settings entry. `/settings` matched no route in either app, so the link fell
  // through the service worker's navigateFallback to index.html and put the user back
  // on home in silence. Artboard 2e draws these controls in the DRAWER, not on a
  // page, and that is where they now are — see `AccountDrawerFooter`, passed as
  // `drawerFooter` below, under the studio switcher `AppShell` already renders.
]

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
  const landingRoute = matchLandingPath(path)
  const joinToken = matchJoinPath(path)
  if (landingRoute) return <LandingShell slug={landingRoute.slug} />
  if (joinToken) return <JoinShell token={joinToken} />
  return <AuthedApp />
}

function LandingShell({ slug }: { slug: string }) {
  const [locale, setLocale] = useState<Locale>('he')
  useDocumentLocale(locale)
  const landingClient = useMemo(() => makeLandingClient(apiFetch), [])
  // §5.4a step 1 → step 2. The OAuth callback appends `signed_in=1` to its redirect, and
  // that marker is the ONE case where the landing knows a refresh is worth firing — a
  // full-page return is a fresh JS context with an empty in-memory token, so without it
  // the booking flow greets the freshly-signed-in parent with its sign-in step again.
  // Anonymous visits stay refresh-free (L6). The render is held while restoring because
  // BookingFlow picks its first step once, at mount.
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
      <PublicLanding
        slug={slug}
        locale={locale}
        client={landingClient}
        languagePicker={<LanguagePicker locale={locale} onChoose={setLocale} />}
        // Passive: the in-memory token, never a request. A cold anonymous load is
        // simply not signed in, and the booking flow's own first step signs in.
        signedIn={getAccessToken() !== null}
      />
    </ThemeProvider>
  )
}

/** What the sign-in wall needs to show the club's own branding before anyone has signed
 *  in -- §6's `slug`/`logo_url` additions to `OnboardingInfoOut`, read from the same
 *  public, unauthenticated `GET /public/onboarding/{token}` the wizard itself reads once
 *  signed in (kept as a separate fetch here rather than threaded through as a prop, so
 *  neither this shell nor `JoinFlow` has to wait on the other's request). */
type JoinWallInfo = { studio_name: string; logo_url: string | null }

function JoinShell({ token }: { token: string }) {
  const [locale, setLocale] = useState<Locale>('he')
  const [mandateLinks, setMandateLinks] = useState<readonly StandingOrderLink[]>([])
  // F1/F10 -- the ONE `useSession()` call for this whole route. `JoinFlow` and
  // `JoinWelcomeStep` used to each mount their own, and every mount's `refresh()` call
  // rotates the refresh token -- three (with this one, four) rotations for one page load,
  // and a REMOUNT of any of them (e.g. `JoinWelcomeStep` on back-navigation) restarted
  // that instance at `status: 'loading'`, which its own render treated as "not signed
  // in" and flashed a sign-in wall for ~120ms. Read once, here, and pass down what the
  // children need -- neither child calls `useSession()` any more.
  const session = useSession()
  const [wallInfo, setWallInfo] = useState<JoinWallInfo | null>(null)
  const privacyClient = useMemo(() => makePrivacyClient(apiFetch), [])
  const healthClient = useMemo(() => makeHealthClient(apiFetch), [])
  const billingClient = useMemo(() => makeParentBillingClient(apiFetch), [])
  useDocumentLocale(locale)

  useEffect(() => {
    if (session.status !== 'signed-in') return
    let live = true
    void apiFetch('/api/v1/me/standing-order-links')
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items: { student_id: string; amount_agorot: number; url: string }[]
            })
          : { items: [] },
      )
      .then((body) => {
        if (!live) return
        setMandateLinks(
          body.items.map((row) => ({
            studentId: row.student_id,
            amountAgorot: row.amount_agorot,
            url: row.url,
          })),
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [session.status])

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
    // wizard, with the club's logo and name. Never inside step 1" (F1). The wizard
    // (`JoinFlow`, starting at `JoinWelcomeStep`) is not rendered at all until this
    // branch is no longer taken.
    return (
      <ThemeProvider>
        <AccessibilityMenu locale={locale} />
        <LanguagePicker locale={locale} onChoose={setLocale} />
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

  // `JoinFlow` owns consent internally now (its own Step 1) -- no external `ConsentGate`
  // wrapper. `ConsentGate.tsx` itself is unchanged and still gates the regular app
  // below; this shell just no longer uses it for this route.
  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      <LanguagePicker locale={locale} onChoose={setLocale} />
      <JoinFlow
        billingClient={billingClient}
        displayName={session.displayName}
        healthClient={healthClient}
        locale={locale}
        onComplete={() => {
          globalThis.location.assign('/')
        }}
        privacyClient={privacyClient}
        standingOrderLinks={mandateLinks}
        token={token}
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
  // Both memoised for the same reason: each screen reads through its client in an effect
  // keyed on the client, so a fresh object every render would re-fetch forever — the
  // month for 12b, the club for 13a.
  const scheduleClient = useMemo(() => makeParentScheduleClient(apiFetch), [])
  const billingClient = useMemo(() => makeParentBillingClient(apiFetch), [])
  const peopleClient = useMemo(() => makePeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeParentEventsClient(apiFetch), [])
  const beltsClient = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const commsClient = useMemo(() => makeParentCommsClient(apiFetch), [])
  const healthClient = useMemo(() => makeHealthClient(apiFetch), [])
  const absenceClient = useMemo(() => makeAbsenceClient(apiFetch), [])
  const privacyClient = useMemo(() => makePrivacyClient(apiFetch), [])
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
  const [setupChildren, setSetupChildren] = useState<readonly SetupChild[]>([])
  /** §5.10's mandate links, one per child. Read live and never cached: a stale link signs
   *  a family up at the wrong amount and nobody finds out for months. */
  const [mandateLinks, setMandateLinks] = useState<readonly StandingOrderLink[]>([])
  useEffect(() => {
    let live = true
    void apiFetch('/api/v1/me/standing-order-links')
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as {
              items: { student_id: string; amount_agorot: number; url: string }[]
            })
          : { items: [] },
      )
      .then((body) => {
        if (!live) return
        setMandateLinks(
          body.items.map((row) => ({
            studentId: row.student_id,
            amountAgorot: row.amount_agorot,
            url: row.url,
          })),
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
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
        setSetupChildren(
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
  const hash = useHash()
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
  const onAbsence = hash === '#/absence'
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
      <AccessibilityMenu locale={locale} />
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
        <AccessGate session={session} locale={locale}>
        <AppShell
          title={session.activeStudioName ?? ''}
          items={NAV}
          locale={locale}
          tabBar={
            // 1a draws the four-tab bar on EVERY screen, and it hides while EITHER of
            // §6.1's gates holds — "no other screen is reachable" includes the bar that
            // reaches them. Step 5 is `consentStatus`, step 6 is `gatedChildren`.
            consentStatus === 'open' &&
            gatedChildren !== null &&
            firstStudentNeedingDeclaration(gatedChildren) === null ? (
              <TabBar
                label={t(locale, 'common.home.title')}
                items={[
                  {
                    key: 'home',
                    label: t(locale, 'common.home.tab.home'),
                    href: '#/',
                    icon: <Icon name="home" size={20} />,
                    active: hash === '' || hash === '#/' || hash === '#',
                  },
                  {
                    key: 'payments',
                    label: t(locale, 'common.home.tab.payments'),
                    href: '#/payments',
                    icon: <Icon name="payments" size={20} />,
                    active: onPayments,
                  },
                  {
                    key: 'messages',
                    label: t(locale, 'common.home.tab.messages'),
                    href: '#/announcements',
                    icon: <Icon name="messages" size={20} />,
                    active: onAnnouncements,
                    badge: pendingCount,
                  },
                  {
                    key: 'profile',
                    label: t(locale, 'common.home.tab.profile'),
                    href: '#/profile',
                    icon: <Icon name="profile" size={20} />,
                    active: onProfile,
                  },
                ]}
              />
            ) : undefined
          }
          drawerFooter={
            <>
              {/* 2e's counts (P9): the children and the missing declarations, above the
                  shared language/theme footer. */}
              {gatedChildren !== null && gatedChildren.length > 0 ? (
                <div data-testid="drawer-counts">
                  <p style={{ margin: 0 }}>
                    {t(locale, 'common.nav.myChildren')} · {gatedChildren.length}
                  </p>
                  {gatedChildren.some(needsFullDeclaration) ? (
                    <p style={{ margin: 0 }}>
                      {t(locale, 'health.declaration.title')} ·{' '}
                      {t(locale, 'people.document.missingCount').replace(
                        '{n}',
                        String(gatedChildren.filter(needsFullDeclaration).length),
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {/* §11's screen, in the drawer 2e draws these controls in. A link and not a
                  NAV entry: NAV is the family's four working surfaces, and privacy is a
                  settings control — the same place the language and theme switches live.
                  `routes.reachable.test.ts` requires this to exist somewhere in the app,
                  because three screens have already shipped mounted and unreachable. */}
              <p style={{ margin: 0 }}>
                <a href="#/privacy">{t(locale, 'reports.privacy.title')}</a>
              </p>
              <AccountDrawerFooter
                locale={locale}
                onChooseLocale={setLocale}
                onSignOut={() => {
                  clearAllJoinDrafts()
                  void session.signOut()
                }}
                accountName={session.displayName}
              />
            </>
          }
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          onSwitchStudio={(studioId) => void switchStudio(studioId)}
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
              PEOPLE's branch needs no such guard — `AddSibling` is behind §6.1's refusal
              already, since a person with no guardian row never reaches this shell. */}
          {/* §6.1 step 6 wraps EVERY routed branch, not the default one: "no other
              screen is reachable", and every drawer link and typed hash routes through
              this expression. Loading, not `null`, while the children are still loading
              — see the fetch above. §7.9: `AppShell`'s own chrome (title, drawer, tab
              bar) already renders around this, but the content area itself read as an
              empty page with nothing on it for as long as the fetch took. */}
          {gatedChildren === null ? (
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
            locale={locale}
            client={healthClient}
            students={gatedChildren}
            onSigned={() => setDeclarationsSigned((count) => count + 1)}
          >
          {/* §6.1's plan step, and it sits HERE for the reason the sequence gives: a family
              picks what they are paying for after the club is allowed to hold the child's
              record, never before. Unlike the two gates above it this one renders the app
              behind it — see `PlanGate`'s header on why nagging beats blocking. */}
          {/* The join already created the children, their groups, their price and their
              first charge, so this step asks the one thing left: how the money moves, per
              child. Then one summary — card in a single checkout, a mandate link each,
              cash and cheques told to the manager. */}
          <PaymentSetupGate
            client={billingClient}
            locale={locale}
            standingOrderLinks={mandateLinks}
            students={setupChildren}
          >
          {session.access.parent && isCalendarRoute(hash) ? (
            <>
              <ScheduleSection
                locale={locale}
                client={scheduleClient}
                hash={hash}
                today={today}
                // The popup a lesson opens writes through `12a`'s client, not a second
                // one: the deadline, the refusal codes and the no-queue rule are all
                // already correct there, and two clients is two places for them to drift.
                absence={absenceClient}
              />
              {/* §5.12 — the feed subscription lives under the calendar it feeds, which
                  is where a parent thinking about calendars already is (P1). */}
              <CalendarSync client={commsClient} locale={locale} />
            </>
          ) : onAbsence ? (
            // `12a`. The children come from the same read §6.1's gate makes; inside the
            // gate they are non-null. The screen itself refuses to work offline, on
            // purpose (§10.2) — preserve that by never wrapping it in a cache.
            <AbsenceScreen
              client={absenceClient}
              locale={locale}
              children={(gatedChildren ?? []).map(({ id, display_name }) => ({ id, display_name }))}
            />
          ) : cardStudentId ? (
            <StudentCardSection client={peopleClient} locale={locale} studentId={cardStudentId} />
          ) : paymentCompleteRef ? (
            <PaymentCompleteSection locale={locale} publicRef={paymentCompleteRef} />
          ) : onPaymentsHistory ? (
            <PaymentHistorySection locale={locale} />
          ) : onPayments ? (
            // No `access.parent` guard needed and none added: the routes behind this
            // screen resolve the payer from the session, so a person with no charges sees
            // an empty state rather than somebody else's money.
            <PaymentsSection locale={locale} />
          ) : planStudentId ? (
            // Same reasoning as the payments screen above: the route resolves the family
            // from the session, so a student id that is not this caller's child answers
            // 404 and the section renders nothing rather than another family's plan.
            <TrainingPlanSection locale={locale} studentId={planStudentId} />
          ) : onShop ? (
            <ShopSection locale={locale} />
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
            <ProfileSection locale={locale} onLocaleChange={setLocale} />
          ) : joiningClub ? (
            // INSIDE the gates, like every other branch: a trial family passes both today
            // (§5.5 does not hold `trial_signed` while the child is still on a trial), and
            // the moment the join lands they stop passing — which is the point.
            <JoinClubSection
              client={peopleClient}
              locale={locale}
              onJoined={() => setFamilyJoined((n) => n + 1)}
            />
          ) : addingChild ? (
            <AddSibling
              locale={locale}
              client={peopleClient}
              onAdded={() => setFamilyJoined((n) => n + 1)}
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
            <InboxScreen
              client={commsClient}
              locale={locale}
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
              <Resolve session={session} locale={locale} />
            </>
          )}
          </PaymentSetupGate>
          </HealthGate>
          </ConsentGate>
          )}
        </AppShell>
        </AccessGate>
      ) : null}
    </ThemeProvider>
  )
}
