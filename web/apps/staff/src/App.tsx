// §6.1's staff first launch, in its stated order:
//
//   1 שפה (BEFORE login) → 2 welcome → 3 resolve → 4 tour → 5 התראות → 6 offline prime
//
// The install WALL that used to sit in front of all of it fell in the 2026-08-27 feature
// pass: the app runs fully in a browser tab, and installing is InstallBanner's nudge plus
// the on-demand walkthrough at `#/install`. §10.6's stake is real — only a home-screen
// web app is exempt from Safari's 7-day script-storage cap, so `pending_ops` is safest
// installed — which is why the nudge names what installing buys, but it is a pitch now,
// not a gate.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, useDisplayMode, useSession, switchStudio } from '@studio/core'
import {
  AccessibilityMenu,
  AccountDrawerFooter,
  AppShell,
  EmptyState,
  Icon,
  InstallBanner,
  InstallWalkthrough,
  ManagerSignIn,
  PRIVACY_HASH,
  SetupIncompleteBanner,
  SetupWizard,
  TabBar,
  TERMS_HASH,
  ThemeProvider,
  UpdateToast,
  makeSetupClient,
  registerM1WizardSteps,
  makeWizardBeltsClient,
  makeWizardItemsClient,
  makeWizardPricesClient,
  registerBeltsWizardStep,
  registerItemsWizardStep,
  registerPricesWizardStep,
  useDocumentLocale,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { LegalScreen } from './features/legal/LegalScreen'
import { AccessGate } from './features/identity/AccessGate'
import { Resolve } from './features/identity/Resolve'
import { PaymentPromisesSection } from './features/billing/PaymentPromisesSection'
import { JoinLinkSection } from './features/people/JoinLinkSection'
import { ScheduleSection } from './features/schedule/ScheduleSection'
import { makeStaffScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'
import { StudentsSearch, makeStaffPeopleClient } from './features/people'
import {
  EventRosterScreen,
  ExamResultsScreen,
  StaffEventsScreen,
  makeStaffEventsClient,
} from './features/events'
import {
  OfflinePrimingGate,
  RosterScreen,
  makeStaffAttendanceClient,
  registerAttendanceSections,
  useOfflinePriming,
} from './features/attendance'
// S2 — the in-session screens (9g, 11a, 11b) and the student card (9c/2d), each behind
// a hash a coach can actually reach.
import { SessionSummarySection } from './features/attendance/SessionSummarySection'
import { HandOverSection } from './features/billing/HandOverSection'
import { TrialSection } from './features/people/TrialSection'
import { StudentCardRoute } from './features/people/StudentCardRoute'
import { useQueueFlusher } from './features/attendance/useQueueFlusher'
import { registerHealthSections } from './features/health'
import {
  AtRiskAlert,
  CoachCalendarFeed,
  NotificationPreferences,
  makeStaffCommsClient,
  registerCommsSections,
} from './features/comms'
// §16's operator view of §11.3 and §11.4. Nothing in either app rendered a `privacy.*`
// string before this wave, so a complete he/en/ru copy set sat behind no screen and four
// working endpoints sat behind no caller.
import { PrivacyOperatorScreen, makeStaffPrivacyClient } from './features/privacy'
import { StaffAlerts } from './StaffAlerts'
import { DrawerIdentity, PermissionBoundaries } from './features/identity/DrawerIdentity'
import { NetworkStatus } from './NetworkStatus'
import './features/attendance/attendance.css'

// §5.1 — 'the staff app and dashboard route them into a resumable wizard'. Both mount the
// SAME wizard from @studio/ui; no step lives in one app's feature directory. Registered
// at module load so the slot is populated before anything renders, and `apiFetch` is
// passed in because @studio/ui must not depend on @studio/core.
registerM1WizardSteps(apiFetch)
// The other three (2026-08-30): belts, prices and items lived in the DASHBOARD's feature
// directories, so this app's wizard showed them as dead rail entries — the owner read
// that as "payments and belts don't work". They live beside the container now, and both
// apps register the same components.
registerBeltsWizardStep(makeWizardBeltsClient(apiFetch))
registerPricesWizardStep(makeWizardPricesClient(apiFetch))
registerItemsWizardStep(makeWizardItemsClient(apiFetch))

// §19.4's `📴 offline` and `🐌 slow` toggles, plus the `student-card` attendance strip and
// the `staff-alerts` conflict cards. Registered at module load for the same reason the
// wizard steps are: the slots must be populated before anything renders. The containers
// themselves are never reopened — that is what seam 4 buys.
registerAttendanceSections()
// The two registrations nothing called (S1). Without the first, a coach taking a register
// saw no health flag on any row — §5.5's coach-facing safety surface, absent from the
// running app because the function that connects fill to container was never invoked.
registerHealthSections()
registerCommsSections(AtRiskAlert)

const NAV = [
  { key: 'today', labelKey: 'common.nav.today', href: '/' },
  // Both W2 lanes moved their entry from a path to a hash, independently and for the
  // same reason: there is no server route behind the path form, so `/schedule` and
  // `/students` were links to a 404.
  { key: 'schedule', labelKey: 'common.nav.schedule', href: '#/schedule' },
  { key: 'students', labelKey: 'common.nav.students', href: '#/students' },
  // A hash, not a path: there is no server route behind `/attendance`, so the path form was
  // a link to a 404 — the same correction both W2 lanes made independently.
  { key: 'attendance', labelKey: 'common.nav.attendance', href: '#/attendance' },
  // 9i. A hash for the same reason the two above are: there is no server route behind
  // `/events`, so the path form would be a link to a 404.
  { key: 'events', labelKey: 'events.title', href: '#/events' },
  { key: 'announcements', labelKey: 'common.nav.announcements', href: '/announcements' },
  // NO settings entry. `/settings` matched no route in either app, so the link fell
  // through the service worker's navigateFallback to index.html and put the user back
  // on home in silence. Artboard 9e — the inventory calls it "אותה מגירה", the same drawer as the parent app's 2e draws these controls in the DRAWER, not on a
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

export default function App() {
  const session = useSession()
  const displayMode = useDisplayMode()
  // M0 drew this line: core's isInstalled() is display-mode !== 'browser', so a
  // fullscreen or minimal-ui home-screen launch counts too. Since the 2026-08-27
  // feature pass this no longer GATES anything — it only decides whether the home
  // screen shows InstallBanner's nudge.
  //
  // The `MODE` disjunct hides the nudge on the VITE DEV SERVER, which serves no service
  // worker (`devOptions: { enabled: false }`) — nothing to install from, so the banner
  // would point at a dead end. `import.meta.env.MODE` is replaced by a string literal at
  // build time, so in a real build the disjunct folds away; under vitest MODE is 'test',
  // which is what lets this app's tests exercise the real banner.
  //
  // `useDisplayMode()` is deliberately left alone: M8 reports install rates from it, and
  // a measurement that lies to make a dev tab convenient is worse than no banner.
  const installed = displayMode !== 'browser' || import.meta.env.MODE === 'development'
  const [locale, setLocale] = useState<Locale>('he')
  // See the parent app's note: index.html's `dir="rtl"` is a literal, and the locale in
  // React state was never written back to the document.
  useDocumentLocale(locale)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Memoised: SetupWizard reads through this in an effect keyed on the client, so a fresh
  // object every render would re-fetch progress forever.
  const setupClient = useMemo(() => makeSetupClient(apiFetch), [])
  const scheduleClient = useMemo(() => makeStaffScheduleClient(apiFetch), [])
  const peopleClient = useMemo(() => makeStaffPeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeStaffEventsClient(apiFetch), [])
  const attendanceClient = useMemo(() => makeStaffAttendanceClient(apiFetch), [])
  const commsClient = useMemo(() => makeStaffCommsClient(apiFetch), [])
  const privacyClient = useMemo(() => makeStaffPrivacyClient(apiFetch), [])
  // §6.1 step 6 — "offline prime: today's and tomorrow's sessions + rosters are fetched and
  // written to IndexedDB BEFORE the coach reaches Today", and "the first launch BLOCKS on
  // this fetch". The gate below renders instead of the app while it runs.
  const priming = useOfflinePriming(
    attendanceClient,
    undefined,
    // S4.2 — one bootstrap call, AFTER the session resolves.
    session.status === 'signed-in',
  )
  const hash = useHash()
  const today = useToday()

  // S4.3 — the bare hash redirects EXPLICITLY rather than falling through in silence:
  // the date picker (9b, on the schedule screen) is where a coach picks the session to
  // mark, and now the URL says so too.
  useEffect(() => {
    if (hash === '#/attendance') globalThis.location.hash = '#/schedule'
  }, [hash])
  // 9a's filter defaults from who is looking: a coach opening the app wants their own day,
  // a manager wants the club's. Both facts come off the ACTIVE membership — the same place
  // features/identity/Resolve.tsx reads `owner` from — because `Session` itself is
  // studio-agnostic and a person can hold different roles in different studios.
  const membership = session.studios.find((s) => s.studio_id === session.activeStudioId)
  // §10.3's queue drained. Nothing called `flush` anywhere in the product, so every
  // mark a coach took stayed in `pending_ops` and the register never reached the
  // server. At the shell rather than on the roster: a coach who marks a register and
  // navigates away before the signal returns must still have their marks sent.
  useQueueFlusher(membership?.person_id ?? null)
  const viewerIsCoach =
    membership?.roles.some((role) => role === 'lead_coach' || role === 'assistant_coach') ?? false
  // The one money surface this app carries (feature pass 2026-08-27): the payment-promise
  // decisions -- cash and cheques -- for the manager standing at the door. §13's invariant
  // is about coach-scoped endpoints, and neither the entry nor the screen exists for a coach.
  const viewerIsManager =
    membership?.roles.some((role) => role === 'owner' || role === 'manager') ?? false
  // Staff `9h` is one hash away from Today. The card (`9c`) and the mid-lesson trial
  // (`11b`) open from a roster row, which is M5's screen — they are exported from
  // features/people for that lane to mount without reopening this file.
  //
  // Read off `useHash()` rather than `globalThis.location.hash` directly: both W2 lanes
  // put a screen behind a hash in this shell, and a plain read is not reactive — the
  // screen would change only when something else happened to re-render App. One
  // subscription serves both lanes' routes.
  const onStudents = hash === '#/students'
  // §6.5's walkthrough, now an on-demand screen behind InstallBanner's nudge.
  const onInstall = hash === '#/install'
  const onCash = hash === '#/cash'
  const onJoinLink = hash === '#/join-link'
  // §16's privacy queue. Manager-gated below with `#/cash` and `#/join-link`: a coach
  // reading it would get an empty list — the endpoint scopes a non-manager to their OWN
  // subjects — and an empty list on a screen titled "requests in this club" reads as
  // "there are none", which is a different and worse claim than "not yours".
  const onPrivacy = hash === '#/privacy'
  // The sign-in footer's two documents (§6.1 step 5's text, read before there is an
  // account). Routed with the ANONYMOUS branch below rather than here in the shell: a
  // legal link that needs a session is a legal link nobody at the sign-in can follow.
  // Distinct from `#/privacy` above, which is §16's operator queue and is manager-gated.
  const onTerms = hash === TERMS_HASH
  const onPrivacyPolicy = hash === PRIVACY_HASH
  // 2026-08-28 — the way BACK into the wizard after a dismissal. Resolve routes an owner
  // in only on first run; the incomplete-setup banner needs a door that exists after it.
  const onSetup = hash === '#/setup'
  // §5.7's register, opened from a session. The id is in the hash so the back button works
  // and a link survives a reload — the same shape both W2 lanes settled on, and the reason
  // NAV's `/attendance` entry became a hash below. A second segment picks the in-session
  // screen (S2): `summary` (9g), `handover` (11a), `trial` (11b); none means the register.
  const attendanceParts = hash.startsWith('#/attendance/')
    ? hash.slice('#/attendance/'.length).split('/')
    : []
  const rosterSessionId = attendanceParts[0] || null
  const sessionView = attendanceParts[1] ?? null
  // `9c`/`2d` — the student card, from a roster row or the student list (S2/S3).
  const cardStudentId = hash.startsWith('#/students/') ? hash.slice('#/students/'.length) : null
  // 9i's list, and 9d's result sheet behind `#/events/<id>`. Same shape as the roster
  // id above: the id is in the hash so the back button works and a link survives a reload.
  const onEvents = hash === '#/events'
  // `#/events/<id>` is the exam sheet; `#/events/<id>/roster` the participants list (9i).
  const eventParts = hash.startsWith('#/events/')
    ? hash.slice('#/events/'.length).split('/')
    : []
  const rosterEventId = eventParts.length === 2 && eventParts[1] === 'roster' ? eventParts[0]! : null
  const examEventId = eventParts.length === 1 && eventParts[0] ? eventParts[0] : null

  useEffect(() => {
    // Chromium fires this when it considers the app installable; iOS never does, which
    // is why §6.5's iOS path is taught rather than prompted.
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    globalThis.addEventListener('beforeinstallprompt', onPrompt)
    return () => globalThis.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      {/* New-build toast — floats over whatever is open, in every session state. */}
      <UpdateToast locale={locale} />
      {session.status === 'anonymous' ? (
        // docs/design "Gladiator Manager Sign In" (2026-09-01) — this app's own face on the
        // flow. The other two apps keep `SignIn`'s split screen.
        //
        // §6.1's ordering rationale still holds — 'language before login, because a
        // Russian-speaking parent cannot read a Hebrew consent screen' — and the screen
        // carries the picker itself, in the footer the mock draws it in, rather than
        // floating a separate one over the artwork.
        //
        // The footer's two legal links are the reason this is a small router and not one
        // component: they must be readable BEFORE signing in, so they are routed here,
        // beside the sign-in, and not behind the shell below.
        onTerms ? (
          <LegalScreen locale={locale} doc="terms" />
        ) : onPrivacyPolicy ? (
          <LegalScreen locale={locale} doc="policy" />
        ) : (
          <ManagerSignIn locale={locale} onChooseLocale={setLocale} />
        )
      ) : null}

      {session.status === 'signed-in' ? (
        // §6.1 step 3's refusal renders OUTSIDE `AppShell` — see `AccessGate`'s header.
        // Every hash-routed branch below already re-checks `session.access.staff` for
        // itself, so this closes the one gap that was left: the shell's own chrome
        // (title, drawer, the unguarded install banner) rendering around the refusal.
        <AccessGate session={session} locale={locale}>
        <AppShell
          title={session.activeStudioName ?? ''}
          items={
            viewerIsManager
              ? [
                  ...NAV,
                  { key: 'cash', labelKey: 'billing.cash.manager.title', href: '#/cash' },
                  { key: 'joinLink', labelKey: 'people.join.card.title', href: '#/join-link' },
                ]
              : NAV
          }
          locale={locale}
          drawerFooter={
            // 9e — "אותה מגירה": M8's notification preferences and the coach's §5.12
            // calendar feed live in the drawer they were designed for (S2), above the
            // language/theme footer everyone shares.
            <>
              {session.access.staff ? (
                <DrawerIdentity
                  client={peopleClient}
                  displayName={session.displayName}
                  locale={locale}
                  roles={membership?.roles ?? []}
                />
              ) : null}
              <NotificationPreferences client={commsClient} locale={locale} />
              <CoachCalendarFeed client={commsClient} locale={locale} />
              {/* 9e — the locked capabilities, shown. A manager sees none: nothing on
                  this list is locked for them. */}
              {session.access.staff && !viewerIsManager ? (
                <PermissionBoundaries
                  locale={locale}
                  canMoveStudents={membership?.roles.includes('lead_coach') ?? false}
                />
              ) : null}
              {/* §16's privacy queue, in 9e's drawer — the same place the parent app puts
                  its own privacy link. A link and not a NAV entry: NAV is the coach's four
                  working surfaces, and this is an operator control. Manager-only, matching
                  the route's own gate: a link a coach follows to a refusal is a link that
                  teaches the app is broken. */}
              {viewerIsManager ? (
                <p style={{ margin: 0 }}>
                  <a href="#/privacy">{t(locale, 'reports.privacy.requests.operatorTitle')}</a>
                </p>
              ) : null}
              <AccountDrawerFooter
                locale={locale}
                onChooseLocale={setLocale}
                onSignOut={() => void session.signOut()}
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
          tabBar={
            // 9a/1c/1d draw the four-tab bar on every staff screen; עוד opens the same
            // drawer 9e describes ("אותה מגירה"), through the shell's own control.
            session.access.staff
              ? ({ openDrawer }) => (
                  <TabBar
                    label={t(locale, 'common.nav.today')}
                    items={[
                      {
                        key: 'schedule',
                        label: t(locale, 'common.nav.schedule'),
                        href: '#/schedule',
                        icon: <Icon name="calendar" size={20} />,
                        active: hash === '' || hash.startsWith('#/schedule'),
                      },
                      {
                        key: 'students',
                        label: t(locale, 'common.nav.students'),
                        href: '#/students',
                        icon: <Icon name="search" size={20} />,
                        active: onStudents,
                      },
                      {
                        key: 'events',
                        label: t(locale, 'events.title'),
                        href: '#/events',
                        icon: <Icon name="events" size={20} />,
                        active: onEvents || examEventId !== null,
                      },
                      {
                        key: 'more',
                        label: t(locale, 'common.nav.more'),
                        icon: <Icon name="menu" size={20} />,
                        onSelect: openDrawer,
                      },
                    ]}
                  />
                )
              : undefined
          }
          devBar={
            // §19.4 — the identity is real now. `devTools` comes from /auth/me, which
            // reads the verified is_developer claim; before M1 every app passed null.
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
          {/* The alert container, above whatever screen is open: a sync conflict or an
              at-risk child must be visible from Today and from the roster, not behind a
              navigation the coach has no reason to make. Every fill renders null when it
              has nothing to say. */}
          {/* S5 — the offline machinery made visible: network mode and queue depth, in the
              shell, so a coach in a basement sees it from Today and from the roster alike.
              Also the app's one `useNetworkMonitor` mount, which starts the probe loop. */}
          {session.access.staff ? <NetworkStatus locale={locale} /> : null}
          {/* The unfinished-setup nudge (2026-08-28). Manager-gated — S4's lesson: a
              manager-only read mounted in front of a coach is a 403 on every screen.
              Hidden on the wizard itself; keyed on the hash so leaving it re-asks. */}
          {session.access.staff && viewerIsManager && !onSetup ? (
            <SetupIncompleteBanner
              key={hash}
              client={setupClient}
              locale={locale}
              onOpen={() => {
                globalThis.location.hash = '#/setup'
              }}
            />
          ) : null}
          {session.access.staff ? <StaffAlerts client={commsClient} locale={locale} /> : null}
          {/* §6.1's first-run routing still owns the DEFAULT screen: `Resolve` decides
              between the setup wizard, the tour and the refusal. Both W2 lanes hang a
              screen off a hash in front of it, and neither claims the fallback — an
              unknown hash still falls through to `Resolve`.

              `access.staff` guards lane SCHEDULE's branch because a hash is typed by
              whoever is holding the phone, so the check cannot live in the link. Lane
              PEOPLE's branch inherits the same protection from being below it: a person
              without staff access takes the `Resolve` arm and gets §6.1's refusal. */}
          {onInstall ? (
            // Needs no access guard: installing the app is every signed-in person's
            // business, and the screen shows nothing from any studio.
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
          ) : session.access.staff && rosterSessionId ? (
            // §6.1 step 6 — "today's and tomorrow's sessions + rosters are fetched and
            // written to IndexedDB BEFORE the coach reaches Today", and "the first launch
            // blocks on this fetch".
            //
            // The FETCH starts at launch: `useOfflinePriming` runs on mount above, so the
            // cache is filling while the coach walks through the tour and Today. What is
            // gated here is the roster itself — the one screen a missing cache actually
            // costs something on, and the one this lane owns.
            //
            // §6.1's own order puts the prime after the tour, and the tour lives in
            // `features/identity/Resolve.tsx`, which belongs to no lane in this wave.
            // `OfflinePrimingGate` and `useOfflinePriming` are exported from this lane's
            // barrel so whoever owns that sequence can put the gate in front of Today
            // without reopening anything here.
            priming.state !== 'ready' ? (
              <OfflinePrimingGate locale={locale} onRetry={priming.retry} state={priming.state} />
            ) : sessionView === 'summary' ? (
              <SessionSummarySection
                client={attendanceClient}
                locale={locale}
                personId={membership?.person_id ?? null}
                sessionId={rosterSessionId}
              />
            ) : sessionView === 'handover' ? (
              <HandOverSection
                attendanceClient={attendanceClient}
                locale={locale}
                sessionId={rosterSessionId}
              />
            ) : sessionView === 'trial' ? (
              <TrialSection
                attendanceClient={attendanceClient}
                canGrantOverride={viewerIsManager}
                client={peopleClient}
                locale={locale}
                sessionId={rosterSessionId}
              />
            ) : (
              <RosterScreen
                client={attendanceClient}
                locale={locale}
                personId={membership?.person_id ?? null}
                sessionId={rosterSessionId}
              />
            )
          ) : session.access.staff && cardStudentId ? (
            <StudentCardRoute
              attendanceClient={attendanceClient}
              locale={locale}
              peopleClient={peopleClient}
              studentId={cardStudentId}
            />
          ) : session.access.staff && hash.startsWith('#/schedule') ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
              viewerPersonId={membership?.person_id}
              viewerIsCoach={viewerIsCoach}
            />
          ) : session.access.staff &&
            !viewerIsManager &&
            (onCash || onJoinLink || onSetup || onPrivacy) ? (
            // S10 — restricted, said out loud. The gate used to fall through to the
            // date-picker screen, which made the app look broken rather than reserved.
            <EmptyState
              data-testid="staff-forbidden"
              title={t(locale, 'common.permission.locked')}
              description={t(locale, 'common.permission.managerOnly')}
            />
          ) : session.access.staff && viewerIsManager && onSetup ? (
            <SetupWizard client={setupClient} locale={locale} />
          ) : session.access.staff && viewerIsManager && onCash ? (
            <PaymentPromisesSection locale={locale} />
          ) : session.access.staff && viewerIsManager && onJoinLink ? (
            <JoinLinkSection locale={locale} />
          ) : session.access.staff && viewerIsManager && onPrivacy ? (
            <PrivacyOperatorScreen client={privacyClient} locale={locale} />
          ) : session.access.staff && onStudents ? (
            <StudentsSearch
              locale={locale}
              client={peopleClient}
              now={today}
              viewerIsCoach={viewerIsCoach}
              onOpen={(studentId) => {
                globalThis.location.hash = `#/students/${studentId}`
              }}
            />
          ) : session.access.staff && rosterEventId ? (
            <EventRosterScreen client={eventsClient} eventId={rosterEventId} locale={locale} />
          ) : session.access.staff && examEventId ? (
            <ExamResultsScreen client={eventsClient} eventId={examEventId} locale={locale} />
          ) : session.access.staff && onEvents ? (
            <StaffEventsScreen
              client={eventsClient}
              locale={locale}
              now={today}
              canPublish={
                viewerIsManager || (membership?.roles.includes('lead_coach') ?? false)
              }
              onOpen={(id) => {
                globalThis.location.hash = `#/events/${id}`
              }}
              onOpenRoster={(id) => {
                globalThis.location.hash = `#/events/${id}/roster`
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
              <Resolve
                session={session}
                locale={locale}
                wizard={<SetupWizard client={setupClient} locale={locale} />}
              />
            </>
          )}
        </AppShell>
        </AccessGate>
      ) : null}
    </ThemeProvider>
  )
}
