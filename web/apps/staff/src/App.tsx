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
import { apiFetch, useDisplayMode, useScrollMemory, useSession, switchStudio } from '@studio/core'
import {
  AccessibilityMenu,
  EmptyState,
  InstallBanner,
  InstallWalkthrough,
  ManagerSignIn,
  PRIVACY_HASH,
  SetupIncompleteBanner,
  SetupWizard,
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
import { CalendarScreen } from './features/schedule/CalendarScreen'
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
import { makeStaffCommsClient } from './features/comms'
// §16's operator view of §11.3 and §11.4. Nothing in either app rendered a `privacy.*`
// string before this wave, so a complete he/en/ru copy set sat behind no screen and four
// working endpoints sat behind no caller.
import { PrivacyOperatorScreen, makeStaffPrivacyClient } from './features/privacy'
import { StaffAlerts } from './StaffAlerts'
import { NetworkStatus } from './NetworkStatus'
import { StaffShell } from './features/shell/StaffShell'
import type { StaffTab } from './features/shell/StaffTabBar'
import { AccountScreen } from './features/account/AccountScreen'
import { TimerScreen } from './features/timer'
import { TasksScreen, openTaskCount, useOpenTasks } from './features/tasks'
import { CoachConstraintsScreen, makeCoachConstraintsClient } from './features/constraints'
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
// The registration nothing called (S1). Without it, a coach taking a register saw no
// health flag on any row — §5.5's coach-facing safety surface, absent from the running
// app because the function that connects fill to container was never invoked.
registerHealthSections()
// `registerCommsSections(AtRiskAlert)` used to sit here too, filling `staff-alerts` with
// the same at-risk card the tasks tab (`features/tasks`) now derives from the same
// `commsClient.atRisk()` inbox. Both were correct built alone; together they put the same
// student on screen twice — once as a banner, once as a task card. Owner decision
// (2026-09-06): at-risk lives in the tasks tab ONLY. The banner keeps
// `registerAttendanceSections`'s `ConflictSection`, which is what it was actually built
// for — a sync conflict a coach must see mid-register, without navigating anywhere.
// `AtRiskAlert.tsx` is deleted rather than left registered-nowhere; its one-tap `tel:`
// dial moved into the tasks tab's own call-parent card (`TasksScreen.tsx`).

// NO `NAV` ARRAY, AND NO DRAWER FOR IT TO SIT IN.
//
// **This replaces `AppShell` with `StaffShell` (§3 of
// docs/superpowers/specs/2026-09-06-staff-app-redesign.md — "the redesign deletes the two
// things AppShell exists to draw: THE DRAWER... THE HEADER").** Five tabs, no side menu.
// Every destination NAV and the drawer used to carry now has a home in the account
// screen — `features/account/AccountScreen.tsx` — or is reached from inside it: identity,
// permission boundaries, notification preferences, the coach calendar feed, cash,
// the join link, the privacy queue, the setup wizard, install, the two legal documents,
// language/theme/sign-out, and the studio switcher. None of it is lost; see that file's
// own header for where each one landed.
//
// **`announcements` is the one entry that does NOT get a new home, on purpose (bug 2.2).**
// The old NAV pointed it at the PATH `/announcements`, which no server route answers — it
// fell through the service worker's `navigateFallback` to index.html and silently put the
// coach back on home. There is no announcements screen anywhere in this app and building
// one is not part of this pass. Do not "restore" this entry; it never had a destination.

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
  const constraintsClient = useMemo(() => makeCoachConstraintsClient(apiFetch), [])
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
  // A hash link moves the page by neither scrolling nor restoring, so without this a coach
  // who scrolls halfway down a thirty-child register, taps טיימר to run a round and comes
  // back lands in the middle of the timer screen on the way out and at the same offset in a
  // list they were part-way through marking on the way back. One offset per screen; see the
  // hook's own header in @studio/core.
  useScrollMemory(hash)
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
  // §6.2, decision 16 — writing a briefing is `owner`/`manager`/`lead_coach`, the exact
  // trio `PATCH /sessions` already admits and `StaffEventsScreen`'s own `canPublish` below
  // computes inline for the identical reason. An assistant coach reads `RosterScreen`'s
  // plan card with no editor rather than being refused a screen that would show them one.
  const viewerCanWritePlan =
    viewerIsManager || (membership?.roles.includes('lead_coach') ?? false)
  // §4.4 (checkpoint 8) — "no task table, rebuilt every time the tab opens". Called here,
  // once, rather than inside the tasks screen alone, because the tab bar's own badge is
  // visible on every screen and needs the same count `TasksScreen` renders; see
  // `features/tasks/useOpenTasks.ts`'s own header for why this is a second, independent
  // call rather than a value threaded down as a prop. `hash` is the refresh key: this
  // component never unmounts, so re-running the fetches on every navigation is what keeps
  // the badge from freezing at whatever it saw when the coach signed in.
  const openTasks = useOpenTasks({
    enabled: session.access.staff,
    locale,
    scheduleClient,
    peopleClient,
    commsClient,
    viewerPersonId: membership?.person_id ?? null,
    viewerIsManager,
    today,
    refreshKey: hash,
  })
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
  // account). Read once, here, and used by BOTH the anonymous branch below (where they
  // must work before there is a session at all) and the signed-in one (the account tab's
  // legal group links to the same two hashes — a staff member never had a way to reread
  // these while signed in before this redesign).
  const onTerms = hash === TERMS_HASH
  const onPrivacyPolicy = hash === PRIVACY_HASH
  // 2026-08-28 — the way BACK into the wizard after a dismissal. Resolve routes an owner
  // in only on first run; the incomplete-setup banner needs a door that exists after it.
  const onSetup = hash === '#/setup'
  // The account tab's own screen, and the two stubs beside it (timer, tasks) — reserved
  // routes StaffTabBar already links to. Real screens land at later checkpoints; a tab
  // that goes nowhere today is the exact bug (2.2) this pass exists to not repeat.
  const onAccount = hash === '#/account'
  const onTimer = hash === '#/timer'
  const onTasks = hash === '#/tasks'
  // §4.8 / §6.1 (checkpoint C10) — filing, withdrawing and reading a coach's own
  // unavailability. Reached from the account tab's own row, not a tab of its own.
  const onConstraints = hash === '#/constraints'
  // §4.7 (checkpoint C11) — the month calendar. Every staff role may open it (decision 7);
  // who may edit FROM it is a question the screen asks itself, the same `viewerCanWritePlan`
  // trio §6.2 already computes, not a second gate at this door.
  const onCalendar = hash === '#/calendar'
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

  // Which of the five tabs the current hash belongs to. `null` is a real answer, not a
  // fallback — see `StaffShell`'s own header: a student card, the privacy operator queue
  // and a session roster all sit BESIDE the tabs rather than inside one, same as every
  // other screen reached only as a sub-page (cash, the join link, setup, the two legal
  // documents). The bar still shows, so a coach can always leave, but marking a tab
  // current on a screen that tab does not lead to is a lie told to a screen reader.
  const activeTab: StaffTab | null = onAccount
    ? 'account'
    : onTimer
      ? 'timer'
      : onTasks
        ? 'tasks'
        : onStudents
          ? 'students'
          : hash === '' || hash.startsWith('#/schedule')
            ? 'schedule'
            : null

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
      {/* נגישות, SIGNED OUT ONLY — the same call the parent app made (owner review,
          2026-09-06, see its App.tsx around the AccessibilityMenu mount). The floating
          button sits right on a public page but wrong behind a fixed bottom bar: at phone
          widths it came to rest ON TOP of the first tab, clipping לוח זמנים's label to
          "נים" and making that tab unpressable. `.studio-a11y__fab` publishes an
          `--a11y-fab-clearance` for exactly this and the redesigned Tailwind bar does not
          read it — padding the bar is not the fix here, because unlike the parent app's
          landing page, a signed-in coach HAS a destination for the control: the account
          tab draws it as a row via `renderTrigger` (see AccountScreen.tsx). Do not
          "restore" the unconditional render — the sign-in screen and any anonymous state
          keep the FAB, because that is where IS 5568 bites hardest: a stranger with low
          vision has no account screen to go to yet. */}
      {session.status !== 'signed-in' ? <AccessibilityMenu locale={locale} /> : null}
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
        // §6.1 step 3's refusal renders OUTSIDE the shell — see `AccessGate`'s header.
        // Every hash-routed branch below already re-checks `session.access.staff` for
        // itself, so this closes the one gap that was left: the shell's own chrome
        // (the tab bar, the unguarded install banner) rendering around the refusal.
        <AccessGate session={session} locale={locale}>
        <StaffShell
          activeTab={activeTab}
          locale={locale}
          // §4.4 (checkpoint 8) — the real open-task count, computed by the same
          // derivation the tasks screen itself renders from (`openTasks` above). Before
          // this checkpoint the count was hardcoded to 0 rather than invented; now it is
          // the honest number because there is finally something honest to count.
          tasksBadgeCount={openTaskCount(openTasks.tasks)}
          networkStatus={session.access.staff ? <NetworkStatus locale={locale} /> : null}
          staffAlerts={
            session.access.staff ? <StaffAlerts client={commsClient} locale={locale} /> : null
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
          {/* §6.1's first-run routing still owns the DEFAULT screen: `Resolve` decides
              between the setup wizard, the tour and the refusal. Both W2 lanes hang a
              screen off a hash in front of it, and neither claims the fallback — an
              unknown hash still falls through to `Resolve`.

              `access.staff` guards lane SCHEDULE's branch because a hash is typed by
              whoever is holding the phone, so the check cannot live in the link. Lane
              PEOPLE's branch inherits the same protection from being below it: a person
              without staff access takes the `Resolve` arm and gets §6.1's refusal. */}
          {onTerms ? (
            // No `access.staff` guard, matching `onInstall` below: these are public
            // documents, readable by anyone this shell has already let in.
            <LegalScreen locale={locale} doc="terms" />
          ) : onPrivacyPolicy ? (
            <LegalScreen locale={locale} doc="policy" />
          ) : session.access.staff && onAccount ? (
            <AccountScreen
              activeStudioId={session.activeStudioId}
              commsClient={commsClient}
              displayName={session.displayName}
              locale={locale}
              onChooseLocale={setLocale}
              onSignOut={() => void session.signOut()}
              onSwitchStudio={(studioId) => void switchStudio(studioId)}
              peopleClient={peopleClient}
              roles={membership?.roles ?? []}
              studios={session.studios.map((s) => ({
                studioId: s.studio_id,
                studioName: s.studio_name,
                studioIsDemo: s.studio_is_demo,
              }))}
              viewerIsManager={viewerIsManager}
            />
          ) : session.access.staff && onTimer ? (
            // §4.5 (checkpoint 9) — no backend, no model, no endpoint: a coach's own
            // presets live on the device (decision 2). Self-contained; nothing else in
            // this file changes to mount it.
            <TimerScreen locale={locale} />
          ) : session.access.staff && onTasks ? (
            // §4.4 (checkpoint 8) — coach and manager rows, derived fresh every time this
            // tab opens. `scheduleClient`/`peopleClient`/`commsClient` are the same
            // instances every other screen already uses; the promise and health-review
            // clients are self-contained inside the screen, the same shape
            // `PaymentPromisesSection` already uses for its own manager-only fetch.
            <TasksScreen
              locale={locale}
              scheduleClient={scheduleClient}
              peopleClient={peopleClient}
              commsClient={commsClient}
              viewerPersonId={membership?.person_id ?? null}
              viewerIsManager={viewerIsManager}
              today={today}
            />
          ) : session.access.staff && onConstraints ? (
            // §4.8 / §6.1 (checkpoint C10) — a coach files their own unavailability.
            // Every staff role, not manager-gated: approving it (C12) is the dashboard's,
            // filing it is this screen's, and `#/account` links here for exactly that
            // reason.
            <CoachConstraintsScreen locale={locale} client={constraintsClient} today={today} />
          ) : session.access.staff && onCalendar ? (
            // §4.7 (checkpoint C11) — the month grid. Every staff role reads it (decision
            // 7); `canEdit` is the same owner/manager/lead_coach trio §6.2 already computes
            // as `viewerCanWritePlan`, passed straight through rather than re-derived, so
            // the calendar's edit sheet asks the identical question `PATCH /sessions`
            // itself asks. `fetcher` is `apiFetch` — the edit sheet's own best-effort
            // `/api/v1/staff` read, same shape the dashboard's `SessionPopover` already uses.
            <CalendarScreen
              locale={locale}
              client={scheduleClient}
              eventsClient={eventsClient}
              constraintsClient={constraintsClient}
              fetcher={apiFetch}
              today={today}
              canEdit={viewerCanWritePlan}
            />
          ) : onInstall ? (
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
                canWritePlan={viewerCanWritePlan}
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
              // C2 — events share the session list (decision 4) and unanswered families can
              // be chased from the card (§4.9). Both were built behind optional props and
              // would have shipped inert without these two lines, which is precisely the
              // failure `unreachable-screens.test.ts` and `inert-buttons.test.ts` exist for
              // and precisely the one neither of them can see: a prop, not a component.
              eventsClient={eventsClient}
              peopleClient={peopleClient}
              // §6.2's marker-becomes-a-button pass (2026-09-07) — the same client and the
              // same permission `RosterScreen` already receives below, so the schedule
              // card's briefing sheet reads and writes the identical rule decision 16 states.
              attendanceClient={attendanceClient}
              canWritePlan={viewerCanWritePlan}
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
            <EventRosterScreen
              client={eventsClient}
              eventId={rosterEventId}
              locale={locale}
              personId={membership?.person_id ?? null}
            />
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
        </StaffShell>
        </AccessGate>
      ) : null}
    </ThemeProvider>
  )
}
